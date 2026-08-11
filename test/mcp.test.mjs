// Drives scripts/hwp-mcp.mjs over real stdio, in both protocol eras:
// legacy (`initialize` handshake, 2025-11-25 and earlier) and modern (stateless,
// per-request `_meta`, 2026-07-28). No MCP client library involved — that is the
// point: this checks the wire format we actually emit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SERVER = join(ROOT, 'scripts', 'hwp-mcp.mjs');
const MODERN = '2026-07-28';
const META = { 'io.modelcontextprotocol/protocolVersion': MODERN };

/** Send a batch of requests to a fresh server process, collect the responses. */
function converse(requests, { timeout = 60_000 } = {}) {
  return new Promise((done, reject) => {
    const proc = spawn(process.execPath, [SERVER], { stdio: ['pipe', 'pipe', 'pipe'] });
    const responses = [];
    let buffer = '';
    let stderr = '';
    const expected = requests.filter((r) => r.id !== undefined).length;
    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error(`timed out; got ${responses.length}/${expected}. stderr: ${stderr}`));
    }, timeout);

    proc.stdout.setEncoding('utf8');
    proc.stdout.on('data', (chunk) => {
      buffer += chunk;
      let nl;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (line) responses.push(JSON.parse(line));
      }
      if (responses.length >= expected) {
        clearTimeout(timer);
        proc.stdin.end();
        proc.kill();
        done(responses);
      }
    });
    proc.stderr.on('data', (d) => { stderr += d; });
    proc.on('error', reject);

    for (const r of requests) proc.stdin.write(JSON.stringify(r) + '\n');
  });
}

const byId = (rs, id) => rs.find((r) => r.id === id);

test('legacy era: initialize handshake, then tools/list', async () => {
  const rs = await converse([
    {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'test', version: '1' },
      },
    },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
  ]);

  const init = byId(rs, 1).result;
  assert.equal(init.protocolVersion, '2025-11-25');
  assert.deepEqual(init.capabilities, { tools: {} });
  assert.equal(init.serverInfo.name, 'hwpkit');
  // Legacy results must NOT carry the modern resultType discriminator.
  assert.equal(init.resultType, undefined);

  const list = byId(rs, 2).result;
  assert.equal(list.resultType, undefined);
  assert.deepEqual(list.tools.map((t) => t.name).sort(), ['hwp_preview', 'hwp_read', 'hwp_write']);
  for (const tool of list.tools) {
    assert.equal(tool.inputSchema.type, 'object', `${tool.name} needs an object inputSchema`);
    assert.ok(tool.description.length > 40, `${tool.name} needs a real description`);
  }
});

test('modern era: server/discover advertises both eras', async () => {
  const rs = await converse([
    { jsonrpc: '2.0', id: 1, method: 'server/discover', params: { _meta: META } },
  ]);
  const d = byId(rs, 1).result;
  assert.equal(d.resultType, 'complete');
  assert.ok(d.supportedVersions.includes(MODERN));
  assert.ok(d.supportedVersions.includes('2025-11-25'), 'must still offer a legacy version');
  assert.deepEqual(d.capabilities, { tools: {} });
  assert.equal(d._meta['io.modelcontextprotocol/serverInfo'].name, 'hwpkit');
});

test('modern era: tools/list is tagged complete', async () => {
  const rs = await converse([
    { jsonrpc: '2.0', id: 1, method: 'tools/list', params: { _meta: META } },
  ]);
  assert.equal(byId(rs, 1).result.resultType, 'complete');
});

test('unsupported protocol version is rejected with the supported list', async () => {
  const rs = await converse([
    {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: { _meta: { 'io.modelcontextprotocol/protocolVersion': '1900-01-01' } },
    },
  ]);
  const err = byId(rs, 1).error;
  assert.equal(err.code, -32022);
  assert.equal(err.data.requested, '1900-01-01');
  assert.ok(err.data.supported.includes(MODERN));
});

test('unknown method and unknown tool produce protocol errors', async () => {
  const rs = await converse([
    { jsonrpc: '2.0', id: 1, method: 'nope/nope', params: { _meta: META } },
    { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { _meta: META, name: 'nope', arguments: {} } },
  ]);
  assert.equal(byId(rs, 1).error.code, -32601);
  assert.equal(byId(rs, 2).error.code, -32602);
});

test('round trip through the tools: write, read back, preview', async () => {
  const out = mkdtempSync(join(tmpdir(), 'hwpkit-mcp-'));
  const file = join(out, 'report.hwp');
  const markdown = '# 분기 보고서\n\n본문 문단입니다.\n\n| 구분 | 값 |\n| --- | --- |\n| 매출 | 1,850 |\n';

  const rs = await converse([
    {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { _meta: META, name: 'hwp_write', arguments: { markdown, outputPath: file } },
    },
    {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { _meta: META, name: 'hwp_read', arguments: { path: file } },
    },
    {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        _meta: META,
        name: 'hwp_preview',
        arguments: { path: file, outputDir: out, png: false },
      },
    },
  ]);

  const write = byId(rs, 1).result;
  assert.equal(write.isError, false, `write failed: ${write.content[0].text}`);
  assert.ok(existsSync(file), 'the .hwp should exist on disk');

  const read = byId(rs, 2).result;
  assert.equal(read.isError, false);
  assert.match(read.content[0].text, /분기 보고서/);
  assert.match(read.content[0].text, /1,850/, 'table text should survive');

  const preview = byId(rs, 3).result;
  assert.equal(preview.isError, false, `preview failed: ${preview.content[0].text}`);
  assert.ok(readdirSync(out).some((f) => f.endsWith('.svg')), 'an SVG page should be written');
});

test('a failing tool call is a tool error, not a protocol error', async () => {
  const rs = await converse([
    {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { _meta: META, name: 'hwp_read', arguments: { path: '/nonexistent/nope.hwp' } },
    },
  ]);
  const r = byId(rs, 1);
  assert.equal(r.error, undefined, 'must not surface as a JSON-RPC error');
  assert.equal(r.result.isError, true);
  assert.ok(r.result.content[0].text.length > 0, 'the model needs something to read');
});
