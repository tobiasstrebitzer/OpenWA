import { Injectable, UseGuards } from '@nestjs/common';
import { Action, Actions } from '@silkweave/nestjs';
import { z } from 'zod/v4';
import { ApiKeyGuard } from '../auth/guards/api-key.guard';
import { StatusService } from './status.service';

const SessionInput = z.object({
  sessionId: z.string().describe('Session ID'),
});

const ContactInput = z.object({
  sessionId: z.string().describe('Session ID'),
  contactId: z.string().describe('Contact ID (e.g., 628xxx@c.us)'),
});

const SendTextInput = z.object({
  sessionId: z.string().describe('Session ID'),
  text: z.string().describe('Status text content'),
  backgroundColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'backgroundColor must be a hex color (e.g., #25D366)')
    .optional()
    .describe('Background color as a hex value (e.g., #25D366)'),
  font: z.coerce.number().int().min(0).max(4).optional().describe('Font index (0-4)'),
});

const MediaInput = z
  .object({
    url: z.string().optional(),
    base64: z.string().optional(),
  })
  .describe('Media source (url or base64)');

const SendImageInput = z.object({
  sessionId: z.string().describe('Session ID'),
  image: MediaInput,
  caption: z.string().optional().describe('Optional caption'),
});

const SendVideoInput = z.object({
  sessionId: z.string().describe('Session ID'),
  video: MediaInput,
  caption: z.string().optional().describe('Optional caption'),
});

const DeleteInput = z.object({
  sessionId: z.string().describe('Session ID'),
  statusId: z.string().describe('Status ID'),
});

@Injectable()
@Actions('status')
@UseGuards(ApiKeyGuard)
export class StatusActions {
  constructor(private readonly statusService: StatusService) {}

  @Action({
    description: 'Get all contact status updates for a session',
    input: SessionInput,
    kind: 'query',
    method: 'GET',
    path: 'sessions/:sessionId/status',
  })
  async list(input: z.infer<typeof SessionInput>) {
    return { statuses: await this.statusService.getStatuses(input.sessionId) };
  }

  @Action({
    description: 'Get status updates from a specific contact',
    input: ContactInput,
    kind: 'query',
    method: 'GET',
    path: 'sessions/:sessionId/status/:contactId',
  })
  async get(input: z.infer<typeof ContactInput>) {
    return { statuses: await this.statusService.getContactStatus(input.sessionId, input.contactId) };
  }

  @Action({
    description: 'Post a text status',
    input: SendTextInput,
    method: 'POST',
    path: 'sessions/:sessionId/status/send-text',
  })
  sendText(input: z.infer<typeof SendTextInput>) {
    return this.statusService.postTextStatus(input.sessionId, input.text, {
      backgroundColor: input.backgroundColor,
      font: input.font,
    });
  }

  @Action({
    description: 'Post an image status',
    input: SendImageInput,
    method: 'POST',
    path: 'sessions/:sessionId/status/send-image',
  })
  sendImage(input: z.infer<typeof SendImageInput>) {
    return this.statusService.postImageStatus(input.sessionId, input.image, input.caption);
  }

  @Action({
    description: 'Post a video status',
    input: SendVideoInput,
    method: 'POST',
    path: 'sessions/:sessionId/status/send-video',
  })
  sendVideo(input: z.infer<typeof SendVideoInput>) {
    return this.statusService.postVideoStatus(input.sessionId, input.video, input.caption);
  }

  @Action({
    description: 'Delete own status',
    input: DeleteInput,
    method: 'DELETE',
    path: 'sessions/:sessionId/status/:statusId',
  })
  async delete(input: z.infer<typeof DeleteInput>) {
    await this.statusService.deleteStatus(input.sessionId, input.statusId);
    return { success: true, message: 'Status deleted successfully' };
  }
}
