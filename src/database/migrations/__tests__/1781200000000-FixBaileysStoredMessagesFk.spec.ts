import { DataSource, QueryRunner } from 'typeorm';
import { AddBaileysStoredMessages1781000000000 } from '../1781000000000-AddBaileysStoredMessages';
import { FixBaileysStoredMessagesFk1781200000000 } from '../1781200000000-FixBaileysStoredMessagesFk';

const insertMessage = (runner: QueryRunner, id: string, sessionId: string): Promise<unknown> =>
  runner.query(
    `INSERT INTO "baileys_stored_messages" ("id", "sessionId", "waMessageId", "serializedMessage") VALUES ('${id}', '${sessionId}', 'wa-${id}', '{}')`,
  );

describe('FixBaileysStoredMessagesFk migration', () => {
  let ds: DataSource;
  let runner: QueryRunner;

  beforeEach(async () => {
    ds = new DataSource({ type: 'sqlite', database: ':memory:' });
    await ds.initialize();
    runner = ds.createQueryRunner();
    // sessions(id PK, name UNIQUE) - the FK now targets `name`.
    await runner.query(
      `CREATE TABLE "sessions" ("id" varchar PRIMARY KEY NOT NULL, "name" varchar(100) NOT NULL, CONSTRAINT "UQ_sessions_name" UNIQUE ("name"))`,
    );
    await runner.query(`INSERT INTO "sessions" ("id", "name") VALUES ('uuid-1', 'toby')`);
    // Create the table with the original (broken) FK -> sessions.id, then apply the fix.
    await new AddBaileysStoredMessages1781000000000().up(runner);
    await new FixBaileysStoredMessagesFk1781200000000().up(runner);
  });

  afterEach(async () => {
    await runner.release();
    await ds.destroy();
  });

  const count = async (): Promise<number> => {
    const rows = (await runner.query(`SELECT COUNT(*) AS c FROM "baileys_stored_messages"`)) as { c: number }[];
    return Number(rows[0].c);
  };

  it('accepts a row keyed by the session NAME (the FK to sessions.id used to reject it)', async () => {
    await runner.query('PRAGMA foreign_keys = ON');
    await insertMessage(runner, 'm1', 'toby');
    expect(await count()).toBe(1);
  });

  it('rejects a row whose sessionId matches no session name', async () => {
    await runner.query('PRAGMA foreign_keys = ON');
    await expect(insertMessage(runner, 'm2', 'ghost')).rejects.toThrow();
  });

  it('CASCADE-deletes stored messages when the parent session is removed', async () => {
    await runner.query('PRAGMA foreign_keys = ON');
    await insertMessage(runner, 'm1', 'toby');
    expect(await count()).toBe(1);
    await runner.query(`DELETE FROM "sessions" WHERE "name" = 'toby'`);
    expect(await count()).toBe(0);
  });

  it('down() keeps the table intact (reverts the FK target)', async () => {
    await new FixBaileysStoredMessagesFk1781200000000().down(runner);
    expect(await runner.hasTable('baileys_stored_messages')).toBe(true);
  });
});
