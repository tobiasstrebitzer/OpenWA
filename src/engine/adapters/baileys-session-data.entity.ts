import { Column, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * Persisted Baileys session snapshot (contacts, chats, lid->pn mappings) so the in-memory
 * BaileysSessionStore survives restarts - otherwise the contact picker is empty and @lid contacts
 * can't be resolved to a phone until history sync re-fires. A generic per-session KV table:
 * `kind` is 'contact' | 'chat' | 'lid', `entryKey` is the contact/chat id (or the lid), and `value`
 * is the JSON record (or, for 'lid', the bare phone number).
 *
 * Deliberately NO foreign key to `sessions`: the Baileys engine keys everything by the session NAME,
 * not the `sessions.id` UUID, so a FK to sessions.id would fail the same way baileys_stored_messages
 * does. Cleanup is explicit via clearSession() on logout.
 */
@Entity('baileys_session_data')
@Index(['sessionId', 'kind', 'entryKey'], { unique: true })
@Index(['sessionId'])
export class BaileysSessionData {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  sessionId: string;

  @Column()
  kind: string;

  @Column()
  entryKey: string;

  @Column({ type: 'text' })
  value: string;

  @UpdateDateColumn()
  updatedAt: Date;
}
