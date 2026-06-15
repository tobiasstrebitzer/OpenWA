import { Injectable, UseGuards } from '@nestjs/common';
import { Action, Actions } from '@silkweave/nestjs';
import { z } from 'zod/v4';
import { ApiKeyGuard } from '../auth/guards/api-key.guard';
import { RequireRole } from '../auth/decorators/auth.decorators';
import { ApiKeyRole } from '../auth/entities/api-key.entity';
import { TemplateService } from './template.service';
import { Template } from './entities/template.entity';

const NAME_MAX_LENGTH = 100;
const BODY_MAX_LENGTH = 4096;
const HEADER_FOOTER_MAX_LENGTH = 1024;

const CreateInput = z.object({
  sessionId: z.string().describe('Session ID'),
  name: z.string().min(1).max(NAME_MAX_LENGTH).describe('Unique template name within the session'),
  body: z.string().min(1).max(BODY_MAX_LENGTH).describe('Template body with {{variable}} placeholders'),
  header: z.string().max(HEADER_FOOTER_MAX_LENGTH).optional().describe('Optional header text, prepended to the body'),
  footer: z.string().max(HEADER_FOOTER_MAX_LENGTH).optional().describe('Optional footer text, appended to the body'),
});

const UpdateInput = z.object({
  sessionId: z.string().describe('Session ID'),
  id: z.string().describe('Template ID'),
  name: z.string().min(1).max(NAME_MAX_LENGTH).optional().describe('Template name'),
  body: z.string().min(1).max(BODY_MAX_LENGTH).optional().describe('Template body with {{variable}} placeholders'),
  header: z.string().max(HEADER_FOOTER_MAX_LENGTH).optional().describe('Optional header text'),
  footer: z.string().max(HEADER_FOOTER_MAX_LENGTH).optional().describe('Optional footer text'),
});

const SessionInput = z.object({
  sessionId: z.string().describe('Session ID'),
});

const IdInput = z.object({
  sessionId: z.string().describe('Session ID'),
  id: z.string().describe('Template ID'),
});

@Injectable()
@Actions('templates')
@UseGuards(ApiKeyGuard)
export class TemplateActions {
  constructor(private readonly templateService: TemplateService) {}

  @RequireRole(ApiKeyRole.OPERATOR)
  @Action({
    description: 'Create a message template for the session',
    input: CreateInput,
    method: 'POST',
    path: 'sessions/:sessionId/templates',
  })
  create(input: z.infer<typeof CreateInput>): Promise<Template> {
    const { sessionId, ...dto } = input;
    return this.templateService.create(sessionId, dto);
  }

  @RequireRole(ApiKeyRole.OPERATOR)
  @Action({
    description: 'List all templates for a session',
    input: SessionInput,
    kind: 'query',
    method: 'GET',
    path: 'sessions/:sessionId/templates',
  })
  list(input: z.infer<typeof SessionInput>): Promise<Template[]> {
    return this.templateService.findBySession(input.sessionId);
  }

  @RequireRole(ApiKeyRole.OPERATOR)
  @Action({
    description: 'Get a template by ID',
    input: IdInput,
    kind: 'query',
    method: 'GET',
    path: 'sessions/:sessionId/templates/:id',
  })
  get(input: z.infer<typeof IdInput>): Promise<Template> {
    return this.templateService.findOne(input.sessionId, input.id);
  }

  @RequireRole(ApiKeyRole.OPERATOR)
  @Action({
    description: 'Update a template',
    input: UpdateInput,
    method: 'PUT',
    path: 'sessions/:sessionId/templates/:id',
  })
  update(input: z.infer<typeof UpdateInput>): Promise<Template> {
    const { sessionId, id, ...dto } = input;
    return this.templateService.update(sessionId, id, dto);
  }

  @RequireRole(ApiKeyRole.OPERATOR)
  @Action({
    description: 'Delete a template',
    input: IdInput,
    method: 'DELETE',
    path: 'sessions/:sessionId/templates/:id',
  })
  async delete(input: z.infer<typeof IdInput>): Promise<{ success: true }> {
    await this.templateService.delete(input.sessionId, input.id);
    return { success: true };
  }
}
