import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds an optional `filters` column to `webhooks` (webhook pre-filters).
 * Nullable JSON: null/absent means no filtering. Hand-authored because `synchronize`
 * is off for the `data` connection on Postgres (and optional on SQLite). `jsonb` on
 * Postgres, `text` on SQLite (where `simple-json` serializes to text).
 */
export class AddWebhookFilters1781500000000 implements MigrationInterface {
  name = 'AddWebhookFilters1781500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('webhooks', 'filters')) return;
    const isPostgres = queryRunner.connection.options.type === 'postgres';
    const columnType = isPostgres ? 'jsonb' : 'text';
    await queryRunner.query(`ALTER TABLE "webhooks" ADD COLUMN "filters" ${columnType}`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('webhooks', 'filters'))) return;
    await queryRunner.query(`ALTER TABLE "webhooks" DROP COLUMN "filters"`);
  }
}
