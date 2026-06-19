import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaileysSessionData } from './baileys-session-data.entity';
import { BaileysPersistedRecord, BaileysSessionPersistence } from '../types/baileys.types';

type Kind = 'contact' | 'chat' | 'lid';

/**
 * Repository-backed persistence for the Baileys session store. Contacts/chats are stored as JSON
 * rows; lid->pn mappings store the bare phone number in `value`. Upserts are keyed by
 * (sessionId, kind, entryKey) so repeated history syncs are idempotent.
 */
@Injectable()
export class BaileysSessionStoreService implements BaileysSessionPersistence {
  constructor(
    @InjectRepository(BaileysSessionData, 'data')
    private readonly repo: Repository<BaileysSessionData>,
  ) {}

  async load(sessionId: string): Promise<{
    contacts: BaileysPersistedRecord[];
    chats: BaileysPersistedRecord[];
    lidToPn: [string, string][];
  }> {
    const rows = await this.repo.find({ where: { sessionId } });
    const contacts: BaileysPersistedRecord[] = [];
    const chats: BaileysPersistedRecord[] = [];
    const lidToPn: [string, string][] = [];
    for (const row of rows) {
      if (row.kind === 'lid') {
        lidToPn.push([row.entryKey, row.value]);
        continue;
      }
      const record = this.parseRecord(row.value);
      if (!record) continue;
      if (row.kind === 'contact') contacts.push(record);
      else if (row.kind === 'chat') chats.push(record);
    }
    return { contacts, chats, lidToPn };
  }

  async saveContacts(sessionId: string, records: BaileysPersistedRecord[]): Promise<void> {
    await this.upsertRows(
      sessionId,
      'contact',
      records.map(r => [r.id, JSON.stringify(r)]),
    );
  }

  async saveChats(sessionId: string, records: BaileysPersistedRecord[]): Promise<void> {
    await this.upsertRows(
      sessionId,
      'chat',
      records.map(r => [r.id, JSON.stringify(r)]),
    );
  }

  async saveLidMappings(sessionId: string, mappings: { lid: string; pn: string }[]): Promise<void> {
    await this.upsertRows(
      sessionId,
      'lid',
      mappings.map(m => [m.lid, m.pn]),
    );
  }

  async clearSession(sessionId: string): Promise<void> {
    await this.repo.delete({ sessionId });
  }

  private async upsertRows(sessionId: string, kind: Kind, entries: [string, string][]): Promise<void> {
    const rows = entries
      .filter(([entryKey]) => !!entryKey)
      .map(([entryKey, value]) => ({ sessionId, kind, entryKey, value }));
    if (rows.length === 0) return;
    await this.repo.upsert(rows, ['sessionId', 'kind', 'entryKey']);
  }

  private parseRecord(value: string): BaileysPersistedRecord | null {
    try {
      const parsed = JSON.parse(value) as BaileysPersistedRecord;
      return typeof parsed?.id === 'string' ? parsed : null;
    } catch {
      return null;
    }
  }
}
