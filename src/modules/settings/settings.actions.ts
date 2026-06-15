import { Injectable, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Action, Actions } from '@silkweave/nestjs';
import { z } from 'zod/v4';
import { ApiKeyGuard } from '../auth/guards/api-key.guard';
import { RequireRole } from '../auth/decorators/auth.decorators';
import { ApiKeyRole } from '../auth/entities/api-key.entity';

interface Settings {
  general: {
    apiBaseUrl: string;
    sessionTimeout: number;
    autoReconnect: boolean;
    debugMode: boolean;
  };
  api: {
    rateLimit: number;
    rateLimitWindow: number;
    enableDocs: boolean;
  };
  notifications: {
    emailEnabled: boolean;
    notificationEmail: string;
    webhookAlerts: boolean;
  };
}

const GeneralInput = z
  .object({
    apiBaseUrl: z.string(),
    sessionTimeout: z.number(),
    autoReconnect: z.boolean(),
    debugMode: z.boolean(),
  })
  .partial();

const ApiInput = z
  .object({
    rateLimit: z.number(),
    rateLimitWindow: z.number(),
    enableDocs: z.boolean(),
  })
  .partial();

const NotificationsInput = z
  .object({
    emailEnabled: z.boolean(),
    notificationEmail: z.string(),
    webhookAlerts: z.boolean(),
  })
  .partial();

const UpdateInput = z
  .object({
    general: GeneralInput.optional(),
    api: ApiInput.optional(),
    notifications: NotificationsInput.optional(),
  })
  .describe('Partial settings to merge into the current settings');

/**
 * Settings actions — REST routes restored to match the original NestJS controller:
 *   GET  /api/settings  -> get()    (read current settings)
 *   PUT  /api/settings  -> update()  (ADMIN, merge partial settings)
 */
@Injectable()
@Actions('settings')
@UseGuards(ApiKeyGuard)
export class SettingsActions {
  private settings: Settings;

  constructor(private readonly configService: ConfigService) {
    // Initialize with values from configuration (reads from .env)
    const port = this.configService.get<number>('port', 2785);

    this.settings = {
      general: {
        apiBaseUrl: `http://localhost:${port}`,
        sessionTimeout: Math.floor(this.configService.get<number>('webhook.timeout', 300000) / 60000),
        autoReconnect: this.configService.get<boolean>('engine.autoReconnect', false),
        debugMode: this.configService.get<boolean>('database.logging', false),
      },
      api: {
        rateLimit: this.configService.get<number>('api.rateLimit.mediumLimit', 100),
        rateLimitWindow: this.configService.get<number>('api.rateLimit.mediumTtl', 60000),
        enableDocs: true, // Swagger docs always enabled
      },
      notifications: {
        emailEnabled: false,
        notificationEmail: '',
        webhookAlerts: true,
      },
    };
  }

  @Action({
    method: 'GET',
    path: 'settings',
    description: 'Get application settings',
    input: z.object({}),
    kind: 'query',
  })
  get(): Settings {
    return this.settings;
  }

  @RequireRole(ApiKeyRole.ADMIN)
  @Action({
    method: 'PUT',
    path: 'settings',
    description: 'Update application settings',
    input: UpdateInput,
  })
  update(newSettings: z.infer<typeof UpdateInput>): Settings {
    if (newSettings.general) {
      this.settings.general = {
        ...this.settings.general,
        ...newSettings.general,
      };
    }
    if (newSettings.api) {
      this.settings.api = { ...this.settings.api, ...newSettings.api };
    }
    if (newSettings.notifications) {
      this.settings.notifications = {
        ...this.settings.notifications,
        ...newSettings.notifications,
      };
    }
    return this.settings;
  }
}
