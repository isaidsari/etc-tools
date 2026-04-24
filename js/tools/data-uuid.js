/**
 * data.uuid — UUID parser & generator
 *
 * Parses any UUID format (with/without hyphens, braces, urn: prefix) and exposes
 * version, variant, raw fields, and embedded timestamp where applicable
 * (v1, v6, v7 — RFC 4122 / RFC 9562).
 *
 * Generates v4 (random), v7 (time-ordered, RFC 9562), and v1 (with random
 * pseudo-node — explicitly noted, not a real MAC).
 */

// ── Engines ─────────────────────────────────────────────────────────────────

// Offset from UUID epoch (1582-10-15 00:00 UTC) to Unix epoch in 100-ns ticks.
const UUID_EPOCH_OFFSET_100NS = 0x01b21dd213814000n;

const VARIANT_NAMES = {
    NCS:       'NCS (reserved, backward-compat)',
    RFC:       'RFC 4122 / RFC 9562',
    MICROSOFT: 'Microsoft (reserved)',
    RESERVED:  'Reserved (future)',
};

function variantOf(byte8) {
    if ((byte8 & 0x80) === 0x00) return 'NCS';
    if ((byte8 & 0xC0) === 0x80) return 'RFC';
    if ((byte8 & 0xE0) === 0xC0) return 'MICROSOFT';
    return 'RESERVED';
}

const VERSION_NAMES = {
    1: 'v1 (time-based, MAC + 100ns ticks)',
    2: 'v2 (DCE security, rare)',
    3: 'v3 (name-based, MD5)',
    4: 'v4 (random)',
    5: 'v5 (name-based, SHA-1)',
    6: 'v6 (time-ordered, RFC 9562)',
    7: 'v7 (time-ordered + random, RFC 9562)',
    8: 'v8 (custom, RFC 9562)',
};

const uuid = {
    // Normalize: strip hyphens / braces / urn: prefix, lowercase, validate hex+length
    normalize(input) {
        if (input == null) throw new Error('empty input');
        let s = String(input).trim().toLowerCase();
        if (s.startsWith('urn:uuid:')) s = s.slice(9);
        s = s.replace(/^\{|\}$/g, '');
        s = s.replace(/-/g, '');
        if (!/^[0-9a-f]{32}$/.test(s)) {
            throw new Error('not a UUID (need 32 hex digits, with or without hyphens)');
        }
        return s;
    },

    formatHyphenated(hex32) {
        return `${hex32.slice(0, 8)}-${hex32.slice(8, 12)}-${hex32.slice(12, 16)}-${hex32.slice(16, 20)}-${hex32.slice(20, 32)}`;
    },

    bytes(hex32) {
        const out = new Uint8Array(16);
        for (let i = 0; i < 16; i++) out[i] = parseInt(hex32.substr(i * 2, 2), 16);
        return out;
    },

    parse(input) {
        const hex = this.normalize(input);
        const bytes = this.bytes(hex);

        const versionRaw = (bytes[6] >> 4) & 0x0f;
        const variantKey = variantOf(bytes[8]);

        const out = {
            input:       String(input).trim(),
            canonical:   this.formatHyphenated(hex),
            hex:         hex,
            version:     versionRaw,
            versionName: VERSION_NAMES[versionRaw] || `unknown (${versionRaw})`,
            variantKey,
            variantName: VARIANT_NAMES[variantKey],
            bytes,
            timestampMs: null,
            extra:       {},
        };

        if (variantKey !== 'RFC') return out;

        if (versionRaw === 1) {
            // v1: time_low (bytes 0-3), time_mid (4-5), time_hi & version (6-7)
            const time_low  = BigInt(bytes[0]) << 24n | BigInt(bytes[1]) << 16n | BigInt(bytes[2]) << 8n | BigInt(bytes[3]);
            const time_mid  = BigInt(bytes[4]) << 8n  | BigInt(bytes[5]);
            const time_hi   = ((BigInt(bytes[6]) & 0x0fn) << 8n) | BigInt(bytes[7]);
            const ts100ns   = (time_hi << 48n) | (time_mid << 32n) | time_low;
            const unix100ns = ts100ns - UUID_EPOCH_OFFSET_100NS;
            out.timestampMs = Number(unix100ns / 10000n);
            out.extra.clockSeq = ((bytes[8] & 0x3f) << 8) | bytes[9];
            out.extra.node     = Array.from(bytes.slice(10, 16))
                                  .map(b => b.toString(16).padStart(2, '0')).join(':');
            out.extra.multicast = (bytes[10] & 0x01) === 0x01;
        } else if (versionRaw === 6) {
            // v6: time_high (bytes 0-3, 32 bits), time_mid (4-5, 16 bits),
            //     version+time_low (6-7, 4+12 bits), then variant+clockSeq, node.
            const time_high = BigInt(bytes[0]) << 24n | BigInt(bytes[1]) << 16n | BigInt(bytes[2]) << 8n | BigInt(bytes[3]);
            const time_mid  = BigInt(bytes[4]) << 8n  | BigInt(bytes[5]);
            const time_low  = ((BigInt(bytes[6]) & 0x0fn) << 8n) | BigInt(bytes[7]);
            const ts100ns   = (time_high << 28n) | (time_mid << 12n) | time_low;
            const unix100ns = ts100ns - UUID_EPOCH_OFFSET_100NS;
            out.timestampMs = Number(unix100ns / 10000n);
            out.extra.clockSeq = ((bytes[8] & 0x3f) << 8) | bytes[9];
            out.extra.node     = Array.from(bytes.slice(10, 16))
                                  .map(b => b.toString(16).padStart(2, '0')).join(':');
        } else if (versionRaw === 7) {
            // v7: bytes 0-5 = unix_ts_ms (big-endian, 48 bits)
            const ts =
                  (BigInt(bytes[0]) << 40n)
                | (BigInt(bytes[1]) << 32n)
                | (BigInt(bytes[2]) << 24n)
                | (BigInt(bytes[3]) << 16n)
                | (BigInt(bytes[4]) <<  8n)
                |  BigInt(bytes[5]);
            out.timestampMs = Number(ts);
            out.extra.randA = (((bytes[6] & 0x0f) << 8) | bytes[7]).toString(16).padStart(3, '0');
            out.extra.randB = Array.from(bytes.slice(8, 16))
                                  .map(b => b.toString(16).padStart(2, '0')).join('');
        }

        return out;
    },

    randomBytes(n) {
        const buf = new Uint8Array(n);
        if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
            crypto.getRandomValues(buf);
        } else {
            for (let i = 0; i < n; i++) buf[i] = Math.floor(Math.random() * 256);
        }
        return buf;
    },

    bytesToHyphenated(bytes) {
        const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
        return this.formatHyphenated(hex);
    },

    generateV4() {
        const b = this.randomBytes(16);
        b[6] = (b[6] & 0x0f) | 0x40;   // version 4
        b[8] = (b[8] & 0x3f) | 0x80;   // RFC variant
        return this.bytesToHyphenated(b);
    },

    generateV7(timestampMs) {
        const ts = BigInt(timestampMs ?? Date.now());
        const b = this.randomBytes(16);
        b[0] = Number((ts >> 40n) & 0xffn);
        b[1] = Number((ts >> 32n) & 0xffn);
        b[2] = Number((ts >> 24n) & 0xffn);
        b[3] = Number((ts >> 16n) & 0xffn);
        b[4] = Number((ts >>  8n) & 0xffn);
        b[5] = Number( ts         & 0xffn);
        b[6] = (b[6] & 0x0f) | 0x70;   // version 7
        b[8] = (b[8] & 0x3f) | 0x80;   // RFC variant
        return this.bytesToHyphenated(b);
    },

    generateV1(timestampMs) {
        // Random pseudo-node with multicast bit set (as per spec for non-MAC nodes)
        const ms100ns =
            BigInt(timestampMs ?? Date.now()) * 10000n + UUID_EPOCH_OFFSET_100NS;
        const time_low = ms100ns & 0xffffffffn;
        const time_mid = (ms100ns >> 32n) & 0xffffn;
        const time_hi  = (ms100ns >> 48n) & 0x0fffn;

        const b = this.randomBytes(16);
        b[0] = Number((time_low >> 24n) & 0xffn);
        b[1] = Number((time_low >> 16n) & 0xffn);
        b[2] = Number((time_low >>  8n) & 0xffn);
        b[3] = Number( time_low         & 0xffn);
        b[4] = Number((time_mid >>  8n) & 0xffn);
        b[5] = Number( time_mid         & 0xffn);
        b[6] = Number((time_hi  >>  8n) & 0x0fn) | 0x10;   // version 1
        b[7] = Number( time_hi          & 0xffn);
        b[8] = (b[8] & 0x3f) | 0x80;   // RFC variant
        // clockSeq stays random in b[8..9]; node already random in b[10..15]
        b[10] |= 0x01;                  // multicast bit — flag as random pseudo-node
        return this.bytesToHyphenated(b);
    },
};

// ── Formatting helpers ──────────────────────────────────────────────────────

function formatTimestamp(ms) {
    if (ms == null) return null;
    const d = new Date(ms);
    if (isNaN(d.getTime())) return null;
    return {
        ms,
        iso:   d.toISOString(),
        local: d.toLocaleString('en-US', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            fractionalSecondDigits: 3, hour12: false,
        }),
    };
}

function formatAge(ms) {
    if (ms == null) return null;
    const diff = Math.floor((Date.now() - ms) / 1000);
    const abs = Math.abs(diff);
    let s;
    if (abs < 60)         s = `${abs}s`;
    else if (abs < 3600)  s = `${Math.floor(abs / 60)}m`;
    else if (abs < 86400) s = `${Math.floor(abs / 3600)}h`;
    else                  s = `${Math.floor(abs / 86400)}d`;
    return diff >= 0 ? `${s} ago` : `in ${s}`;
}

function escape(s) {
    return String(s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Tool definition ─────────────────────────────────────────────────────────

const dataUuid = {
    id: 'data.uuid',
    title: 'UUID Parser & Generator',

    render() {
        return `
            <div class="tool-title">${this.title}</div>
            <div class="tool-desc">
                parse any uuid (v1–v8) and extract version / variant / embedded timestamp,
                or generate fresh v4 / v7 / v1
            </div>

            <div class="tool">
                <div class="tool-tabs">
                    <button class="tool-tab active" data-panel="uuid-parse">parse</button>
                    <button class="tool-tab"        data-panel="uuid-gen">generate</button>
                </div>

                <!-- Parse -->
                <div class="tool-body panel active" id="uuid-parse">
                    <div class="field">
                        <label>uuid</label>
                        <textarea id="uuid-parse-input"
                            placeholder="01923f9d-4c10-7b9f-9b34-2c1c8a8e9a0d&#10;or 0192...0d&#10;or {01923...0d}&#10;or urn:uuid:01923...0d"></textarea>
                    </div>

                    <div class="actions">
                        <button class="btn btn-primary" id="uuid-parse-btn">parse</button>
                        <button class="btn"            id="uuid-parse-clear">clear</button>
                    </div>

                    <div class="output-wrap">
                        <div class="output" id="uuid-parse-output"></div>
                        <button class="output-copy" data-target="uuid-parse-output">copy</button>
                    </div>
                </div>

                <!-- Generate -->
                <div class="tool-body panel" id="uuid-gen">
                    <div class="seg">
                        <div class="seg-label">version</div>
                        <label><input type="radio" name="uuid-ver" value="4" checked><span>v4 · random</span></label>
                        <label><input type="radio" name="uuid-ver" value="7"><span>v7 · time-ordered</span></label>
                        <label><input type="radio" name="uuid-ver" value="1"><span>v1 · pseudo-MAC</span></label>
                    </div>

                    <div class="field">
                        <label>timestamp (v1 / v7 only — empty = now)</label>
                        <textarea id="uuid-gen-input"
                            placeholder="leave empty for current time&#10;or unix ms / iso 8601 / date string"></textarea>
                    </div>

                    <div class="field">
                        <label>count</label>
                        <input type="number" id="uuid-gen-count" value="1" min="1" max="100">
                    </div>

                    <div class="actions">
                        <button class="btn btn-primary" id="uuid-gen-btn">generate</button>
                        <button class="btn"            id="uuid-gen-clear">clear</button>
                    </div>

                    <div class="output-wrap">
                        <div class="output" id="uuid-gen-output"></div>
                        <button class="output-copy" data-target="uuid-gen-output">copy</button>
                    </div>
                </div>
            </div>

            <details class="ref">
                <summary>uuid versions &amp; layout</summary>
                <div class="ref-body">
                    <table>
                        <tr><th>version</th><th>basis</th><th>timestamp</th><th>note</th></tr>
                        <tr><td><code>v1</code></td><td>time + MAC</td><td>60-bit, 100ns ticks since 1582-10-15</td><td>leaks MAC</td></tr>
                        <tr><td><code>v3</code></td><td>name (MD5)</td><td>—</td><td>deterministic</td></tr>
                        <tr><td><code>v4</code></td><td>random</td><td>—</td><td>most common</td></tr>
                        <tr><td><code>v5</code></td><td>name (SHA-1)</td><td>—</td><td>deterministic</td></tr>
                        <tr><td><code>v6</code></td><td>v1 fields reordered</td><td>same source as v1</td><td>sortable, RFC 9562</td></tr>
                        <tr><td><code>v7</code></td><td>unix ms + random</td><td>48-bit unix ms</td><td>k-sortable, RFC 9562</td></tr>
                        <tr><td><code>v8</code></td><td>custom</td><td>app-defined</td><td>RFC 9562</td></tr>
                    </table>
                    <p style="margin-top: 12px; font-size: 12px; color: var(--fg2);">
                        bit layout: <code>xxxxxxxx-xxxx-Mxxx-Nxxx-xxxxxxxxxxxx</code> — <code>M</code> is the version
                        nibble, the high bits of <code>N</code> encode the variant (10xx for RFC 4122 / 9562).
                    </p>
                    <a href="https://www.rfc-editor.org/rfc/rfc9562.html" target="_blank" class="ref-link">→ rfc 9562 (uuids)</a>
                </div>
            </details>
        `;
    },

    mount() {
        const parseOut = document.getElementById('uuid-parse-output');
        const genOut   = document.getElementById('uuid-gen-output');
        const parseInput = document.getElementById('uuid-parse-input');

        // Parse
        const runParse = () => {
            const input = parseInput.value.trim();
            if (!input) {
                parseOut.innerHTML = '';
                clearError(parseInput);
                return;
            }

            try {
                const r = uuid.parse(input);
                clearError(parseInput);
                const ts  = formatTimestamp(r.timestampMs);
                const age = formatAge(r.timestampMs);

                let extraHtml = '';
                if (r.version === 1 || r.version === 6) {
                    extraHtml = `
                        <div style="margin-bottom: 12px">
                            <div style="color: var(--fg3); font-size: 11px; margin-bottom: 4px">CLOCK SEQ</div>
                            <div>${r.extra.clockSeq} <span style="color: var(--fg3)">(0x${r.extra.clockSeq.toString(16).padStart(4,'0')})</span></div>
                        </div>
                        <div style="margin-bottom: 12px">
                            <div style="color: var(--fg3); font-size: 11px; margin-bottom: 4px">NODE</div>
                            <div style="font-family: var(--font-mono)">${r.extra.node}</div>
                            ${r.version === 1 && r.extra.multicast ? `<div style="color: var(--fg3); font-size: 11px; margin-top: 4px">multicast bit set — likely random pseudo-node, not a real MAC</div>` : ''}
                        </div>`;
                } else if (r.version === 7) {
                    extraHtml = `
                        <div style="margin-bottom: 12px">
                            <div style="color: var(--fg3); font-size: 11px; margin-bottom: 4px">RAND_A · RAND_B</div>
                            <div style="font-family: var(--font-mono)">${r.extra.randA} · ${r.extra.randB}</div>
                        </div>`;
                }

                parseOut.innerHTML = `
                    <div style="margin-bottom: 12px">
                        <div style="color: var(--fg3); font-size: 11px; margin-bottom: 4px">CANONICAL</div>
                        <div style="font-family: var(--font-mono)">${escape(r.canonical)}</div>
                    </div>
                    <div style="margin-bottom: 12px">
                        <div style="color: var(--fg3); font-size: 11px; margin-bottom: 4px">VERSION · VARIANT</div>
                        <div>${escape(r.versionName)}</div>
                        <div style="color: var(--fg2); font-size: 12px">${escape(r.variantName)}</div>
                    </div>
                    ${ts ? `
                    <div style="margin-bottom: 12px">
                        <div style="color: var(--fg3); font-size: 11px; margin-bottom: 4px">TIMESTAMP</div>
                        <div>${ts.iso}</div>
                        <div style="color: var(--fg2); font-size: 12px">${ts.local}</div>
                        <div style="color: var(--fg3); font-size: 11px; margin-top: 4px">${age} · unix ms: ${ts.ms}</div>
                    </div>` : ''}
                    ${extraHtml}
                `;
            } catch (e) {
                parseOut.innerHTML = '';
                setError(parseInput, e.message);
            }
        };

        document.getElementById('uuid-parse-btn').onclick   = runParse;
        document.getElementById('uuid-parse-clear').onclick = () => {
            parseInput.value = '';
            parseOut.innerHTML = '';
            clearError(parseInput);
        };

        // Live: parse on every keystroke (debounced)
        liveBind(parseInput, runParse, 200);

        // Generate
        const runGen = () => {
            const ver = +document.querySelector('input[name="uuid-ver"]:checked').value;
            const tsRaw = document.getElementById('uuid-gen-input').value.trim();
            const count = Math.max(1, Math.min(100,
                parseInt(document.getElementById('uuid-gen-count').value, 10) || 1));

            let timestampMs = null;
            if (tsRaw && (ver === 1 || ver === 7)) {
                if (/^\d+$/.test(tsRaw)) {
                    const n = parseInt(tsRaw, 10);
                    timestampMs = tsRaw.length >= 13 ? n : n * 1000;
                } else {
                    const d = new Date(tsRaw);
                    if (isNaN(d.getTime())) {
                        toast.show('invalid date format');
                        genOut.innerHTML = '';
                        return;
                    }
                    timestampMs = d.getTime();
                }
            }

            const lines = [];
            for (let i = 0; i < count; i++) {
                if (ver === 4)      lines.push(uuid.generateV4());
                else if (ver === 7) lines.push(uuid.generateV7(timestampMs));
                else if (ver === 1) lines.push(uuid.generateV1(timestampMs));
            }
            const note = ver === 1
                ? `<div style="color: var(--fg3); font-size: 11px; margin-bottom: 8px">v1 generated with random pseudo-node (multicast bit set) — does not leak a real MAC</div>`
                : '';
            genOut.innerHTML = note + lines.join('\n').replace(/\n/g, '<br>');
        };

        document.getElementById('uuid-gen-btn').onclick   = runGen;
        document.getElementById('uuid-gen-clear').onclick = () => {
            document.getElementById('uuid-gen-input').value  = '';
            document.getElementById('uuid-gen-count').value  = '1';
            genOut.innerHTML = '';
        };

        // Ctrl+Enter shortcut
        document.getElementById('uuid-parse-input').onkeydown = (e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault(); runParse();
            }
        };
        document.getElementById('uuid-gen-input').onkeydown = (e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault(); runGen();
            }
        };
    },
};

window.registerTool(dataUuid);
