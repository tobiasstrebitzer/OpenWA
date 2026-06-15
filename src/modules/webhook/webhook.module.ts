import { Module, DynamicModule, Type } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Webhook } from './entities/webhook.entity';
import { WebhookService } from './webhook.service';
import { WebhookActions } from './webhook.actions';
import { ApiKeyGuard } from '../auth/guards/api-key.guard';

// Only import QueueModule if explicitly enabled to avoid Redis connection errors
const queueModules: Array<Type | DynamicModule> = [];
if (process.env.QUEUE_ENABLED === 'true') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const queueModule = require('../queue/queue.module') as {
    QueueModule: Type;
  };
  queueModules.push(queueModule.QueueModule);
}

@Module({
  imports: [TypeOrmModule.forFeature([Webhook], 'data'), ...queueModules],
  providers: [WebhookService, WebhookActions, ApiKeyGuard],
  exports: [WebhookService],
})
export class WebhookModule {}
