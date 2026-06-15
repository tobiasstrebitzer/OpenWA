import { Injectable, UseGuards } from '@nestjs/common';
import { Action, Actions } from '@silkweave/nestjs';
import { z } from 'zod/v4';
import { ApiKeyGuard } from '../auth/guards/api-key.guard';
import { RequireRole } from '../auth/decorators/auth.decorators';
import { ApiKeyRole } from '../auth/entities/api-key.entity';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/entities/audit-log.entity';
import { SessionService } from './session.service';
import { Session } from './entities/session.entity';
import { SessionResponseDto } from './dto';

const IdInput = z.object({
  id: z.string().describe('Session ID'),
});

const CreateInput = z.object({
  name: z
    .string()
    .min(3)
    .max(50)
    .regex(/^[a-zA-Z0-9-]+$/, 'Session name can only contain letters, numbers, and hyphens')
    .describe('Unique name for the session (alphanumeric and hyphens only)'),
  config: z.record(z.string(), z.unknown()).optional().describe('Session configuration options'),
  proxyUrl: z.string().max(255).optional().describe('Proxy URL for this session'),
  proxyType: z.enum(['http', 'https', 'socks4', 'socks5']).optional().describe('Proxy type'),
});

@Injectable()
@Actions('sessions')
@UseGuards(ApiKeyGuard)
export class SessionActions {
  constructor(
    private readonly sessionService: SessionService,
    private readonly auditService: AuditService,
  ) {}

  @Action({
    description: 'List all sessions',
    input: z.object({}),
    kind: 'query',
    method: 'GET',
    path: 'sessions',
  })
  async list(): Promise<SessionResponseDto[]> {
    const sessions = await this.sessionService.findAll();
    return sessions.map(s => this.transformSession(s));
  }

  @Action({
    description: 'Get session by ID',
    input: IdInput,
    kind: 'query',
    method: 'GET',
    path: 'sessions/:id',
  })
  async get(input: z.infer<typeof IdInput>): Promise<SessionResponseDto> {
    const session = await this.sessionService.findOne(input.id);
    return this.transformSession(session);
  }

  @Action({
    description: 'Get session statistics for multi-session monitoring',
    input: z.object({}),
    kind: 'query',
    method: 'GET',
    path: 'sessions/stats/overview',
  })
  statsOverview() {
    return this.sessionService.getStats();
  }

  @RequireRole(ApiKeyRole.OPERATOR)
  @Action({
    description: 'Get QR code for session authentication',
    input: IdInput,
    kind: 'query',
    method: 'GET',
    path: 'sessions/:id/qr',
  })
  async qr(input: z.infer<typeof IdInput>) {
    const qrCode = await this.sessionService.getQRCode(input.id);
    await this.auditService.logInfo(AuditAction.SESSION_QR_GENERATED, {
      sessionId: input.id,
    });
    return qrCode;
  }

  @RequireRole(ApiKeyRole.OPERATOR)
  @Action({
    description: 'Create a new WhatsApp session',
    input: CreateInput,
    method: 'POST',
    path: 'sessions',
  })
  async create(input: z.infer<typeof CreateInput>): Promise<Session> {
    const session = await this.sessionService.create(input);
    await this.auditService.logInfo(AuditAction.SESSION_CREATED, {
      sessionId: session.id,
      sessionName: session.name,
    });
    return session;
  }

  @RequireRole(ApiKeyRole.OPERATOR)
  @Action({
    description: 'Start a session and initialize WhatsApp connection',
    input: IdInput,
    method: 'POST',
    path: 'sessions/:id/start',
  })
  async start(input: z.infer<typeof IdInput>): Promise<SessionResponseDto> {
    const session = await this.sessionService.start(input.id);
    await this.auditService.logInfo(AuditAction.SESSION_STARTED, {
      sessionId: session.id,
      sessionName: session.name,
    });
    return this.transformSession(session);
  }

  @RequireRole(ApiKeyRole.OPERATOR)
  @Action({
    description: 'Stop a session and disconnect WhatsApp',
    input: IdInput,
    method: 'POST',
    path: 'sessions/:id/stop',
  })
  async stop(input: z.infer<typeof IdInput>): Promise<SessionResponseDto> {
    const session = await this.sessionService.stop(input.id);
    await this.auditService.logInfo(AuditAction.SESSION_STOPPED, {
      sessionId: session.id,
      sessionName: session.name,
    });
    return this.transformSession(session);
  }

  @RequireRole(ApiKeyRole.OPERATOR)
  @Action({
    description: 'Delete a session',
    input: IdInput,
    method: 'DELETE',
    path: 'sessions/:id',
  })
  async delete(input: z.infer<typeof IdInput>): Promise<{ success: true }> {
    const session = await this.sessionService.findOne(input.id);
    await this.sessionService.delete(input.id);
    await this.auditService.logInfo(AuditAction.SESSION_DELETED, {
      sessionId: input.id,
      sessionName: session.name,
    });
    return { success: true };
  }

  /** Transform entity to response DTO with the `lastActive` field name. */
  private transformSession(session: Session): SessionResponseDto {
    return {
      id: session.id,
      name: session.name,
      status: session.status,
      phone: session.phone,
      pushName: session.pushName,
      connectedAt: session.connectedAt,
      lastActive: session.lastActiveAt,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };
  }
}
