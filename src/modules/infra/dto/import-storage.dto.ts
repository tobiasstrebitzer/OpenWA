import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class ImportStorageDto {
  @ApiProperty({
    description: 'Path to the tar.gz archive to import. Must reference a file inside the app data directory.',
    example: 'data/storage-export-1700000000000.tar.gz',
  })
  @IsString()
  @IsNotEmpty()
  filePath: string;
}
