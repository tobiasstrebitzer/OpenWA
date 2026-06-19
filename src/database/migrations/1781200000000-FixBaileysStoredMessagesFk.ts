import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Retargets the `baileys_stored_messages.sessionId` foreign key from `sessions.id` to
 * `sessions.name`. The Baileys engine identifies sessions by NAME, so `messageStore.put` writes the
 * session name as `sessionId`; the original FK to `sessions.id` (a UUID) never matched and every
 * persist failed with a FOREIGN KEY constraint error - the store was always empty. `sessions.name`
 * has a UNIQUE constraint, so it is a valid CASCADE target and cleanup-on-delete is preserved.
 *
 * Orphan rows (a `sessionId` with no matching `sessions.name`) are removed first so the new FK holds;
 * in practice the table is empty because the broken FK rejected every insert.
 */
export class FixBaileysStoredMessagesFk1781200000000 implements MigrationInterface {
  name = 'FixBaileysStoredMessagesFk1781200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('baileys_stored_messages'))) return;
    const isPostgres = queryRunner.connection.options.type === 'postgres';

    await queryRunner.query(
      `DELETE FROM "baileys_stored_messages" WHERE "sessionId" NOT IN (SELECT "name" FROM "sessions")`,
    );

    if (isPostgres) {
      await queryRunner.query(
        `ALTER TABLE "baileys_stored_messages" DROP CONSTRAINT "FK_baileys_stored_messages_sessionId"`,
      );
      await queryRunner.query(
        `ALTER TABLE "baileys_stored_messages" ADD CONSTRAINT "FK_baileys_stored_messages_sessionId" FOREIGN KEY ("sessionId") REFERENCES "sessions" ("name") ON DELETE CASCADE ON UPDATE NO ACTION`,
      );
      return;
    }

    // SQLite can't ALTER a foreign key; rebuild the table with the corrected reference.
    await this.rebuildSqlite(queryRunner, 'name');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('baileys_stored_messages'))) return;
    const isPostgres = queryRunner.connection.options.type === 'postgres';

    if (isPostgres) {
      await queryRunner.query(
        `ALTER TABLE "baileys_stored_messages" DROP CONSTRAINT "FK_baileys_stored_messages_sessionId"`,
      );
      await queryRunner.query(
        `ALTER TABLE "baileys_stored_messages" ADD CONSTRAINT "FK_baileys_stored_messages_sessionId" FOREIGN KEY ("sessionId") REFERENCES "sessions" ("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
      );
      return;
    }

    await this.rebuildSqlite(queryRunner, 'id');
  }

  /** Rebuild the SQLite table so its FK references `sessions(<referencedColumn>)`, preserving rows. */
  private async rebuildSqlite(queryRunner: QueryRunner, referencedColumn: 'name' | 'id'): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_baileys_stored_messages_session_created"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_baileys_stored_messages_session_wamsg"`);
    await queryRunner.query(
      `CREATE TABLE "baileys_stored_messages_rebuild" ("id" varchar PRIMARY KEY NOT NULL, "sessionId" varchar NOT NULL, "waMessageId" varchar NOT NULL, "serializedMessage" text NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_baileys_stored_messages_sessionId" FOREIGN KEY ("sessionId") REFERENCES "sessions" ("${referencedColumn}") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "baileys_stored_messages_rebuild" ("id", "sessionId", "waMessageId", "serializedMessage", "createdAt") SELECT "id", "sessionId", "waMessageId", "serializedMessage", "createdAt" FROM "baileys_stored_messages"`,
    );
    await queryRunner.query(`DROP TABLE "baileys_stored_messages"`);
    await queryRunner.query(`ALTER TABLE "baileys_stored_messages_rebuild" RENAME TO "baileys_stored_messages"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_baileys_stored_messages_session_wamsg" ON "baileys_stored_messages" ("sessionId", "waMessageId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_baileys_stored_messages_session_created" ON "baileys_stored_messages" ("sessionId", "createdAt")`,
    );
  }
}
