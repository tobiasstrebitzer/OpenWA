import { Injectable, UseGuards } from '@nestjs/common';
import { Action, Actions } from '@silkweave/nestjs';
import type { SilkweaveContext } from '@silkweave/core';
import type { Request } from 'express';
import { z } from 'zod/v4';
import { ApiKeyGuard } from './guards/api-key.guard';
import { RequireRole } from './decorators/auth.decorators';
import { ApiKey, ApiKeyRole } from './entities/api-key.entity';
import { AuthService } from './auth.service';

const IdInput = z.object({
  id: z.string().describe('API key ID'),
});

const CreateInput = z.object({
  name: z.string().min(3).max(100).describe('Friendly name for the API key'),
  role: z.enum(ApiKeyRole).optional().describe('Role/permission level'),
  allowedIps: z.array(z.string()).optional().describe('Allowed IP addresses (whitelist)'),
  allowedSessions: z.array(z.string()).optional().describe('Allowed session IDs this key can access'),
  expiresAt: z.iso.datetime().optional().describe('Expiration date (ISO 8601)'),
});

const UpdateInput = z.object({
  id: z.string().describe('API key ID'),
  name: z.string().min(3).max(100).optional(),
  role: z.enum(ApiKeyRole).optional(),
  allowedIps: z.array(z.string()).optional(),
  allowedSessions: z.array(z.string()).optional(),
  expiresAt: z.iso.datetime().optional(),
});

@Injectable()
@Actions('auth')
@UseGuards(ApiKeyGuard)
export class AuthActions {
  constructor(private readonly authService: AuthService) {}

  private toResponse(k: ApiKey) {
    return {
      id: k.id,
      name: k.name,
      keyPrefix: k.keyPrefix,
      role: k.role,
      allowedIps: k.allowedIps || undefined,
      allowedSessions: k.allowedSessions || undefined,
      isActive: k.isActive,
      expiresAt: k.expiresAt || undefined,
      lastUsedAt: k.lastUsedAt || undefined,
      usageCount: k.usageCount,
      createdAt: k.createdAt,
    };
  }

  @RequireRole(ApiKeyRole.ADMIN)
  @Action({
    name: 'api-keys-list',
    method: 'GET',
    path: 'auth/api-keys',
    description: 'List all API keys (admin only)',
    input: z.object({}),
    kind: 'query',
  })
  async listApiKeys() {
    const keys = await this.authService.findAll();
    return keys.map(k => this.toResponse(k));
  }

  @RequireRole(ApiKeyRole.ADMIN)
  @Action({
    name: 'api-keys-get',
    method: 'GET',
    path: 'auth/api-keys/:id',
    description: 'Get API key details (admin only)',
    input: IdInput,
    kind: 'query',
  })
  async getApiKey(input: z.infer<typeof IdInput>) {
    const k = await this.authService.findOne(input.id);
    return this.toResponse(k);
  }

  @RequireRole(ApiKeyRole.ADMIN)
  @Action({
    name: 'api-keys-create',
    method: 'POST',
    path: 'auth/api-keys',
    description: 'Create a new API key (admin only). Returns the raw key once.',
    input: CreateInput,
  })
  async createApiKey(input: z.infer<typeof CreateInput>) {
    const { apiKey, rawKey } = await this.authService.createApiKey(input);
    return { ...this.toResponse(apiKey), apiKey: rawKey };
  }

  @RequireRole(ApiKeyRole.ADMIN)
  @Action({
    name: 'api-keys-update',
    method: 'PUT',
    path: 'auth/api-keys/:id',
    description: 'Update an API key (admin only)',
    input: UpdateInput,
  })
  async updateApiKey(input: z.infer<typeof UpdateInput>) {
    const { id, ...dto } = input;
    const k = await this.authService.update(id, dto);
    return this.toResponse(k);
  }

  @RequireRole(ApiKeyRole.ADMIN)
  @Action({
    name: 'api-keys-revoke',
    method: 'POST',
    path: 'auth/api-keys/:id/revoke',
    description: 'Revoke (deactivate) an API key (admin only)',
    input: IdInput,
  })
  async revokeApiKey(input: z.infer<typeof IdInput>) {
    const k = await this.authService.revoke(input.id);
    return this.toResponse(k);
  }

  @RequireRole(ApiKeyRole.ADMIN)
  @Action({
    name: 'api-keys-delete',
    method: 'DELETE',
    path: 'auth/api-keys/:id',
    description: 'Delete an API key permanently (admin only)',
    input: IdInput,
  })
  async deleteApiKey(input: z.infer<typeof IdInput>) {
    await this.authService.delete(input.id);
    return { success: true };
  }

  @Action({
    method: 'POST',
    path: 'auth/validate',
    description: 'Validate the current API key and return its role',
    input: z.object({}),
    transports: ['rest'],
  })
  validate(_input: Record<string, never>, context: SilkweaveContext): { valid: boolean; role?: string } {
    const request = context.get<Request & { apiKey?: ApiKey }>('request');
    const apiKey = request?.apiKey;
    return { valid: true, role: apiKey?.role };
  }
}
