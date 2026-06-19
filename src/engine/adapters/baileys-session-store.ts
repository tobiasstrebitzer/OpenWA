import type { Chat, Contact as BaileysContact, WAMessage, WAMessageKey } from '@whiskeysockets/baileys';
import { ChatSummary, Contact } from '../interfaces/whatsapp-engine.interface';
import { BaileysSessionPersistence } from '../types/baileys.types';
import { createLogger } from '../../common/services/logger.service';

/**
 * Baileys `Contact` does not include a `phoneNumber` field, but WhatsApp Business events may supply
 * the resolved phone JID alongside the lid-based id. We extend the input type locally so callers can
 * pass `phoneNumber` when available (e.g. from `contacts.upsert` payloads that carry lid+pn pairs).
 */
type BaileysContactWithPhone = BaileysContact & { phoneNumber?: string };

interface LastMessage {
  key: WAMessageKey;
  timestamp: number;
  text: string;
}

/**
 * Per-session, in-memory snapshot of Baileys contacts + chats, fed from `sock.ev` events. Baileys has
 * no fetch-all; this data arrives via `contacts.*`/`chats.*`/`messaging-history.set` (a full re-sync on
 * each connect) and is mapped to the neutral `Contact`/`ChatSummary` on read. Holds no socket — pure data.
 */
export class BaileysSessionStore {
  private readonly contacts = new Map<string, BaileysContactWithPhone>();
  private readonly chats = new Map<string, Chat>();
  private readonly lastMessages = new Map<string, LastMessage>();
  private readonly lidToPn = new Map<string, string>();
  private readonly logger = createLogger('BaileysSessionStore');

  // `persistence`/`sessionId` are optional: without them the store is purely in-memory (the existing
  // behaviour, and what the unit tests exercise). With them, upserts write through and hydrate() loads.
  constructor(
    private readonly persistence?: BaileysSessionPersistence,
    private readonly sessionId?: string,
  ) {}

  /** Load persisted contacts/chats/lid mappings into memory. Safe no-op when persistence is absent. */
  async hydrate(): Promise<void> {
    if (!this.persistence || !this.sessionId) {
      return;
    }
    try {
      const { contacts, chats, lidToPn } = await this.persistence.load(this.sessionId);
      for (const c of contacts) this.contacts.set(c.id, c);
      for (const ch of chats) this.chats.set(ch.id, ch);
      for (const [lid, pn] of lidToPn) this.lidToPn.set(lid, pn);
    } catch (err) {
      this.logger.warn('Failed to hydrate Baileys session store', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  upsertContacts(records: Partial<BaileysContactWithPhone>[] = []): void {
    const changed: BaileysContactWithPhone[] = [];
    const newLids: { lid: string; pn: string }[] = [];
    for (const r of records) {
      if (!r.id) {
        continue;
      }
      const existing = this.contacts.get(r.id) ?? { id: r.id };
      const merged: BaileysContactWithPhone = { ...existing, ...r };
      this.contacts.set(r.id, merged);
      changed.push(merged);
      if (r.lid && r.phoneNumber) {
        this.lidToPn.set(r.lid, r.phoneNumber);
        newLids.push({ lid: r.lid, pn: r.phoneNumber });
      }
    }
    if (changed.length) this.persist((p, sid) => p.saveContacts(sid, changed));
    if (newLids.length) this.persist((p, sid) => p.saveLidMappings(sid, newLids));
  }

  upsertChats(records: Partial<Chat>[] = []): void {
    const changed: Chat[] = [];
    for (const r of records) {
      if (!r.id) {
        continue;
      }
      const existing = this.chats.get(r.id) ?? { id: r.id };
      const merged = { ...existing, ...r } as Chat;
      this.chats.set(r.id, merged);
      changed.push(merged);
    }
    if (changed.length) this.persist((p, sid) => p.saveChats(sid, changed));
  }

  addLidMappings(mappings: { lid?: string; pn?: string }[] = []): void {
    const saved: { lid: string; pn: string }[] = [];
    for (const m of mappings) {
      if (m.lid && m.pn) {
        this.lidToPn.set(m.lid, m.pn);
        saved.push({ lid: m.lid, pn: m.pn });
      }
    }
    if (saved.length) this.persist((p, sid) => p.saveLidMappings(sid, saved));
  }

  // Fire-and-forget write-through: persistence failures are logged, never thrown (the in-memory copy
  // stays the source of truth for the live session).
  private persist(run: (p: BaileysSessionPersistence, sessionId: string) => Promise<void>): void {
    if (!this.persistence || !this.sessionId) {
      return;
    }
    void run(this.persistence, this.sessionId).catch(err =>
      this.logger.warn('Failed to persist Baileys session store', {
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  }

  recordMessage(msg: WAMessage): void {
    const chatId = msg.key?.remoteJid;
    if (!chatId || !msg.key) {
      return;
    }
    const timestamp = this.toUnixSeconds(msg.messageTimestamp);
    const existing = this.lastMessages.get(chatId);
    if (existing && existing.timestamp >= timestamp) {
      return; // keep the newest
    }
    const text = msg.message?.conversation ?? msg.message?.extendedTextMessage?.text ?? '';
    this.lastMessages.set(chatId, { key: msg.key, timestamp, text });
  }

  listContacts(): Contact[] {
    return [...this.contacts.values()].map(c => this.toNeutralContact(c));
  }

  findContact(id: string): Contact | null {
    const c = this.contacts.get(id);
    return c ? this.toNeutralContact(c) : null;
  }

  listChats(): ChatSummary[] {
    return [...this.chats.values()].map(c => this.toNeutralChat(c));
  }

  lastMessage(chatId: string): { key: WAMessageKey; timestamp: number } | null {
    const m = this.lastMessages.get(chatId);
    return m ? { key: m.key, timestamp: m.timestamp } : null;
  }

  resolvePhone(id: string): string | null {
    if (id.endsWith('@s.whatsapp.net')) {
      return this.userPart(id);
    }
    if (id.endsWith('@lid')) {
      const pn = this.lidToPn.get(id);
      if (pn) {
        return this.userPart(pn);
      }
      const contactPhone = this.contacts.get(id)?.phoneNumber;
      return contactPhone ? this.userPart(contactPhone) : null;
    }
    return null;
  }

  private toNeutralContact(c: BaileysContactWithPhone): Contact {
    const number = c.phoneNumber
      ? this.userPart(c.phoneNumber)
      : c.id.endsWith('@s.whatsapp.net')
        ? this.userPart(c.id)
        : '';
    return {
      id: c.id,
      name: c.name ?? c.verifiedName,
      pushName: c.notify,
      number,
      isMyContact: true, // best-effort: present in the synced address book / chat list
      isBlocked: false, // best-effort: blocklist state is not tracked in this slice
      profilePicUrl: c.imgUrl ?? undefined,
    };
  }

  private toNeutralChat(c: Chat): ChatSummary {
    const last = this.lastMessages.get(c.id);
    return {
      id: c.id,
      name: c.name ?? this.userPart(c.id),
      isGroup: c.id.endsWith('@g.us'),
      unreadCount: c.unreadCount ?? 0,
      timestamp: last?.timestamp ?? this.toUnixSeconds(c.conversationTimestamp),
      lastMessage: last?.text,
    };
  }

  private userPart(jid: string): string {
    return jid.split('@')[0].split(':')[0];
  }

  private toUnixSeconds(ts: number | { toNumber(): number } | null | undefined): number {
    if (ts == null) {
      return 0;
    }
    return typeof ts === 'number' ? ts : ts.toNumber();
  }
}
