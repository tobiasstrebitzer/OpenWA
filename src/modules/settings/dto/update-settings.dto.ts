import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';

class GeneralSettingsDto {
  @ApiPropertyOptional({ description: 'Public base URL the API is reachable at' })
  @IsOptional()
  @IsString()
  apiBaseUrl?: string;

  @ApiPropertyOptional({ description: 'Session timeout in minutes' })
  @IsOptional()
  @IsNumber()
  sessionTimeout?: number;

  @ApiPropertyOptional({ description: 'Reconnect sessions automatically after a drop' })
  @IsOptional()
  @IsBoolean()
  autoReconnect?: boolean;

  @ApiPropertyOptional({ description: 'Enable verbose debug logging' })
  @IsOptional()
  @IsBoolean()
  debugMode?: boolean;
}

class ApiSettingsDto {
  @ApiPropertyOptional({ description: 'Requests allowed per rate-limit window' })
  @IsOptional()
  @IsNumber()
  rateLimit?: number;

  @ApiPropertyOptional({ description: 'Rate-limit window in milliseconds' })
  @IsOptional()
  @IsNumber()
  rateLimitWindow?: number;

  @ApiPropertyOptional({ description: 'Expose the Swagger docs endpoint' })
  @IsOptional()
  @IsBoolean()
  enableDocs?: boolean;
}

class NotificationSettingsDto {
  @ApiPropertyOptional({ description: 'Send notifications by email' })
  @IsOptional()
  @IsBoolean()
  emailEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Address that receives notification emails' })
  @IsOptional()
  @IsString()
  notificationEmail?: string;

  @ApiPropertyOptional({ description: 'Alert on webhook delivery failures' })
  @IsOptional()
  @IsBoolean()
  webhookAlerts?: boolean;
}

// Every section (and field within it) is optional: callers send only the parts
// they change and the controller merges them onto the current settings.
export class UpdateSettingsDto {
  @ApiPropertyOptional({ type: GeneralSettingsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => GeneralSettingsDto)
  general?: GeneralSettingsDto;

  @ApiPropertyOptional({ type: ApiSettingsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ApiSettingsDto)
  api?: ApiSettingsDto;

  @ApiPropertyOptional({ type: NotificationSettingsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationSettingsDto)
  notifications?: NotificationSettingsDto;
}
