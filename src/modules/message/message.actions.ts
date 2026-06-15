import { Injectable, UseGuards } from '@nestjs/common';
import { Action, Actions } from '@silkweave/nestjs';
import { z } from 'zod/v4';
import { ApiKeyGuard } from '../auth/guards/api-key.guard';
import { RequireRole } from '../auth/decorators/auth.decorators';
import { ApiKeyRole } from '../auth/entities/api-key.entity';
import { MessageService } from './message.service';
import { BulkMessageService } from './bulk-message.service';

const GetMessagesInput = z.object({
  sessionId: z.string().describe('Session ID'),
  chatId: z.string().optional().describe('Filter by chat ID'),
  limit: z.coerce.number().int().positive().optional().describe('Max messages to return (default 50)'),
  offset: z.coerce.number().int().min(0).optional().describe('Offset for pagination'),
});

const SendTextInput = z.object({
  sessionId: z.string().describe('Session ID'),
  chatId: z.string().describe('WhatsApp chat ID (phone@c.us or groupId@g.us)'),
  text: z.string().min(1).max(4096).describe('Text message content'),
});

// Flat media shape mirrors the old `SendMediaMessageDto` (and the dashboard's
// `{chatId,url,caption}` / `{chatId,url}` / `{chatId,url,filename}` bodies).
const SendMediaInput = z.object({
  sessionId: z.string().describe('Session ID'),
  chatId: z.string().describe('WhatsApp chat ID'),
  url: z.string().url().optional().describe('Media URL (http/https)'),
  base64: z.string().optional().describe('Base64 encoded media data'),
  mimetype: z.string().optional().describe('Media MIME type (required when using base64)'),
  filename: z.string().max(255).optional().describe('Filename for the media'),
  caption: z.string().max(1024).optional().describe('Caption for the media'),
});

const SendLocationInput = z.object({
  sessionId: z.string().describe('Session ID'),
  chatId: z.string().describe('WhatsApp chat ID'),
  latitude: z.number().describe('Latitude'),
  longitude: z.number().describe('Longitude'),
  description: z.string().optional(),
  address: z.string().optional(),
});

const SendContactInput = z.object({
  sessionId: z.string().describe('Session ID'),
  chatId: z.string().describe('WhatsApp chat ID'),
  contactName: z.string().describe('Contact display name'),
  contactNumber: z.string().describe('Contact phone number'),
});

const ReplyInput = z.object({
  sessionId: z.string().describe('Session ID'),
  chatId: z.string().describe('WhatsApp chat ID'),
  quotedMessageId: z.string().describe('ID of the message being replied to'),
  text: z.string().describe('Reply text content'),
});

const ForwardInput = z.object({
  sessionId: z.string().describe('Session ID'),
  fromChatId: z.string().describe('Source chat ID'),
  toChatId: z.string().describe('Destination chat ID'),
  messageId: z.string().describe('Message ID to forward'),
});

const ReactInput = z.object({
  sessionId: z.string().describe('Session ID'),
  chatId: z.string().describe('WhatsApp chat ID'),
  messageId: z.string().describe('Message ID to react to'),
  emoji: z.string().describe('Reaction emoji (empty string removes the reaction)'),
});

const GetReactionsInput = z.object({
  sessionId: z.string().describe('Session ID'),
  chatId: z.string().describe('Chat ID containing the message'),
  messageId: z.string().describe('Message ID to get reactions for'),
});

const DeleteMessageInput = z.object({
  sessionId: z.string().describe('Session ID'),
  chatId: z.string().describe('WhatsApp chat ID'),
  messageId: z.string().describe('Message ID to delete'),
  forEveryone: z.boolean().optional().describe('Delete for everyone (default true)'),
});

const BulkContentSchema = z.object({
  text: z.string().optional(),
  image: z
    .object({ url: z.string().optional(), base64: z.string().optional(), mimetype: z.string().optional() })
    .optional(),
  video: z
    .object({ url: z.string().optional(), base64: z.string().optional(), mimetype: z.string().optional() })
    .optional(),
  audio: z
    .object({ url: z.string().optional(), base64: z.string().optional(), mimetype: z.string().optional() })
    .optional(),
  document: z
    .object({
      url: z.string().optional(),
      base64: z.string().optional(),
      mimetype: z.string().optional(),
      filename: z.string().optional(),
    })
    .optional(),
  caption: z.string().optional(),
});

const SendBulkInput = z.object({
  sessionId: z.string().describe('Session ID'),
  batchId: z.string().optional().describe('Custom batch ID (auto-generated if omitted)'),
  messages: z
    .array(
      z.object({
        chatId: z.string().describe('Recipient chat ID'),
        type: z.enum(['text', 'image', 'video', 'audio', 'document']).describe('Message type'),
        content: BulkContentSchema.describe('Message content based on type'),
        variables: z.record(z.string(), z.string()).optional().describe('Template variables'),
      }),
    )
    .max(100)
    .describe('Array of messages (max 100 per request)'),
  options: z
    .object({
      delayBetweenMessages: z.number().min(1000).max(60000).optional(),
      randomizeDelay: z.boolean().optional(),
      stopOnError: z.boolean().optional(),
    })
    .optional()
    .describe('Batch processing options'),
});

const BatchInput = z.object({
  sessionId: z.string().describe('Session ID'),
  batchId: z.string().describe('Batch ID'),
});

@Injectable()
@Actions('messages')
@UseGuards(ApiKeyGuard)
export class MessageActions {
  constructor(
    private readonly messageService: MessageService,
    private readonly bulkMessageService: BulkMessageService,
  ) {}

  @Action({
    description: 'Get message history for a session',
    input: GetMessagesInput,
    kind: 'query',
    method: 'GET',
    path: 'sessions/:sessionId/messages',
  })
  list(input: z.infer<typeof GetMessagesInput>) {
    const { sessionId, chatId, limit, offset } = input;
    return this.messageService.getMessages(sessionId, { chatId, limit, offset });
  }

  @RequireRole(ApiKeyRole.OPERATOR)
  @Action({
    description: 'Send a text message',
    input: SendTextInput,
    method: 'POST',
    path: 'sessions/:sessionId/messages/send-text',
  })
  sendText(input: z.infer<typeof SendTextInput>) {
    const { sessionId, ...dto } = input;
    return this.messageService.sendText(sessionId, dto);
  }

  @RequireRole(ApiKeyRole.OPERATOR)
  @Action({
    description: 'Send an image message',
    input: SendMediaInput,
    method: 'POST',
    path: 'sessions/:sessionId/messages/send-image',
  })
  sendImage(input: z.infer<typeof SendMediaInput>) {
    const { sessionId, ...dto } = input;
    return this.messageService.sendImage(sessionId, dto);
  }

  @RequireRole(ApiKeyRole.OPERATOR)
  @Action({
    description: 'Send a video message',
    input: SendMediaInput,
    method: 'POST',
    path: 'sessions/:sessionId/messages/send-video',
  })
  sendVideo(input: z.infer<typeof SendMediaInput>) {
    const { sessionId, ...dto } = input;
    return this.messageService.sendVideo(sessionId, dto);
  }

  @RequireRole(ApiKeyRole.OPERATOR)
  @Action({
    description: 'Send an audio/voice message',
    input: SendMediaInput,
    method: 'POST',
    path: 'sessions/:sessionId/messages/send-audio',
  })
  sendAudio(input: z.infer<typeof SendMediaInput>) {
    const { sessionId, ...dto } = input;
    return this.messageService.sendAudio(sessionId, dto);
  }

  @RequireRole(ApiKeyRole.OPERATOR)
  @Action({
    description: 'Send a document/file message',
    input: SendMediaInput,
    method: 'POST',
    path: 'sessions/:sessionId/messages/send-document',
  })
  sendDocument(input: z.infer<typeof SendMediaInput>) {
    const { sessionId, ...dto } = input;
    return this.messageService.sendDocument(sessionId, dto);
  }

  @RequireRole(ApiKeyRole.OPERATOR)
  @Action({
    description: 'Send a location message',
    input: SendLocationInput,
    method: 'POST',
    path: 'sessions/:sessionId/messages/send-location',
  })
  sendLocation(input: z.infer<typeof SendLocationInput>) {
    const { sessionId, ...dto } = input;
    return this.messageService.sendLocation(sessionId, dto);
  }

  @RequireRole(ApiKeyRole.OPERATOR)
  @Action({
    description: 'Send a contact card message',
    input: SendContactInput,
    method: 'POST',
    path: 'sessions/:sessionId/messages/send-contact',
  })
  sendContact(input: z.infer<typeof SendContactInput>) {
    const { sessionId, ...dto } = input;
    return this.messageService.sendContact(sessionId, dto);
  }

  @RequireRole(ApiKeyRole.OPERATOR)
  @Action({
    description: 'Send a sticker message',
    input: SendMediaInput,
    method: 'POST',
    path: 'sessions/:sessionId/messages/send-sticker',
  })
  sendSticker(input: z.infer<typeof SendMediaInput>) {
    const { sessionId, ...dto } = input;
    return this.messageService.sendSticker(sessionId, dto);
  }

  @RequireRole(ApiKeyRole.OPERATOR)
  @Action({
    description: 'Reply to a message',
    input: ReplyInput,
    method: 'POST',
    path: 'sessions/:sessionId/messages/reply',
  })
  reply(input: z.infer<typeof ReplyInput>) {
    const { sessionId, ...dto } = input;
    return this.messageService.reply(sessionId, dto);
  }

  @RequireRole(ApiKeyRole.OPERATOR)
  @Action({
    description: 'Forward a message to another chat',
    input: ForwardInput,
    method: 'POST',
    path: 'sessions/:sessionId/messages/forward',
  })
  forward(input: z.infer<typeof ForwardInput>) {
    const { sessionId, ...dto } = input;
    return this.messageService.forward(sessionId, dto);
  }

  @RequireRole(ApiKeyRole.OPERATOR)
  @Action({
    description: 'Add or remove a reaction to a message (empty emoji removes it)',
    input: ReactInput,
    method: 'POST',
    path: 'sessions/:sessionId/messages/react',
  })
  async react(input: z.infer<typeof ReactInput>) {
    const { sessionId, ...dto } = input;
    await this.messageService.reactToMessage(sessionId, dto);
    return { success: true };
  }

  @Action({
    description: 'Get reactions for a specific message',
    input: GetReactionsInput,
    kind: 'query',
    method: 'GET',
    path: 'sessions/:sessionId/messages/:chatId/:messageId/reactions',
  })
  reactions(input: z.infer<typeof GetReactionsInput>) {
    return this.messageService.getMessageReactions(input.sessionId, input.chatId, input.messageId);
  }

  @RequireRole(ApiKeyRole.OPERATOR)
  @Action({
    description: 'Delete a message',
    input: DeleteMessageInput,
    method: 'POST',
    path: 'sessions/:sessionId/messages/delete',
  })
  async delete(input: z.infer<typeof DeleteMessageInput>) {
    const { sessionId, ...dto } = input;
    await this.messageService.deleteMessage(sessionId, dto);
    return { success: true };
  }

  @RequireRole(ApiKeyRole.OPERATOR)
  @Action({
    description: 'Send messages to multiple recipients (async batch processing)',
    input: SendBulkInput,
    method: 'POST',
    path: 'sessions/:sessionId/messages/send-bulk',
  })
  async sendBulk(input: z.infer<typeof SendBulkInput>) {
    const { sessionId, ...dto } = input;
    const batch = await this.bulkMessageService.createBatch(sessionId, dto);
    const estimatedTime = new Date(Date.now() + batch.messages.length * (batch.options?.delayBetweenMessages || 3000));

    return {
      batchId: batch.batchId,
      status: batch.status,
      totalMessages: batch.messages.length,
      estimatedCompletionTime: estimatedTime.toISOString(),
      statusUrl: `/api/sessions/${sessionId}/messages/batch/${batch.batchId}`,
    };
  }

  @Action({
    description: 'Get batch processing status',
    input: BatchInput,
    kind: 'query',
    method: 'GET',
    path: 'sessions/:sessionId/messages/batch/:batchId',
  })
  async batchStatus(input: z.infer<typeof BatchInput>) {
    const batch = await this.bulkMessageService.getBatchStatus(input.sessionId, input.batchId);
    return {
      batchId: batch.batchId,
      status: batch.status,
      progress: batch.progress,
      results: batch.results,
      startedAt: batch.startedAt,
      completedAt: batch.completedAt,
    };
  }

  @RequireRole(ApiKeyRole.OPERATOR)
  @Action({
    description: 'Cancel a running batch',
    input: BatchInput,
    method: 'POST',
    path: 'sessions/:sessionId/messages/batch/:batchId/cancel',
  })
  async batchCancel(input: z.infer<typeof BatchInput>) {
    const batch = await this.bulkMessageService.cancelBatch(input.sessionId, input.batchId);
    return {
      batchId: batch.batchId,
      status: batch.status,
      progress: batch.progress,
    };
  }
}
