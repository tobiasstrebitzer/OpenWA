import { Module } from '@nestjs/common';
import { HealthActions } from './health.actions';

@Module({
  providers: [HealthActions],
})
export class HealthModule {}
