import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class SyncChatHistoryDto {
  @ApiProperty({ description: 'Chat ID to sync history for (e.g. 628123456789@c.us)' })
  @IsString()
  @IsNotEmpty()
  chatId: string;

  @ApiPropertyOptional({ description: 'Max messages to pull from the engine (1-500, default 50)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}
