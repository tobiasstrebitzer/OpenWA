import { BadRequestException, Injectable, NotFoundException, UseGuards } from '@nestjs/common';
import { Action, Actions } from '@silkweave/nestjs';
import { z } from 'zod/v4';
import { ApiKeyGuard } from '../auth/guards/api-key.guard';
import { SessionService } from '../session/session.service';

const SessionInput = z.object({
  sessionId: z.string().describe('Session ID'),
});

const ChannelInput = z.object({
  sessionId: z.string().describe('Session ID'),
  channelId: z.string().describe('Channel ID'),
});

const MessagesInput = z.object({
  sessionId: z.string().describe('Session ID'),
  channelId: z.string().describe('Channel ID'),
  limit: z.coerce.number().int().positive().optional().describe('Max messages to return (default 50)'),
});

const SubscribeInput = z.object({
  sessionId: z.string().describe('Session ID'),
  inviteCode: z.string().describe('Channel invite code (from channel link)'),
});

@Injectable()
@Actions('channel')
@UseGuards(ApiKeyGuard)
export class ChannelActions {
  constructor(private readonly sessionService: SessionService) {}

  @Action({
    description: 'Get all subscribed channels/newsletters for a session',
    input: SessionInput,
    kind: 'query',
    method: 'GET',
    path: 'sessions/:sessionId/channels',
  })
  list(input: z.infer<typeof SessionInput>) {
    const engine = this.getEngine(input.sessionId);
    return engine.getSubscribedChannels();
  }

  @Action({
    description: 'Get a specific channel by ID',
    input: ChannelInput,
    kind: 'query',
    method: 'GET',
    path: 'sessions/:sessionId/channels/:channelId',
  })
  async get(input: z.infer<typeof ChannelInput>) {
    const engine = this.getEngine(input.sessionId);
    const channel = await engine.getChannelById(input.channelId);
    if (!channel) {
      throw new NotFoundException(`Channel ${input.channelId} not found`);
    }
    return channel;
  }

  @Action({
    description: 'Get messages from a channel',
    input: MessagesInput,
    kind: 'query',
    method: 'GET',
    path: 'sessions/:sessionId/channels/:channelId/messages',
  })
  messages(input: z.infer<typeof MessagesInput>) {
    const engine = this.getEngine(input.sessionId);
    return engine.getChannelMessages(input.channelId, input.limit);
  }

  @Action({
    description: 'Subscribe to a channel using an invite code',
    input: SubscribeInput,
    method: 'POST',
    path: 'sessions/:sessionId/channels/subscribe',
  })
  subscribe(input: z.infer<typeof SubscribeInput>) {
    const engine = this.getEngine(input.sessionId);
    return engine.subscribeToChannel(input.inviteCode);
  }

  @Action({
    description: 'Unsubscribe from a channel',
    input: ChannelInput,
    method: 'DELETE',
    path: 'sessions/:sessionId/channels/:channelId',
  })
  async unsubscribe(input: z.infer<typeof ChannelInput>) {
    const engine = this.getEngine(input.sessionId);
    await engine.unsubscribeFromChannel(input.channelId);
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
