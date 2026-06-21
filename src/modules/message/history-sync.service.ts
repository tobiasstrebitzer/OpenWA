import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { SessionService } from '../session/session.service';
import { Message, MessageDirection, MessageStatus } from './entities/message.entity';
import { IncomingMessage } from '../../engine/interfaces/whatsapp-engine.interface';
import { createLogger } from '../../common/services/logger.service';

export interface ChatHistorySyncResult {
  chatId: string;
  fetched: number;
  inserted: number;
  skipped: number;
}

export interface SessionHistorySyncStart {
  started: boolean;
  chats: number;
}

/**
 * Backfills engine-held chat history into the `messages` table so the DB-backed chat view shows
 * conversations that predate the live connection. No engine persists history on connect: inbound
 * `messaging-history.set`/`append` events are not stored, and the dashboard reads stored rows, so a
 * freshly (re)started session shows an empty panel until new live traffic arrives. This pulls history
 * on demand via `engine.getChatHistory` and mirrors it in, de-duplicated by `(sessionId, waMessageId)`
 * so repeated resyncs never duplicate.
 *
 * Engines rate-limit history reads, so this never fans out: a chat sync is one engine call, and the
 * session-wide sweep walks chats sequentially with a pause between them. An automatic/scheduled sweep
 * would call `syncSession`; that scheduler is intentionally deferred to a follow-up.
 */
@Injectable()
export class HistorySyncService {
  private readonly logger = createLogger('HistorySync');

  /** Per-chat fetch bounds. getChatHistory hits the (rate-limited) engine, so the ceiling is modest. */
  private static readonly DEFAULT_CHAT_LIMIT = 50;
  private static readonly MAX_CHAT_LIMIT = 500;

  /** Session sweep throttle: chats are synced one at a time with this pause between them, capped so a
   *  single run can't walk an unbounded address book. */
  private static readonly SESSION_SYNC_DELAY_MS = 1500;
  private static readonly SESSION_SYNC_MAX_CHATS = 200;

  /** Sessions with a sweep in flight - guards against overlapping runs (double trigger, or a future
   *  scheduler racing a manual one) hammering the engine. */
  private readonly sessionsSyncing = new Set<string>();

  constructor(
    @InjectRepository(Message, 'data')
    private readonly messageRepository: Repository<Message>,
    private readonly sessionService: SessionService,
  ) {}

  /** Sync one chat's history into stored history. Idempotent: rows already present (by waMessageId)
   *  are skipped, so repeated resyncs only add what's missing. */
  async syncChat(sessionId: string, chatId: string, limit?: number): Promise<ChatHistorySyncResult> {
    if (!chatId) {
      throw new BadRequestException('chatId is required');
    }
    const engine = this.getEngine(sessionId);
    const history = await engine.getChatHistory(chatId, this.clampLimit(limit));
    const inserted = await this.persist(sessionId, history);
    this.logger.debug(`History synced for chat ${chatId}`, {
      sessionId,
      chatId,
      fetched: history.length,
      inserted,
      action: 'history_sync_chat',
    });
    return { chatId, fetched: history.length, inserted, skipped: history.length - inserted };
  }

  /** Start a throttled, sequential background sweep of every chat in the session. Returns immediately
   *  with the number of chats queued; progress is logged. Rejects if a sweep is already running. */
  async syncSession(sessionId: string): Promise<SessionHistorySyncStart> {
    const engine = this.getEngine(sessionId);
    if (this.sessionsSyncing.has(sessionId)) {
      throw new ConflictException('A history sync is already running for this session');
    }
    const chats = await engine.getChats();
    const chatIds = chats.slice(0, HistorySyncService.SESSION_SYNC_MAX_CHATS).map(c => c.id);
    this.sessionsSyncing.add(sessionId);
    void this.runSessionSweep(sessionId, chatIds).finally(() => this.sessionsSyncing.delete(sessionId));
    return { started: true, chats: chatIds.length };
  }

  private async runSessionSweep(sessionId: string, chatIds: string[]): Promise<void> {
    let inserted = 0;
    for (let i = 0; i < chatIds.length; i++) {
      // Bail if the session was stopped/deleted mid-sweep so we stop calling a dead engine.
      if (!this.sessionService.getEngine(sessionId)) {
        break;
      }
      try {
        inserted += (await this.syncChat(sessionId, chatIds[i])).inserted;
      } catch (err) {
        this.logger.warn(`History sync failed for chat ${chatIds[i]}: ${String(err)}`, {
          sessionId,
          action: 'history_sync_chat_failed',
        });
      }
      if (i < chatIds.length - 1) {
        await this.delay(HistorySyncService.SESSION_SYNC_DELAY_MS);
      }
    }
    this.logger.log(`History sweep done: ${chatIds.length} chat(s), ${inserted} message(s) inserted`, {
      sessionId,
      action: 'history_sync_session',
      chats: chatIds.length,
      inserted,
    });
  }

  /** De-dup within the batch and against stored rows (by waMessageId, unique per account), then bulk
   *  insert what's missing. Returns the number of rows inserted. */
  private async persist(sessionId: string, history: IncomingMessage[]): Promise<number> {
    const byId = new Map<string, IncomingMessage>();
    for (const m of history) {
      // Need an id to de-dup; chatId/from/to are NOT NULL columns; status/story posts aren't chats.
      if (m.id && !m.isStatusBroadcast && m.chatId && m.from && m.to) {
        byId.set(m.id, m);
      }
    }
    if (byId.size === 0) {
      return 0;
    }
    const existing = await this.messageRepository.find({
      where: { sessionId, waMessageId: In([...byId.keys()]) },
      select: ['waMessageId'],
    });
    for (const row of existing) {
      byId.delete(row.waMessageId);
    }
    if (byId.size === 0) {
      return 0;
    }
    const rows = [...byId.values()].map(m => this.toRow(sessionId, m));
    await this.messageRepository.save(rows);
    return rows.length;
  }

  private toRow(sessionId: string, m: IncomingMessage): Message {
    const metadata: Record<string, unknown> = {};
    if (m.media) {
      metadata.media = m.media;
    }
    if (m.quotedMessage) {
      metadata.quotedMessage = m.quotedMessage;
    }
    const row = this.messageRepository.create({
      sessionId,
      waMessageId: m.id,
      chatId: m.chatId,
      from: m.from,
      to: m.to,
      body: m.body,
      type: m.type,
      direction: m.fromMe ? MessageDirection.OUTGOING : MessageDirection.INCOMING,
      timestamp: m.timestamp,
      status: MessageStatus.SENT,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    });
    // The chat panel orders by createdAt, so stamp backfilled rows with the message's real time
    // (unix seconds) rather than "now" - otherwise old history clumps at the bottom as if just sent,
    // ahead of live messages. TypeORM honours an explicitly set @CreateDateColumn on insert.
    if (m.timestamp) {
      row.createdAt = new Date(m.timestamp * 1000);
    }
    return row;
  }

  private clampLimit(limit?: number): number {
    if (typeof limit !== 'number' || !Number.isFinite(limit)) {
      return HistorySyncService.DEFAULT_CHAT_LIMIT;
    }
    return Math.min(Math.max(Math.trunc(limit), 1), HistorySyncService.MAX_CHAT_LIMIT);
  }

  private getEngine(sessionId: string) {
    const engine = this.sessionService.getEngine(sessionId);
    if (!engine) {
      throw new BadRequestException(`Session '${sessionId}' is not active. Start the session first.`);
    }
    return engine;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => {
      const timer = setTimeout(resolve, ms);
      timer.unref?.();
    });
  }
}
