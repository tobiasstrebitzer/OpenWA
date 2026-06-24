import 'reflect-metadata';
import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { DiscoveryModule } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { IsOptional, IsString } from 'class-validator';
import { McpDiscovery } from './discovery';
import { Mcp } from './mcp.decorator';
import type { McpTool } from './types';

class SendDto {
  @IsString()
  text: string;

  @IsOptional()
  @IsString()
  caption?: string;
}

@Controller('widgets')
class FixtureController {
  lastArgs: unknown[] = [];

  @Get(':sessionId/items/:itemId')
  @ApiOperation({ summary: 'Get a widget item' })
  @Mcp()
  getItem(@Param('sessionId') sessionId: string, @Param('itemId') itemId: string, @Query('verbose') verbose?: string) {
    this.lastArgs = [sessionId, itemId, verbose];
    return { sessionId, itemId, verbose };
  }

  @Post(':sessionId/send')
  @Mcp()
  send(@Param('sessionId') sessionId: string, @Body() dto: SendDto) {
    this.lastArgs = [sessionId, dto];
    return { sessionId, dto };
  }

  // Whole-body param typed as an interface -> erases to Object -> passthrough.
  @Post('raw')
  @Mcp()
  raw(@Body() body: { anything: string }) {
    this.lastArgs = [body];
    return body;
  }

  // No @Mcp() -> must not be discovered.
  @Get('hidden')
  hidden() {
    return 'nope';
  }
}

describe('McpDiscovery', () => {
  let discovery: McpDiscovery;
  let controller: FixtureController;
  let tools: McpTool[];
  const byName = (name: string): McpTool => {
    const t = tools.find(x => x.name === name);
    if (!t) {
      throw new Error(`tool ${name} not found; have: ${tools.map(x => x.name).join(', ')}`);
    }
    return t;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [DiscoveryModule],
      controllers: [FixtureController],
      providers: [McpDiscovery],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    discovery = app.get(McpDiscovery);
    controller = app.get(FixtureController);
    tools = discovery.discover();
  });

  it('discovers only @Mcp()-decorated routes', () => {
    const names = tools.map(t => t.name).sort();
    expect(names).toEqual(['FixtureGetItem', 'FixtureRaw', 'FixtureSend']);
  });

  it('derives the description from @ApiOperation', () => {
    expect(byName('FixtureGetItem').description).toBe('Get a widget item');
  });

  it('reflects path params and optional query into the input shape', () => {
    const shape = byName('FixtureGetItem').inputShape;
    expect(Object.keys(shape).sort()).toEqual(['itemId', 'sessionId', 'verbose']);
    expect(shape.sessionId.safeParse('x').success).toBe(true);
    // verbose is optional
    expect(shape.verbose.safeParse(undefined).success).toBe(true);
  });

  it('flattens a whole-body DTO into its fields (not passthrough)', () => {
    const tool = byName('FixtureSend');
    expect(Object.keys(tool.inputShape).sort()).toEqual(['caption', 'sessionId', 'text']);
    expect(tool.passthrough).toBeFalsy();
  });

  it('marks an unreflectable whole-body param as passthrough', () => {
    const tool = byName('FixtureRaw');
    expect(tool.passthrough).toBe(true);
    expect(Object.keys(tool.inputShape)).toEqual([]);
  });

  it('run() rebinds input back into the method positional args', async () => {
    const result = await byName('FixtureGetItem').run({ sessionId: 's1', itemId: 'i9', verbose: 'true' }, undefined);
    expect(controller.lastArgs).toEqual(['s1', 'i9', 'true']);
    expect(result).toEqual({ sessionId: 's1', itemId: 'i9', verbose: 'true' });
  });

  it('run() reconstructs a whole-body DTO arg', async () => {
    await byName('FixtureSend').run({ sessionId: 's1', text: 'hi', caption: 'c' }, undefined);
    expect(controller.lastArgs).toEqual(['s1', { text: 'hi', caption: 'c' }]);
  });

  it('run() passes the whole body through for a passthrough param', async () => {
    await byName('FixtureRaw').run({ anything: 'goes', extra: 1 }, undefined);
    expect(controller.lastArgs).toEqual([{ anything: 'goes', extra: 1 }]);
  });
});
