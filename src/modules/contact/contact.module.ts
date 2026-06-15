import { Module } from '@nestjs/common';
import { ContactActions } from './contact.actions';
import { ApiKeyGuard } from '../auth/guards/api-key.guard';
import { SessionModule } from '../session/session.module';

@Module({
  imports: [SessionModule],
  providers: [ContactActions, ApiKeyGuard],
})
export class ContactModule {}
