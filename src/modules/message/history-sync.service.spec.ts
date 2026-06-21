import { DataSource } from 'typeorm';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { HistorySyncService } from './history-sync.service';
import { SessionService } from '../session/session.service';
import { Message, MessageDirection } from './entities/message.entity';
import { IncomingMessage } from '../../engine/interfaces/whatsapp-engine.interface';

const msg = (over: Partial<IncomingMessage>): IncomingMessage => ({
  id: 'wa-1',
  from: 'peer@c.us',
  to: 'me@c.us',
  chatId: 'peer@c.us',
  body: 'hello',
  type: 'text',
  timestamp: 1_700_000_000,
  fromMe: false,
  isGroup: false,
  ...over,
});

describe('HistorySyncService (real sqlite)', () => {
  let ds: DataSource;
  let service: HistorySyncService;
  let engine: { getChatHistory: jest.Mock; getChats: jest.Mock };
  let sessionService: { getEngine: jest.Mock };

  const CHAT = 'peer@c.us';

  beforeEach(async () => {
    ds = new DataSource({ type: 'sqlite', database: ':memory:', entities: [Message], synchronize: true });
    await ds.initialize();

    engine = { getChatHistory: jest.fn().mockResolvedValue([]), getChats: jest.fn().mockResolvedValue([]) };
    sessionService = { getEngine: jest.fn().mockReturnValue(engine) };

    service = new HistorySyncService(ds.getRepository(Message), sessionService as unknown as SessionService);
  });

  afterEach(async () => {
    await ds.destroy();
  });

  const storedFor = (chatId: string) =>
    ds.getRepository(Message).find({ where: { chatId }, order: { createdAt: 'ASC' } });

  it('persists fetched history, stamping createdAt from the message time so the panel orders chronologically', async () => {
    engine.getChatHistory.mockResolvedValue([
      msg({ id: 'm1', body: 'first', timestamp: 1_700_000_100, fromMe: false }),
      msg({ id: 'm2', body: 'reply', timestamp: 1_700_000_200, fromMe: true, from: 'me@c.us', to: CHAT }),
    ]);

    const res = await service.syncChat('s1', CHAT);
    expect(res).toEqual({ chatId: CHAT, fetched: 2, inserted: 2, skipped: 0 });

    const rows = await storedFor(CHAT);
    expect(rows.map(r => r.body)).toEqual(['first', 'reply']);
    // createdAt reflects the real message time (not "now"), which is what getMessages sorts on.
    expect(rows[0].createdAt.getTime()).toBe(1_700_000_100 * 1000);
    expect(rows[1].createdAt.getTime()).toBe(1_700_000_200 * 1000);
    // direction is derived from fromMe.
    expect(rows[0].direction).toBe(MessageDirection.INCOMING);
    expect(rows[1].direction).toBe(MessageDirection.OUTGOING);
  });

  it('is idempotent: a second sync inserts nothing (dedup by waMessageId)', async () => {
    const history = [msg({ id: 'm1' }), msg({ id: 'm2' })];
    engine.getChatHistory.mockResolvedValue(history);

    const first = await service.syncChat('s1', CHAT);
    expect(first.inserted).toBe(2);

    const second = await service.syncChat('s1', CHAT);
    expect(second).toEqual({ chatId: CHAT, fetched: 2, inserted: 0, skipped: 2 });
    expect(await ds.getRepository(Message).count()).toBe(2);
  });

  it('does not duplicate rows already stored from live events (same waMessageId)', async () => {
    await ds.getRepository(Message).save(
      ds.getRepository(Message).create({
        sessionId: 's1',
        waMessageId: 'm1',
        chatId: CHAT,
        from: 'peer@c.us',
        to: 'me@c.us',
        type: 'text',
        direction: MessageDirection.INCOMING,
      }),
    );
    engine.getChatHistory.mockResolvedValue([msg({ id: 'm1' }), msg({ id: 'm2' })]);

    const res = await service.syncChat('s1', CHAT);
    expect(res.inserted).toBe(1); // only m2 is new
    expect(await ds.getRepository(Message).count()).toBe(2);
  });

  it('skips status broadcasts and messages missing id/chatId/from/to', async () => {
    engine.getChatHistory.mockResolvedValue([
      msg({ id: 'ok' }),
      msg({ id: 'bcast', isStatusBroadcast: true }),
      msg({ id: '' }),
      msg({ id: 'nochat', chatId: '' }),
      msg({ id: 'nofrom', from: '' }),
    ]);

    const res = await service.syncChat('s1', CHAT);
    expect(res.inserted).toBe(1);
    expect((await ds.getRepository(Message).find()).map(r => r.waMessageId)).toEqual(['ok']);
  });

  it('clamps the requested limit before hitting the engine', async () => {
    await service.syncChat('s1', CHAT, 99999);
    expect(engine.getChatHistory).toHaveBeenCalledWith(CHAT, 500); // MAX_CHAT_LIMIT
    await service.syncChat('s1', CHAT, 0);
    expect(engine.getChatHistory).toHaveBeenLastCalledWith(CHAT, 1); // floor of 1
  });

  it('throws when the session is not active', async () => {
    sessionService.getEngine.mockReturnValue(undefined);
    await expect(service.syncChat('s1', CHAT)).rejects.toBeInstanceOf(BadRequestException);
  });

  describe('syncSession', () => {
    it('queues a sweep of the session chats and reports the count', async () => {
      engine.getChats.mockResolvedValue([{ id: 'a@c.us' }]);
      engine.getChatHistory.mockResolvedValue([]);

      const res = await service.syncSession('s1');
      expect(res).toEqual({ started: true, chats: 1 });
      expect(engine.getChats).toHaveBeenCalled();
    });

    it('rejects a second sweep while one is already in flight', async () => {
      (service as unknown as { sessionsSyncing: Set<string> }).sessionsSyncing.add('s1');
      await expect(service.syncSession('s1')).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
