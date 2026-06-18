import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';
import type { MessageBatchRow, MessageRow, SessionRow, WebhookRow } from './migration.types';

// Rows are inserted verbatim, so they are intentionally not element-validated
// (no @Type on the arrays): the migration blob is trusted admin input and we
// must not strip or coerce row fields on the way in.
class ImportTablesDto {
  @ApiPropertyOptional({ type: 'array', description: 'Session rows' })
  @IsOptional()
  @IsArray()
  sessions?: SessionRow[];

  @ApiPropertyOptional({ type: 'array', description: 'Webhook rows' })
  @IsOptional()
  @IsArray()
  webhooks?: WebhookRow[];

  @ApiPropertyOptional({ type: 'array', description: 'Message rows' })
  @IsOptional()
  @IsArray()
  messages?: MessageRow[];

  @ApiPropertyOptional({ type: 'array', description: 'Message batch rows' })
  @IsOptional()
  @IsArray()
  messageBatches?: MessageBatchRow[];
}

export class ImportDataDto {
  @ApiProperty({ type: ImportTablesDto, description: 'Tables to import (replaces existing data)' })
  @IsObject()
  @ValidateNested()
  @Type(() => ImportTablesDto)
  tables: ImportTablesDto;

  // Envelope fields produced by the export-data endpoint. Accepted and ignored so
  // an exported blob can be posted back verbatim without tripping whitelist validation.
  @ApiPropertyOptional({ description: 'Ignored; present on export-data output' })
  @IsOptional()
  @IsString()
  exportedAt?: string;

  @ApiPropertyOptional({ description: 'Ignored; present on export-data output' })
  @IsOptional()
  @IsString()
  dataDbType?: string;

  @ApiPropertyOptional({ description: 'Ignored; present on export-data output' })
  @IsOptional()
  @IsObject()
  counts?: Record<string, number>;
}
