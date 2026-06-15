import { BadRequestException, Injectable, NotFoundException, UseGuards } from '@nestjs/common';
import { Action, Actions } from '@silkweave/nestjs';
import { z } from 'zod/v4';
import { ApiKeyGuard } from '../auth/guards/api-key.guard';
import { SessionService } from '../session/session.service';

const SessionInput = z.object({
  sessionId: z.string().describe('Session ID'),
});

const LabelInput = z.object({
  sessionId: z.string().describe('Session ID'),
  labelId: z.string().describe('Label ID'),
});

const ChatInput = z.object({
  sessionId: z.string().describe('Session ID'),
  chatId: z.string().describe('Chat ID'),
});

const AddLabelToChatInput = z.object({
  sessionId: z.string().describe('Session ID'),
  chatId: z.string().describe('Chat ID'),
  labelId: z.string().describe('Label ID to add'),
});

const RemoveLabelFromChatInput = z.object({
  sessionId: z.string().describe('Session ID'),
  chatId: z.string().describe('Chat ID'),
  labelId: z.string().describe('Label ID to remove'),
});

@Injectable()
@Actions('labels')
@UseGuards(ApiKeyGuard)
export class LabelActions {
  constructor(private readonly sessionService: SessionService) {}

  @Action({
    description: 'Get all labels (WhatsApp Business only)',
    input: SessionInput,
    kind: 'query',
    method: 'GET',
    path: 'sessions/:sessionId/labels',
  })
  list(input: z.infer<typeof SessionInput>) {
    const engine = this.getEngine(input.sessionId);
    return engine.getLabels();
  }

  @Action({
    description: 'Get a specific label by ID',
    input: LabelInput,
    kind: 'query',
    method: 'GET',
    path: 'sessions/:sessionId/labels/:labelId',
  })
  async get(input: z.infer<typeof LabelInput>) {
    const engine = this.getEngine(input.sessionId);
    const label = await engine.getLabelById(input.labelId);
    if (!label) {
      throw new NotFoundException(`Label ${input.labelId} not found`);
    }
    return label;
  }

  @Action({
    description: 'Get labels for a specific chat',
    input: ChatInput,
    kind: 'query',
    method: 'GET',
    path: 'sessions/:sessionId/labels/chat/:chatId',
  })
  chatLabels(input: z.infer<typeof ChatInput>) {
    const engine = this.getEngine(input.sessionId);
    return engine.getChatLabels(input.chatId);
  }

  @Action({
    description: 'Add a label to a chat',
    input: AddLabelToChatInput,
    method: 'POST',
    path: 'sessions/:sessionId/labels/chat/:chatId',
  })
  async addToChat(input: z.infer<typeof AddLabelToChatInput>) {
    const engine = this.getEngine(input.sessionId);
    await engine.addLabelToChat(input.chatId, input.labelId);
    return { success: true };
  }

  @Action({
    description: 'Remove a label from a chat',
    input: RemoveLabelFromChatInput,
    method: 'DELETE',
    path: 'sessions/:sessionId/labels/chat/:chatId/:labelId',
  })
  async removeFromChat(input: z.infer<typeof RemoveLabelFromChatInput>) {
    const engine = this.getEngine(input.sessionId);
    await engine.removeLabelFromChat(input.chatId, input.labelId);
    return { success: true };
  }

  /** Resolve the running engine for a session, mirroring the old controller. */
  private getEngine(sessionId: string) {
    const engine = this.sessionService.getEngine(sessionId);
    if (!engine) {
      throw new BadRequestException('Session is not started');
    }
    return engine;
  }
}
