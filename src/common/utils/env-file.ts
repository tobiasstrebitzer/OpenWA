/**
 * Read/merge/write helper for data/.env.generated — the dashboard-managed env file
 * that main.ts loads into process.env at boot (after process env and project .env,
 * which take precedence). Kept dependency-free so it can be used outside the Nest
 * container (e.g. the built-in MCP plugin persisting its enabled flag).
 */
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

/** Absolute path of the dashboard-managed generated env file. */
export function generatedEnvPath(): string {
  return path.resolve(process.cwd(), 'data', '.env.generated');
}

/**
 * Merge `updates` into the existing generated env file and write it back, sorted.
 * Keys in `staleKeys` are dropped from the merged result (used to remove settings
 * made obsolete by a mode switch). Returns the path written.
 */
export function updateGeneratedEnv(updates: Record<string, string>, staleKeys: Iterable<string> = []): string {
  const envPath = generatedEnvPath();
  const existing: Record<string, string> = fs.existsSync(envPath) ? dotenv.parse(fs.readFileSync(envPath, 'utf8')) : {};
  const merged: Record<string, string> = { ...existing, ...updates };
  for (const k of staleKeys) {
    delete merged[k];
  }
  const body = Object.keys(merged)
    .sort()
    .map(key => `${key}=${merged[key]}`);
  const contents = [
    '# OpenWA Configuration',
    `# Generated at ${new Date().toISOString()}`,
    '# Managed via Dashboard. Values in process env or project .env take precedence.',
    '',
    ...body,
    '',
  ].join('\n');
  fs.writeFileSync(envPath, contents, 'utf8');
  return envPath;
}
