import { Injectable, UseGuards } from '@nestjs/common';
import { Action, Actions } from '@silkweave/nestjs';
import { z } from 'zod/v4';
import { ApiKeyGuard } from '../auth/guards/api-key.guard';
import { PluginsService } from './plugins.service';

const IdInput = z.object({
  id: z.string().describe('Plugin ID'),
});

const UpdateConfigInput = z.object({
  id: z.string().describe('Plugin ID'),
  config: z.record(z.string(), z.unknown()).describe('Plugin configuration object'),
});

@Injectable()
@Actions('plugins')
@UseGuards(ApiKeyGuard)
export class PluginsActions {
  constructor(private readonly pluginsService: PluginsService) {}

  @Action({
    description: 'List all plugins',
    input: z.object({}),
    kind: 'query',
    method: 'GET',
    path: 'plugins',
  })
  list() {
    return this.pluginsService.findAll();
  }

  @Action({
    description: 'Get a plugin by ID',
    input: IdInput,
    kind: 'query',
    method: 'GET',
    path: 'plugins/:id',
  })
  get(input: z.infer<typeof IdInput>) {
    return this.pluginsService.findOne(input.id);
  }

  @Action({
    description: 'Enable a plugin',
    input: IdInput,
    method: 'POST',
    path: 'plugins/:id/enable',
  })
  enable(input: z.infer<typeof IdInput>) {
    return this.pluginsService.enable(input.id);
  }

  @Action({
    description: 'Disable a plugin',
    input: IdInput,
    method: 'POST',
    path: 'plugins/:id/disable',
  })
  disable(input: z.infer<typeof IdInput>) {
    return this.pluginsService.disable(input.id);
  }

  @Action({
    description: 'Update plugin configuration',
    input: UpdateConfigInput,
    method: 'PUT',
    path: 'plugins/:id/config',
  })
  updateConfig(input: z.infer<typeof UpdateConfigInput>) {
    return this.pluginsService.updateConfig(input.id, input.config);
  }

  @Action({
    description: 'Check plugin health',
    input: IdInput,
    kind: 'query',
    method: 'GET',
    path: 'plugins/:id/health',
  })
  healthCheck(input: z.infer<typeof IdInput>) {
    return this.pluginsService.healthCheck(input.id);
  }
}
