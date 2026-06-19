import type { WAMessage } from '@whiskeysockets/baileys';

/**
 * Persistence boundary for the Baileys engine's message store. The adapter depends on this narrow
 * interface (not the concrete Nest service) so it stays unit-testable with a fake.
 */
export interface BaileysMessageStore {
  /** Persist a message (idempotent on the same id) so it can be referenced by reply/forward/react/delete. */
  put(sessionId: string, msg: WAMessage): Promise<void>;
  /** Look up a previously-seen message by its id, or null. */
  getMessage(sessionId: string, messageId: string): Promise<WAMessage | null>;
  /** Remove all stored messages for a session (called on logout). */
  clearSession(sessionId: string): Promise<void>;
}

/** A persisted record only needs an `id` (contact/chat id) at the type level; the whole object is
 * serialized verbatim at runtime, so concrete Baileys `Contact`/`Chat` values are accepted as-is. */
export type BaileysPersistedRecord = { id: string };

/**
 * Persistence boundary for the Baileys session store (contacts/chats/lid->pn). The in-memory store
 * write-throughs to this on every upsert and hydrates from it on init, so the data survives restarts.
 * The adapter depends on this narrow interface (not the Nest service) so it stays unit-testable.
 */
export interface BaileysSessionPersistence {
  /** Load the persisted snapshot for a session (empty arrays when nothing is stored yet). */
  load(sessionId: string): Promise<{
    contacts: BaileysPersistedRecord[];
    chats: BaileysPersistedRecord[];
    lidToPn: [string, string][];
  }>;
  saveContacts(sessionId: string, records: BaileysPersistedRecord[]): Promise<void>;
  saveChats(sessionId: string, records: BaileysPersistedRecord[]): Promise<void>;
  saveLidMappings(sessionId: string, mappings: { lid: string; pn: string }[]): Promise<void>;
  /** Remove all persisted session data for a session (called on logout). */
  clearSession(sessionId: string): Promise<void>;
}

/**
 * Per-call construction config for {@link BaileysAdapter}. Engine-neutral fields come from the
 * factory; `authDir` is the base multi-file auth directory from the opaque `engine.baileys.*` blob
 * (the adapter appends the session id to isolate each session).
 */
export interface BaileysAdapterConfig {
  sessionId: string;
  authDir: string;
  proxyUrl?: string;
  proxyType?: 'http' | 'https' | 'socks4' | 'socks5';
  /** Persisted store for reply/forward/react/delete. Provided by the plugin; the four ops require it. */
  messageStore?: BaileysMessageStore;
  /** Persisted contacts/chats/lid->pn snapshot. Provided by the plugin; absent => in-memory only. */
  sessionStore?: BaileysSessionPersistence;
}

/**
 * The minimal pino-compatible logger Baileys' `makeWASocket` expects. Declared locally so we can
 * pass a fully silent logger without taking a direct `pino` dependency.
 *
 * Matches the Baileys `ILogger` contract: each log method receives `(obj: unknown, msg?: string)`.
 */
export interface BaileysLogger {
  level: string;
  child: (bindings: Record<string, unknown>) => BaileysLogger;
  trace: (obj: unknown, msg?: string) => void;
  debug: (obj: unknown, msg?: string) => void;
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
}
