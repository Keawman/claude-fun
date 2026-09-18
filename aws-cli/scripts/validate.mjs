#!/usr/bin/env node
/**
 * Validates every topic file under data/: required fields, allowed values,
 * unique IDs, resolvable "related" links and that index.html loads each file.
 *
 *   node scripts/validate.mjs            # exit 1 on any error
 *   node scripts/validate.mjs --strict   # also fail on warnings
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(ROOT, 'data');
const STRICT = process.argv.includes('--strict');

const ALLOWED_TAGS = new Set([
  'read-only', 'mutating', 'destructive', 'query', 'pagination', 'scripting',
  'security', 'cost', 'govcloud', 'interactive', 'config', 'waiter', 'jmespath'
]);
const ALLOWED_FORMATS = new Set(['json', 'table', 'text', 'plain', 'none', 'stderr', 'yaml']);
const ALLOWED_NOTE_TYPES = new Set(['gotcha', 'info', 'danger']);
const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PLACEHOLDER_RE = /<([^<>\s]+)>/g;
const GOOD_PLACEHOLDER_RE = /^[a-z][a-z0-9-]*(?:\|[a-z0-9-]+)*$/;

const errors = [];
const warnings = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);
const warn = (where, msg) => warnings.push(`${where}: ${msg}`);

// ---- load data files through the same registry the browser uses ----
const registrySrc = fs.readFileSync(path.join(ROOT, 'js', 'registry.js'), 'utf8');
const sandbox = { window: {}, console };
vm.createContext(sandbox);
vm.runInContext(registrySrc, sandbox, { filename: 'js/registry.js' });
sandbox.AWSCHEAT = sandbox.window.AWSCHEAT;

const dataFiles = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith('.js')).sort();
const fileOfTopic = new Map();
for (const f of dataFiles) {
  const before = sandbox.AWSCHEAT.topics.length;
  try {
    vm.runInContext(fs.readFileSync(path.join(DATA_DIR, f), 'utf8'), sandbox, { filename: `data/${f}` });
  } catch (e) {
    err(`data/${f}`, `failed to load: ${e.message}`);
    continue;
  }
  const added = sandbox.AWSCHEAT.topics.slice(before);
  if (added.length !== 1) err(`data/${f}`, `expected exactly one AWSCHEAT.register() call, found ${added.length}`);
  for (const t of added) fileOfTopic.set(t.id, f);
}

// ---- index.html must reference every data file (and nothing missing) ----
const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const referenced = [...indexHtml.matchAll(/<script src="data\/([^"]+)"><\/script>/g)].map((m) => m[1]);
for (const f of dataFiles) if (!referenced.includes(f)) err('index.html', `data/${f} exists but is not loaded by a <script> tag`);
for (const f of referenced) if (!dataFiles.includes(f)) err('index.html', `<script src="data/${f}"> points to a missing file`);

// ---- structural checks ----
const topics = sandbox.AWSCHEAT.topics;
const topicIds = new Set();
const orders = new Map();
const globalCardIds = new Map();
const relatedRefs = [];
let cardTotal = 0;

const isStr = (v) => typeof v === 'string' && v.trim().length > 0;

for (const t of topics) {
  const where = `data/${fileOfTopic.get(t.id) || '?'} (topic "${t.id}")`;
  if (!isStr(t.id) || !ID_RE.test(t.id)) err(where, 'topic.id must be lowercase kebab-case');
  if (topicIds.has(t.id)) err(where, 'duplicate topic id');
  topicIds.add(t.id);
  if (!isStr(t.title)) err(where, 'topic.title is required');
  if (typeof t.order !== 'number') err(where, 'topic.order must be a number');
  else if (orders.has(t.order)) err(where, `order ${t.order} is also used by topic "${orders.get(t.order)}"`);
  else orders.set(t.order, t.id);
  if (t.intro !== undefined && !isStr(t.intro)) err(where, 'topic.intro must be a non-empty string when present');

  const subIds = new Set();
  if (!Array.isArray(t.subtopics) || t.subtopics.length === 0) err(where, 'topic.subtopics must be a non-empty array');
  else for (const s of t.subtopics) {
    if (!isStr(s.id) || !ID_RE.test(s.id)) err(where, `subtopic id "${s.id}" must be lowercase kebab-case`);
    if (!isStr(s.title)) err(where, `subtopic "${s.id}" needs a title`);
    if (subIds.has(s.id)) err(where, `duplicate subtopic id "${s.id}"`);
    subIds.add(s.id);
  }

  if (!Array.isArray(t.cards) || t.cards.length === 0) { err(where, 'topic.cards must be a non-empty array'); continue; }
  if (t.cards.length < 8) warn(where, `only ${t.cards.length} cards (target is 8–15)`);
  if (t.cards.length > 30) warn(where, `${t.cards.length} cards is a lot for one topic`);

  const cardIds = new Set();
  let hasTable = false;
  const usedSubs = new Set();
  for (const c of t.cards) {
    const cw = `${where} card "${c.id}"`;
    cardTotal++;
    if (!isStr(c.id) || !ID_RE.test(c.id)) err(cw, 'card.id must be lowercase kebab-case');
    if (cardIds.has(c.id)) err(cw, 'duplicate card id within topic');
    cardIds.add(c.id);
    if (subIds.has(c.id)) err(cw, 'card.id collides with a subtopic id (anchors would clash)');
    const gid = `${t.id}-${c.id}`;
    if (globalCardIds.has(gid)) err(cw, `global id "${gid}" already used by ${globalCardIds.get(gid)}`);
    globalCardIds.set(gid, cw);

    if (!isStr(c.subtopic)) err(cw, 'card.subtopic is required');
    else if (!subIds.has(c.subtopic)) err(cw, `subtopic "${c.subtopic}" is not declared on the topic`);
    else usedSubs.add(c.subtopic);

    if (!isStr(c.title)) err(cw, 'card.title is required');
    else if (c.title.length > 90) warn(cw, 'title longer than 90 chars');
    if (!isStr(c.command)) err(cw, 'card.command is required');
    else {
      if (!/\baws\b/.test(c.command)) warn(cw, 'command does not mention "aws"');
      for (const m of c.command.matchAll(PLACEHOLDER_RE)) {
        if (!GOOD_PLACEHOLDER_RE.test(m[1])) warn(cw, `placeholder <${m[1]}> should be lowercase kebab-case`);
      }
      if (/\s+\n/.test(c.command)) warn(cw, 'command has trailing whitespace before a newline');
    }
    if (!isStr(c.description)) err(cw, 'card.description is required');
    else {
      const sentences = c.description.split(/(?<=[.!?])\s+/).length;
      if (sentences > 4) warn(cw, `description has ${sentences} sentences (aim for 1–3)`);
    }

    if (!Array.isArray(c.flags)) err(cw, 'card.flags must be an array (use [] when there is nothing to explain)');
    else for (const f of c.flags) {
      if (!Array.isArray(f) || f.length !== 2 || !isStr(f[0]) || !isStr(f[1])) err(cw, `flag entry must be [flag, explanation]: ${JSON.stringify(f)}`);
    }

    if (!c.output || typeof c.output !== 'object') err(cw, 'card.output {format, body} is required');
    else {
      if (!ALLOWED_FORMATS.has(c.output.format)) err(cw, `output.format "${c.output.format}" not in ${[...ALLOWED_FORMATS].join(', ')}`);
      if (typeof c.output.body !== 'string') err(cw, 'output.body must be a string');
      else if (c.output.format !== 'none' && !c.output.body.trim()) err(cw, 'output.body is empty but format is not "none"');
      if (c.output.format === 'table') {
        hasTable = true;
        const lines = c.output.body.split('\n');
        const widths = new Set(lines.filter((l) => /^[|+-]/.test(l) && !l.includes('||')).map((l) => l.length));
        if (widths.size > 1) warn(cw, `table rows have inconsistent widths (${[...widths].join(', ')})`);
      }
      if (c.output.format === 'json') {
        // A command chain may print several JSON documents back to back; validate each.
        const docs = c.output.body.split(/(?<=^[}\]])\n/m);
        for (const d of docs) { try { JSON.parse(d); } catch (e) { err(cw, `output.body is not valid JSON: ${e.message}`); break; } }
      }
      const acct = c.output.body.match(/\b\d{12}\b/g) || [];
      for (const a of acct) if (a !== '123456789012') warn(cw, `output contains account-like number ${a} (use 123456789012)`);
    }

    if (c.note !== undefined) {
      const n = typeof c.note === 'string' ? { type: 'gotcha', text: c.note } : c.note;
      if (!n || !isStr(n.text)) err(cw, 'note.text is required when note is present');
      if (!ALLOWED_NOTE_TYPES.has(n.type)) err(cw, `note.type "${n.type}" must be one of ${[...ALLOWED_NOTE_TYPES].join(', ')}`);
    }
    if (c.iam !== undefined) {
      if (!Array.isArray(c.iam) || !c.iam.every(isStr)) err(cw, 'card.iam must be an array of strings');
      else for (const p of c.iam) if (!/^[a-z0-9-]+:[A-Za-z0-9*]+$/.test(p)) warn(cw, `IAM action "${p}" does not look like service:Action`);
    }
    if (c.related !== undefined) {
      if (!Array.isArray(c.related) || !c.related.every(isStr)) err(cw, 'card.related must be an array of global card ids');
      else for (const r of c.related) relatedRefs.push([cw, r]);
    }
    if (!Array.isArray(c.tags) || c.tags.length === 0) err(cw, 'card.tags must be a non-empty array');
    else {
      for (const tag of c.tags) if (!ALLOWED_TAGS.has(tag)) err(cw, `unknown tag "${tag}" (allowed: ${[...ALLOWED_TAGS].join(', ')})`);
      const kinds = ['read-only', 'mutating', 'destructive'].filter((k) => c.tags.includes(k));
      if (kinds.length === 0) warn(cw, 'no read-only / mutating / destructive tag');
      if (kinds.length > 1) err(cw, `tags ${kinds.join(' and ')} are mutually exclusive`);
      if (!c.command.includes('--dry-run') && /\b(terminate-|delete-(?!tags\b)|deregister-image|s3 rm\b|s3 rb\b|purge|force-delete)/.test(c.command) && !c.tags.includes('destructive')) {
        warn(cw, 'command looks destructive but is not tagged "destructive"');
      }
    }
    const known = new Set(['id', 'subtopic', 'title', 'command', 'description', 'flags', 'output', 'note', 'iam', 'related', 'tags']);
    for (const k of Object.keys(c)) if (!known.has(k)) warn(cw, `unknown field "${k}"`);
  }
  if (!hasTable) err(where, 'at least one card per topic must show --output table');
  for (const s of subIds) if (!usedSubs.has(s)) warn(where, `subtopic "${s}" has no cards`);
}
for (const [cw, r] of relatedRefs) if (!globalCardIds.has(r)) err(cw, `related "${r}" does not resolve to any card`);

// ---- report ----
for (const w of warnings) console.warn(`WARN  ${w}`);
for (const e of errors) console.error(`ERROR ${e}`);
console.log(`\n${topics.length} topics, ${cardTotal} cards — ${errors.length} error(s), ${warnings.length} warning(s)`);
process.exit(errors.length || (STRICT && warnings.length) ? 1 : 0);
