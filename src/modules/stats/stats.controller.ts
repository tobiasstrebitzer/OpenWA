import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Mcp } from '@silkweave/nestjs';
import { StatsService } from './stats.service';
import { StatsQueryDto } from './dto/stats-query.dto';

@ApiTags('Statistics')
@Controller('stats')
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Get overall statistics' })
  @Mcp()
  async getOverview() {
    return this.statsService.getOverview();
  }

  @Get('messages')
  @ApiOperation({ summary: 'Get message statistics with time series' })
  @Mcp()
  async getMessageStats(@Query() query: StatsQueryDto) {
    return this.statsService.getMessageStats(query.period || '24h');
  }

  @Get('sessions/:sessionId')
  @ApiOperation({ summary: 'Get statistics for a specific session' })
  @Mcp()
  async getSessionStats(@Param('sessionId') sessionId: string) {
    return this.statsService.getSessionStats(sessionId);
  }
}
