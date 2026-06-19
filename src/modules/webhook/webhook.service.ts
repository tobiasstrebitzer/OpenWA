import { Injectable, NotFoundException, Optional, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import * as crypto from 'crypto';
import { Webhook } from './entities/webhook.entity';
import { CreateWebhookDto, UpdateWebhookDto } from './dto';
import { createLogger } from '../../common/services/logger.service';
import { QUEUE_NAMES } from '../queue/queue-names';
import { generateIdempotencyKey, generateDeliveryId } from './utils/idempotency.util';
import { WebhookPayload, WebhookJobData } from './interfaces/webhook-payload.interface';
import { evaluateFilters } from './filters/filter-evaluator';
import { sendGuardedWebhook } from './delivery/webhook-sender';
import { assertSafeFetchUrl, isSsrfProtectionEnabled, SsrfBlockedError } from '../../common/security/ssrf-guard';
import { HookManager } from '../../core/hooks';

@Injectable()
export class WebhookService {
  private readonly logger = createLogger('WebhookService');
  private readonly queueEnabled: boolean;

  constructor(
    @InjectRepository(Webhook, 'data')
    private readonly webhookRepository: Repository<Webhook>,
    private readonly configService: ConfigService,
    private readonly hookManager: HookManager,
    @Optional()
    @InjectQueue(QUEUE_NAMES.WEBHOOK)
    private readonly webhookQueue?: Queue<WebhookJobData>,
  ) {
    this.queueEnabled = configService.get<boolean>('queue.enabled', false);
  }

  /**
   * Reject an internal/unsafe webhook URL at registration, so a bad URL fails
   * synchronously with a 400 instead of silently failing at delivery time. Honors the same
   * SSRF flag + SSRF_ALLOWED_HOSTS escape-hatch as delivery. Maps the guard error to 400.
   */
  private async validateWebhookUrl(url: string): Promise<void> {
    if (!isSsrfProtectionEnabled()) return;
    try {
      await assertSafeFetchUrl(url);
    } catch (error) {
      if (error instanceof SsrfBlockedError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  async create(sessionId: string, dto: CreateWebhookDto): Promise<Webhook> {
    await this.validateWebhookUrl(dto.url);
    const webhook = this.webhookRepository.create({
      sessionId,
      url: dto.url,
      events: dto.events || ['message.received'],
      secret: dto.secret || null,
      headers: dto.headers || {},
      filters: dto.filters ?? null,
      retryCount: dto.retryCount ?? 3,
    });

    return this.webhookRepository.save(webhook);
  }

  async findBySession(sessionId: string): Promise<Webhook[]> {
    return this.webhookRepository.find({
      where: { sessionId },
      order: { createdAt: 'DESC' },
    });
  }

  async findAll(): Promise<Webhook[]> {
    return this.webhookRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Webhook> {
    const webhook = await this.webhookRepository.findOne({ where: { id } });
    if (!webhook) {
      throw new NotFoundException(`Webhook with id '${id}' not found`);
    }
    return webhook;
  }

  async update(id: string, dto: UpdateWebhookDto): Promise<Webhook> {
    const webhook = await this.findOne(id);

    if (dto.url !== undefined) {
      await this.validateWebhookUrl(dto.url);
      webhook.url = dto.url;
    }
    if (dto.events !== undefined) webhook.events = dto.events;
    // Normalize empty string to null (parity with create) - an empty secret means "no HMAC",
    // not a stored blank that silently disables signing while looking configured.
    if (dto.secret !== undefined) webhook.secret = dto.secret || null;
    if (dto.headers !== undefined) webhook.headers = dto.headers;
    if (dto.filters !== undefined) webhook.filters = dto.filters;
    if (dto.active !== undefined) webhook.active = dto.active;
    if (dto.retryCount !== undefined) webhook.retryCount = dto.retryCount;

    return this.webhookRepository.save(webhook);
  }

  async delete(id: string): Promise<void> {
    const webhook = await this.findOne(id);
    await this.webhookRepository.remove(webhook);
  }

  async test(sessionId: string, webhookId: string): Promise<{ success: boolean; statusCode?: number; error?: string }> {
    const webhook = await this.findOne(webhookId);

    const testPayload: WebhookPayload = {
      event: 'test',
      timestamp: new Date().toISOString(),
      sessionId,
      idempotencyKey: generateIdempotencyKey('test', { webhookId: webhook.id }),
      deliveryId: generateDeliveryId(),
      data: {
        message: 'This is a test webhook from OpenWA',
        webhookId: webhook.id,
        url: webhook.url,
      },
    };

    const body = JSON.stringify(testPayload);
    const headers = this.buildSystemHeaders(webhook, {
      event: 'test',
      idempotencyKey: testPayload.idempotencyKey,
      deliveryId: testPayload.deliveryId,
    });
    if (webhook.secret) {
      headers['X-OpenWA-Signature'] = this.generateSignature(body, webhook.secret);
    }

    try {
      const response = await sendGuardedWebhook(webhook.url, { headers, body, timeoutMs: this.deliveryTimeout() });
      return {
        success: response.ok,
        statusCode: response.status,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async dispatch(sessionId: string, event: string, data: Record<string, unknown>): Promise<void> {
    // Callers fire-and-forget this (`void dispatch(...)`), so a failure looking up webhooks must be
    // logged and swallowed here - otherwise it surfaces as an unhandled promise rejection.
    let webhooks: Webhook[];
    try {
      webhooks = await this.webhookRepository.find({
        where: { sessionId, active: true },
      });
    } catch (error) {
      this.logger.error(`Webhook dispatch lookup failed for ${event}`, String(error), {
        sessionId,
        action: 'webhook_dispatch_lookup_failed',
      });
      return;
    }

    const matchingWebhooks = webhooks.filter(
      w => (w.events.includes(event) || w.events.includes('*')) && evaluateFilters(w.filters, event, data),
    );

    // Generate idempotency key (same for all webhooks receiving this event)
    const idempotencyKey = generateIdempotencyKey(event, { ...data, sessionId });

    for (const webhook of matchingWebhooks) {
      await this.dispatchOne(webhook, { sessionId, event, data, idempotencyKey });
    }
  }

  /**
   * Deliver one event to one webhook: run the `webhook:before` hook (plugins may cancel or rewrite
   * the payload), build the headers, then hand off to the chosen transport - the queue when enabled
   * (retries via BullMQ in the processor), otherwise a single best-effort direct send.
   */
  private async dispatchOne(
    webhook: Webhook,
    ctx: { sessionId: string; event: string; data: Record<string, unknown>; idempotencyKey: string },
  ): Promise<void> {
    const { sessionId, event, data, idempotencyKey } = ctx;
    const deliveryId = generateDeliveryId();
    const payload: WebhookPayload = {
      event,
      timestamp: new Date().toISOString(),
      sessionId,
      idempotencyKey,
      deliveryId,
      data,
    };

    const { continue: shouldContinue, data: hookResult } = await this.hookManager.execute(
      'webhook:before',
      { sessionId, event, payload },
      { sessionId, source: 'WebhookService' },
    );
    if (!shouldContinue) {
      this.logger.debug(`Webhook dispatch cancelled by plugin for ${event}`, {
        webhookId: webhook.id,
        action: 'webhook_cancelled_by_plugin',
      });
      return;
    }

    const finalPayload = (hookResult as { payload: WebhookPayload }).payload;
    const headers = this.buildSystemHeaders(webhook, { event, idempotencyKey, deliveryId });

    if (this.queueEnabled && this.webhookQueue) {
      await this.enqueue(webhook, { sessionId, event }, finalPayload, headers);
    } else {
      await this.deliverDirect(webhook, { sessionId, event }, finalPayload, headers);
    }
  }

  // Queue transport: hand the job to BullMQ (the processor performs the actual delivery + retries).
  private async enqueue(
    webhook: Webhook,
    ctx: { sessionId: string; event: string },
    payload: WebhookPayload,
    headers: Record<string, string>,
  ): Promise<void> {
    const queue = this.webhookQueue;
    if (!queue) return;
    const { sessionId, event } = ctx;
    const signature = webhook.secret ? this.generateSignature(JSON.stringify(payload), webhook.secret) : '';
    if (webhook.secret) {
      headers['X-OpenWA-Signature'] = signature;
    }

    const jobData: WebhookJobData = {
      webhookId: webhook.id,
      url: webhook.url,
      event,
      payload,
      signature,
      headers,
      attempt: 1,
      maxRetries: webhook.retryCount,
    };

    try {
      await queue.add(`webhook-${webhook.id}`, jobData, {
        attempts: webhook.retryCount,
        backoff: { type: 'exponential', delay: this.configService.get<number>('webhook.retryDelay', 5000) },
      });
      // webhook:queued only - delivered/error fire in the processor once the job runs.
      await this.hookManager.execute(
        'webhook:queued',
        { sessionId, event, webhookId: webhook.id, deliveryId: payload.deliveryId },
        { sessionId, source: 'WebhookService' },
      );
      this.logger.debug(`Webhook job queued for ${webhook.id}`, {
        webhookId: webhook.id,
        event,
        idempotencyKey: payload.idempotencyKey,
        deliveryId: payload.deliveryId,
        action: 'webhook_queued',
      });
    } catch (error) {
      await this.hookManager.execute(
        'webhook:error',
        { sessionId, event, webhookId: webhook.id, error: `Queue failed: ${String(error)}` },
        { sessionId, source: 'WebhookService' },
      );
      this.logger.error(`Failed to queue webhook ${webhook.id}`, String(error), {
        webhookId: webhook.id,
        action: 'webhook_queue_failed',
      });
    }
  }

  // Direct transport (queue disabled): a single best-effort send. Retries are a queue-only feature;
  // this is the single place the direct path updates lastTriggeredAt and fires delivered/error.
  private async deliverDirect(
    webhook: Webhook,
    ctx: { sessionId: string; event: string },
    payload: WebhookPayload,
    headers: Record<string, string>,
  ): Promise<void> {
    const { sessionId, event } = ctx;
    const body = JSON.stringify(payload);
    if (webhook.secret && !headers['X-OpenWA-Signature']) {
      headers['X-OpenWA-Signature'] = this.generateSignature(body, webhook.secret);
    }

    try {
      const response = await sendGuardedWebhook(webhook.url, { headers, body, timeoutMs: this.deliveryTimeout() });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      await this.webhookRepository.update(webhook.id, { lastTriggeredAt: new Date() });

      await this.hookManager.execute(
        'webhook:delivered',
        { sessionId, event, webhookId: webhook.id, deliveryId: payload.deliveryId },
        { sessionId, source: 'WebhookService' },
      );
      // Legacy hook for backward compatibility.
      await this.hookManager.execute(
        'webhook:after',
        { sessionId, event, webhookId: webhook.id, success: true },
        { sessionId, source: 'WebhookService' },
      );

      this.logger.debug(`Webhook delivered to ${webhook.id}`, {
        webhookId: webhook.id,
        deliveryId: payload.deliveryId,
        action: 'webhook_delivered',
      });
    } catch (error) {
      await this.hookManager.execute(
        'webhook:error',
        { sessionId, event, webhookId: webhook.id, error: String(error) },
        { sessionId, source: 'WebhookService' },
      );
      this.logger.error(`Failed to deliver webhook ${webhook.id}`, String(error), {
        webhookId: webhook.id,
        deliveryId: payload.deliveryId,
        action: 'webhook_delivery_failed',
      });
    }
  }

  /**
   * Build the outbound headers for a webhook request: sanitized custom headers FIRST so the
   * system headers below always win (a webhook config can't forge event/idempotency/signature).
   * The signature header, which depends on the serialized body, is added by the caller.
   */
  private buildSystemHeaders(
    webhook: Webhook,
    meta: { event: string; idempotencyKey: string; deliveryId: string; retryCount?: number },
  ): Record<string, string> {
    return {
      ...this.sanitizeCustomHeaders(webhook.headers),
      'Content-Type': 'application/json',
      'User-Agent': 'OpenWA-Webhook/1.0.0',
      'X-OpenWA-Event': meta.event,
      'X-OpenWA-Idempotency-Key': meta.idempotencyKey,
      'X-OpenWA-Delivery-Id': meta.deliveryId,
      'X-OpenWA-Retry-Count': String(meta.retryCount ?? 0),
    };
  }

  private deliveryTimeout(): number {
    return this.configService.get<number>('webhook.timeout', 10000);
  }

  /**
   * Drop operator-supplied custom headers that target reserved names (Content-Type or any
   * X-OpenWA-* header) so a webhook config cannot forge the signature/event/idempotency
   * headers. Spread the result BEFORE the system headers so system always wins.
   */
  private sanitizeCustomHeaders(custom: Record<string, string> | null | undefined): Record<string, string> {
    const safe: Record<string, string> = {};
    for (const [key, value] of Object.entries(custom ?? {})) {
      if (!/^(content-type|x-openwa-)/i.test(key)) {
        safe[key] = value;
      }
    }
    return safe;
  }

  private generateSignature(payload: string, secret: string): string {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(payload);
    return `sha256=${hmac.digest('hex')}`;
  }
}
