import { Injectable, UseGuards, BadRequestException } from '@nestjs/common';
import { Action, Actions } from '@silkweave/nestjs';
import { z } from 'zod/v4';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { ApiKeyGuard } from '../auth/guards/api-key.guard';
import { Public, RequireRole } from '../auth/decorators/auth.decorators';
import { ApiKeyRole } from '../auth/entities/api-key.entity';
import { isPathWithin } from '../../common/utils/path-safety';
import { EngineFactory } from '../../engine/engine.factory';
import { DockerService } from '../docker';
import { CacheService } from '../../common/cache/cache.service';
import { StorageService } from '../../common/storage/storage.service';
import { ShutdownService } from '../../common/services/shutdown.service';
import { createLogger } from '../../common/services/logger.service';
import * as fs from 'fs';
import * as path from 'path';

interface InfraStatus {
  database: { connected: boolean; type: string; host: string };
  redis: { enabled: boolean; connected: boolean; host: string; port: number };
  queue: {
    enabled: boolean;
    messages: { pending: number; completed: number; failed: number };
    webhooks: { pending: number; completed: number; failed: number };
  };
  storage: { type: 'local' | 's3'; path?: string; bucket?: string };
  engine: { type: string; headless: boolean; sessionDataPath: string; browserArgs: string };
}

// Database migration types for export/import
interface SessionRow {
  id: string;
  name: string;
  status: string;
  phone: string | null;
  pushName: string | null;
  config: string | Record<string, unknown>;
  proxyUrl: string | null;
  proxyType: string | null;
  connectedAt: string | null;
  lastActiveAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface WebhookRow {
  id: string;
  sessionId: string;
  url: string;
  events: string | string[];
  secret: string | null;
  headers: string | Record<string, string>;
  active: boolean;
  retryCount: number;
  lastTriggeredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface MessageRow {
  id: string;
  sessionId: string;
  messageId: string;
  chatId: string;
  direction: string;
  type: string;
  content: string | Record<string, unknown>;
  status: string;
  metadata: string | Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

interface MessageBatchRow {
  id: string;
  batchId: string;
  sessionId: string;
  status: string;
  messages: string | unknown[];
  options: string | Record<string, unknown>;
  progress: string | Record<string, unknown>;
  results: string | unknown[];
  currentIndex: number;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

interface MigrationTables {
  sessions: SessionRow[];
  webhooks: WebhookRow[];
  messages: MessageRow[];
  messageBatches: MessageBatchRow[];
}

// PUT /infra/config body (SaveConfigDto)
const SaveConfigInput = z.object({
  database: z
    .object({
      type: z.enum(['sqlite', 'postgres']),
      builtIn: z.boolean().optional(),
      host: z.string().optional(),
      port: z.string().optional(),
      username: z.string().optional(),
      password: z.string().optional(),
      database: z.string().optional(),
      poolSize: z.number().optional(),
      sslEnabled: z.boolean().optional(),
      sslRejectUnauthorized: z.boolean().optional(),
    })
    .optional(),
  redis: z
    .object({
      enabled: z.boolean().optional(),
      builtIn: z.boolean().optional(),
      host: z.string().optional(),
      port: z.string().optional(),
      password: z.string().optional(),
    })
    .optional(),
  queue: z
    .object({
      enabled: z.boolean().optional(),
    })
    .optional(),
  storage: z
    .object({
      type: z.enum(['local', 's3']),
      builtIn: z.boolean().optional(),
      localPath: z.string().optional(),
      s3Bucket: z.string().optional(),
      s3Region: z.string().optional(),
      s3AccessKey: z.string().optional(),
      s3SecretKey: z.string().optional(),
      s3Endpoint: z.string().optional(),
    })
    .optional(),
  engine: z
    .object({
      headless: z.boolean().optional(),
      sessionDataPath: z.string().optional(),
      browserArgs: z.string().optional(),
    })
    .optional(),
});

type SaveConfigDto = z.infer<typeof SaveConfigInput>;

const RestartInput = z.object({
  profiles: z.array(z.string()).optional().describe('Docker profiles to enable'),
  profilesToRemove: z.array(z.string()).optional().describe('Docker profiles to disable/remove'),
});

const ImportDataInput = z.object({
  tables: z
    .object({
      // z.any() keeps these representable in JSON Schema (z.custom<T>() is not),
      // which the MCP transport requires when generating the tool input schema.
      // Rows are an opaque DB dump re-imported as-is; the body asserts the shape.
      sessions: z.array(z.any()).optional(),
      webhooks: z.array(z.any()).optional(),
      messages: z.array(z.any()).optional(),
      messageBatches: z.array(z.any()).optional(),
    })
    .describe('Exported tables from infra.export-data'),
});

const ImportStorageInput = z.object({
  filePath: z.string().describe('Path to a tar.gz file inside the data directory'),
});

@Injectable()
@Actions('infra')
@UseGuards(ApiKeyGuard)
export class InfraActions {
  private readonly logger = createLogger('InfraActions');

  constructor(
    private readonly configService: ConfigService,
    @InjectDataSource('main')
    private readonly mainDataSource: DataSource,
    @InjectDataSource('data')
    private readonly dataDataSource: DataSource,
    private readonly engineFactory: EngineFactory,
    private readonly dockerService: DockerService,
    private readonly cacheService: CacheService,
    private readonly storageService: StorageService,
    private readonly shutdownService: ShutdownService,
  ) {}

  @Action({
    description: 'Get infrastructure status (database, redis, queue, storage, engine)',
    input: z.object({}),
    kind: 'query',
    method: 'GET',
    path: 'infra/status',
  })
  async status(): Promise<InfraStatus> {
    // Check both database connections
    const mainDbConnected = this.mainDataSource.isInitialized;
    const dataDbConnected = this.dataDataSource.isInitialized;
    const dbConnected = mainDbConnected && dataDbConnected;
    const dbType = this.configService.get<string>('dataDatabase.type', 'sqlite');
    const dbHost = this.configService.get<string>('dataDatabase.host', 'localhost');

    const redisHost = process.env.REDIS_HOST || this.configService.get<string>('redis.host', 'localhost');
    const redisPort = parseInt(process.env.REDIS_PORT || '', 10) || this.configService.get<number>('redis.port', 6379);
    const redisEnabled = process.env.REDIS_ENABLED === 'true';
    const queueEnabled = this.configService.get<boolean>('queue.enabled', false);

    // Check actual Redis connectivity via CacheService
    const redisConnected = await this.cacheService.isAvailable();

    const storageType = this.configService.get<'local' | 's3'>('storage.type', 'local');
    const storagePath = this.configService.get<string>('storage.path', './uploads');

    const engineType = this.configService.get<string>('engine.type', 'whatsapp-web.js');
    const engineHeadless = this.configService.get<boolean>('engine.headless', true);
    const sessionDataPath = this.configService.get<string>('engine.sessionDataPath', './data/sessions');
    const browserArgs = this.configService.get<string>('engine.browserArgs', '--no-sandbox --disable-gpu');

    return {
      database: { connected: dbConnected, type: dbType, host: dbHost },
      redis: { enabled: redisEnabled, connected: redisConnected, host: redisHost, port: redisPort },
      queue: {
        enabled: queueEnabled,
        messages: { pending: 0, completed: 0, failed: 0 },
        webhooks: { pending: 0, completed: 0, failed: 0 },
      },
      storage: { type: storageType, path: storagePath },
      engine: { type: engineType, headless: engineHeadless, sessionDataPath, browserArgs },
    };
  }

  @Action({
    description: 'Get available WhatsApp engines',
    input: z.object({}),
    kind: 'query',
    method: 'GET',
    path: 'infra/engines',
  })
  engines(): Array<{ id: string; name: string; enabled: boolean; features: string[] }> {
    return this.engineFactory.getAvailableEngines();
  }

  @Action({
    description: 'Get the current active WhatsApp engine',
    input: z.object({}),
    kind: 'query',
    method: 'GET',
    path: 'infra/engines/current',
  })
  enginesCurrent(): { engineType: string } {
    return { engineType: this.engineFactory.getCurrentEngine() };
  }

  @Public()
  @Action({
    description: 'Health check endpoint',
    input: z.object({}),
    kind: 'query',
    method: 'GET',
    path: 'infra/health',
  })
  health(): { status: string; timestamp: string } {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  @RequireRole(ApiKeyRole.ADMIN)
  @Action({
    description: 'Save infrastructure configuration to a generated .env file',
    input: SaveConfigInput,
    method: 'PUT',
    path: 'infra/config',
  })
  config(input: SaveConfigDto): { message: string; saved: boolean; envPath: string; profiles: string[] } {
    const config = input;
    try {
      // Build .env content from config
      const envLines: string[] = [];
      const profiles: string[] = [];

      // Header
      envLines.push('# OpenWA Configuration');
      envLines.push(`# Generated at ${new Date().toISOString()}`);
      envLines.push('');

      // Database
      if (config.database) {
        envLines.push('# Database');
        envLines.push(`DATABASE_TYPE=${config.database.type || 'sqlite'}`);
        envLines.push(`POSTGRES_BUILTIN=${config.database.builtIn ? 'true' : 'false'}`);
        if (config.database.type === 'postgres') {
          if (config.database.builtIn) {
            // Built-in PostgreSQL - use container name as host
            envLines.push('DATABASE_HOST=postgres');
            envLines.push('DATABASE_PORT=5432');
            envLines.push('DATABASE_USERNAME=openwa');
            envLines.push('DATABASE_PASSWORD=openwa');
            envLines.push('DATABASE_NAME=openwa');
            profiles.push('postgres');
          } else {
            // External PostgreSQL
            envLines.push(`DATABASE_HOST=${config.database.host || 'localhost'}`);
            envLines.push(`DATABASE_PORT=${config.database.port || '5432'}`);
            envLines.push(`DATABASE_USERNAME=${config.database.username || 'postgres'}`);
            envLines.push(`DATABASE_PASSWORD=${config.database.password || ''}`);
            envLines.push(`DATABASE_NAME=${config.database.database || 'openwa'}`);
          }
          envLines.push(`DATABASE_POOL_SIZE=${config.database.poolSize || 10}`);
          envLines.push(`DATABASE_SSL=${config.database.sslEnabled ? 'true' : 'false'}`);
          if (config.database.sslEnabled) {
            // Default to certificate verification; only relax it when the operator opts out
            // (managed Postgres with self-signed certs: Supabase, Heroku, Render, Railway).
            envLines.push(
              `DATABASE_SSL_REJECT_UNAUTHORIZED=${config.database.sslRejectUnauthorized === false ? 'false' : 'true'}`,
            );
          }
        }
        envLines.push('');
      }

      // Redis / Queue
      envLines.push('# Redis / Queue System');
      envLines.push(`REDIS_ENABLED=${config.redis?.enabled ? 'true' : 'false'}`);
      envLines.push(`REDIS_BUILTIN=${config.redis?.builtIn ? 'true' : 'false'}`);
      envLines.push(`QUEUE_ENABLED=${config.queue?.enabled ? 'true' : 'false'}`);
      if (config.redis?.enabled) {
        if (config.redis.builtIn) {
          // Built-in Redis - use container name as host
          envLines.push('REDIS_HOST=redis');
          envLines.push('REDIS_PORT=6379');
          profiles.push('redis');
        } else {
          // External Redis
          envLines.push(`REDIS_HOST=${config.redis.host || 'localhost'}`);
          envLines.push(`REDIS_PORT=${config.redis.port || '6379'}`);
          if (config.redis.password) {
            envLines.push(`REDIS_PASSWORD=${config.redis.password}`);
          }
        }
      }
      envLines.push('');

      // Storage
      if (config.storage) {
        envLines.push('# Storage');
        envLines.push(`STORAGE_TYPE=${config.storage.type || 'local'}`);
        envLines.push(`MINIO_BUILTIN=${config.storage.builtIn ? 'true' : 'false'}`);
        if (config.storage.type === 'local') {
          envLines.push(`STORAGE_PATH=${config.storage.localPath || './uploads'}`);
        } else if (config.storage.type === 's3') {
          if (config.storage.builtIn) {
            // Built-in MinIO - use container name as endpoint
            envLines.push('S3_ENDPOINT=http://minio:9000');
            envLines.push('S3_ACCESS_KEY=minioadmin');
            envLines.push('S3_SECRET_KEY=minioadmin');
            envLines.push('S3_BUCKET=openwa');
            envLines.push('S3_REGION=us-east-1');
            profiles.push('minio');
          } else {
            // External S3/MinIO
            envLines.push(`S3_BUCKET=${config.storage.s3Bucket || ''}`);
            envLines.push(`S3_REGION=${config.storage.s3Region || 'ap-southeast-1'}`);
            envLines.push(`S3_ACCESS_KEY=${config.storage.s3AccessKey || ''}`);
            envLines.push(`S3_SECRET_KEY=${config.storage.s3SecretKey || ''}`);
            if (config.storage.s3Endpoint) {
              envLines.push(`S3_ENDPOINT=${config.storage.s3Endpoint}`);
            }
          }
        }
        envLines.push('');
      }

      // Engine
      if (config.engine) {
        envLines.push('# WhatsApp Engine');
        envLines.push(`ENGINE_HEADLESS=${config.engine.headless !== false ? 'true' : 'false'}`);
        envLines.push(`ENGINE_SESSION_PATH=${config.engine.sessionDataPath || './data/sessions'}`);
        envLines.push(`ENGINE_BROWSER_ARGS=${config.engine.browserArgs || '--no-sandbox --disable-gpu'}`);
        envLines.push('');
      }

      // Docker Profiles (for reference)
      envLines.push('# Docker Profiles (auto-generated)');
      envLines.push(`# Required profiles: ${profiles.length > 0 ? profiles.join(', ') : 'none'}`);
      envLines.push('');

      // Write to .env file in data/ directory so it persists across container restarts
      const envPath = path.resolve(process.cwd(), 'data', '.env.generated');
      fs.writeFileSync(envPath, envLines.join('\n'), 'utf8');
      this.logger.log('Configuration saved', { envPath });

      const profileMsg = profiles.length > 0 ? ` Docker profiles required: ${profiles.join(', ')}.` : '';

      return {
        message: `Configuration saved successfully.${profileMsg} Server restart required to apply changes.`,
        saved: true,
        envPath,
        profiles,
      };
    } catch (error) {
      return {
        message: `Failed to save configuration: ${error instanceof Error ? error.message : 'Unknown error'}`,
        saved: false,
        envPath: '',
        profiles: [],
      };
    }
  }

  @RequireRole(ApiKeyRole.ADMIN)
  @Action({
    description: 'Request server restart with Docker orchestration',
    input: RestartInput,
    method: 'POST',
    path: 'infra/restart',
  })
  async restart(input: z.infer<typeof RestartInput>): Promise<{
    message: string;
    restarting: boolean;
    profiles: string[];
    profilesToRemove: string[];
    estimatedTime: number;
    orchestration?: object;
    removal?: object;
  }> {
    const profiles = input.profiles || [];
    const profilesToRemove = input.profilesToRemove || [];
    let orchestrationResult: object | undefined;
    let removalResult: { removed: string[]; errors: string[] } | undefined;

    this.logger.log('Restart requested', { profiles });
    this.logger.log('Profiles to remove', { profilesToRemove });

    // If profiles are specified, orchestrate Docker containers
    if (this.dockerService.isDockerAvailable()) {
      // First, remove containers for disabled services
      if (profilesToRemove.length > 0) {
        this.logger.log('Removing disabled profiles...');
        removalResult = { removed: [], errors: [] };

        for (const profile of profilesToRemove) {
          try {
            const success = await this.dockerService.removeService(profile);
            if (success) {
              removalResult.removed.push(profile);
            } else {
              removalResult.errors.push(`Failed to remove ${profile}`);
            }
          } catch (err) {
            removalResult.errors.push(`Error removing ${profile}: ${err}`);
          }
        }
        this.logger.log('Removal result', { removalResult });
      }

      // Then, start containers for enabled services
      if (profiles.length > 0) {
        this.logger.log('Orchestrating enabled profiles...');
        orchestrationResult = await this.dockerService.orchestrateProfiles(profiles);
        this.logger.log('Orchestration result', { orchestrationResult });
      }
    } else {
      this.logger.warn('Docker not available, writing signal file instead');
      // Fallback: write signal file for host script
      try {
        const signalFile = path.resolve(process.cwd(), 'data', '.orchestration-request.json');
        const orchestrationRequest = {
          timestamp: new Date().toISOString(),
          profiles,
          profilesToRemove,
          action: 'restart-with-profiles',
        };
        fs.writeFileSync(signalFile, JSON.stringify(orchestrationRequest, null, 2), 'utf8');
        this.logger.log('Orchestration request written', { signalFile });
      } catch (err) {
        this.logger.error('Failed to write orchestration request', err instanceof Error ? err.message : String(err));
      }
    }

    // Schedule graceful shutdown after delay to allow response and container orchestration
    void this.shutdownService.shutdown(3000);

    // Calculate estimated time - base 15s + additional for each service (increased for reliability)
    let estimatedTime = 15;
    if (profiles.includes('postgres')) estimatedTime += 20;
    if (profiles.includes('redis')) estimatedTime += 13;
    if (profiles.includes('minio')) estimatedTime += 15;
    if (profilesToRemove.length > 0) estimatedTime += profilesToRemove.length * 5; // +5s per removal

    return {
      message:
        profiles.length > 0 || profilesToRemove.length > 0
          ? `Server is restarting. Enabling: ${profiles.join(', ') || 'none'}. Disabling: ${profilesToRemove.join(', ') || 'none'}.`
          : 'Server is restarting. Please wait...',
      restarting: true,
      profiles,
      profilesToRemove,
      estimatedTime,
      orchestration: orchestrationResult,
      removal: removalResult,
    };
  }

  @RequireRole(ApiKeyRole.ADMIN)
  @Action({
    description: 'Export all data from the Data DB for migration',
    input: z.object({}),
    kind: 'query',
    method: 'GET',
    path: 'infra/export-data',
  })
  async exportData(): Promise<{
    exportedAt: string;
    dataDbType: string;
    tables: MigrationTables;
    counts: { sessions: number; webhooks: number; messages: number; messageBatches: number };
  }> {
    // Get all entities from Data DB
    const sessions = await this.dataDataSource.query<SessionRow[]>('SELECT * FROM sessions');
    const webhooks = await this.dataDataSource.query<WebhookRow[]>('SELECT * FROM webhooks');

    // Messages table may not exist yet or be empty
    let messages: MessageRow[] = [];
    let messageBatches: MessageBatchRow[] = [];

    try {
      messages = await this.dataDataSource.query<MessageRow[]>('SELECT * FROM messages');
    } catch (error) {
      this.logger.debug('Messages table not available for export', { error: String(error) });
    }

    try {
      messageBatches = await this.dataDataSource.query<MessageBatchRow[]>('SELECT * FROM message_batches');
    } catch (error) {
      this.logger.debug('Message batches table not available for export', { error: String(error) });
    }

    return {
      exportedAt: new Date().toISOString(),
      dataDbType: this.configService.get<string>('dataDatabase.type', 'sqlite'),
      tables: {
        sessions,
        webhooks,
        messages,
        messageBatches,
      },
      counts: {
        sessions: sessions.length,
        webhooks: webhooks.length,
        messages: messages.length,
        messageBatches: messageBatches.length,
      },
    };
  }

  @RequireRole(ApiKeyRole.ADMIN)
  @Action({
    description: 'Import data to the Data DB (replaces existing data)',
    input: ImportDataInput,
    method: 'POST',
    path: 'infra/import-data',
  })
  async importData(input: z.infer<typeof ImportDataInput>): Promise<{
    imported: boolean;
    counts: { sessions: number; webhooks: number; messages: number; messageBatches: number };
    warnings: string[];
  }> {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- narrows the z.any() rows to typed MigrationTables for the insert code below
    const data = input as { tables: Partial<MigrationTables> };
    const warnings: string[] = [];
    const queryRunner = this.dataDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Clear existing data (in correct order due to foreign keys)
      await queryRunner.query('DELETE FROM webhooks');
      await queryRunner.query('DELETE FROM messages').catch(() => {});
      await queryRunner.query('DELETE FROM message_batches').catch(() => {});
      await queryRunner.query('DELETE FROM sessions');

      // Import sessions first
      let sessionsCount = 0;
      if (data.tables.sessions?.length) {
        for (const session of data.tables.sessions) {
          try {
            await queryRunner.query(
              `INSERT INTO sessions (id, name, status, phone, "pushName", config, "proxyUrl", "proxyType", "connectedAt", "lastActiveAt", "createdAt", "updatedAt")
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
              [
                session.id,
                session.name,
                session.status,
                session.phone,
                session.pushName,
                typeof session.config === 'string' ? session.config : JSON.stringify(session.config || {}),
                session.proxyUrl,
                session.proxyType,
                session.connectedAt,
                session.lastActiveAt,
                session.createdAt,
                session.updatedAt,
              ],
            );
            sessionsCount++;
          } catch (err) {
            warnings.push(`Failed to import session ${session.id}: ${err}`);
          }
        }
      }

      // Import webhooks
      let webhooksCount = 0;
      if (data.tables.webhooks?.length) {
        for (const webhook of data.tables.webhooks) {
          try {
            await queryRunner.query(
              `INSERT INTO webhooks (id, "sessionId", url, events, secret, headers, active, "retryCount", "lastTriggeredAt", "createdAt", "updatedAt")
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
              [
                webhook.id,
                webhook.sessionId,
                webhook.url,
                typeof webhook.events === 'string' ? webhook.events : JSON.stringify(webhook.events || []),
                webhook.secret,
                typeof webhook.headers === 'string' ? webhook.headers : JSON.stringify(webhook.headers || {}),
                webhook.active,
                webhook.retryCount,
                webhook.lastTriggeredAt,
                webhook.createdAt,
                webhook.updatedAt,
              ],
            );
            webhooksCount++;
          } catch (err) {
            warnings.push(`Failed to import webhook ${webhook.id}: ${err}`);
          }
        }
      }

      // Import messages (optional)
      let messagesCount = 0;
      if (data.tables.messages?.length) {
        for (const msg of data.tables.messages) {
          try {
            await queryRunner.query(
              `INSERT INTO messages (id, "sessionId", "messageId", "chatId", direction, type, content, status, metadata, "createdAt", "updatedAt")
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
              [
                msg.id,
                msg.sessionId,
                msg.messageId,
                msg.chatId,
                msg.direction,
                msg.type,
                typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content || {}),
                msg.status,
                typeof msg.metadata === 'string' ? msg.metadata : JSON.stringify(msg.metadata || {}),
                msg.createdAt,
                msg.updatedAt,
              ],
            );
            messagesCount++;
          } catch (err) {
            warnings.push(`Failed to import message ${msg.id}: ${err}`);
          }
        }
      }

      // Import message batches (optional)
      let messageBatchesCount = 0;
      if (data.tables.messageBatches?.length) {
        for (const batch of data.tables.messageBatches) {
          try {
            await queryRunner.query(
              `INSERT INTO message_batches (id, "batchId", "sessionId", status, messages, options, progress, results, "currentIndex", "createdAt", "updatedAt", "startedAt", "completedAt")
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
              [
                batch.id,
                batch.batchId,
                batch.sessionId,
                batch.status,
                typeof batch.messages === 'string' ? batch.messages : JSON.stringify(batch.messages || []),
                typeof batch.options === 'string' ? batch.options : JSON.stringify(batch.options || {}),
                typeof batch.progress === 'string' ? batch.progress : JSON.stringify(batch.progress || {}),
                typeof batch.results === 'string' ? batch.results : JSON.stringify(batch.results || []),
                batch.currentIndex,
                batch.createdAt,
                batch.updatedAt,
                batch.startedAt,
                batch.completedAt,
              ],
            );
            messageBatchesCount++;
          } catch (err) {
            warnings.push(`Failed to import message batch ${batch.id}: ${err}`);
          }
        }
      }

      await queryRunner.commitTransaction();

      return {
        imported: true,
        counts: {
          sessions: sessionsCount,
          webhooks: webhooksCount,
          messages: messagesCount,
          messageBatches: messageBatchesCount,
        },
        warnings,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  // ============================================================================
  // STORAGE MIGRATION API
  // ============================================================================

  @Action({
    description: 'Get file count and size in current storage',
    input: z.object({}),
    kind: 'query',
    method: 'GET',
    path: 'infra/storage/files/count',
  })
  async storageFilesCount(): Promise<{
    storageType: string;
    count: number;
    sizeBytes: number;
    sizeMB: string;
  }> {
    const { count, sizeBytes } = await this.storageService.getFileCount();
    return {
      storageType: this.storageService.getCurrentStorageType(),
      count,
      sizeBytes,
      sizeMB: (sizeBytes / 1024 / 1024).toFixed(2),
    };
  }

  @RequireRole(ApiKeyRole.ADMIN)
  @Action({
    description: 'Export all storage files as a tar.gz archive (writes to a file under data/, returns its path)',
    input: z.object({}),
    kind: 'query',
    method: 'GET',
    path: 'infra/storage/export',
  })
  async storageExport(): Promise<{ message: string; download: string }> {
    // Note: In production, this would return a StreamableFile
    // For simplicity, we'll save to a temp file and return the path
    const stream = await this.storageService.createExportStream();
    const exportPath = path.join(process.cwd(), 'data', `storage-export-${Date.now()}.tar.gz`);

    const writeStream = fs.createWriteStream(exportPath);
    stream.pipe(writeStream);

    await new Promise<void>((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });

    return {
      message: 'Storage export completed',
      download: exportPath,
    };
  }

  @RequireRole(ApiKeyRole.ADMIN)
  @Action({
    description: 'Import storage files from a tar.gz file inside the data directory',
    input: ImportStorageInput,
    method: 'POST',
    path: 'infra/storage/import',
  })
  async storageImport(
    input: z.infer<typeof ImportStorageInput>,
  ): Promise<{ imported: boolean; count: number; storageType: string }> {
    const { filePath } = input;

    // `filePath` is fully caller-controlled. Restrict it to the app's data
    // directory so it cannot point at arbitrary files on the host.
    const dataDir = path.join(process.cwd(), 'data');
    if (!filePath || !isPathWithin(dataDir, filePath)) {
      throw new BadRequestException('filePath must reference a file inside the data directory');
    }

    if (!fs.existsSync(filePath)) {
      throw new BadRequestException(`File not found: ${filePath}`);
    }

    const readStream = fs.createReadStream(filePath);
    const count = await this.storageService.importFromStream(readStream);

    return {
      imported: true,
      count,
      storageType: this.storageService.getCurrentStorageType(),
    };
  }
}
