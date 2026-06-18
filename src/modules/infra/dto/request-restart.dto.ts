import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString } from 'class-validator';

export class RequestRestartDto {
  @ApiPropertyOptional({ type: [String], description: 'Service profiles to (re)start, e.g. postgres, redis' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  profiles?: string[];

  @ApiPropertyOptional({ type: [String], description: 'Service profiles whose containers should be removed' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  profilesToRemove?: string[];
}
