/**
 * data.jwt - JSON Web Token decoder & signer
 */

const jwt = {
    extract(raw) {
        const s = String(raw).replace(/\s+/g, '');
        const preferred = s.match(/ey[A-Za-z0-9_-]+\.ey[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/);
        if (preferred) return preferred[0];
        const m = s.match(/([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]*)/);
        return m ? m[0] : s;
    },

    parse(token) {
        const t = this.extract(token);
        const parts = t.split('.');
        if (parts.length !== 3) throw new Error('invalid jwt: expected 3 segments (header.payload.signature)');

        const [h, p, s] = parts;
        const header  = this._decodeSegment(h, 'header');
        const payload = this._decodeSegment(p, 'payload');
        const sigBytes = s ? this._b64urlToBytes(s) : new Uint8Array(0);

        return {
            token: t,
            segments: { header: h, payload: p, signature: s },
            header: header.json,
            payload: payload.json,
            headerBytes: header.bytes,
            payloadBytes: payload.bytes,
            signatureBytes: sigBytes,
            signingInput: `${h}.${p}`
        };
    },

    _decodeSegment(seg, name) {
        let bytes;
        try { bytes = this._b64urlToBytes(seg); }
        catch (e) { throw new Error(`failed to decode ${name}: ${e.message}`); }
        let text;
        try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
        catch { throw new Error(`${name} is not valid utf-8`); }
        let json;
        try { json = JSON.parse(text); }
        catch { throw new Error(`${name} is not valid json`); }
        return { bytes, json };
    },

    _b64urlToBytes(s) {
        const pad = s.length % 4 === 2 ? '==' : s.length % 4 === 3 ? '=' : s.length % 4 === 1 ? null : '';
        if (pad === null) throw new Error('invalid base64url length');
        const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad;
        if (!/^[A-Za-z0-9+/=]*$/.test(b64)) throw new Error('invalid base64url characters');
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return bytes;
    },

    _bytesToB64url(bytes) {
        let bin = '';
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    },

    async _hmacKey(secret, alg) {
        const hash = { HS256: 'SHA-256', HS384: 'SHA-384', HS512: 'SHA-512' }[alg];
        if (!hash) throw new Error(`unsupported hmac alg: ${alg}`);
        return crypto.subtle.importKey(
            'raw',
            new TextEncoder().encode(secret),
            { name: 'HMAC', hash },
            false,
            ['sign', 'verify']
        );
    },

    async sign(signingInput, secret, alg) {
        const key = await this._hmacKey(secret, alg);
        const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signingInput));
        return this._bytesToB64url(new Uint8Array(sig));
    },

    async verify(signingInput, sigBytes, secret, alg) {
        const key = await this._hmacKey(secret, alg);
        return crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(signingInput));
    },

    CLAIMS: {
        iss: 'issuer',
        sub: 'subject',
        aud: 'audience',
        exp: 'expiration',
        nbf: 'not before',
        iat: 'issued at',
        jti: 'jwt id'
    },

    humanizeTime(ts) {
        if (typeof ts !== 'number' || !isFinite(ts)) return null;
        const ms = ts < 1e12 ? ts * 1000 : ts;
        const d = new Date(ms);
        if (isNaN(d.getTime())) return null;
        const diff = Math.floor((ms - Date.now()) / 1000);
        const abs = Math.abs(diff);
        let unit;
        if (abs < 60)         unit = `${abs}s`;
        else if (abs < 3600)  unit = `${Math.floor(abs / 60)}m`;
        else if (abs < 86400) unit = `${Math.floor(abs / 3600)}h`;
        else                  unit = `${Math.floor(abs / 86400)}d`;
        const rel = diff > 0 ? `in ${unit}` : diff < 0 ? `${unit} ago` : 'now';
        return { iso: d.toISOString(), rel };
    }
};

const dataJwt = {
    id: 'data.jwt',
    title: 'JWT Decoder & Signer',

    render() {
        return `
            <div class="tool-title">${this.title}</div>
            <div class="tool-desc">decode JSON web tokens, inspect claims, verify or sign with HS256/384/512</div>

            <div class="tool">
                <div class="tool-tabs">
                    <button class="tool-tab active" data-panel="jwt-decode">decode</button>
                    <button class="tool-tab" data-panel="jwt-sign">sign</button>
                </div>

                <div class="tool-body panel active" id="jwt-decode">
                    <div class="field">
                        <label>token</label>
                        <textarea id="jd-in" placeholder="paste a jwt (with or without 'Bearer' prefix)" style="min-height:90px;font-family:var(--font-mono);font-size:12px;"></textarea>
                    </div>
                    <div class="actions">
                        <button class="btn btn-primary" id="jd-btn">decode</button>
                        <button class="btn" id="jd-sample">sample</button>
                        <button class="btn" id="jd-clear">clear</button>
                    </div>
                    <div id="jd-out" style="display:none;"></div>
                </div>

                <div class="tool-body panel" id="jwt-sign">
                    <div class="field">
                        <label>header (json)</label>
                        <textarea id="js-hdr" style="min-height:60px;font-family:var(--font-mono);font-size:12px;">{"alg":"HS256","typ":"JWT"}</textarea>
                    </div>
                    <div class="field">
                        <label>payload (json)</label>
                        <textarea id="js-pay" style="min-height:100px;font-family:var(--font-mono);font-size:12px;">{"sub":"1234567890","name":"John Doe","iat":1516239022}</textarea>
                    </div>
                    <div class="field">
                        <label>secret (utf-8)</label>
                        <input type="text" id="js-sec" value="your-256-bit-secret" style="font-size:12px;">
                    </div>
                    <div class="actions">
                        <button class="btn btn-primary" id="js-btn">sign</button>
                        <button class="btn" id="js-now">insert iat/exp</button>
                        <button class="btn" id="js-clear">reset</button>
                    </div>
                    <div class="output-wrap">
                        <div class="output" id="js-out"></div>
                        <button class="output-copy" data-target="js-out">copy</button>
                    </div>
                </div>
            </div>

            <details class="ref">
                <summary>jwt structure</summary>
                <div class="ref-body">
                    <table>
                        <tr><th>segment</th><th>content</th><th>example</th></tr>
                        <tr><td>header</td><td>alg, typ, kid</td><td><code>{"alg":"HS256","typ":"JWT"}</code></td></tr>
                        <tr><td>payload</td><td>claims (iss, sub, aud, exp, nbf, iat, jti, custom)</td><td><code>{"sub":"u1","exp":1700000000}</code></td></tr>
                        <tr><td>signature</td><td>HMAC or RSA/ECDSA signature over the signing input</td><td><code>sign(b64u(h)+"."+b64u(p), key)</code></td></tr>
                    </table>
                    <p style="margin-top:12px;font-size:12px;color:var(--fg2);line-height:1.6;">
                        signing input: <code>base64url(header) + "." + base64url(payload)</code><br>
                        verification of RS/ES/EdDSA requires the public key. this tool handles <strong>HS256/HS384/HS512</strong>.
                    </p>
                    <a href="https://datatracker.ietf.org/doc/html/rfc7519" target="_blank" class="ref-link">→ rfc 7519</a>
                </div>
            </details>

            <style>
                .jseg-h { color: #42A5F5; }
                .jseg-p { color: #66BB6A; }
                .jseg-s { color: #EF5350; }
                .jwt-segviz { padding:10px 14px; font-family:var(--font-mono); font-size:12px; word-break:break-all; border:1px solid var(--border); background:color-mix(in srgb,var(--bg) 84%,transparent); border-radius:var(--radius-sm); margin-bottom:14px; line-height:1.6; }
                .jwt-card { border:1px solid var(--border); border-radius:var(--radius-sm); overflow:hidden; margin-bottom:12px; background:color-mix(in srgb,var(--fg) 3%,var(--bg)); }
                .jwt-card-head { padding:7px 12px; font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.07em; color:var(--fg3); border-bottom:1px solid var(--border); display:flex; align-items:center; gap:8px; }
                .jwt-card-head .dot { width:8px; height:8px; border-radius:50%; }
                .jwt-json { padding:10px 14px; font-family:var(--font-mono); font-size:12px; white-space:pre-wrap; word-break:break-word; line-height:1.6; }
                .jk { color: #42A5F5; }
                .jn { color: #FFA726; }
                .js { color: #66BB6A; }
                .jb { color: #EF5350; }
                .jl { color: var(--fg3); }
                .jwt-claims { padding:6px 0; border-top:1px solid var(--border); }
                .jwt-claim-row { display:flex; gap:14px; padding:5px 14px; font-size:12px; }
                .jwt-claim-row .k { width:130px; flex-shrink:0; color:var(--fg3); }
                .jwt-claim-row .v { color:var(--fg2); word-break:break-all; }
                .jwt-badge { display:inline-block; padding:1px 7px; font-size:10px; border-radius:4px; margin-left:6px; font-weight:600; }
                .jwt-ok   { background:color-mix(in srgb,var(--color-ok) 20%,transparent); color:var(--color-ok); }
                .jwt-bad  { background:color-mix(in srgb,var(--color-err) 20%,transparent); color:var(--color-err); }
                .jwt-warn { background:color-mix(in srgb,#FFA726 22%,transparent); color:#FFA726; }
                .jwt-verify { padding:12px 14px; border-top:1px solid var(--border); background:color-mix(in srgb,var(--fg) 2%,var(--bg)); }
                .jwt-verify-row { display:flex; gap:8px; align-items:center; }
                .jwt-verify input { flex:1; padding:7px 10px; background:var(--bg); border:1px solid var(--border); border-radius:var(--radius-sm); color:var(--fg); font-family:var(--font-mono); font-size:12px; outline:none; }
                .jwt-verify input:focus { border-color:var(--accent); box-shadow:0 0 0 3px var(--ring); }
                .jwt-verify-note { font-size:12px; color:var(--fg3); padding:8px 14px; border-top:1px solid var(--border); }
                .jwt-error { padding:12px 14px; color:var(--color-err); font-size:13px; border:1px solid color-mix(in srgb,var(--color-err) 35%,var(--border)); border-radius:var(--radius-sm); background:color-mix(in srgb,var(--color-err) 8%,transparent); }
            </style>
        `;
    },

    mount() {
        const inEl  = document.getElementById('jd-in');
        const outEl = document.getElementById('jd-out');

        const decode = () => {
            const raw = inEl.value.trim();
            if (!raw) { outEl.style.display = 'none'; outEl.innerHTML = ''; return; }
            try {
                const res = jwt.parse(raw);
                if (res.token !== raw.replace(/\s+/g, '')) inEl.value = res.token;
                outEl.innerHTML = this._renderDecoded(res);
                outEl.style.display = 'block';
                this._wireVerify(res);
            } catch (e) {
                outEl.innerHTML = `<div class="jwt-error">${this._esc(e.message)}</div>`;
                outEl.style.display = 'block';
            }
        };

        document.getElementById('jd-btn').onclick = decode;
        document.getElementById('jd-clear').onclick = () => { inEl.value = ''; outEl.style.display = 'none'; outEl.innerHTML = ''; };
        document.getElementById('jd-sample').onclick = () => {
            inEl.value = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
            decode();
        };
        inEl.onkeydown = (e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); decode(); }
        };

        this._mountSign();
    },

    _mountSign() {
        const hdrEl = document.getElementById('js-hdr');
        const payEl = document.getElementById('js-pay');
        const secEl = document.getElementById('js-sec');
        const outEl = document.getElementById('js-out');

        const sign = async () => {
            let header, payload;
            try { header  = JSON.parse(hdrEl.value); } catch { toast.show('invalid header json'); return; }
            try { payload = JSON.parse(payEl.value); } catch { toast.show('invalid payload json'); return; }
            const alg = header && header.alg;
            if (!['HS256', 'HS384', 'HS512'].includes(alg)) { toast.show('alg must be HS256/384/512'); return; }
            const secret = secEl.value;
            if (!secret) { toast.show('secret required'); return; }

            try {
                const hb = jwt._bytesToB64url(new TextEncoder().encode(JSON.stringify(header)));
                const pb = jwt._bytesToB64url(new TextEncoder().encode(JSON.stringify(payload)));
                const sig = await jwt.sign(`${hb}.${pb}`, secret, alg);
                outEl.innerHTML = `<span class="jseg-h">${hb}</span><span class="jl">.</span><span class="jseg-p">${pb}</span><span class="jl">.</span><span class="jseg-s">${sig}</span>`;
            } catch (e) {
                outEl.innerHTML = `<span style="color:var(--color-err);">${this._esc(e.message)}</span>`;
            }
        };

        document.getElementById('js-btn').onclick = sign;
        document.getElementById('js-clear').onclick = () => {
            hdrEl.value = '{"alg":"HS256","typ":"JWT"}';
            payEl.value = '{"sub":"1234567890","name":"John Doe","iat":1516239022}';
            secEl.value = 'your-256-bit-secret';
            outEl.textContent = '';
        };
        document.getElementById('js-now').onclick = () => {
            let p; try { p = JSON.parse(payEl.value); } catch { p = {}; }
            const now = Math.floor(Date.now() / 1000);
            p.iat = now;
            p.exp = now + 3600;
            payEl.value = JSON.stringify(p, null, 2);
        };
    },

    _renderDecoded(r) {
        const seg = r.segments;
        const sigHtml = seg.signature
            ? `<span class="jseg-s">${this._esc(seg.signature)}</span>`
            : `<span class="jl"><em>(empty — alg=${this._esc(r.header.alg || '?')})</em></span>`;

        const segViz = `
            <div class="jwt-segviz">
                <span class="jseg-h">${this._esc(seg.header)}</span><span class="jl">.</span><span class="jseg-p">${this._esc(seg.payload)}</span><span class="jl">.</span>${sigHtml}
            </div>`;

        const headerCard = this._card(
            '#42A5F5', 'header',
            `${r.headerBytes.length} bytes`,
            `<div class="jwt-json">${this._prettyJson(r.header)}</div>`
        );

        const payloadCard = this._card(
            '#66BB6A', 'payload',
            `${r.payloadBytes.length} bytes`,
            `<div class="jwt-json">${this._prettyJson(r.payload)}</div>${this._claimsBlock(r.payload)}`
        );

        const sigBody = r.signatureBytes.length
            ? `<div class="jwt-json jl">${this._bytesHex(r.signatureBytes)}</div>`
            : `<div class="jwt-json jl">(no signature bytes)</div>`;

        const sigCard = this._card(
            '#EF5350', 'signature',
            `${r.signatureBytes.length} bytes · alg: ${this._esc(r.header.alg || '?')}`,
            sigBody + this._verifyBlock(r)
        );

        return segViz + headerCard + payloadCard + sigCard;
    },

    _card(color, title, meta, body) {
        return `
            <div class="jwt-card">
                <div class="jwt-card-head"><span class="dot" style="background:${color};"></span>${title}<span style="color:var(--fg3);font-weight:400;margin-left:auto;">${meta}</span></div>
                ${body}
            </div>`;
    },

    _verifyBlock(r) {
        const alg = (r.header && r.header.alg) || '';
        if (!r.signatureBytes.length) return '';
        if (!['HS256', 'HS384', 'HS512'].includes(alg)) {
            return `<div class="jwt-verify-note">verification for <code>${this._esc(alg)}</code> requires a public key — not supported in this tool.</div>`;
        }
        return `
            <div class="jwt-verify">
                <div class="jwt-verify-row">
                    <input type="text" id="jv-sec" placeholder="secret (utf-8)">
                    <button class="btn" id="jv-btn">verify</button>
                </div>
                <div id="jv-res" style="font-size:12px;color:var(--fg3);margin-top:6px;"></div>
            </div>`;
    },

    _wireVerify(r) {
        const btn = document.getElementById('jv-btn');
        if (!btn) return;
        const secEl = document.getElementById('jv-sec');
        const resEl = document.getElementById('jv-res');
        const alg = r.header.alg;

        const run = async () => {
            if (!secEl.value) { resEl.innerHTML = '<span class="jwt-badge jwt-bad">secret required</span>'; return; }
            try {
                const ok = await jwt.verify(r.signingInput, r.signatureBytes, secEl.value, alg);
                resEl.innerHTML = ok
                    ? '<span class="jwt-badge jwt-ok">signature valid</span>'
                    : '<span class="jwt-badge jwt-bad">signature invalid</span>';
            } catch (e) {
                resEl.innerHTML = `<span class="jwt-badge jwt-bad">${this._esc(e.message)}</span>`;
            }
        };
        btn.onclick = run;
        secEl.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); run(); } };
    },

    _claimsBlock(payload) {
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return '';
        const now = Math.floor(Date.now() / 1000);
        const rows = [];
        for (const [k, label] of Object.entries(jwt.CLAIMS)) {
            const v = payload[k];
            if (v === undefined) continue;
            let detail = '';
            if (['exp', 'nbf', 'iat'].includes(k) && typeof v === 'number') {
                const h = jwt.humanizeTime(v);
                if (h) detail = ` <span style="color:var(--fg3);">${this._esc(h.iso)} · ${this._esc(h.rel)}</span>`;
                if (k === 'exp' && v < now) detail += ' <span class="jwt-badge jwt-bad">expired</span>';
                if (k === 'nbf' && v > now) detail += ' <span class="jwt-badge jwt-warn">not yet valid</span>';
            }
            const vStr = typeof v === 'object' ? JSON.stringify(v) : String(v);
            rows.push(`<div class="jwt-claim-row"><span class="k">${k} · ${label}</span><span class="v">${this._esc(vStr)}${detail}</span></div>`);
        }
        return rows.length ? `<div class="jwt-claims">${rows.join('')}</div>` : '';
    },

    _prettyJson(v, indent = 0) {
        const pad = '  '.repeat(indent);
        const padN = '  '.repeat(indent + 1);
        if (v === null) return '<span class="jb">null</span>';
        if (typeof v === 'boolean') return `<span class="jb">${v}</span>`;
        if (typeof v === 'number') return `<span class="jn">${v}</span>`;
        if (typeof v === 'string') return `<span class="js">${this._esc(JSON.stringify(v))}</span>`;
        if (Array.isArray(v)) {
            if (!v.length) return '<span class="jl">[]</span>';
            const items = v.map(x => padN + this._prettyJson(x, indent + 1)).join(',\n');
            return `<span class="jl">[</span>\n${items}\n${pad}<span class="jl">]</span>`;
        }
        if (typeof v === 'object') {
            const keys = Object.keys(v);
            if (!keys.length) return '<span class="jl">{}</span>';
            const items = keys.map(k =>
                `${padN}<span class="jk">${this._esc(JSON.stringify(k))}</span><span class="jl">:</span> ${this._prettyJson(v[k], indent + 1)}`
            ).join(',\n');
            return `<span class="jl">{</span>\n${items}\n${pad}<span class="jl">}</span>`;
        }
        return this._esc(String(v));
    },

    _bytesHex(bytes) {
        return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    },

    _esc(s) {
        return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }
};

window.registerTool(dataJwt);
