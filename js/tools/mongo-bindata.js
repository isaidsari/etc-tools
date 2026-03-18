/**
 * mongo.bindata - MongoDB BinData/UUID converter
 */

const bindata = {
    // Legacy UUID byte orderings for subtype 3
    enc: {
        csharp: {
            to: b => new Uint8Array([b[3], b[2], b[1], b[0], b[5], b[4], b[7], b[6], ...b.slice(8)]),
            from: b => new Uint8Array([b[3], b[2], b[1], b[0], b[5], b[4], b[7], b[6], ...b.slice(8)])
        },
        java: {
            to: b => new Uint8Array([b[7], b[6], b[5], b[4], b[3], b[2], b[1], b[0], b[15], b[14], b[13], b[12], b[11], b[10], b[9], b[8]]),
            from: b => new Uint8Array([b[7], b[6], b[5], b[4], b[3], b[2], b[1], b[0], b[15], b[14], b[13], b[12], b[11], b[10], b[9], b[8]])
        },
        python: { to: b => b, from: b => b }
    },

    parse(s) {
        s = s.trim();
        let m;
        if ((m = s.match(/BinData\s*\(\s*(\d+)\s*,\s*["']([^"']+)["']\s*\)/i)))
            return { sub: +m[1], b64: m[2] };
        if ((m = s.match(/Binary\.createFromBase64\s*\(\s*["']([^"']+)["']\s*,\s*(\d+)\s*\)/i)))
            return { sub: +m[2], b64: m[1] };
        if ((m = s.match(/UUID\s*\(\s*["']([^"']+)["']\s*\)/i)))
            return { sub: 4, b64: this.toB64(this.uuidToBytes(m[1])) };
        if (/^[A-Za-z0-9+/]+=*$/.test(s) && s.length >= 4)
            return { sub: null, b64: s };
        throw new Error('invalid format');
    },

    toBytes(b64) {
        try {
            return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
        } catch {
            throw new Error('invalid base64');
        }
    },

    toB64(bytes) {
        // Chunk conversion to avoid argument length limits on large inputs.
        let binary = '';
        const chunkSize = 0x8000;
        for (let i = 0; i < bytes.length; i += chunkSize) {
            const chunk = bytes.subarray(i, i + chunkSize);
            binary += String.fromCharCode(...chunk);
        }
        return btoa(binary);
    },

    toHex: bytes => [...bytes].map(b => b.toString(16).padStart(2, '0')).join(''),

    fromHex(hex) {
        const h = hex.replace(/\s/g, '');
        if (h.length % 2) throw new Error('invalid hex');
        if (h && !/^[0-9a-f]+$/i.test(h)) throw new Error('invalid hex');
        return new Uint8Array(h.match(/.{2}/g).map(b => parseInt(b, 16)));
    },

    toUuid(b) {
        const h = this.toHex(b);
        return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
    },

    uuidToBytes(u) {
        const h = u.replace(/-/g, '');
        if (h.length !== 32 || !/^[0-9a-f]+$/i.test(h)) throw new Error('invalid uuid');
        return this.fromHex(h);
    },

    isUuid: s => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s),

    decode(input, sub, enc) {
        const p = this.parse(input);
        const bytes = this.toBytes(p.b64);
        const st = sub === 'auto' ? p.sub : +sub;

        if (st === 3 && bytes.length === 16) {
            const e = this.enc[enc] || this.enc.csharp;
            return { val: this.toUuid(e.to(bytes)), type: `legacy uuid (${enc})`, len: 16 };
        }
        if (st === 4 && bytes.length === 16) {
            return { val: this.toUuid(bytes), type: 'uuid', len: 16 };
        }
        if (bytes.length === 16 && st == null) {
            return { val: this.toUuid(bytes), type: 'uuid (guessed)', len: 16 };
        }
        return { val: this.toHex(bytes), type: `subtype ${st ?? '?'}`, len: bytes.length };
    },

    encode(input, sub, fmt, enc) {
        const s = input.trim();
        let bytes;

        if (this.isUuid(s)) {
            const ub = this.uuidToBytes(s);
            bytes = +sub === 3 ? (this.enc[enc] || this.enc.csharp).from(ub) : ub;
        } else if (/^[0-9a-f\s]+$/i.test(s)) {
            bytes = this.fromHex(s);
        } else if (/^[A-Za-z0-9+/]+=*$/.test(s)) {
            bytes = this.toBytes(s);
        } else {
            bytes = new TextEncoder().encode(s);
        }

        const b64 = this.toB64(bytes);
        if (fmt === 'bindata') return `BinData(${sub}, "${b64}")`;
        if (fmt === 'binary') return `Binary.createFromBase64("${b64}", ${sub})`;
        return b64;
    }
};

// Tool definition
const mongoBindata = {
    id: 'mongo.bindata',
    title: 'MongoDB BinData / UUID Converter',

    render() {
        return `
            <div class="tool-title">${this.title}</div>
            <div class="tool-desc">convert between bindata, uuid, hex and base64 formats</div>

            <div class="tool">
                <div class="tool-tabs">
                    <button class="tool-tab active" data-panel="decode">decode</button>
                    <button class="tool-tab" data-panel="encode">encode</button>
                </div>

                <!-- Decode Panel -->
                <div class="tool-body panel active" id="decode">
                    <div class="field">
                        <label>input</label>
                        <textarea id="decode-input" placeholder="BinData(3, &quot;...&quot;)&#10;Binary.createFromBase64(&quot;...&quot;, 4)&#10;raw base64"></textarea>
                    </div>

                    <div class="seg">
                        <span class="seg-label">subtype</span>
                        <label><input type="radio" name="d-sub" value="auto" checked><span>auto</span></label>
                        <label><input type="radio" name="d-sub" value="3"><span>3 legacy</span></label>
                        <label><input type="radio" name="d-sub" value="4"><span>4 uuid</span></label>
                        <label><input type="radio" name="d-sub" value="0"><span>0 generic</span></label>
                    </div>

                    <div class="seg" id="d-enc-wrap">
                        <span class="seg-label">legacy encoding</span>
                        <label><input type="radio" name="d-enc" value="csharp" checked><span>c#</span></label>
                        <label><input type="radio" name="d-enc" value="java"><span>java</span></label>
                        <label><input type="radio" name="d-enc" value="python"><span>python</span></label>
                    </div>

                    <div class="actions">
                        <button class="btn btn-primary" id="decode-btn">decode</button>
                        <button class="btn" id="decode-clear">clear</button>
                    </div>

                    <div class="output-wrap">
                        <div class="output" id="decode-output"></div>
                        <button class="output-copy" data-target="decode-output">copy</button>
                    </div>
                    <div class="output-meta" id="decode-meta"></div>
                </div>

                <!-- Encode Panel -->
                <div class="tool-body panel" id="encode">
                    <div class="field">
                        <label>input</label>
                        <textarea id="encode-input" placeholder="uuid string&#10;hex bytes&#10;plain text"></textarea>
                    </div>

                    <div class="seg">
                        <span class="seg-label">subtype</span>
                        <label><input type="radio" name="e-sub" value="4" checked><span>4 uuid</span></label>
                        <label><input type="radio" name="e-sub" value="3"><span>3 legacy</span></label>
                        <label><input type="radio" name="e-sub" value="0"><span>0 generic</span></label>
                    </div>

                    <div class="seg" id="e-enc-wrap" style="display:none">
                        <span class="seg-label">legacy encoding</span>
                        <label><input type="radio" name="e-enc" value="csharp" checked><span>c#</span></label>
                        <label><input type="radio" name="e-enc" value="java"><span>java</span></label>
                        <label><input type="radio" name="e-enc" value="python"><span>python</span></label>
                    </div>

                    <div class="seg">
                        <span class="seg-label">format</span>
                        <label><input type="radio" name="e-fmt" value="bindata" checked><span>BinData()</span></label>
                        <label><input type="radio" name="e-fmt" value="binary"><span>Binary()</span></label>
                        <label><input type="radio" name="e-fmt" value="base64"><span>base64</span></label>
                    </div>

                    <div class="actions">
                        <button class="btn btn-primary" id="encode-btn">encode</button>
                        <button class="btn" id="encode-clear">clear</button>
                    </div>

                    <div class="output-wrap">
                        <div class="output" id="encode-output"></div>
                        <button class="output-copy" data-target="encode-output">copy</button>
                    </div>
                </div>
            </div>

            <details class="ref">
                <summary>subtype reference</summary>
                <div class="ref-body">
                    <table>
                        <tr><th>type</th><th>name</th><th>description</th></tr>
                        <tr><td><code>0</code></td><td>generic</td><td>general purpose binary</td></tr>
                        <tr><td><code>3</code></td><td>uuid legacy</td><td>driver-specific byte order</td></tr>
                        <tr><td><code>4</code></td><td>uuid</td><td>rfc 4122 standard</td></tr>
                        <tr><td><code>5</code></td><td>md5</td><td>md5 hash, 16 bytes</td></tr>
                        <tr><td><code>6</code></td><td>encrypted</td><td>client-side encryption</td></tr>
                        <tr><td><code>128+</code></td><td>user defined</td><td>custom subtypes</td></tr>
                    </table>
                    <a href="https://www.mongodb.com/docs/manual/reference/bson-types/#binary-data" target="_blank" class="ref-link">→ mongodb docs</a>
                </div>
            </details>
        `;
    },

    mount() {
        const decOut = document.getElementById('decode-output');
        const decMeta = document.getElementById('decode-meta');
        const encOut = document.getElementById('encode-output');

        // Decode
        document.getElementById('decode-btn').onclick = () => {
            const input = document.getElementById('decode-input').value;
            if (!input.trim()) {
                decOut.textContent = '';
                decMeta.textContent = '';
                return;
            }

            try {
                const r = bindata.decode(input, radio('d-sub'), radio('d-enc'));
                decOut.textContent = r.val;
                decMeta.textContent = `${r.type} · ${r.len} bytes`;
            } catch (e) {
                decOut.textContent = '';
                decMeta.textContent = e.message;
            }
        };

        // Encode
        document.getElementById('encode-btn').onclick = () => {
            const input = document.getElementById('encode-input').value;
            if (!input.trim()) {
                encOut.textContent = '';
                return;
            }

            try {
                encOut.textContent = bindata.encode(input, radio('e-sub'), radio('e-fmt'), radio('e-enc'));
            } catch (e) {
                encOut.textContent = '';
                toast.show(e.message);
            }
        };

        // Clear buttons
        document.getElementById('decode-clear').onclick = () => {
            document.getElementById('decode-input').value = '';
            decOut.textContent = '';
            decMeta.textContent = '';
        };

        document.getElementById('encode-clear').onclick = () => {
            document.getElementById('encode-input').value = '';
            encOut.textContent = '';
        };

        // Show/hide encoding options based on subtype
        document.querySelectorAll('input[name="d-sub"]').forEach(r => {
            r.onchange = () => {
                const v = radio('d-sub');
                document.getElementById('d-enc-wrap').style.display = (v === '3' || v === 'auto') ? '' : 'none';
            };
        });

        document.querySelectorAll('input[name="e-sub"]').forEach(r => {
            r.onchange = () => {
                document.getElementById('e-enc-wrap').style.display = radio('e-sub') === '3' ? '' : 'none';
            };
        });

        // Keyboard shortcuts
        document.getElementById('decode-input').onkeydown = (e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                document.getElementById('decode-btn').click();
            }
        };

        document.getElementById('encode-input').onkeydown = (e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                document.getElementById('encode-btn').click();
            }
        };
    }
};

// Register tool
window.registerTool(mongoBindata);
