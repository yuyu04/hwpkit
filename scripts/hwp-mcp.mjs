#!/usr/bin/env node
// hwp-mcp.mjs — MCP server exposing hwpkit over stdio, so any MCP client
// (Gemini CLI, Codex, Cursor, VS Code, Claude Code, OpenAI Agents SDK) can read,
// write and preview Korean HWP/HWPX documents.
//
//   node scripts/hwp-mcp.mjs
//
// Speaks JSON-RPC 2.0 over newline-delimited stdin/stdout. Nothing but protocol
// messages may go to stdout; diagnostics go to stderr.
//
// DUAL-ERA. MCP revision 2026-07-28 removed the `initialize` handshake: it is
// stateless, every request carries its version in `_meta`, and servers MUST
// implement `server/discover`. Clients in the wild still speak the older
// handshake-based revisions. The spec explicitly allows a server to implement
// both ("dual-era"), which is what we do:
//   - an `initialize` request selects legacy semantics for this process
//   - a request carrying modern `_meta` is served statelessly
// The only wire difference for the calls we support is that modern results carry
// `resultType: "complete"`, so we tag results per request era.
//
// Written against the spec directly rather than @modelcontextprotocol/sdk: the SDK
// is ~4MB with 17 dependencies (express, hono, jose, ajv, zod…), and hwpkit ships
// everything vendored so it runs offline with no install step.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const SCRIPTS = dirname(fileURLToPath(import.meta.url));
const MODERN = '2026-07-28';
const LEGACY = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const SUPPORTED = [MODERN, ...LEGACY];
const VERSION = '0.3.0';
const META_VERSION = 'io.modelcontextprotocol/protocolVersion';
const META_SERVER_INFO = 'io.modelcontextprotocol/serverInfo';

const INSTRUCTIONS = [
  'Reads, writes and previews Korean HWP/HWPX (한글) documents locally — formats most',
  'AI runtimes cannot handle natively. Prefer .hwp over .hwpx unless the user asks',
  'otherwise: .hwp is what Korean organisations actually use and it is the only format',
  'that preserves mid-paragraph bold/italic. After writing a document, call hwp_preview',
  'and look at the PNG before telling the user it looks right.',
].join(' ');

// ── tools ───────────────────────────────────────────────────────────────────
const TOOLS = [
  {
    name: 'hwp_read',
    title: 'Read an HWP/HWPX document',
    description:
      'Extract the text of a Korean .hwp or .hwpx document in reading order, including ' +
      'table-cell text. Korean documents (보고서, 공문, 연구노트) often keep most of their ' +
      'content inside tables, so never assume body paragraphs are the whole document. ' +
      'Complex layout is flattened into reading order rather than reconstructed as Markdown.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the .hwp or .hwpx file to read' },
      },
      required: ['path'],
      additionalProperties: false,
    },
  },
  {
    name: 'hwp_write',
    title: 'Create an HWP/HWPX document from Markdown',
    description:
      'Create a native Korean .hwp or .hwpx document from Markdown. The output extension ' +
      'picks the format. Supported Markdown: # / ## / ### headings (sized 22/17/14/11.5pt, ' +
      'bold), paragraphs (맑은 고딕 10pt, 160% line spacing; consecutive lines join into one ' +
      'paragraph), - / * bullets, 1. ordered items, | pipe | tables (real HWP tables), and ' +
      'inline **bold** / *italic* / `code`. Links and images are reduced to their text. ' +
      'Code fences, block quotes, horizontal rules and images are NOT supported — do not ' +
      'emit them. Prefer .hwp: rhwp\'s HWPX writer collapses each paragraph to a single ' +
      'character run, so mid-paragraph emphasis is lost in .hwpx.',
    inputSchema: {
      type: 'object',
      properties: {
        markdown: { type: 'string', description: 'Markdown source for the document body' },
        outputPath: {
          type: 'string',
          description: 'Where to write the file; extension .hwp or .hwpx selects the format',
        },
      },
      required: ['markdown', 'outputPath'],
      additionalProperties: false,
    },
  },
  {
    name: 'hwp_preview',
    title: 'Render HWP/HWPX pages to images',
    description:
      'Render pages of a .hwp or .hwpx to SVG, and optionally PNG, without Hancom Office. ' +
      'Use this to actually look at a document — either one the user supplied, or one you ' +
      'just created, before claiming it looks correct. Output files are named ' +
      '<stem>-<format>-p<N>.svg/.png in outputDir. PNG needs a Chrome-family browser as a ' +
      'rasterizer (set CHROME_PATH if not found); SVG needs nothing but Node. This is ' +
      "rhwp's renderer, not Hancom's — close, but tell the user to open the file in 한글 " +
      'for final visual sign-off.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the .hwp or .hwpx file' },
        outputDir: { type: 'string', description: 'Directory to write rendered pages into' },
        png: { type: 'boolean', description: 'Also rasterize to PNG (default true)' },
        pages: { type: 'string', description: '1-based page selection, e.g. "1", "1,3", "2-4"' },
        scale: { type: 'number', description: 'PNG pixel ratio, default 2' },
      },
      required: ['path', 'outputDir'],
      additionalProperties: false,
    },
  },
];

/** Run one of the bundled CLI scripts; returns {ok, text}. */
function runScript(script, args, stdin) {
  const res = spawnSync(process.execPath, [join(SCRIPTS, script), ...args], {
    input: stdin,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (res.error) return { ok: false, text: `failed to run ${script}: ${res.error.message}` };
  const out = (res.stdout ?? '').trim();
  const err = (res.stderr ?? '').trim();
  if (res.status !== 0) return { ok: false, text: err || out || `${script} exited ${res.status}` };
  // hwp-write and hwp-preview report progress on stderr; surface it as the result.
  return { ok: true, text: out || err || 'done' };
}

function callTool(name, args = {}) {
  switch (name) {
    case 'hwp_read':
      return runScript('hwp-read.mjs', [resolve(args.path)]);
    case 'hwp_write': {
      if (typeof args.markdown !== 'string' || !args.markdown.trim()) {
        return { ok: false, text: 'markdown is required and must not be empty' };
      }
      return runScript('hwp-write.mjs', ['-', resolve(args.outputPath)], args.markdown);
    }
    case 'hwp_preview': {
      const extra = [];
      if (args.png !== false) extra.push('--png');
      if (args.pages) extra.push('--pages', String(args.pages));
      if (args.scale) extra.push('--scale', String(args.scale));
      return runScript('hwp-preview.mjs', [resolve(args.path), resolve(args.outputDir), ...extra]);
    }
    default:
      return null; // unknown tool → protocol error
  }
}

// ── JSON-RPC plumbing ───────────────────────────────────────────────────────
let legacyMode = false; // set once a client opens with `initialize`

const send = (msg) => process.stdout.write(JSON.stringify(msg) + '\n');
const ok = (id, result, modern) =>
  send({ jsonrpc: '2.0', id, result: modern ? { resultType: 'complete', ...result } : result });
const fail = (id, code, message, data) =>
  send({ jsonrpc: '2.0', id, error: data ? { code, message, data } : { code, message } });

function handle(msg) {
  const { id, method, params = {} } = msg;
  const requested = params?._meta?.[META_VERSION];
  // A request carrying modern _meta is served statelessly; `initialize` pins this
  // process to legacy semantics. Absent both, follow whichever era we're already in.
  const modern = requested ? requested === MODERN : !legacyMode;

  if (requested && !SUPPORTED.includes(requested)) {
    return fail(id, -32022, 'Unsupported protocol version', {
      supported: SUPPORTED,
      requested,
    });
  }

  switch (method) {
    case 'initialize': {
      legacyMode = true;
      const want = params.protocolVersion;
      return ok(id, {
        protocolVersion: LEGACY.includes(want) ? want : LEGACY[0],
        capabilities: { tools: {} },
        serverInfo: { name: 'hwpkit', version: VERSION },
        instructions: INSTRUCTIONS,
      }, false);
    }
    case 'server/discover':
      return ok(id, {
        supportedVersions: SUPPORTED,
        capabilities: { tools: {} },
        instructions: INSTRUCTIONS,
        _meta: { [META_SERVER_INFO]: { name: 'hwpkit', version: VERSION } },
      }, modern);
    case 'ping':
      return ok(id, {}, modern);
    case 'tools/list':
      return ok(id, { tools: TOOLS }, modern);
    case 'tools/call': {
      const res = callTool(params.name, params.arguments ?? {});
      if (!res) return fail(id, -32602, `Unknown tool: ${params.name}`);
      // Execution failures are tool errors, not protocol errors: the model can read
      // the message and retry with different arguments.
      return ok(id, { content: [{ type: 'text', text: res.text }], isError: !res.ok }, modern);
    }
    default:
      if (method?.startsWith('notifications/')) return; // no response to notifications
      return fail(id, -32601, `Method not found: ${method}`);
  }
}

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let nl;
  while ((nl = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, nl).trim();
    buffer = buffer.slice(nl + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      fail(null, -32700, 'Parse error');
      continue;
    }
    if (msg.id === undefined && !msg.method) continue; // a response to us; ignore
    try {
      handle(msg);
    } catch (e) {
      fail(msg.id ?? null, -32603, `Internal error: ${e?.message ?? e}`);
    }
  }
});
process.stdin.on('end', () => process.exit(0));
