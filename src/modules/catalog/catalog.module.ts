import { Module } from '@nestjs/common';
import { CatalogActions } from './catalog.actions';
import { CatalogService } from './catalog.service';
import { ApiKeyGuard } from '../auth/guards/api-key.guard';
import { SessionModule } from '../session/session.module';

@Module({
  imports: [SessionModule],
  providers: [CatalogActions, ApiKeyGuard, CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
