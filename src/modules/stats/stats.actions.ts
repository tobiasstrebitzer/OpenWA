import { Injectable, UseGuards } from '@nestjs/common';
import { Action, Actions } from '@silkweave/nestjs';
import { z } from 'zod/v4';
import { ApiKeyGuard } from '../auth/guards/api-key.guard';
import { StatsService } from './stats.service';

const MessageStatsInput = z.object({
  period: z.enum(['24h', '7d', '30d']).default('24h').describe('Time period for the message statistics'),
});

const SessionStatsInput = z.object({
  sessionId: z.string().describe('Session ID'),
});

@Injectable()
@Actions('stats')
@UseGuards(ApiKeyGuard)
export class StatsActions {
  constructor(private readonly statsService: StatsService) {}

  @Action({
    description: 'Get overall statistics across sessions and messages',
    input: z.object({}),
    kind: 'query',
    method: 'GET',
    path: 'stats/overview',
  })
  overview() {
    return this.statsService.getOverview();
  }

  @Action({
    description: 'Get message statistics with time series for a period',
    input: MessageStatsInput,
    kind: 'query',
    method: 'GET',
    path: 'stats/messages',
  })
  messages(input: z.infer<typeof MessageStatsInput>) {
    return this.statsService.getMessageStats(input.period);
  }

  @Action({
    description: 'Get statistics for a specific session',
    input: SessionStatsInput,
    kind: 'query',
    method: 'GET',
    path: 'stats/sessions/:sessionId',
  })
  sessionStats(input: z.infer<typeof SessionStatsInput>) {
    return this.statsService.getSessionStats(input.sessionId);
  }
}
