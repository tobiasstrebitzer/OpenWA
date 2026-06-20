import { readFileSync } from 'fs';
import { resolve } from 'path';
import { Scenario } from '../world/types';

// Committed scenarios live as JSON under the package's fixtures/ dir (AI generators emit there too).
// Tests load them and replay deterministically - no model is ever called at test time.
const FIXTURES_DIR = resolve(__dirname, '..', '..', 'fixtures');

export function loadScenarioFile(filePath: string): Scenario {
  const raw = readFileSync(filePath, 'utf8');
  return parseScenario(raw);
}

export function loadScenario(name: string): Scenario {
  return loadScenarioFile(resolve(FIXTURES_DIR, `${name}.json`));
}

export function parseScenario(raw: string): Scenario {
  const parsed = JSON.parse(raw) as Scenario;
  if (!parsed.me?.phone) throw new Error('scenario is missing me.phone');
  if (!Array.isArray(parsed.events)) throw new Error('scenario is missing events[]');
  return parsed;
}
