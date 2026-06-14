import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class MarkChatReadDto {
  @ApiProperty({
    description: 'WhatsApp chat ID to mark as read (e.g., 1234567890@c.us or 1234567890-123@g.us)',
    example: '1234567890@c.us',
  })
  @IsString()
  @IsNotEmpty()
  chatId: string;
}
