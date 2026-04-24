/**
 * data.asn1 — ASN.1 DER/BER decoder
 *
 * Accepts raw hex or a PEM block (BEGIN/END framed base64). Decodes the byte
 * stream into a recursive tree: tag class + P/C + tag number + length + body.
 * Recognized primitives are pretty-printed (OID with friendly name, INTEGER,
 * STRINGs, BOOLEAN, NULL, UTC/GeneralizedTime). Constructed types
 * (SEQUENCE/SET, context-specific) recurse.
 *
 * Designed for X.509 / PKCS / CMS / CSR debugging in the browser.
 */

// ── Tag constants ───────────────────────────────────────────────────────────

const CLASS_NAMES = ['UNIVERSAL', 'APPLICATION', 'CONTEXT', 'PRIVATE'];

const UNIVERSAL_TAGS = {
    0x00: 'EOC',
    0x01: 'BOOLEAN',
    0x02: 'INTEGER',
    0x03: 'BIT STRING',
    0x04: 'OCTET STRING',
    0x05: 'NULL',
    0x06: 'OBJECT IDENTIFIER',
    0x07: 'ObjectDescriptor',
    0x0a: 'ENUMERATED',
    0x0c: 'UTF8String',
    0x10: 'SEQUENCE',
    0x11: 'SET',
    0x12: 'NumericString',
    0x13: 'PrintableString',
    0x14: 'T61String',
    0x15: 'VideotexString',
    0x16: 'IA5String',
    0x17: 'UTCTime',
    0x18: 'GeneralizedTime',
    0x19: 'GraphicString',
    0x1a: 'VisibleString',
    0x1b: 'GeneralString',
    0x1c: 'UniversalString',
    0x1e: 'BMPString',
};

// Common OIDs encountered in X.509 + PKCS / CMS chains. Far from exhaustive.
const OID_NAMES = {
    // Algorithms
    '1.2.840.113549.1.1.1':   'rsaEncryption',
    '1.2.840.113549.1.1.5':   'sha1WithRSAEncryption',
    '1.2.840.113549.1.1.10':  'rsassa-pss',
    '1.2.840.113549.1.1.11':  'sha256WithRSAEncryption',
    '1.2.840.113549.1.1.12':  'sha384WithRSAEncryption',
    '1.2.840.113549.1.1.13':  'sha512WithRSAEncryption',
    '1.2.840.10040.4.1':      'dsa',
    '1.2.840.10040.4.3':      'sha1WithDSA',
    '1.2.840.10045.2.1':      'ecPublicKey',
    '1.2.840.10045.4.3.2':    'ecdsaWithSHA256',
    '1.2.840.10045.4.3.3':    'ecdsaWithSHA384',
    '1.2.840.10045.4.3.4':    'ecdsaWithSHA512',
    '1.2.840.10045.3.1.7':    'prime256v1',
    '1.3.132.0.34':           'secp384r1',
    '1.3.132.0.35':           'secp521r1',
    '1.3.101.110':            'X25519',
    '1.3.101.112':            'Ed25519',
    // Hashes
    '1.3.14.3.2.26':          'sha1',
    '2.16.840.1.101.3.4.2.1': 'sha256',
    '2.16.840.1.101.3.4.2.2': 'sha384',
    '2.16.840.1.101.3.4.2.3': 'sha512',
    // Distinguished Name attributes
    '2.5.4.3':  'commonName',
    '2.5.4.4':  'surname',
    '2.5.4.5':  'serialNumber',
    '2.5.4.6':  'countryName',
    '2.5.4.7':  'localityName',
    '2.5.4.8':  'stateOrProvinceName',
    '2.5.4.9':  'streetAddress',
    '2.5.4.10': 'organizationName',
    '2.5.4.11': 'organizationalUnitName',
    '2.5.4.12': 'title',
    '2.5.4.42': 'givenName',
    '2.5.4.43': 'initials',
    '2.5.4.44': 'generationQualifier',
    '0.9.2342.19200300.100.1.25': 'domainComponent',
    '1.2.840.113549.1.9.1':       'emailAddress',
    // X.509 extensions
    '2.5.29.14': 'subjectKeyIdentifier',
    '2.5.29.15': 'keyUsage',
    '2.5.29.17': 'subjectAltName',
    '2.5.29.18': 'issuerAltName',
    '2.5.29.19': 'basicConstraints',
    '2.5.29.20': 'cRLNumber',
    '2.5.29.30': 'nameConstraints',
    '2.5.29.31': 'cRLDistributionPoints',
    '2.5.29.32': 'certificatePolicies',
    '2.5.29.35': 'authorityKeyIdentifier',
    '2.5.29.37': 'extKeyUsage',
    // PKIX
    '1.3.6.1.5.5.7.1.1':  'authorityInfoAccess',
    '1.3.6.1.5.5.7.3.1':  'serverAuth',
    '1.3.6.1.5.5.7.3.2':  'clientAuth',
    '1.3.6.1.5.5.7.3.3':  'codeSigning',
    '1.3.6.1.5.5.7.3.4':  'emailProtection',
    '1.3.6.1.5.5.7.3.8':  'timeStamping',
    '1.3.6.1.5.5.7.3.9':  'OCSPSigning',
    '1.3.6.1.5.5.7.48.1': 'ocsp',
    '1.3.6.1.5.5.7.48.2': 'caIssuers',
    // PKCS#9 / PKCS#7
    '1.2.840.113549.1.7.1': 'data',
    '1.2.840.113549.1.7.2': 'signedData',
    '1.2.840.113549.1.9.3': 'contentType',
    '1.2.840.113549.1.9.4': 'messageDigest',
    '1.2.840.113549.1.9.5': 'signingTime',
};

// ── Input loaders ───────────────────────────────────────────────────────────

function looksLikePEM(s) { return /-----BEGIN [A-Z0-9 ]+-----/.test(s); }

function loadInput(s) {
    s = s.trim();
    if (!s) throw new Error('empty input');

    if (looksLikePEM(s)) {
        const m = s.match(/-----BEGIN ([A-Z0-9 ]+)-----([\s\S]+?)-----END \1-----/);
        if (!m) throw new Error('PEM block malformed');
        const b64 = m[2].replace(/\s+/g, '');
        try {
            const bin = atob(b64);
            const out = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
            return { bytes: out, label: m[1].trim() };
        } catch (e) {
            throw new Error('PEM base64 decode failed: ' + e.message);
        }
    }

    // Hex (allow whitespace, 0x prefix, colons)
    const hex = s.replace(/^0x/i, '').replace(/[\s:]/g, '');
    if (!/^[0-9a-fA-F]+$/.test(hex)) throw new Error('input is neither PEM nor hex');
    if (hex.length % 2) throw new Error('hex has odd length');
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
    return { bytes: out, label: 'hex' };
}

// ── Parser ──────────────────────────────────────────────────────────────────

function parseTag(buf, off) {
    let b = buf[off];
    if (b === undefined) throw new Error(`unexpected EOF at offset ${off}`);
    const cls   = (b >> 6) & 0x03;
    const cons  = (b >> 5) & 0x01;
    let tagNum  = b & 0x1f;
    let consumed = 1;

    if (tagNum === 0x1f) {
        // High-tag-number form
        tagNum = 0;
        do {
            b = buf[off + consumed];
            if (b === undefined) throw new Error(`unexpected EOF reading tag at ${off}`);
            tagNum = (tagNum << 7) | (b & 0x7f);
            consumed++;
        } while (b & 0x80);
    }

    return { cls, cons, tagNum, consumed };
}

function parseLength(buf, off) {
    const first = buf[off];
    if (first === undefined) throw new Error(`unexpected EOF reading length at ${off}`);
    if (first < 0x80) return { length: first, consumed: 1 };
    if (first === 0x80) return { length: -1, consumed: 1 };  // indefinite
    const n = first & 0x7f;
    if (n > 4) throw new Error(`length octets > 4 at ${off}`);
    let length = 0;
    for (let i = 0; i < n; i++) {
        const b = buf[off + 1 + i];
        if (b === undefined) throw new Error(`unexpected EOF reading length at ${off}`);
        length = (length << 8) | b;
    }
    return { length, consumed: 1 + n };
}

function parseAll(buf, off, end) {
    const items = [];
    while (off < end) {
        const item = parseOne(buf, off);
        items.push(item);
        off = item.endOffset;
    }
    return items;
}

function parseOne(buf, off) {
    const startOff = off;
    const tag = parseTag(buf, off);
    off += tag.consumed;
    const len = parseLength(buf, off);
    off += len.consumed;
    const bodyStart = off;
    const body = buf.slice(bodyStart, bodyStart + len.length);
    const endOffset = bodyStart + len.length;

    const node = {
        offset:    startOff,
        headerLen: bodyStart - startOff,
        bodyLen:   len.length,
        endOffset,
        cls:       tag.cls,
        className: CLASS_NAMES[tag.cls],
        cons:      !!tag.cons,
        tagNum:    tag.tagNum,
        tagLabel:  tag.cls === 0
            ? (UNIVERSAL_TAGS[tag.tagNum] || `[UNIVERSAL ${tag.tagNum}]`)
            : `[${CLASS_NAMES[tag.cls]} ${tag.tagNum}]`,
        body,
        children:  null,
        decoded:   null,
        decodeErr: null,
    };

    if (node.cons) {
        try { node.children = parseAll(buf, bodyStart, endOffset); }
        catch (e) { node.decodeErr = 'children: ' + e.message; }
    } else if (tag.cls === 0) {
        try { node.decoded = decodePrimitive(tag.tagNum, body); }
        catch (e) { node.decodeErr = e.message; }
    }
    return node;
}

// ── Primitive decoders ──────────────────────────────────────────────────────

function decodePrimitive(tagNum, body) {
    switch (tagNum) {
        case 0x01: return decodeBool(body);
        case 0x02: return decodeInteger(body);
        case 0x03: return decodeBitString(body);
        case 0x04: return { type: 'OCTET STRING', preview: hexPreview(body), len: body.length };
        case 0x05: return { type: 'NULL' };
        case 0x06: return decodeOID(body);
        case 0x0c:
        case 0x12:
        case 0x13:
        case 0x14:
        case 0x16:
        case 0x1a:
        case 0x1b: return decodeString(body, tagNum);
        case 0x17: return decodeUTCTime(body);
        case 0x18: return decodeGeneralizedTime(body);
        default:   return { type: '?', preview: hexPreview(body), len: body.length };
    }
}

function decodeBool(body) {
    if (body.length !== 1) throw new Error('BOOLEAN length != 1');
    return { type: 'BOOLEAN', value: body[0] !== 0 };
}

function decodeInteger(body) {
    if (body.length === 0) throw new Error('INTEGER empty');
    let bi = 0n;
    const negative = (body[0] & 0x80) !== 0;
    for (const b of body) bi = (bi << 8n) | BigInt(b);
    if (negative) {
        const bits = BigInt(body.length * 8);
        bi = bi - (1n << bits);
    }
    return {
        type:    'INTEGER',
        bigint:  bi,
        decimal: bi.toString(10),
        hex:     '0x' + Array.from(body, b => b.toString(16).padStart(2, '0')).join(''),
        len:     body.length,
    };
}

function decodeBitString(body) {
    if (body.length === 0) throw new Error('BIT STRING empty');
    return {
        type:       'BIT STRING',
        unusedBits: body[0],
        preview:    hexPreview(body.slice(1)),
        len:        body.length - 1,
    };
}

function decodeOID(body) {
    if (body.length === 0) throw new Error('OID empty');
    const arcs = [];
    const first = body[0];
    arcs.push(Math.floor(first / 40), first % 40);

    let v = 0n;
    for (let i = 1; i < body.length; i++) {
        v = (v << 7n) | BigInt(body[i] & 0x7f);
        if ((body[i] & 0x80) === 0) {
            arcs.push(v.toString(10));
            v = 0n;
        }
    }
    const oid = arcs.join('.');
    return { type: 'OID', oid, name: OID_NAMES[oid] || null };
}

function decodeString(body, tagNum) {
    let str;
    try {
        if (tagNum === 0x0c) {
            str = new TextDecoder('utf-8', { fatal: true }).decode(body);
        } else {
            // Most others are ASCII-compatible; latin-1 fallback for T61
            str = new TextDecoder('latin1').decode(body);
        }
    } catch {
        str = '<invalid encoding>';
    }
    return { type: UNIVERSAL_TAGS[tagNum], value: str };
}

function decodeUTCTime(body) {
    const s = new TextDecoder('latin1').decode(body);
    // YYMMDDhhmm[ss]Z or with timezone offset
    const m = s.match(/^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?(Z|[+-]\d{4})$/);
    if (!m) return { type: 'UTCTime', value: s };
    let yy = parseInt(m[1], 10);
    yy = yy >= 50 ? 1900 + yy : 2000 + yy;
    const iso = `${yy}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] || '00'}${m[7] === 'Z' ? 'Z' : m[7]}`;
    return { type: 'UTCTime', value: s, iso };
}

function decodeGeneralizedTime(body) {
    const s = new TextDecoder('latin1').decode(body);
    const m = s.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})?(\d{2})?(\.\d+)?(Z|[+-]\d{4})?$/);
    if (!m) return { type: 'GeneralizedTime', value: s };
    const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5] || '00'}:${m[6] || '00'}${m[7] || ''}${m[8] || ''}`;
    return { type: 'GeneralizedTime', value: s, iso };
}

function hexPreview(body, max = 32) {
    const out = [];
    const n = Math.min(body.length, max);
    for (let i = 0; i < n; i++) out.push(body[i].toString(16).padStart(2, '0'));
    return out.join(' ') + (body.length > max ? ` … (+${body.length - max} bytes)` : '');
}

// ── Renderer ────────────────────────────────────────────────────────────────

function escape(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderTree(nodes, depth = 0) {
    return nodes.map(n => renderNode(n, depth)).join('');
}

function renderNode(n, depth) {
    const pad = depth * 14;
    const tagBadge = n.cls === 0
        ? `<span class="asn1-tag asn1-univ">${escape(n.tagLabel)}</span>`
        : `<span class="asn1-tag asn1-${n.className.toLowerCase()}">${escape(n.tagLabel)}</span>`;

    const meta = `<span class="asn1-meta">@${n.offset} · ${n.bodyLen}B${n.cons ? ' · constructed' : ''}</span>`;

    let value = '';
    if (n.decodeErr) {
        value = `<span class="asn1-err">${escape(n.decodeErr)}</span>`;
    } else if (n.decoded) {
        value = renderDecoded(n.decoded);
    } else if (n.cons) {
        // children rendered below
    } else {
        value = `<span class="asn1-hex">${hexPreview(n.body)}</span>`;
    }

    let html = `<div class="asn1-node" style="padding-left:${pad}px">
        <div class="asn1-row">${tagBadge} ${value} ${meta}</div>`;

    if (n.cons && n.children && n.children.length) {
        html += `<div class="asn1-children">${renderTree(n.children, depth + 1)}</div>`;
    }
    html += '</div>';
    return html;
}

function renderDecoded(d) {
    switch (d.type) {
        case 'NULL':              return `<span class="asn1-val">NULL</span>`;
        case 'BOOLEAN':           return `<span class="asn1-val">${d.value}</span>`;
        case 'INTEGER':
            if (d.bigint >= -9007199254740992n && d.bigint <= 9007199254740992n) {
                return `<span class="asn1-val">${d.decimal}</span> <span class="asn1-meta">${d.hex}</span>`;
            }
            return `<span class="asn1-val asn1-hex">${d.hex}</span> <span class="asn1-meta">${d.len}-byte int</span>`;
        case 'OID':
            return `<span class="asn1-val">${escape(d.oid)}</span>` +
                   (d.name ? ` <span class="asn1-name">${escape(d.name)}</span>` : '');
        case 'UTCTime':
        case 'GeneralizedTime':
            return `<span class="asn1-val">${escape(d.value)}</span>` +
                   (d.iso ? ` <span class="asn1-meta">${escape(d.iso)}</span>` : '');
        case 'BIT STRING':
            return `<span class="asn1-meta">[${d.unusedBits} unused] ${d.len}B</span> <span class="asn1-hex">${d.preview}</span>`;
        case 'OCTET STRING':
        case '?':
            return `<span class="asn1-meta">${d.len}B</span> <span class="asn1-hex">${d.preview}</span>`;
        default:
            // strings
            return `<span class="asn1-str">"${escape(d.value)}"</span>`;
    }
}

// ── Tool definition ─────────────────────────────────────────────────────────

const dataAsn1 = {
    id: 'data.asn1',
    title: 'ASN.1 DER/BER Decoder',

    render() {
        return `
            <style>
                .asn1-out {
                    font-family: var(--font-mono);
                    font-size: 12px;
                    line-height: 1.7;
                    background: var(--bg);
                    border: 1px solid var(--border);
                    border-radius: var(--radius-sm);
                    padding: 12px 14px;
                    overflow-x: auto;
                }
                .asn1-node      { border-left: 1px dashed var(--border); }
                .asn1-children  { border-left: 1px dashed var(--border); }
                .asn1-row       { padding: 2px 0; }
                .asn1-tag {
                    display: inline-block;
                    padding: 1px 6px;
                    margin-right: 8px;
                    border-radius: 3px;
                    font-size: 11px;
                    font-weight: 600;
                }
                .asn1-univ      { background: var(--accent-bg); color: var(--accent); }
                .asn1-context   { background: var(--bg3);       color: var(--fg2); }
                .asn1-application { background: var(--bg3);     color: var(--fg2); }
                .asn1-private   { background: var(--bg3);       color: var(--fg2); }
                .asn1-val       { color: var(--fg); }
                .asn1-str       { color: var(--color-ok); }
                .asn1-name      { color: var(--accent-2); font-style: italic; margin-left: 6px; }
                .asn1-hex       { color: var(--fg3); }
                .asn1-meta      { color: var(--fg4); margin-left: 6px; font-size: 11px; }
                .asn1-err       { color: var(--color-err); }
                .asn1-stat {
                    display: flex;
                    gap: 16px;
                    flex-wrap: wrap;
                    color: var(--fg2);
                    font-size: 12px;
                    margin-bottom: 10px;
                    font-family: var(--font-mono);
                }
                .asn1-stat span b { color: var(--fg); font-weight: 500; }
            </style>

            <div class="tool-title">${this.title}</div>
            <div class="tool-desc">
                decode DER / BER bytes into a tree of tags. accepts hex or PEM
                (-----BEGIN CERTIFICATE----- etc). recognises OIDs, integers, strings,
                times, and constructed types.
            </div>

            <div class="tool">
                <div class="tool-body panel active" id="asn1-main">
                    <div class="field">
                        <label>input — PEM block or hex</label>
                        <textarea id="asn1-input" rows="6"
                            placeholder="-----BEGIN CERTIFICATE-----&#10;MIIBkTCB+wIJAL7...&#10;-----END CERTIFICATE-----&#10;or: 30 82 01 91 02 09 ..."></textarea>
                    </div>

                    <div class="actions">
                        <button class="btn btn-primary" id="asn1-decode">decode</button>
                        <button class="btn"            id="asn1-clear">clear</button>
                    </div>

                    <div class="asn1-stat" id="asn1-stat" style="display:none"></div>
                    <div class="output-wrap">
                        <div class="output asn1-out" id="asn1-output"></div>
                        <button class="output-copy" data-target="asn1-output">copy text</button>
                    </div>
                </div>
            </div>

            <details class="ref">
                <summary>asn.1 / DER cheatsheet</summary>
                <div class="ref-body">
                    <table>
                        <tr><th>tag</th><th>type</th><th>note</th></tr>
                        <tr><td><code>02</code></td><td>INTEGER</td><td>signed, big-endian, two's complement</td></tr>
                        <tr><td><code>03</code></td><td>BIT STRING</td><td>first byte = unused trailing bits</td></tr>
                        <tr><td><code>04</code></td><td>OCTET STRING</td><td>raw bytes</td></tr>
                        <tr><td><code>05</code></td><td>NULL</td><td>length = 0</td></tr>
                        <tr><td><code>06</code></td><td>OBJECT IDENTIFIER</td><td>1st byte = 40·a + b; rest base-128</td></tr>
                        <tr><td><code>0C</code></td><td>UTF8String</td><td>typical for X.509 names today</td></tr>
                        <tr><td><code>13</code></td><td>PrintableString</td><td>legacy ascii subset</td></tr>
                        <tr><td><code>17</code></td><td>UTCTime</td><td>YYMMDDhhmmssZ (year 50–99 ⇒ 19xx)</td></tr>
                        <tr><td><code>18</code></td><td>GeneralizedTime</td><td>YYYYMMDDhhmmssZ</td></tr>
                        <tr><td><code>30</code></td><td>SEQUENCE</td><td>constructed; high bit of byte 0 set</td></tr>
                        <tr><td><code>31</code></td><td>SET</td><td>constructed</td></tr>
                        <tr><td><code>A0–BF</code></td><td>[CONTEXT n]</td><td>tag class 10 (context); n in low 5 bits</td></tr>
                    </table>
                    <p style="margin-top: 12px; font-size: 12px; color: var(--fg2);">
                        long-form length: high bit of first length byte is set; remaining 7 bits
                        give the count of subsequent bytes that hold the actual length, big-endian.
                        e.g. <code>82 01 91</code> = 0x0191 = 401 byte body.
                    </p>
                    <a href="https://luca.ntop.org/Teaching/Appunti/asn1.html" target="_blank" class="ref-link">→ "Layman's Guide to ASN.1"</a>
                </div>
            </details>
        `;
    },

    mount() {
        const out   = document.getElementById('asn1-output');
        const stat  = document.getElementById('asn1-stat');
        const input = document.getElementById('asn1-input');

        const run = () => {
            const raw = input.value;
            if (!raw.trim()) {
                out.innerHTML = '';
                stat.style.display = 'none';
                clearError(input);
                return;
            }

            try {
                const { bytes, label } = loadInput(raw);
                const t0 = performance.now();
                const tree = parseAll(bytes, 0, bytes.length);
                const dt = (performance.now() - t0).toFixed(2);

                let nodeCount = 0;
                const walk = (ns) => { for (const n of ns) {
                    nodeCount++; if (n.children) walk(n.children);
                }};
                walk(tree);

                stat.innerHTML = `
                    <span>source: <b>${escape(label)}</b></span>
                    <span>bytes: <b>${bytes.length}</b></span>
                    <span>nodes: <b>${nodeCount}</b></span>
                    <span>parse: <b>${dt}ms</b></span>
                `;
                stat.style.display = '';
                out.innerHTML = renderTree(tree);
                clearError(input);
            } catch (e) {
                stat.style.display = 'none';
                out.innerHTML = '';
                setError(input, e.message);
            }
        };

        document.getElementById('asn1-decode').onclick = run;
        document.getElementById('asn1-clear').onclick = () => {
            input.value = '';
            out.innerHTML = '';
            stat.style.display = 'none';
            clearError(input);
        };
        input.onkeydown = (e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                run();
            }
        };

        // Live: heavier parse, longer debounce
        liveBind(input, run, 350);
    },
};

window.registerTool(dataAsn1);
