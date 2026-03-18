/**
 * mongo.objectid - MongoDB ObjectId parser & generator
 */

const objectid = {
    isValid(id) {
        return /^[0-9a-f]{24}$/i.test(id?.toString().trim());
    },

    getTimestamp(id) {
        if (!this.isValid(id)) throw new Error('invalid objectid');
        const hex = id.toString().trim().substring(0, 8);
        return parseInt(hex, 16);
    },

    parse(id) {
        if (!this.isValid(id)) throw new Error('invalid objectid');
        const s = id.toString().trim();
        const timestamp = parseInt(s.substring(0, 8), 16);
        const random = s.substring(8, 18);
        const counter = parseInt(s.substring(18, 24), 16);
        return { timestamp, random, counter };
    },

    generate(timestamp) {
        const ts = timestamp ? Math.floor(timestamp / 1000) : Math.floor(Date.now() / 1000);
        const hex = ts.toString(16).padStart(8, '0');
        const entropy = new Uint8Array(8);
        if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
            crypto.getRandomValues(entropy);
        } else {
            for (let i = 0; i < entropy.length; i++) {
                entropy[i] = Math.floor(Math.random() * 256);
            }
        }

        const random = Array.from(entropy.slice(0, 5), b => b.toString(16).padStart(2, '0')).join('');
        const counter = ((entropy[5] << 16) | (entropy[6] << 8) | entropy[7]).toString(16).padStart(6, '0');
        return hex + random + counter;
    },

    formatTimestamp(ts) {
        const d = new Date(ts * 1000);
        const iso = d.toISOString();
        const local = d.toLocaleString('en-US', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
        return { iso, local, unix: ts };
    },

    getAge(id) {
        const ts = this.getTimestamp(id);
        const now = Math.floor(Date.now() / 1000);
        const diff = now - ts;
        if (diff < 60) return `${diff}s ago`;
        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
        return `${Math.floor(diff / 86400)}d ago`;
    }
};

// Tool definition
const mongoObjectId = {
    id: 'mongo.objectid',
    title: 'MongoDB ObjectId Parser & Generator',

    render() {
        return `
            <div class="tool-title">${this.title}</div>
            <div class="tool-desc">extract timestamp and structure from objectids, or generate new ones</div>

            <div class="tool">
                <div class="tool-tabs">
                    <button class="tool-tab active" data-panel="parse">parse</button>
                    <button class="tool-tab" data-panel="generate">generate</button>
                </div>

                <!-- Parse Panel -->
                <div class="tool-body panel active" id="parse">
                    <div class="field">
                        <label>objectid</label>
                        <textarea id="parse-input" placeholder="507f1f77bcf86cd799439011"></textarea>
                    </div>

                    <div class="actions">
                        <button class="btn btn-primary" id="parse-btn">parse</button>
                        <button class="btn" id="parse-clear">clear</button>
                    </div>

                    <div class="output-wrap">
                        <div class="output" id="parse-output"></div>
                        <button class="output-copy" data-target="parse-output">copy</button>
                    </div>
                </div>

                <!-- Generate Panel -->
                <div class="tool-body panel" id="generate">
                    <div class="field">
                        <label>timestamp (optional)</label>
                        <textarea id="generate-input" placeholder="leave empty for current time&#10;or enter: unix timestamp, iso date, or date string"></textarea>
                    </div>

                    <div class="actions">
                        <button class="btn btn-primary" id="generate-btn">generate</button>
                        <button class="btn" id="generate-clear">clear</button>
                    </div>

                    <div class="output-wrap">
                        <div class="output" id="generate-output"></div>
                        <button class="output-copy" data-target="generate-output">copy</button>
                    </div>
                </div>
            </div>

            <details class="ref">
                <summary>objectid structure</summary>
                <div class="ref-body">
                    <table>
                        <tr><th>bytes</th><th>field</th><th>description</th></tr>
                        <tr><td><code>0-3</code></td><td>timestamp</td><td>unix epoch seconds</td></tr>
                        <tr><td><code>4-8</code></td><td>random</td><td>random value (process id + machine id)</td></tr>
                        <tr><td><code>9-11</code></td><td>counter</td><td>incrementing counter</td></tr>
                    </table>
                    <p style="margin-top: 12px; font-size: 12px; color: var(--fg2);">
                        ObjectIds are 12-byte values (24 hex characters) designed to be globally unique.
                        The embedded timestamp allows sorting by creation time and extracting creation date.
                    </p>
                    <a href="https://www.mongodb.com/docs/manual/reference/method/ObjectId/" target="_blank" class="ref-link">→ mongodb docs</a>
                </div>
            </details>
        `;
    },

    mount() {
        const parseOut = document.getElementById('parse-output');
        const genOut = document.getElementById('generate-output');

        // Parse ObjectId
        document.getElementById('parse-btn').onclick = () => {
            const input = document.getElementById('parse-input').value.trim();
            if (!input) {
                parseOut.innerHTML = '';
                return;
            }

            try {
                const parsed = objectid.parse(input);
                const time = objectid.formatTimestamp(parsed.timestamp);
                const age = objectid.getAge(input);

                parseOut.innerHTML = `
                    <div style="margin-bottom: 12px">
                        <div style="color: var(--fg3); font-size: 11px; margin-bottom: 4px">TIMESTAMP</div>
                        <div>${time.iso}</div>
                        <div style="color: var(--fg2); font-size: 12px">${time.local}</div>
                        <div style="color: var(--fg3); font-size: 11px; margin-top: 4px">${age} · unix: ${time.unix}</div>
                    </div>
                    <div style="margin-bottom: 12px">
                        <div style="color: var(--fg3); font-size: 11px; margin-bottom: 4px">RANDOM</div>
                        <div style="font-family: monospace">${parsed.random}</div>
                    </div>
                    <div>
                        <div style="color: var(--fg3); font-size: 11px; margin-bottom: 4px">COUNTER</div>
                        <div>${parsed.counter} <span style="color: var(--fg3)">(0x${parsed.counter.toString(16)})</span></div>
                    </div>
                `;
            } catch (e) {
                parseOut.innerHTML = `<div style="color: var(--fg3)">${e.message}</div>`;
            }
        };

        // Generate ObjectId
        document.getElementById('generate-btn').onclick = () => {
            const input = document.getElementById('generate-input').value.trim();
            let timestamp = null;

            if (input) {
                try {
                    const d = new Date(input);
                    if (isNaN(d.getTime())) {
                        const unix = parseInt(input, 10);
                        if (isNaN(unix)) throw new Error('invalid date/timestamp');
                        timestamp = unix * 1000;
                    } else {
                        timestamp = d.getTime();
                    }
                } catch (e) {
                    genOut.textContent = '';
                    toast.show('invalid date format');
                    return;
                }
            }

            const oid = objectid.generate(timestamp);
            genOut.textContent = oid;
        };

        // Clear buttons
        document.getElementById('parse-clear').onclick = () => {
            document.getElementById('parse-input').value = '';
            parseOut.innerHTML = '';
        };

        document.getElementById('generate-clear').onclick = () => {
            document.getElementById('generate-input').value = '';
            genOut.textContent = '';
        };

        // Keyboard shortcuts
        document.getElementById('parse-input').onkeydown = (e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                document.getElementById('parse-btn').click();
            }
        };

        document.getElementById('generate-input').onkeydown = (e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                document.getElementById('generate-btn').click();
            }
        };
    }
};

// Register tool
window.registerTool(mongoObjectId);
