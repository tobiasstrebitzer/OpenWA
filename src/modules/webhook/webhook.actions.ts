import { Injectable, UseGuards } from '@nestjs/common';
import { Action, Actions } from '@silkweave/nestjs';
import { z } from 'zod/v4';
import { ApiKeyGuard } from '../auth/guards/api-key.guard';
import { RequireRole } from '../auth/decorators/auth.decorators';
import { ApiKeyRole } from '../auth/entities/api-key.entity';
import { WebhookService } from './webhook.service';

const ListInput = z.object({
  sessionId: z.string().describe('Session ID'),
});

const IdInput = z.object({
  sessionId: z.string().describe('Session ID'),
  id: z.string().describe('Webhook ID'),
});

const CreateInput = z.object({
  sessionId: z.string().describe('Session ID'),
  url: z.url().describe('Webhook URL to receive events'),
  events: z.array(z.string()).min(1).optional().describe('Event types to subscribe to'),
  secret: z.string().optional().describe('Secret key for HMAC signature verification'),
  headers: z.record(z.string(), z.string()).optional().describe('Custom headers to include in webhook requests'),
  retryCount: z.number().int().min(0).max(5).optional().describe('Number of retry attempts on failure'),
});

const UpdateInput = z.object({
  sessionId: z.string().describe('Session ID'),
  id: z.string().describe('Webhook ID'),
  url: z.url().optional(),
  events: z.array(z.string()).optional(),
  secret: z.string().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  active: z.boolean().optional(),
  retryCount: z.number().int().min(0).max(5).optional(),
});

const TestInput = z.object({
  sessionId: z.string().describe('Session ID'),
  id: z.string().describe('Webhook ID'),
});

@Injectable()
@Actions('webhooks')
@UseGuards(ApiKeyGuard)
export class WebhookActions {
  constructor(private readonly webhookService: WebhookService) {}

  @Action({
    method: 'GET',
    path: 'webhooks',
    description: 'List all webhooks across all sessions',
    input: z.object({}),
    kind: 'query',
  })
  listAll() {
    return this.webhookService.findAll();
  }

  @Action({
    method: 'GET',
    path: 'sessions/:sessionId/webhooks',
    description: 'List all webhooks for a session',
    input: ListInput,
    kind: 'query',
  })
  list(input: z.infer<typeof ListInput>) {
    return this.webhookService.findBySession(input.sessionId);
  }

  @Action({
    method: 'GET',
    path: 'sessions/:sessionId/webhooks/:id',
    description: 'Get a webhook by ID',
    input: IdInput,
    kind: 'query',
  })
  get(input: z.infer<typeof IdInput>) {
    return this.webhookService.findOne(input.id);
  }

  @RequireRole(ApiKeyRole.OPERATOR)
  @Action({
    method: 'POST',
    path: 'sessions/:sessionId/webhooks',
    description: 'Create a webhook for the session',
    input: CreateInput,
  })
  create(input: z.infer<typeof CreateInput>) {
    const { sessionId, ...dto } = input;
    return this.webhookService.create(sessionId, dto);
  }

  @RequireRole(ApiKeyRole.OPERATOR)
  @Action({
    method: 'PUT',
    path: 'sessions/:sessionId/webhooks/:id',
    description: 'Update a webhook',
    input: UpdateInput,
  })
  update(input: z.infer<typeof UpdateInput>) {
    const { id, sessionId, ...dto } = input;
    return this.webhookService.update(id, dto);
  }

  @RequireRole(ApiKeyRole.OPERATOR)
  @Action({
    method: 'POST',
    path: 'sessions/:sessionId/webhooks/:id/test',
    description: 'Test a webhook by sending a test payload',
    input: TestInput,
  })
  test(input: z.infer<typeof TestInput>) {
    return this.webhookService.test(input.sessionId, input.id);
  }

  @RequireRole(ApiKeyRole.OPERATOR)
  @Action({
    method: 'DELETE',
    path: 'sessions/:sessionId/webhooks/:id',
    description: 'Delete a webhook',
    input: IdInput,
  })
  async delete(input: z.infer<typeof IdInput>) {
    await this.webhookService.delete(input.id);
    return { success: true };
  }
}
