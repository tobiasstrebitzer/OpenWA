// AI scenario generator (dev-only). Calls Claude Haiku 4.5 to produce a realistic WhatsApp world,
// compiles it to a deterministic Scenario, validates it by replaying, and writes a committed fixture.
// Tests never run this - they replay the emitted JSON, so no model is called at test time.
//
// Usage (from repo root):
//   ANTHROPIC_API_KEY=... npm -w @openwa/wa-sim run generate -- --name support-desk \
//     --theme "a small business customer-support inbox over a busy afternoon"
//
// This file is excluded from the package's main build (tsconfig.json) and only compiled by
// tsconfig.generate.json, so the app/tests never load the Anthropic SDK.

import { writeFileSync } from 'fs';
import { resolve } from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { Simulation } from '../world/simulation';
import { parseScenario } from '../scenarios/loader';
import { GEN_SPEC_SCHEMA, GenSpec, compileSpec } from './compile';

const FIXTURES_DIR = resolve(__dirname, '..', '..', 'fixtures');
const DEFAULT_MODEL = 'claude-haiku-4-5';

const SYSTEM_PROMPT = `You generate realistic WhatsApp test worlds for an end-to-end test simulator.
Return a single world that fits the user's theme, populated with believable people, conversations and
business data. Rules:
- "me" is the account running the simulator; use the literal string "me" as the message/status sender
  for anything the account itself sends or posts.
- Every name used in groups.participants, conversations.with, conversations.messages.from and
  statuses.from must be either "me" or one of the contacts you listed (groups.with may also be a group
  name you defined).
- Write natural, varied message text - greetings, questions, replies, the occasional emoji. Keep each
  message to a sentence or two.
- Include a few labels, one or two channels (at least one subscribed, with a couple of posts), a couple
  of contact statuses, and a small business catalog with 2-4 products.
- Do not invent phone numbers, ids, timestamps or colors - those are assigned by the test harness.`;

interface Args {
  name: string;
  theme: string;
  model: string;
  out: string;
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const name = get('--name');
  const theme = get('--theme');
  if (!name || !theme) {
    throw new Error('usage: --name <fixture-name> --theme "<scenario description>" [--model <id>] [--out <path>]');
  }
  return {
    name,
    theme,
    model: get('--model') ?? DEFAULT_MODEL,
    out: get('--out') ?? resolve(FIXTURES_DIR, `${name}.json`),
  };
}

async function generateSpec(model: string, theme: string): Promise<GenSpec> {
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment
  const response = await client.messages.create({
    model,
    max_tokens: 8000,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: `Generate a WhatsApp world for this theme: ${theme}` }],
    output_config: { format: { type: 'json_schema', schema: GEN_SPEC_SCHEMA } },
  } as Anthropic.MessageCreateParamsNonStreaming);

  if (response.stop_reason === 'refusal') throw new Error('model refused the request');
  const text = response.content.find(b => b.type === 'text');
  if (!text || text.type !== 'text') throw new Error('model returned no text content');
  return JSON.parse(text.text) as GenSpec;
}

// Replay the compiled scenario to prove it is structurally valid before we commit it.
function validate(json: string): void {
  const scenario = parseScenario(json);
  const sim = new Simulation(scenario);
  const chats = sim.world.getChats().length;
  if (chats === 0) throw new Error('compiled scenario has no chats - generation produced an empty world');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  console.log(`Generating "${args.name}" with ${args.model}...`);
  const spec = await generateSpec(args.model, args.theme);
  const scenario = compileSpec(spec);
  const json = JSON.stringify(scenario, null, 2);
  validate(json);
  writeFileSync(args.out, `${json}\n`);
  console.log(`Wrote ${scenario.events.length} events to ${args.out}`);
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
