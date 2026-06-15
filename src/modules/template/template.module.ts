import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Template } from './entities/template.entity';
import { TemplateService } from './template.service';
import { TemplateActions } from './template.actions';
import { ApiKeyGuard } from '../auth/guards/api-key.guard';

@Module({
  imports: [TypeOrmModule.forFeature([Template], 'data')],
  providers: [TemplateService, TemplateActions, ApiKeyGuard],
  exports: [TemplateService],
})
export class TemplateModule {}
