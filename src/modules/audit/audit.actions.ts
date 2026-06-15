import { Injectable, UseGuards } from '@nestjs/common';
import { Action, Actions } from '@silkweave/nestjs';
import { z } from 'zod/v4';
import { ApiKeyGuard } from '../auth/guards/api-key.guard';
import { AuditService, AuditQueryOptions } from './audit.service';
import { AuditAction, AuditSeverity } from './entities/audit-log.entity';

const ListInput = z.object({
  action: z.enum(AuditAction).optional().describe('Filter by audit action'),
  severity: z.enum(AuditSeverity).optional().describe('Filter by severity'),
  sessionId: z.string().optional().describe('Filter by session ID'),
  apiKeyId: z.string().optional().describe('Filter by API key ID'),
  limit: z.coerce.number().int().min(1).max(500).default(50).describe('Max number of records to return'),
  offset: z.coerce.number().int().min(0).default(0).describe('Number of records to skip'),
});

@Injectable()
@Actions('audit')
@UseGuards(ApiKeyGuard)
export class AuditActions {
  constructor(private readonly auditService: AuditService) {}

  @Action({
    description: 'List audit logs with optional filters',
    input: ListInput,
    kind: 'query',
    method: 'GET',
    path: 'audit',
  })
  list(input: z.infer<typeof ListInput>) {
    const options: AuditQueryOptions = {
      limit: input.limit,
      offset: input.offset,
    };
    if (input.action) options.action = input.action;
    if (input.severity) options.severity = input.severity;
    if (input.sessionId) options.sessionId = input.sessionId;
    if (input.apiKeyId) options.apiKeyId = input.apiKeyId;

    return this.auditService.findAll(options);
  }
}
