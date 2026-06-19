import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates `baileys_session_data` - the persisted Baileys session snapshot (contacts, chats, lid->pn)
 * so the in-memory store survives restarts. Hand-authored because `synchronize` is off for the
 * `data` connection (default). Deliberately NO foreign key to `sessions`: the Baileys engine keys
 * everything by the session NAME, not the sessions.id UUID, so a FK would fail. Cleanup is explicit
 * via clearSession() on logout.
 */
export class AddBaileysSessionData1781100000000 implements MigrationInterface {
  name = 'AddBaileysSessionData1781100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('baileys_session_data')) return;
    const isPostgres = queryRunner.connection.options.type === 'postgres';

    if (isPostgres) {
      await queryRunner.query(
        `CREATE TABLE "baileys_session_data" ("id" varchar PRIMARY KEY NOT NULL DEFAULT gen_random_uuid()::varchar, "sessionId" varchar NOT NULL, "kind" varchar NOT NULL, "entryKey" varchar NOT NULL, "value" text NOT NULL, "updatedAt" timestamp NOT NULL DEFAULT NOW())`,
      );
    } else {
      await queryRunner.query(
        `CREATE TABLE "baileys_session_data" ("id" varchar PRIMARY KEY NOT NULL, "sessionId" varchar NOT NULL, "kind" varchar NOT NULL, "entryKey" varchar NOT NULL, "value" text NOT NULL, "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`,
      );
    }

    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_baileys_session_data_session_kind_key" ON "baileys_session_data" ("sessionId", "kind", "entryKey")`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_baileys_session_data_session" ON "baileys_session_data" ("sessionId")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_baileys_session_data_session"`);
    await queryRunner.query(`DROP INDEX "UQ_baileys_session_data_session_kind_key"`);
    await queryRunner.query(`DROP TABLE "baileys_session_data"`);
  }
}
