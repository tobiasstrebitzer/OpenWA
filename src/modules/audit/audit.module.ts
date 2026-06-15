import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLog } from './entities/audit-log.entity';
import { AuditService } from './audit.service';
import { AuditActions } from './audit.actions';
import { ApiKeyGuard } from '../auth/guards/api-key.guard';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AuditLog], 'main')],
  providers: [AuditActions, ApiKeyGuard, AuditService],
  exports: [AuditService],
})
export class AuditModule {}
