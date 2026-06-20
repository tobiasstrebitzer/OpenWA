// archiver v8 is ESM-only and is pulled in transitively via the @Global StorageModule when AppModule
// boots; stub it so ts-jest (CommonJS) can load the module graph.
jest.mock('archiver', () => ({ TarArchive: jest.fn() }));

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { SessionService } from './../src/modules/session/session.service';
import { AuthService } from './../src/modules/auth/auth.service';
import { ApiKeyRole } from './../src/modules/auth/entities/api-key.entity';
import type { SimulatorEngineAdapter } from './../src/engine/adapters/simulator.adapter';

/**
 * True end-to-end across the service layer with NO real WhatsApp connection: boots the full app with
 * ENGINE_TYPE=simulator (the in-memory `baseline` world), then drives the public REST API to create +
 * start a session, read world data, send a message, and - by injecting an inbound message into the
 * running engine - prove the inbound pipeline (engine callback -> persist -> webhook dispatch) runs.
 *
 * The data DB is isolated to in-memory so the run is hermetic and re-runnable, and a real admin key is
 * minted at boot so the actual auth boundary is exercised on every call.
 */
describe('Simulator engine (e2e)', () => {
  let app: INestApplication<App>;
  let sessions: SessionService;
  let sessionId: string;
  let apiKey: string;
  let apiKeyId: string;

  const ALICE = '14155550101@c.us';
  const BOB = '14155550102@c.us';
  const GROUP = '120363000000000001@g.us';
  const NEWS_CHANNEL = '120363111111111111@newsletter';

  const saved: Record<string, string | undefined> = {};
  const setEnv = (key: string, value: string): void => {
    saved[key] = process.env[key];
    process.env[key] = value;
  };

  const auth = (req: request.Test): request.Test => req.set('X-API-Key', apiKey);

  beforeAll(async () => {
    setEnv('ENGINE_TYPE', 'simulator');
    // Hermetic, re-runnable session/message storage (the auth DB path is fixed, but those rows are
    // cleaned up below). Keep the throttler out of the way of a tight test sequence.
    setEnv('DATABASE_NAME', ':memory:');
    setEnv('DATABASE_SYNCHRONIZE', 'true');
    setEnv('RATE_LIMIT_SHORT_LIMIT', '100000');
    setEnv('RATE_LIMIT_MEDIUM_LIMIT', '100000');
    setEnv('RATE_LIMIT_LONG_LIMIT', '100000');

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    sessions = moduleFixture.get(SessionService);
    const authService = moduleFixture.get(AuthService);
    const minted = await authService.createApiKey({ name: 'sim-e2e', role: ApiKeyRole.ADMIN });
    apiKey = minted.rawKey;
    apiKeyId = minted.apiKey.id;
  });

  afterAll(async () => {
    try {
      if (apiKeyId) await app.get(AuthService).delete(apiKeyId);
    } catch {
      /* best-effort cleanup */
    }
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    try {
      await app?.close();
    } catch {
      /* ignore teardown-only multi-datasource quirk */
    }
  });

  it('creates and starts a session that reports ready on the simulated identity', async () => {
    const created = await auth(request(app.getHttpServer()).post('/api/sessions')).send({ name: 'sim-e2e' });
    expect(created.status).toBe(201);
    sessionId = (created.body as { id: string }).id;
    expect(sessionId).toBeTruthy();

    await auth(request(app.getHttpServer()).post(`/api/sessions/${sessionId}/start`)).expect(201);

    const detail = await auth(request(app.getHttpServer()).get(`/api/sessions/${sessionId}`)).expect(200);
    const body = detail.body as { status: string; phone?: string | null };
    expect(body.status).toBe('ready');
    expect(body.phone).toBe('14155550100');
  });

  it('serves world chats and groups through the REST API', async () => {
    const chats = await auth(request(app.getHttpServer()).get(`/api/sessions/${sessionId}/chats`)).expect(200);
    const chatIds = (chats.body as Array<{ id: string }>).map(c => c.id);
    expect(chatIds).toEqual(expect.arrayContaining([ALICE, GROUP]));

    const groups = await auth(request(app.getHttpServer()).get(`/api/sessions/${sessionId}/groups`)).expect(200);
    const groupNames = (groups.body as Array<{ name: string }>).map(g => g.name);
    expect(groupNames).toContain('Project Falcon');
  });

  it('reads seeded chat history live from the engine', async () => {
    const res = await auth(
      request(app.getHttpServer()).get(`/api/sessions/${sessionId}/messages/${ALICE}/history`),
    ).expect(200);
    const bodies = (res.body as Array<{ body: string }>).map(m => m.body);
    expect(bodies).toEqual(expect.arrayContaining(['Hey, are we still on for tomorrow?', 'Yes, 3pm works for me.']));
  });

  it('sends a text message through the service layer', async () => {
    const res = await auth(request(app.getHttpServer()).post(`/api/sessions/${sessionId}/messages/send-text`)).send({
      chatId: ALICE,
      text: 'On my way',
    });
    expect(res.status).toBe(201);
    const body = res.body as { messageId?: string; id?: string };
    expect(body.messageId ?? body.id).toBeTruthy();
  });

  it('delivers an injected inbound message through the pipeline (persisted to the DB)', async () => {
    const engine = sessions.getEngine(sessionId) as unknown as SimulatorEngineAdapter;
    expect(engine).toBeDefined();

    const marker = 'inbound-proof-7f3a';
    engine.injectInboundText(ALICE, marker);

    // onMessage persists asynchronously (fire-and-forget save); poll the DB-backed list briefly.
    let found = false;
    for (let i = 0; i < 20 && !found; i++) {
      const res = await auth(
        request(app.getHttpServer()).get(`/api/sessions/${sessionId}/messages`).query({ chatId: ALICE }),
      );
      if (JSON.stringify(res.body).includes(marker)) found = true;
      else await new Promise(r => setTimeout(r, 50));
    }
    expect(found).toBe(true);
  });

  it('serves business labels and applies one to a chat', async () => {
    const labels = await auth(request(app.getHttpServer()).get(`/api/sessions/${sessionId}/labels`)).expect(200);
    const names = (labels.body as Array<{ name: string }>).map(l => l.name);
    expect(names).toEqual(expect.arrayContaining(['Lead', 'Customer']));

    const aliceLabels = await auth(
      request(app.getHttpServer()).get(`/api/sessions/${sessionId}/labels/chat/${ALICE}`),
    ).expect(200);
    expect((aliceLabels.body as Array<{ name: string }>).map(l => l.name)).toEqual(['Lead']);

    await auth(request(app.getHttpServer()).post(`/api/sessions/${sessionId}/labels/chat/${BOB}`))
      .send({ labelId: 'LBL_CUSTOMER' })
      .expect(201);

    const bobLabels = await auth(
      request(app.getHttpServer()).get(`/api/sessions/${sessionId}/labels/chat/${BOB}`),
    ).expect(200);
    expect((bobLabels.body as Array<{ name: string }>).map(l => l.name)).toEqual(['Customer']);
  });

  it('lists subscribed channels, reads their feed, and subscribes via invite code', async () => {
    const subscribed = await auth(request(app.getHttpServer()).get(`/api/sessions/${sessionId}/channels`)).expect(200);
    const names = (subscribed.body as Array<{ name: string }>).map(c => c.name);
    expect(names).toEqual(['OpenWA News']); // Tech Daily is not subscribed yet

    const feed = await auth(
      request(app.getHttpServer()).get(`/api/sessions/${sessionId}/channels/${NEWS_CHANNEL}/messages`),
    ).expect(200);
    expect((feed.body as Array<{ body: string }>)[0].body).toContain('v0.4.6');

    await auth(request(app.getHttpServer()).post(`/api/sessions/${sessionId}/channels/subscribe`))
      .send({ inviteCode: 'tech-daily-invite' })
      .expect(201);

    const after = await auth(request(app.getHttpServer()).get(`/api/sessions/${sessionId}/channels`)).expect(200);
    expect((after.body as Array<{ name: string }>).map(c => c.name)).toEqual(
      expect.arrayContaining(['OpenWA News', 'Tech Daily']),
    );
  });

  it('serves contact statuses and posts an own text status', async () => {
    const statuses = await auth(request(app.getHttpServer()).get(`/api/sessions/${sessionId}/status`)).expect(200);
    const captions = (statuses.body as { statuses: Array<{ caption?: string }> }).statuses.map(s => s.caption);
    expect(captions).toContain('Out for lunch 🍜');

    const posted = await auth(request(app.getHttpServer()).post(`/api/sessions/${sessionId}/status/send-text`))
      .send({ text: 'Back online', backgroundColor: '#25D366' })
      .expect(201);
    expect((posted.body as { statusId: string }).statusId).toBeTruthy();
  });

  it('serves the business catalog, its products, and sends a product message', async () => {
    const catalog = await auth(request(app.getHttpServer()).get(`/api/sessions/${sessionId}/catalog`)).expect(200);
    const cat = catalog.body as { name: string; productCount: number };
    expect(cat.name).toBe('OpenWA Store');
    expect(cat.productCount).toBe(2);

    const products = await auth(request(app.getHttpServer()).get(`/api/sessions/${sessionId}/catalog/products`)).expect(
      200,
    );
    const list = (products.body as { products: Array<{ id: string; name: string }> }).products;
    expect(list.map(p => p.name)).toEqual(expect.arrayContaining(['Starter Plan', 'Pro Plan']));

    const sent = await auth(request(app.getHttpServer()).post(`/api/sessions/${sessionId}/messages/send-product`))
      .send({ chatId: ALICE, productId: 'PROD_0001' })
      .expect(201);
    expect(
      (sent.body as { messageId?: string; id?: string }).messageId ?? (sent.body as { id?: string }).id,
    ).toBeTruthy();
  });
});
