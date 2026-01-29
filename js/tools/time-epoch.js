/**
 * time.epoch - Timestamp converter & formatter
 */

const epoch = {
    parse(input) {
        const s = input.trim();

        // Unix timestamp variations
        if (/^\d+$/.test(s)) {
            const num = s.length <= 10 ? parseInt(s) : BigInt(s);
            if (s.length === 10) return { unix: parseInt(s), ms: parseInt(s) * 1000, type: 'unix seconds' };
            if (s.length === 13) return { unix: Math.floor(parseInt(s) / 1000), ms: parseInt(s), type: 'unix milliseconds' };
            if (s.length === 16) return { unix: Math.floor(Number(num) / 1000000), ms: Math.floor(Number(num) / 1000), type: 'unix microseconds' };
            if (s.length === 19) return { unix: Math.floor(Number(num) / 1000000000), ms: Math.floor(Number(num) / 1000000), type: 'unix nanoseconds' };
        }

        // Floating point unix timestamp
        if (/^\d+\.\d+$/.test(s)) {
            const unix = parseFloat(s);
            return { unix: Math.floor(unix), ms: Math.floor(unix * 1000), type: 'unix seconds (decimal)' };
        }

        // ISO 8601 / RFC 3339
        if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
            const d = new Date(s);
            if (isNaN(d.getTime())) throw new Error('invalid iso date');
            return { unix: Math.floor(d.getTime() / 1000), ms: d.getTime(), type: 'iso 8601' };
        }

        // SQL datetime (YYYY-MM-DD HH:MM:SS)
        if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}/.test(s)) {
            const d = new Date(s.replace(' ', 'T') + 'Z');
            if (isNaN(d.getTime())) throw new Error('invalid sql datetime');
            return { unix: Math.floor(d.getTime() / 1000), ms: d.getTime(), type: 'sql datetime' };
        }

        // RFC 2822 (Tue, 30 Jan 2024 15:00:00 GMT)
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
            const days = parseInt(s);
            const excelEpoch = new Date(1899, 11, 30);
            const ms = excelEpoch.getTime() + (days * 86400000);
            return { unix: Math.floor(ms / 1000), ms, type: 'excel serial date' };
        }

        // Try general Date parsing
        const d = new Date(s);
        if (!isNaN(d.getTime())) {
            return { unix: Math.floor(d.getTime() / 1000), ms: d.getTime(), type: 'date string' };
        }

        throw new Error('unrecognized format');
    },

    format(ms) {
        const unix = Math.floor(ms / 1000);
        const d = new Date(ms);

        // SQL datetime format
        const pad = n => n.toString().padStart(2, '0');
        const sqlDateTime = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
            `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;

        return {
            iso: d.toISOString(),
            rfc2822: d.toUTCString(),
            sql: sqlDateTime,
            unix: unix,
            ms: ms,
            excel: Math.floor((ms - new Date(1899, 11, 30).getTime()) / 86400000),
            local: d.toLocaleString('en-US', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            }),
            offset: -d.getTimezoneOffset() / 60,
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

    // Preset timestamp generators
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

    render() {
        return `
            <div class="tool-title">${this.title}</div>

            <div class="tool">
                <div class="tool-tabs">
                    <button class="tool-tab active" data-panel="parse-timestamp">parse</button>
                    <button class="tool-tab" data-panel="generate-timestamp">generate</button>
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
                        <label><button class="btn" data-preset="now">now</button></label>
                        <label><button class="btn" data-preset="yesterday">yesterday</button></label>
                        <label><button class="btn" data-preset="lastWeek">last week</button></label>
                        <label><button class="btn" data-preset="tomorrow">tomorrow</button></label>
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

        // Parse timestamp
        document.getElementById('parse-timestamp-btn').onclick = () => {
            const input = document.getElementById('parse-timestamp-input').value.trim();
            if (!input) {
                parseOut.innerHTML = '';
                return;
            }

            try {
                const parsed = epoch.parse(input);
                const fmt = epoch.format(parsed.ms);

                parseOut.innerHTML = `
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
                        <div style="color: var(--fg3); font-size: 11px; margin-bottom: 4px">LOCAL TIME</div>
                        <div>${fmt.local}</div>
                        <div style="color: var(--fg3); font-size: 11px; margin-top: 4px">UTC${fmt.offset >= 0 ? '+' : ''}${fmt.offset}</div>
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
            } catch (e) {
                parseOut.innerHTML = `<div style="color: var(--fg3)">${e.message}</div>`;
            }
        };

        // Generate timestamp
        document.getElementById('generate-timestamp-btn').onclick = () => {
            const input = document.getElementById('generate-timestamp-input').value.trim();
            let ms;

            if (input) {
                try {
                    const d = new Date(input);
                    if (isNaN(d.getTime())) throw new Error('invalid date');
                    ms = d.getTime();
                } catch (e) {
                    genOut.innerHTML = `<div style="color: var(--fg3)">invalid date format</div>`;
                    return;
                }
            } else {
                ms = Date.now();
            }

            const fmt = epoch.format(ms);

            genOut.innerHTML = `
                <div style="margin-bottom: 12px">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px">
                        <div style="color: var(--fg3); font-size: 11px">UNIX (SECONDS)</div>
                        <button class="output-copy" onclick="navigator.clipboard.writeText('${fmt.unix}'); toast.show('copied')" style="position: static; padding: 2px 8px">copy</button>
                    </div>
                    <div>${fmt.unix}</div>
                </div>
                <div style="margin-bottom: 12px">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px">
                        <div style="color: var(--fg3); font-size: 11px">MILLISECONDS</div>
                        <button class="output-copy" onclick="navigator.clipboard.writeText('${fmt.ms}'); toast.show('copied')" style="position: static; padding: 2px 8px">copy</button>
                    </div>
                    <div>${fmt.ms}</div>
                </div>
                <div style="margin-bottom: 12px">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px">
                        <div style="color: var(--fg3); font-size: 11px">ISO 8601</div>
                        <button class="output-copy" onclick="navigator.clipboard.writeText('${fmt.iso}'); toast.show('copied')" style="position: static; padding: 2px 8px">copy</button>
                    </div>
                    <div>${fmt.iso}</div>
                </div>
                <div style="margin-bottom: 12px">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px">
                        <div style="color: var(--fg3); font-size: 11px">RFC 2822</div>
                        <button class="output-copy" onclick="navigator.clipboard.writeText('${fmt.rfc2822}'); toast.show('copied')" style="position: static; padding: 2px 8px">copy</button>
                    </div>
                    <div>${fmt.rfc2822}</div>
                </div>
                <div style="margin-bottom: 12px">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px">
                        <div style="color: var(--fg3); font-size: 11px">SQL DATETIME</div>
                        <button class="output-copy" onclick="navigator.clipboard.writeText('${fmt.sql}'); toast.show('copied')" style="position: static; padding: 2px 8px">copy</button>
                    </div>
                    <div>${fmt.sql}</div>
                </div>
                <div>
                    <div style="color: var(--fg3); font-size: 11px; margin-bottom: 4px">RELATIVE</div>
                    <div style="color: var(--fg2); font-size: 12px">${fmt.relative}</div>
                </div>
            `;
        };

        // Preset buttons
        document.querySelectorAll('[data-preset]').forEach(btn => {
            btn.onclick = () => {
                const preset = btn.dataset.preset;
                const ms = epoch.presets[preset]();
                document.getElementById('generate-timestamp-input').value = '';
                const fmt = epoch.format(ms);
                genOut.innerHTML = `
                    <div style="margin-bottom: 12px">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px">
                            <div style="color: var(--fg3); font-size: 11px">UNIX (SECONDS)</div>
                            <button class="output-copy" onclick="navigator.clipboard.writeText('${fmt.unix}'); toast.show('copied')" style="position: static; padding: 2px 8px">copy</button>
                        </div>
                        <div>${fmt.unix}</div>
                    </div>
                    <div style="margin-bottom: 12px">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px">
                            <div style="color: var(--fg3); font-size: 11px">MILLISECONDS</div>
                            <button class="output-copy" onclick="navigator.clipboard.writeText('${fmt.ms}'); toast.show('copied')" style="position: static; padding: 2px 8px">copy</button>
                        </div>
                        <div>${fmt.ms}</div>
                    </div>
                    <div style="margin-bottom: 12px">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px">
                            <div style="color: var(--fg3); font-size: 11px">ISO 8601</div>
                            <button class="output-copy" onclick="navigator.clipboard.writeText('${fmt.iso}'); toast.show('copied')" style="position: static; padding: 2px 8px">copy</button>
                        </div>
                        <div>${fmt.iso}</div>
                    </div>
                    <div style="margin-bottom: 12px">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px">
                            <div style="color: var(--fg3); font-size: 11px">RFC 2822</div>
                            <button class="output-copy" onclick="navigator.clipboard.writeText('${fmt.rfc2822}'); toast.show('copied')" style="position: static; padding: 2px 8px">copy</button>
                        </div>
                        <div>${fmt.rfc2822}</div>
                    </div>
                    <div style="margin-bottom: 12px">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px">
                            <div style="color: var(--fg3); font-size: 11px">SQL DATETIME</div>
                            <button class="output-copy" onclick="navigator.clipboard.writeText('${fmt.sql}'); toast.show('copied')" style="position: static; padding: 2px 8px">copy</button>
                        </div>
                        <div>${fmt.sql}</div>
                    </div>
                    <div>
                        <div style="color: var(--fg3); font-size: 11px; margin-bottom: 4px">RELATIVE</div>
                        <div style="color: var(--fg2); font-size: 12px">${fmt.relative}</div>
                    </div>
                `;
            };
        });

        // Clear buttons
        document.getElementById('parse-timestamp-clear').onclick = () => {
            document.getElementById('parse-timestamp-input').value = '';
            parseOut.innerHTML = '';
        };

        document.getElementById('generate-timestamp-clear').onclick = () => {
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
