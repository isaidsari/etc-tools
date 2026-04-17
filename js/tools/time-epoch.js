/**
 * time.epoch - Timestamp converter & formatter
 */

const TZ_OPTIONS = [
    { label: 'browser local', value: '' },
    { label: 'UTC', value: 'UTC' },
    { label: 'America/New_York', value: 'America/New_York' },
    { label: 'America/Chicago', value: 'America/Chicago' },
    { label: 'America/Los_Angeles', value: 'America/Los_Angeles' },
    { label: 'America/Sao_Paulo', value: 'America/Sao_Paulo' },
    { label: 'Europe/London', value: 'Europe/London' },
    { label: 'Europe/Paris', value: 'Europe/Paris' },
    { label: 'Europe/Istanbul', value: 'Europe/Istanbul' },
    { label: 'Africa/Cairo', value: 'Africa/Cairo' },
    { label: 'Asia/Dubai', value: 'Asia/Dubai' },
    { label: 'Asia/Kolkata', value: 'Asia/Kolkata' },
    { label: 'Asia/Bangkok', value: 'Asia/Bangkok' },
    { label: 'Asia/Singapore', value: 'Asia/Singapore' },
    { label: 'Asia/Tokyo', value: 'Asia/Tokyo' },
    { label: 'Asia/Seoul', value: 'Asia/Seoul' },
    { label: 'Australia/Sydney', value: 'Australia/Sydney' },
];

// Excel treats 1900-01-00 as day 0 and (wrongly) includes 1900-02-29, making
// 1899-12-30 UTC the effective epoch. Must be UTC — using `new Date(1899, 11, 30)`
// anchors to the browser timezone and skews the day count on either side of midnight.
const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);

const epoch = {
    parse(input) {
        const s = input.trim();
        const toSafeNumber = (n, label) => {
            const max = BigInt(Number.MAX_SAFE_INTEGER);
            const min = BigInt(Number.MIN_SAFE_INTEGER);
            if (n > max || n < min) throw new Error(`${label} out of safe range`);
            return Number(n);
        };

        // Unix timestamp variations
        if (/^\d+$/.test(s)) {
            const num = s.length <= 13 ? parseInt(s, 10) : BigInt(s);
            if (s.length === 10) return { unix: parseInt(s, 10), ms: parseInt(s, 10) * 1000, type: 'unix seconds' };
            if (s.length === 13) return { unix: Math.floor(parseInt(s, 10) / 1000), ms: parseInt(s, 10), type: 'unix milliseconds' };
            if (s.length === 16) {
                const unix = toSafeNumber(num / 1000000n, 'unix timestamp');
                const ms = toSafeNumber(num / 1000n, 'milliseconds');
                return { unix, ms, type: 'unix microseconds' };
            }
            if (s.length === 19) {
                const unix = toSafeNumber(num / 1000000000n, 'unix timestamp');
                const ms = toSafeNumber(num / 1000000n, 'milliseconds');
                return { unix, ms, type: 'unix nanoseconds' };
            }
        }

        // Floating point unix timestamp
        if (/^\d+\.\d+$/.test(s)) {
            const unix = parseFloat(s);
            return { unix: Math.floor(unix), ms: Math.floor(unix * 1000), type: 'unix seconds (decimal)' };
        }

        // SQL datetime (YYYY-MM-DD HH:MM:SS) — checked before ISO so the space-separated
        // form is treated as UTC rather than being handed to the ISO branch which lets
        // `new Date` interpret it as browser-local.
        if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}/.test(s)) {
            const d = new Date(s.replace(' ', 'T') + 'Z');
            if (isNaN(d.getTime())) throw new Error('invalid sql datetime');
            return { unix: Math.floor(d.getTime() / 1000), ms: d.getTime(), type: 'sql datetime' };
        }

        // ISO 8601 / RFC 3339
        if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
            const d = new Date(s);
            if (isNaN(d.getTime())) throw new Error('invalid iso date');
            return { unix: Math.floor(d.getTime() / 1000), ms: d.getTime(), type: 'iso 8601' };
        }

        // RFC 2822
        if (/^\w{3},\s+\d{1,2}\s+\w{3}\s+\d{4}/.test(s)) {
            const d = new Date(s);
            if (isNaN(d.getTime())) throw new Error('invalid rfc 2822');
            return { unix: Math.floor(d.getTime() / 1000), ms: d.getTime(), type: 'rfc 2822' };
        }

        // MongoDB ISODate("...")
        const mongoMatch = s.match(/ISODate\s*\(\s*["']([^"']+)["']\s*\)/i);
        if (mongoMatch) {
            const d = new Date(mongoMatch[1]);
            if (isNaN(d.getTime())) throw new Error('invalid mongodb isodate');
            return { unix: Math.floor(d.getTime() / 1000), ms: d.getTime(), type: 'mongodb isodate' };
        }

        // Excel serial date (5 digits)
        if (/^\d{5}$/.test(s)) {
            const days = parseInt(s, 10);
            const ms = EXCEL_EPOCH_MS + (days * 86400000);
            return { unix: Math.floor(ms / 1000), ms, type: 'excel serial date' };
        }

        // Try general Date parsing
        const d = new Date(s);
        if (!isNaN(d.getTime())) {
            return { unix: Math.floor(d.getTime() / 1000), ms: d.getTime(), type: 'date string' };
        }

        throw new Error('unrecognized format');
    },

    format(ms, tz) {
        const unix = Math.floor(ms / 1000);
        const d = new Date(ms);
        const timeZone = tz || Intl.DateTimeFormat().resolvedOptions().timeZone;

        const pad = n => n.toString().padStart(2, '0');
        const sqlDateTime = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
            `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;

        const local = d.toLocaleString('en-US', {
            timeZone,
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            hour12: false
        });

        const tzName = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'short' })
            .formatToParts(d)
            .find(p => p.type === 'timeZoneName')?.value || timeZone;

        return {
            iso: d.toISOString(),
            rfc2822: d.toUTCString(),
            sql: sqlDateTime,
            unix,
            ms,
            excel: Math.floor((ms - EXCEL_EPOCH_MS) / 86400000),
            local,
            tzName,
            relative: this.relative(unix)
        };
    },

    relative(unix) {
        const now = Math.floor(Date.now() / 1000);
        const diff = now - unix;
        const absDiff = Math.abs(diff);
        const future = diff < 0;
        if (absDiff < 1) return 'now';
        if (absDiff < 60) return `${absDiff}s ${future ? 'from now' : 'ago'}`;
        if (absDiff < 3600) return `${Math.floor(absDiff / 60)}m ${future ? 'from now' : 'ago'}`;
        if (absDiff < 86400) return `${Math.floor(absDiff / 3600)}h ${future ? 'from now' : 'ago'}`;
        if (absDiff < 2592000) return `${Math.floor(absDiff / 86400)}d ${future ? 'from now' : 'ago'}`;
        if (absDiff < 31536000) return `${Math.floor(absDiff / 2592000)}mo ${future ? 'from now' : 'ago'}`;
        return `${Math.floor(absDiff / 31536000)}y ${future ? 'from now' : 'ago'}`;
    },

    presets: {
        now: () => Date.now(),
        yesterday: () => Date.now() - 86400000,
        lastWeek: () => Date.now() - (7 * 86400000),
        tomorrow: () => Date.now() + 86400000,
        nextWeek: () => Date.now() + (7 * 86400000)
    }
};

// Tool definition
const timeEpoch = {
    id: 'time.epoch',
    title: 'Timestamp Converter & Formatter',
    _liveInterval: null,

    _getSelectedTz() {
        return document.getElementById('tz-select')?.value || null;
    },

    _renderParseOutput(parsed, fmt, container) {
        container.innerHTML = `
            <div style="margin-bottom: 12px">
                <div style="color: var(--fg3); font-size: 11px; margin-bottom: 4px">INPUT TYPE</div>
                <div style="color: var(--fg2); font-size: 12px">${parsed.type}</div>
            </div>
            <div style="margin-bottom: 12px">
                <div style="color: var(--fg3); font-size: 11px; margin-bottom: 4px">ISO 8601</div>
                <div>${fmt.iso}</div>
            </div>
            <div style="margin-bottom: 12px">
                <div style="color: var(--fg3); font-size: 11px; margin-bottom: 4px">RFC 2822</div>
                <div>${fmt.rfc2822}</div>
            </div>
            <div style="margin-bottom: 12px">
                <div style="color: var(--fg3); font-size: 11px; margin-bottom: 4px">SQL DATETIME</div>
                <div>${fmt.sql}</div>
            </div>
            <div style="margin-bottom: 12px">
                <div style="color: var(--fg3); font-size: 11px; margin-bottom: 4px">LOCAL TIME (${fmt.tzName})</div>
                <div>${fmt.local}</div>
            </div>
            <div style="margin-bottom: 12px">
                <div style="color: var(--fg3); font-size: 11px; margin-bottom: 4px">UNIX TIMESTAMP</div>
                <div>${fmt.unix} <span style="color: var(--fg3)">seconds</span></div>
                <div style="color: var(--fg2); font-size: 12px">${fmt.ms} <span style="color: var(--fg3)">milliseconds</span></div>
            </div>
            <div style="margin-bottom: 12px">
                <div style="color: var(--fg3); font-size: 11px; margin-bottom: 4px">EXCEL SERIAL DATE</div>
                <div>${fmt.excel}</div>
            </div>
            <div>
                <div style="color: var(--fg3); font-size: 11px; margin-bottom: 4px">RELATIVE</div>
                <div>${fmt.relative}</div>
            </div>
        `;
    },

    _renderGenOutput(ms, container) {
        const tz = this._getSelectedTz();
        const fmt = epoch.format(ms, tz);
        const rows = [
            { label: 'UNIX (SECONDS)', val: String(fmt.unix) },
            { label: 'MILLISECONDS', val: String(fmt.ms) },
            { label: 'ISO 8601', val: fmt.iso },
            { label: 'RFC 2822', val: fmt.rfc2822 },
            { label: 'SQL DATETIME', val: fmt.sql },
            { label: `LOCAL (${fmt.tzName})`, val: fmt.local },
        ];

        container.innerHTML = rows.map((r, i) => `
            <div style="margin-bottom: 12px">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px">
                    <div style="color: var(--fg3); font-size: 11px">${r.label}</div>
                    <button class="output-copy gen-copy" data-idx="${i}" style="position: static; padding: 2px 8px">copy</button>
                </div>
                <div>${r.val}</div>
            </div>
        `).join('') + `
            <div>
                <div style="color: var(--fg3); font-size: 11px; margin-bottom: 4px">RELATIVE</div>
                <div style="color: var(--fg2); font-size: 12px">${fmt.relative}</div>
            </div>
        `;

        container.querySelectorAll('.gen-copy').forEach(btn => {
            const val = rows[parseInt(btn.dataset.idx)].val;
            btn.onclick = async (e) => {
                e.stopPropagation();
                try {
                    await navigator.clipboard.writeText(val);
                    toast.show('copied');
                } catch { toast.show('failed'); }
            };
        });
    },

    _startLive(container) {
        this._stopLive();
        const liveBtn = document.getElementById('live-btn');
        if (liveBtn) {
            liveBtn.textContent = 'stop';
            liveBtn.classList.add('btn-primary');
        }
        const update = () => this._renderGenOutput(Date.now(), container);
        update();
        this._liveInterval = setInterval(update, 1000);
    },

    _stopLive() {
        if (this._liveInterval) {
            clearInterval(this._liveInterval);
            this._liveInterval = null;
        }
        const liveBtn = document.getElementById('live-btn');
        if (liveBtn) {
            liveBtn.textContent = 'live';
            liveBtn.classList.remove('btn-primary');
        }
    },

    unmount() {
        this._stopLive();
    },

    render() {
        const savedTz = localStorage.getItem('etc.tz') ?? '';
        const tzOptions = TZ_OPTIONS.map(t =>
            `<option value="${t.value}"${t.value === savedTz ? ' selected' : ''}>${t.label}</option>`
        ).join('');

        return `
            <div class="tool-title">${this.title}</div>
            <div class="tool-desc">parse and convert timestamps between formats</div>

            <div class="tool">
                <div class="tool-tabs">
                    <button class="tool-tab active" data-panel="parse-timestamp">parse</button>
                    <button class="tool-tab" data-panel="generate-timestamp">generate</button>
                    <select id="tz-select" class="tz-select">${tzOptions}</select>
                </div>

                <!-- Parse Panel -->
                <div class="tool-body panel active" id="parse-timestamp">
                    <div class="field">
                        <label>timestamp</label>
                        <textarea id="parse-timestamp-input" placeholder="1706626800 (unix)&#10;1706626800000 (ms)&#10;2024-01-30T15:00:00Z (iso)&#10;2024-01-30 15:00:00 (sql)&#10;Tue, 30 Jan 2024 15:00:00 GMT (rfc)&#10;ISODate(&quot;2024-01-30T15:00:00Z&quot;) (mongodb)"></textarea>
                    </div>

                    <div class="actions">
                        <button class="btn btn-primary" id="parse-timestamp-btn">parse</button>
                        <button class="btn" id="parse-timestamp-clear">clear</button>
                    </div>

                    <div class="output-wrap">
                        <div class="output" id="parse-timestamp-output"></div>
                        <button class="output-copy" data-target="parse-timestamp-output">copy</button>
                    </div>
                </div>

                <!-- Generate Panel -->
                <div class="tool-body panel" id="generate-timestamp">
                    <div class="field">
                        <label>date/time (optional)</label>
                        <textarea id="generate-timestamp-input" placeholder="Leave empty for current time&#10;or enter: 2024-01-30 15:00:00"></textarea>
                    </div>

                    <div class="seg">
                        <span class="seg-label">presets</span>
                        <button class="btn" data-preset="now">now</button>
                        <button class="btn" data-preset="yesterday">yesterday</button>
                        <button class="btn" data-preset="lastWeek">last week</button>
                        <button class="btn" data-preset="tomorrow">tomorrow</button>
                        <button class="btn" id="live-btn">live</button>
                    </div>

                    <div class="actions">
                        <button class="btn btn-primary" id="generate-timestamp-btn">generate</button>
                        <button class="btn" id="generate-timestamp-clear">clear</button>
                    </div>

                    <div class="output-wrap">
                        <div class="output" id="generate-timestamp-output"></div>
                    </div>
                </div>
            </div>

            <details class="ref">
                <summary>format reference</summary>
                <div class="ref-body">
                    <table>
                        <tr><th>format</th><th>example</th><th>description</th></tr>
                        <tr><td><code>unix</code></td><td>1706626800</td><td>seconds since epoch (10 digits)</td></tr>
                        <tr><td><code>milliseconds</code></td><td>1706626800000</td><td>milliseconds since epoch (13 digits)</td></tr>
                        <tr><td><code>microseconds</code></td><td>1706626800000000</td><td>microseconds since epoch (16 digits)</td></tr>
                        <tr><td><code>nanoseconds</code></td><td>1706626800000000000</td><td>nanoseconds since epoch (19 digits)</td></tr>
                        <tr><td><code>iso 8601</code></td><td>2024-01-30T15:00:00.000Z</td><td>international standard</td></tr>
                        <tr><td><code>rfc 2822</code></td><td>Tue, 30 Jan 2024 15:00:00 GMT</td><td>email/http headers</td></tr>
                        <tr><td><code>sql datetime</code></td><td>2024-01-30 15:00:00</td><td>mysql/postgres format</td></tr>
                        <tr><td><code>mongodb</code></td><td>ISODate("2024-01-30T15:00:00Z")</td><td>mongodb shell format</td></tr>
                        <tr><td><code>excel serial</code></td><td>45000</td><td>days since dec 30, 1899</td></tr>
                    </table>
                    <p style="margin-top: 12px; font-size: 12px; color: var(--fg2);">
                        Parser auto-detects format. Supports unix (seconds/ms/µs/ns), ISO 8601, RFC 2822, SQL datetime, MongoDB ISODate, Excel serial, and decimal unix timestamps.
                    </p>
                    <a href="https://en.wikipedia.org/wiki/Unix_time" target="_blank" class="ref-link">→ unix time on wikipedia</a>
                </div>
            </details>
        `;
    },

    mount() {
        const parseOut = document.getElementById('parse-timestamp-output');
        const genOut = document.getElementById('generate-timestamp-output');
        let lastParsed = null;

        // Parse timestamp
        const runParse = () => {
            const input = document.getElementById('parse-timestamp-input').value.trim();
            if (!input) { parseOut.innerHTML = ''; lastParsed = null; return; }
            try {
                lastParsed = epoch.parse(input);
                const fmt = epoch.format(lastParsed.ms, this._getSelectedTz());
                this._renderParseOutput(lastParsed, fmt, parseOut);
            } catch (e) {
                lastParsed = null;
                parseOut.innerHTML = `<div style="color: var(--fg3)">${e.message}</div>`;
            }
        };

        document.getElementById('parse-timestamp-btn').onclick = runParse;

        // Timezone change → persist selection and re-render outputs
        document.getElementById('tz-select').onchange = () => {
            localStorage.setItem('etc.tz', this._getSelectedTz() ?? '');
            if (lastParsed) {
                const fmt = epoch.format(lastParsed.ms, this._getSelectedTz());
                this._renderParseOutput(lastParsed, fmt, parseOut);
            }
            if (this._liveInterval) this._renderGenOutput(Date.now(), genOut);
        };

        // Generate timestamp
        document.getElementById('generate-timestamp-btn').onclick = () => {
            this._stopLive();
            const input = document.getElementById('generate-timestamp-input').value.trim();
            let ms;
            if (input) {
                try {
                    const d = new Date(input);
                    if (isNaN(d.getTime())) throw new Error('invalid date');
                    ms = d.getTime();
                } catch {
                    genOut.innerHTML = `<div style="color: var(--fg3)">invalid date format</div>`;
                    return;
                }
            } else {
                ms = Date.now();
            }
            this._renderGenOutput(ms, genOut);
        };

        // Preset buttons
        document.querySelectorAll('[data-preset]').forEach(btn => {
            btn.onclick = () => {
                this._stopLive();
                document.getElementById('generate-timestamp-input').value = '';
                this._renderGenOutput(epoch.presets[btn.dataset.preset](), genOut);
            };
        });

        // Live clock button
        document.getElementById('live-btn').onclick = () => {
            if (this._liveInterval) {
                this._stopLive();
            } else {
                document.getElementById('generate-timestamp-input').value = '';
                this._startLive(genOut);
            }
        };

        // Clear buttons
        document.getElementById('parse-timestamp-clear').onclick = () => {
            document.getElementById('parse-timestamp-input').value = '';
            parseOut.innerHTML = '';
            lastParsed = null;
        };

        document.getElementById('generate-timestamp-clear').onclick = () => {
            this._stopLive();
            document.getElementById('generate-timestamp-input').value = '';
            genOut.innerHTML = '';
        };

        // Keyboard shortcuts
        document.getElementById('parse-timestamp-input').onkeydown = (e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                document.getElementById('parse-timestamp-btn').click();
            }
        };

        document.getElementById('generate-timestamp-input').onkeydown = (e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                document.getElementById('generate-timestamp-btn').click();
            }
        };
    }
};

// Register tool
window.registerTool(timeEpoch);
