#!/usr/bin/env node
/**
 * Schema history for the local D1.
 *
 *   node scripts/schema.ts snapshot [label]   write docs/schema/NNNN-YYYYMMDD[-label].sql if changed
 *   node scripts/schema.ts list               list snapshots with hash and object counts
 *   node scripts/schema.ts diff [a] [b]       unified diff; args are snapshot numbers, "live", or omitted
 *                                             (omitted: live vs latest snapshot)
 *   node scripts/schema.ts show [a]           print one snapshot (default: live)
 *
 * The snapshot is what is actually applied (read from sqlite_master), normalized and sorted,
 * so two snapshots differ only when the schema differs. Diffs between snapshots are the raw
 * material for migrations once something is deployed.
 */
import { DatabaseSync } from "node:sqlite";
import {
  readdirSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const ROOT = resolve(import.meta.dirname, "..");
const SNAP_DIR = join(ROOT, "docs", "schema");
const D1_DIR = join(ROOT, ".wrangler", "state", "v3", "d1", "miniflare-D1DatabaseObject");

interface Snapshot {
  n: number;
  file: string;
  name: string;
  text: string;
  hash: string;
}

function die(msg: string): never {
  console.error(msg);
  process.exit(1);
}

function liveDbPath(): string {
  if (!existsSync(D1_DIR)) die(`no local D1 at ${D1_DIR}; run \`pnpm db:reset:local\` first`);
  const f = readdirSync(D1_DIR).find((x) => x.endsWith(".sqlite") && !x.startsWith("metadata"));
  if (!f) die("no D1 sqlite file found");
  return join(D1_DIR, f);
}

/** Applied schema, normalized: one statement per object, sorted by (type, name). */
function liveSchema(): string {
  const db = new DatabaseSync(liveDbPath(), { readOnly: true });
  try {
    const rows = db
      .prepare(
        `SELECT type, name, tbl_name, sql FROM sqlite_master
         WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '\\_cf\\_%' ESCAPE '\\'
         ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END, tbl_name, name`,
      )
      .all() as { type: string; name: string; tbl_name: string; sql: string }[];
    return rows.map((r) => normalize(r.sql) + ";").join("\n\n") + "\n";
  } finally {
    db.close();
  }
}

/** Strip comments, collapse whitespace, one column per line, so diffs are about structure. */
function normalize(sql: string): string {
  const noComments = sql.replace(/--[^\n]*/g, "");
  const flat = noComments.replace(/\s+/g, " ").trim();
  const open = flat.indexOf("(");
  if (!flat.toUpperCase().startsWith("CREATE TABLE") || open < 0) return flat;
  const head = flat.slice(0, open).trim();
  const body = flat.slice(open + 1, flat.lastIndexOf(")")).trim();
  const cols: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of body) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      cols.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) cols.push(cur.trim());
  return `${head} (\n  ${cols.join(",\n  ")}\n)`;
}

const hashOf = (text: string): string =>
  createHash("sha256").update(text).digest("hex").slice(0, 12);

function snapshots(): Snapshot[] {
  if (!existsSync(SNAP_DIR)) return [];
  return readdirSync(SNAP_DIR)
    .filter((f) => /^\d{4}-.*\.sql$/.test(f))
    .toSorted()
    .map((file) => {
      const text = readFileSync(join(SNAP_DIR, file), "utf8");
      return {
        n: Number(file.slice(0, 4)),
        file,
        name: file.replace(/\.sql$/, ""),
        text,
        hash: hashOf(text),
      };
    });
}

function resolveRef(
  ref: string | undefined,
  fallback: Snapshot | undefined,
): { name: string; text: string } {
  if (ref === "live" || (ref === undefined && fallback === undefined))
    return { name: "live", text: liveSchema() };
  if (ref === undefined) return { name: fallback!.name, text: fallback!.text };
  const n = Number(ref);
  const s = snapshots().find((x) => x.n === n);
  if (!s) die(`no snapshot ${ref}`);
  return { name: s.name, text: s.text };
}

function counts(text: string): string {
  const t = (text.match(/^CREATE TABLE/gm) ?? []).length;
  const i = (text.match(/^CREATE (UNIQUE )?INDEX/gm) ?? []).length;
  return `${t} tables, ${i} indexes`;
}

const [cmd = "list", a, b] = process.argv.slice(2);

switch (cmd) {
  case "snapshot": {
    const text = liveSchema();
    const all = snapshots();
    const last = all.at(-1);
    if (last && last.text === text) {
      console.log(`unchanged since ${last.name} (${last.hash})`);
      break;
    }
    const n = String((last?.n ?? 0) + 1).padStart(4, "0");
    const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
    const label = a ? "-" + a.replace(/[^a-z0-9-]+/gi, "-").toLowerCase() : "";
    mkdirSync(SNAP_DIR, { recursive: true });
    const file = `${n}-${date}${label}.sql`;
    writeFileSync(join(SNAP_DIR, file), text);
    console.log(`wrote docs/schema/${file} (${hashOf(text)}, ${counts(text)})`);
    break;
  }
  case "list": {
    const all = snapshots();
    if (all.length === 0) console.log("no snapshots; run `pnpm schema:snapshot`");
    for (const s of all) console.log(`${s.name}  ${s.hash}  ${counts(s.text)}`);
    const live = liveSchema();
    const match = all.find((s) => s.text === live);
    console.log(
      `live               ${hashOf(live)}  ${counts(live)}  ${match ? `= ${match.name}` : "(not snapshotted)"}`,
    );
    break;
  }
  case "show": {
    process.stdout.write(resolveRef(a, undefined).text);
    break;
  }
  case "diff": {
    const all = snapshots();
    const left = a === undefined ? resolveRef(undefined, all.at(-1)) : resolveRef(a, undefined);
    const right = b === undefined ? resolveRef("live", undefined) : resolveRef(b, undefined);
    if (left.text === right.text) {
      console.log(`no difference between ${left.name} and ${right.name}`);
      break;
    }
    const dir = mkdtempSync(join(tmpdir(), "schema-diff-"));
    writeFileSync(join(dir, "a.sql"), left.text);
    writeFileSync(join(dir, "b.sql"), right.text);
    spawnSync(
      "diff",
      ["-u", "--label", left.name, "--label", right.name, join(dir, "a.sql"), join(dir, "b.sql")],
      { stdio: "inherit" },
    );
    rmSync(dir, { recursive: true, force: true });
    break;
  }
  default:
    die(`unknown command ${cmd}; use snapshot | list | diff | show`);
}
