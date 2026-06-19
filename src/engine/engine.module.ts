import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EngineFactory } from './engine.factory';
import { BaileysStoredMessage } from './adapters/baileys-stored-message.entity';
import { BaileysMessageStoreService } from './adapters/baileys-message-store.service';
import { BaileysSessionData } from './adapters/baileys-session-data.entity';
import { BaileysSessionStoreService } from './adapters/baileys-session-store.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([BaileysStoredMessage, BaileysSessionData], 'data')],
  providers: [EngineFactory, BaileysMessageStoreService, BaileysSessionStoreService],
  exports: [EngineFactory],
})
export class EngineModule {}
