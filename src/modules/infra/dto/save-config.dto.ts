import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';

class DatabaseConfigDto {
  @ApiPropertyOptional({ enum: ['sqlite', 'postgres'] })
  @IsOptional()
  @IsIn(['sqlite', 'postgres'])
  type?: 'sqlite' | 'postgres';

  @ApiPropertyOptional({ description: 'Use the bundled (container) database' })
  @IsOptional()
  @IsBoolean()
  builtIn?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  host?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  port?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  username?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  password?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  database?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  poolSize?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  sslEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  sslRejectUnauthorized?: boolean;
}

class RedisConfigDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ description: 'Use the bundled (container) Redis' })
  @IsOptional()
  @IsBoolean()
  builtIn?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  host?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  port?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  password?: string;
}

class QueueConfigDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

class StorageConfigDto {
  @ApiPropertyOptional({ enum: ['local', 's3'] })
  @IsOptional()
  @IsIn(['local', 's3'])
  type?: 'local' | 's3';

  @ApiPropertyOptional({ description: 'Use the bundled (container) storage' })
  @IsOptional()
  @IsBoolean()
  builtIn?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  localPath?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  s3Bucket?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  s3Region?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  s3AccessKey?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  s3SecretKey?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  s3Endpoint?: string;
}

class EngineConfigDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  headless?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sessionDataPath?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  browserArgs?: string;
}

// Partial by design: the dashboard sends only the sections it renders and the
// controller merges them onto the existing generated env (#226).
export class SaveConfigDto {
  @ApiPropertyOptional({ type: DatabaseConfigDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DatabaseConfigDto)
  database?: DatabaseConfigDto;

  @ApiPropertyOptional({ type: RedisConfigDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => RedisConfigDto)
  redis?: RedisConfigDto;

  @ApiPropertyOptional({ type: QueueConfigDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => QueueConfigDto)
  queue?: QueueConfigDto;

  @ApiPropertyOptional({ type: StorageConfigDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => StorageConfigDto)
  storage?: StorageConfigDto;

  @ApiPropertyOptional({ type: EngineConfigDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => EngineConfigDto)
  engine?: EngineConfigDto;
}
