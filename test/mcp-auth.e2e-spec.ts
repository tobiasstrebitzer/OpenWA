// Avoid writing the dev key file (data/.api-key) when AuthService seeds a default key on init.
jest.mock('../src/common/utils/secret-file', () => ({ writeSecretFile: jest.fn() }));

import 'reflect-metadata';
import { Controller, Get, INestApplication, Param, Post } from '@nestjs/common';
import { APP_GUARD, DiscoveryModule } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { McpDiscovery } from '../src/modules/mcp/discovery';
import { Mcp } from '../src/modules/mcp/mcp.decorator';
import type { McpTool } from '../src/modules/mcp/types';
import { AuthService } from '../src/modules/auth/auth.service';
import { ApiKeyGuard } from '../src/modules/auth/guards/api-key.guard';
import { ApiKey, ApiKeyRole } from '../src/modules/auth/entities/api-key.entity';
import { RequireRole, SessionScoped } from '../src/modules/auth/decorators/auth.decorators';
import { hashApiKey } from '../src/modules/auth/api-key-hash';

// A session-scoped controller mirroring SessionController: `:id` is the session id
// (because the class is @SessionScoped), so per-key allowedSessions scoping applies.
@SessionScoped()
@Controller('sessions')
class FixtureSessionController {
  @Get(':id')
  @RequireRole(ApiKeyRole.VIEWER)
  @Mcp()
  findOne(@Param('id') id: string) {
    return { id, ok: true };
  }

  @Post(':id/stop')
  @RequireRole(ApiKeyRole.OPERATOR)
  @Mcp()
  stop(@Param('id') id: string) {
    return { id, stopped: true };
  }
}

/**
 * The auth acceptance bar (PR #256): every MCP tool call goes through ApiKeyGuard +
 * @RequireRole with per-key session scoping enforced - and an unscoped/scoped key cannot
 * reach another key's session. This drives the real guard through the same request
 * reconstruction the transport uses, so the MCP decision matches the REST decision.
 */
describe('MCP auth + session scoping (e2e)', () => {
  let app: INestApplication;
  let tools: McpTool[];

  const SCOPED = 'scoped-viewer-key'; // viewer, allowedSessions: ['session-a']
  const ADMIN = 'admin-key'; // admin, no session scope
  const pepper = process.env.API_KEY_PEPPER;

  const tool = (name: string): McpTool => {
    const t = tools.find(x => x.name === name);
    if (!t) throw new Error(`tool ${name} not found`);
    return t;
  };
  const call = (t: McpTool, key: string | undefined, id: string) =>
    t.run({ id }, { headers: key ? { 'x-api-key': key } : {}, params: {}, query: {}, body: {} });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          entities: [ApiKey],
          synchronize: true,
          name: 'main',
        }),
        TypeOrmModule.forFeature([ApiKey], 'main'),
        DiscoveryModule,
      ],
      controllers: [FixtureSessionController],
      providers: [AuthService, McpDiscovery, { provide: APP_GUARD, useClass: ApiKeyGuard }],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    const repo = app.get<Repository<ApiKey>>(getRepositoryToken(ApiKey, 'main'));
    await repo.save(
      repo.create({
        name: 'scoped',
        keyHash: hashApiKey(SCOPED, pepper),
        keyPrefix: 'scoped',
        role: ApiKeyRole.VIEWER,
        allowedSessions: ['session-a'],
        isActive: true,
      }),
    );
    await repo.save(
      repo.create({
        name: 'admin',
        keyHash: hashApiKey(ADMIN, pepper),
        keyPrefix: 'admin',
        role: ApiKeyRole.ADMIN,
        allowedSessions: null,
        isActive: true,
      }),
    );

    tools = app.get(McpDiscovery).discover({ globalGuards: [ApiKeyGuard] });
  });

  afterAll(async () => {
    try {
      await app?.close();
    } catch {
      /* teardown-only multi-datasource quirk */
    }
  });

  it('exposes the decorated routes as tools', () => {
    expect(tools.map(t => t.name).sort()).toEqual(['FixtureSessionFindOne', 'FixtureSessionStop']);
  });

  it('rejects a tool call with no API key', async () => {
    await expect(call(tool('FixtureSessionFindOne'), undefined, 'session-a')).rejects.toThrow(/API key is required/);
  });

  it('rejects a tool call with an invalid API key', async () => {
    await expect(call(tool('FixtureSessionFindOne'), 'nope', 'session-a')).rejects.toThrow(/Invalid API key/);
  });

  it('allows a scoped key on its own session', async () => {
    await expect(call(tool('FixtureSessionFindOne'), SCOPED, 'session-a')).resolves.toEqual({
      id: 'session-a',
      ok: true,
    });
  });

  it('DENIES a scoped key reaching another session (the cross-session-leak path)', async () => {
    await expect(call(tool('FixtureSessionFindOne'), SCOPED, 'session-b')).rejects.toThrow(
      /not authorized for this session/,
    );
  });

  it('enforces @RequireRole over MCP (viewer key blocked on an operator tool)', async () => {
    await expect(call(tool('FixtureSessionStop'), SCOPED, 'session-a')).rejects.toThrow(/Insufficient permissions/);
  });

  it('an admin key (no scope) reaches any session', async () => {
    await expect(call(tool('FixtureSessionStop'), ADMIN, 'session-b')).resolves.toEqual({
      id: 'session-b',
      stopped: true,
    });
  });
});
