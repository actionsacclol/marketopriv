import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import type { RunUsage } from '../shared/aiUsage';

// The usage ledger: one row per autopilot run (what the AI app reported when
// it finished) and one per day and model for the built-in chat. It belongs to
// the app, not to a profile, like the schedule. Sessions the user drives from
// their own AI app over MCP are not in it: the hub never sees their tokens.

const KEEP = 600;
const file = (): string => path.join(app.getPath('userData'), 'autopilot', 'usage.json');

let rows: RunUsage[] | null = null;

function load(): RunUsage[] {
  if (rows) return rows;
  try {
    const j = JSON.parse(fs.readFileSync(file(), 'utf8')) as unknown;
    rows = Array.isArray(j) ? (j as RunUsage[]).filter((r) => r && typeof r.key === 'string' && typeof r.at === 'string') : [];
  } catch {
    rows = [];
  }
  return rows;
}

function save(): void {
  const list = load();
  if (list.length > KEEP) list.splice(0, list.length - KEEP);
  try {
    fs.mkdirSync(path.dirname(file()), { recursive: true });
    const tmp = `${file()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(list), 'utf8');
    fs.renameSync(tmp, file());
  } catch {
    /* the ledger is a convenience: a run never fails over it */
  }
}

export function has(key: string): boolean {
  return load().some((r) => r.key === key);
}

/** Record a finished run once (by its report file name). */
export function addRun(row: RunUsage): void {
  if (has(row.key)) return;
  load().push(row);
  load().sort((a, b) => a.at.localeCompare(b.at));
  save();
}

const day = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** The built-in chat got an answer: add its tokens to today's row for that model. */
export function addChat(model: string, input: number, output: number, cached = 0): void {
  if (!(input > 0 || output > 0)) return;
  const key = `chat ${day()} ${model}`;
  const list = load();
  let row = list.find((r) => r.key === key);
  if (!row) {
    row = { key, at: `${day()}T00:00`, kind: 'chat', model, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, turns: 0 };
    list.push(row);
  }
  // Providers count cached tokens inside the prompt total: keep the two apart.
  row.input += Math.max(0, input - cached);
  row.cacheRead += cached;
  row.output += output;
  row.turns = (row.turns ?? 0) + 1;
  save();
}

/** The last `days` days of rows, oldest first. */
export function recent(days = 30): RunUsage[] {
  const from = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  return load().filter((r) => r.at.slice(0, 10) >= from);
}
