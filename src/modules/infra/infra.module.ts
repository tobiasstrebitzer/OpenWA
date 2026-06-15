import { Module } from '@nestjs/common';
import { InfraActions } from './infra.actions';
import { ApiKeyGuard } from '../auth/guards/api-key.guard';
import { EngineModule } from '../../engine/engine.module';
import { DockerModule } from '../docker';

@Module({
  imports: [EngineModule, DockerModule],
  providers: [InfraActions, ApiKeyGuard],
})
export class InfraModule {}
