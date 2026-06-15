import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ApiKey } from './entities/api-key.entity';
import { AuthService } from './auth.service';
import { AuthActions } from './auth.actions';
import { ApiKeyGuard } from './guards/api-key.guard';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([ApiKey], 'main')],
  providers: [
    AuthService,
    AuthActions,
    ApiKeyGuard,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ApiKeyGuard,
    },
  ],
  exports: [AuthService],
})
export class AuthModule {}
