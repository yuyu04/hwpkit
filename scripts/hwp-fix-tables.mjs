// hwp-fix-tables.mjs — Repair table CTRL_HEADERs in an exported .hwp.
//
// JS port of hop's Rust `fix_table_headers` (state.rs save post-processing).
// The rhwp engine writes freshly-created table controls with a 42-byte
// CTRL_HEADER (raw_ctrl_data = 38 bytes) instead of the correct 48-byte layout,
// which drops prevent_page_break/description fields and leaves an inconsistent
// treat_as_char flag → in Hancom the table can be invisible, mis-anchored, or
// split awkwardly across pages. This rewrites those headers to the correct
// 48-byte layout (treat_as_char=1, horzRelTo=2, offsets=0), preserving width/
// height/margins/instance-id. Conservative: on any parse failure it returns the
// input unchanged. HWP (CFB) only — HWPX tables are XML and unaffected.
import * as CFB from 'cfb';
import { inflateRawSync, deflateRawSync } from 'node:zlib';

const HWPTAG_CTRL_HEADER = 71;
const TABLE_CTRL_ID = Buffer.from([0x20, 0x6c, 0x62, 0x74]); // "tbl " id, little-endian
const CORRECT_RAW_LEN = 44; // ctrlID(4) + 44 = 48-byte CTRL_HEADER data

/** Fix table headers in exported HWP bytes; return input unchanged on any failure. */
export function fixTableHeaders(bytes) {
  try {
    const fixed = tryFix(Buffer.from(bytes));
    return fixed ?? bytes;
  } catch {
    return bytes;
  }
}

function tryFix(buf) {
  const cfb = CFB.read(buf, { type: 'buffer' });

  const fh = findStream(cfb, 'FileHeader');
  if (!fh || fh.length < 40) return null;
  const flags = fh.readUInt32LE(36);
  const compressed = (flags & 0x01) !== 0;
  const encrypted = (flags & 0x02) !== 0;
  if (encrypted) return null;

  const sections = cfb.FileIndex.filter((e) => e.type === 2 && isSectionPath(pathOf(cfb, e)));
  if (!sections.length) return null;

  let changed = false;
  for (const entry of sections) {
    const raw = Buffer.from(entry.content);
    let decoded;
    if (compressed) {
      try {
        decoded = inflateRawSync(raw);
      } catch {
        continue;
      }
    } else {
      decoded = raw;
    }
    const [patched, count] = patchRecords(decoded);
    if (count === 0) continue;
    const encoded = compressed ? deflateRawSync(patched) : patched;
    entry.content = encoded;
    entry.size = encoded.length;
    changed = true;
  }
  if (!changed) return null;
  return Buffer.from(CFB.write(cfb, { type: 'buffer' }));
}

function pathOf(cfb, entry) {
  const idx = cfb.FileIndex.indexOf(entry);
  return (cfb.FullPaths[idx] || entry.name || '').replace(/\\/g, '/');
}

function isSectionPath(p) {
  const name = p.split('/').pop() || '';
  const n = name.startsWith('Section') ? name.slice('Section'.length) : '';
  const isSection = n.length > 0 && /^[0-9]+$/.test(n);
  // BodyText/SectionN (root path) — exclude ViewText (distribution-encrypted).
  return isSection && /(^|\/)BodyText\/Section[0-9]+$/.test(p);
}

function findStream(cfb, leaf) {
  const entry = cfb.FileIndex.find((e) => e.type === 2 && (e.name === leaf || pathOf(cfb, e).endsWith('/' + leaf)));
  return entry ? Buffer.from(entry.content) : null;
}

/** Walk the record stream, rebuild broken table CTRL_HEADERs. Returns [buffer, count]. */
function patchRecords(data) {
  const out = [];
  let i = 0;
  let count = 0;
  while (i + 4 <= data.length) {
    const header = data.readUInt32LE(i);
    const tag = header & 0x3ff;
    const level = (header >>> 10) & 0x3ff;
    let size = (header >>> 20) & 0xfff;
    let headerLen = 4;
    if (size === 0xfff) {
      if (i + 8 > data.length) {
        out.push(data.subarray(i));
        i = data.length;
        break;
      }
      size = data.readUInt32LE(i + 4);
      headerLen = 8;
    }
    const bodyStart = i + headerLen;
    const bodyEnd = bodyStart + size;
    if (bodyEnd > data.length) {
      out.push(data.subarray(i)); // truncated record — preserve tail
      i = data.length;
      break;
    }
    const body = data.subarray(bodyStart, bodyEnd);
    const isBrokenTable =
      tag === HWPTAG_CTRL_HEADER &&
      body.length >= 4 &&
      body.subarray(0, 4).equals(TABLE_CTRL_ID) &&
      body.length - 4 < CORRECT_RAW_LEN;
    if (isBrokenTable) {
      const newBody = rebuildTableCtrl(body);
      writeRecord(out, tag, level, newBody);
      count += 1;
    } else {
      out.push(data.subarray(i, bodyEnd));
    }
    i = bodyEnd;
  }
  if (i < data.length) out.push(data.subarray(i));
  return [Buffer.concat(out), count];
}

function rebuildTableCtrl(body) {
  const raw = body.subarray(4);
  const ru32 = (off) => (off + 4 <= raw.length ? raw.readUInt32LE(off) : 0);
  const ri16 = (off) => (off + 2 <= raw.length ? raw.readInt16LE(off) : 0);

  const oldFlags = ru32(0);
  const newFlags = ((oldFlags & ~(0b11 << 8)) | 0b1 | (2 << 8)) >>> 0;
  const width = ru32(12);
  const height = ru32(16);
  const zOrder = ru32(20);
  const mL = ri16(24);
  const mR = ri16(26);
  const mT = ri16(28);
  const mB = ri16(30);
  const instanceId = ru32(32);

  const nr = Buffer.alloc(CORRECT_RAW_LEN);
  nr.writeUInt32LE(newFlags, 0); // 0..4   FLAGS
  nr.writeUInt32LE(0, 4); //             4..8   V_OFFSET = 0
  nr.writeUInt32LE(0, 8); //             8..12  H_OFFSET = 0
  nr.writeUInt32LE(width, 12); //        12..16 WIDTH
  nr.writeUInt32LE(height, 16); //       16..20 HEIGHT
  nr.writeUInt32LE(zOrder, 20); //       20..24 Z_ORDER
  nr.writeInt16LE(mL, 24); //            24..26 MARGIN_LEFT
  nr.writeInt16LE(mR, 26); //            26..28 MARGIN_RIGHT
  nr.writeInt16LE(mT, 28); //            28..30 MARGIN_TOP
  nr.writeInt16LE(mB, 30); //            30..32 MARGIN_BOTTOM
  nr.writeUInt32LE(instanceId, 32); //   32..36 INSTANCE_ID
  // 36..44 = prevent_page_break(0) + description(len 0) + padding, already zero.

  return Buffer.concat([body.subarray(0, 4), nr]);
}

function writeRecord(out, tag, level, body) {
  const size = body.length;
  const head = Buffer.alloc(size < 0xfff ? 4 : 8);
  if (size < 0xfff) {
    head.writeUInt32LE(((tag & 0x3ff) | ((level & 0x3ff) << 10) | ((size & 0xfff) << 20)) >>> 0, 0);
  } else {
    head.writeUInt32LE(((tag & 0x3ff) | ((level & 0x3ff) << 10) | (0xfff << 20)) >>> 0, 0);
    head.writeUInt32LE(size, 4);
  }
  out.push(head, body);
}
