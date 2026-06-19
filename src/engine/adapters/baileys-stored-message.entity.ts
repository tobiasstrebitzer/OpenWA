import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Session } from '../../modules/session/entities/session.entity';

/**
 * Persisted Baileys message store (the lib ships none). Holds the serialized WAMessage proto
 * (via BufferJSON) so reply/forward/react/delete can resolve the original message/key by id across
 * restarts. Engine-specific — lives in the engine layer, not the neutral `messages` table.
 *
 * The `session` relation declares the CASCADE FK so stored messages are cleaned up when the parent
 * session row is deleted (I6). The FK targets `sessions.name` (not the `id` UUID) because the
 * Baileys engine identifies sessions by NAME everywhere - `messageStore.put` writes the session
 * name as `sessionId`, so a FK to `sessions.id` never matched and every persist failed with a
 * FOREIGN KEY constraint error. `sessions.name` carries a UNIQUE constraint, so it's a valid target.
 */
@Entity('baileys_stored_messages')
@Index(['sessionId', 'waMessageId'], { unique: true }) // lookup + dedup (send-return vs upsert echo)
@Index(['sessionId', 'createdAt']) // eviction ordering
export class BaileysStoredMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  sessionId: string;

  @ManyToOne(() => Session, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sessionId', referencedColumnName: 'name' })
  session?: Session;

  @Column()
  waMessageId: string;

  @Column({ type: 'text' })
  serializedMessage: string;

  @CreateDateColumn()
  createdAt: Date;
}
