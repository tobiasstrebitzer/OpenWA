import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Session } from './entities/session.entity';
import { Message } from '../message/entities/message.entity';
import { SessionService } from './session.service';
import { SessionActions } from './session.actions';
import { ApiKeyGuard } from '../auth/guards/api-key.guard';
import { WebhookModule } from '../webhook/webhook.module';

@Module({
  imports: [TypeOrmModule.forFeature([Session, Message], 'data'), forwardRef(() => WebhookModule)],
  providers: [SessionService, SessionActions, ApiKeyGuard],
  exports: [SessionService],
})
export class SessionModule {}
