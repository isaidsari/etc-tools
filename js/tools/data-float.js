/**
 * data.float - IEEE 754 Float Inspector
 */

const dataFloat = {
    id: 'data.float',
    title: 'IEEE 754 Float Inspector',

    render() {
        return `
            <div class="tool-title">${this.title}</div>
            <div class="tool-desc">inspect and convert ieee 754 float32 and float64 values between hex and decimal</div>

            <div class="tool">
                <div class="tool-tabs">
                    <button class="tool-tab active" data-panel="float-32">float32</button>
                    <button class="tool-tab" data-panel="float-64">float64</button>
                </div>

                ${this._panelHtml('32')}
                ${this._panelHtml('64')}
            </div>

            <details class="ref">
                <summary>ieee 754 format reference</summary>
                <div class="ref-body">
                    <table>
                        <tr><th>format</th><th>total</th><th>sign</th><th>exponent</th><th>mantissa</th><th>bias</th></tr>
                        <tr><td>float32</td><td>32 bits</td><td>1</td><td>8</td><td>23</td><td>127</td></tr>
                        <tr><td>float64</td><td>64 bits</td><td>1</td><td>11</td><td>52</td><td>1023</td></tr>
                    </table>
                    <table style="margin-top: 12px;">
                        <tr><th>class</th><th>exponent</th><th>mantissa</th></tr>
                        <tr><td>±zero</td><td>all 0s</td><td>= 0</td></tr>
                        <tr><td>subnormal</td><td>all 0s</td><td>≠ 0</td></tr>
                        <tr><td>normal</td><td>other</td><td>any</td></tr>
                        <tr><td>±infinity</td><td>all 1s</td><td>= 0</td></tr>
                        <tr><td>NaN</td><td>all 1s</td><td>≠ 0</td></tr>
                    </table>
                    <p style="margin-top: 12px; font-size: 12px; color: var(--fg2); line-height: 1.6;">
                        Normal value: (−1)<sup>sign</sup> × 1.mantissa × 2<sup>exp−bias</sup><br>
                        Subnormal: (−1)<sup>sign</sup> × 0.mantissa × 2<sup>1−bias</sup><br>
                        Special inputs accepted: <code>inf</code>, <code>-inf</code>, <code>nan</code>
                    </p>
                </div>
            </details>

            <style>
                .fbit { display: inline-flex; align-items: center; justify-content: center; border: 1px solid var(--border); cursor: default; user-select: none; }
                .fbit-s { background: color-mix(in srgb, #ef5350 22%, var(--bg)); }
                .fbit-e { background: color-mix(in srgb, #FFA726 22%, var(--bg)); }
                .fbit-m { background: color-mix(in srgb, #42A5F5 18%, var(--bg)); }
                .fbit-0 { color: var(--fg3); }
                .fbit-1 { color: var(--fg); font-weight: 500; }
                .fdet-row { display: flex; gap: 16px; padding: 7px 0; border-bottom: 1px solid color-mix(in srgb, var(--border) 50%, transparent); }
                .fdet-row:last-child { border-bottom: none; }
                .fdet-key { width: 80px; flex-shrink: 0; font-size: 11px; color: var(--fg3); padding-top: 1px; }
                .fdet-val { font-family: var(--font); font-size: 13px; word-break: break-all; }
            </style>
        `;
    },

    _panelHtml(bits) {
        const active  = bits === '32' ? ' active' : '';
        const ph      = bits === '32' ? '3F800000 or 1.0' : '3FF0000000000000 or 1.0';
        return `
            <div class="tool-body panel${active}" id="float-${bits}">
                <div class="field">
                    <label>value</label>
                    <input type="text" id="fi-${bits}" placeholder="${ph}">
                </div>
                <div class="actions">
                    <button class="btn btn-primary" id="fb-hex-${bits}">parse hex</button>
                    <button class="btn" id="fb-flt-${bits}">parse float</button>
                    <button class="btn" id="fb-clr-${bits}">clear</button>
                </div>
                <div id="fo-${bits}" style="display:none; margin-top:4px;">
                    <div id="fv-${bits}" style="padding:12px 16px; border:1px solid var(--border); background:color-mix(in srgb,var(--fg) 3%,var(--bg)); overflow-x:auto;"></div>
                    <div id="fd-${bits}" style="padding:4px 16px 8px; border:1px solid var(--border); border-top:none; background:color-mix(in srgb,var(--fg) 3%,var(--bg));"></div>
                </div>
            </div>`;
    },

    mount() {
        this._mountPanel('32');
        this._mountPanel('64');
    },

    _mountPanel(bits) {
        const input  = document.getElementById(`fi-${bits}`);
        const output = document.getElementById(`fo-${bits}`);

        const parseHex = () => {
            const raw = input.value.trim().replace(/\s+/g, '').replace(/^0x/i, '');
            if (!raw) return;
            if (!/^[0-9a-fA-F]+$/.test(raw)) {
                toast.show('use "parse float" for decimal values');
                return;
            }
            try {
                const a = bits === '32' ? this._analyze32(raw) : this._analyze64(raw);
                input.value = a.hex;
                this._showResult(bits, a);
            } catch (e) {
                toast.show(e.message);
            }
        };

        const parseFloat_ = () => {
            const raw = input.value.trim();
            if (!raw) return;
            try {
                const hex = bits === '32' ? this._floatToHex32(raw) : this._floatToHex64(raw);
                const a   = bits === '32' ? this._analyze32(hex)    : this._analyze64(hex);
                input.value = a.hex;
                this._showResult(bits, a);
            } catch (e) {
                toast.show(e.message);
            }
        };

        document.getElementById(`fb-hex-${bits}`).onclick = parseHex;
        document.getElementById(`fb-flt-${bits}`).onclick = parseFloat_;
        document.getElementById(`fb-clr-${bits}`).onclick = () => {
            input.value = '';
            output.style.display = 'none';
        };

        input.onkeydown = (e) => {
            if (e.key === 'Enter' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
                e.preventDefault();
                parseHex();
            }
        };
    },

    _showResult(bits, a) {
        const vizEl = document.getElementById(`fv-${bits}`);
        const detEl = document.getElementById(`fd-${bits}`);
        const outEl = document.getElementById(`fo-${bits}`);

        const sz = bits === '32' ? 20 : 12;
        const ht = bits === '32' ? 28 : 20;
        const fs = bits === '32' ? 12 : 10;

        // ── Bit visualization ────────────────────────────────────────────────
        let bhtml = `<div style="display:flex;align-items:center;gap:2px;flex-wrap:nowrap;min-width:max-content;">`;
        for (let i = 0; i < a.bits.length; i++) {
            const bit  = a.bits[i];
            const type = i === 0 ? 's' : i <= a.expBits ? 'e' : 'm';
            bhtml += `<span class="fbit fbit-${type} fbit-${bit}" style="width:${sz}px;height:${ht}px;font-size:${fs}px;">${bit}</span>`;
            if (i === 0 || i === a.expBits) {
                bhtml += `<span style="width:5px;flex-shrink:0;"></span>`;
            }
        }
        bhtml += `</div>`;

        // Legend
        const dot = (c) => `<span style="display:inline-block;width:9px;height:9px;background:${c};border:1px solid var(--border);vertical-align:middle;margin-right:4px;"></span>`;
        bhtml += `<div style="display:flex;gap:16px;margin-top:8px;font-size:11px;color:var(--fg3);">`;
        bhtml += `<span>${dot('color-mix(in srgb,#ef5350 22%,var(--bg))')}sign</span>`;
        bhtml += `<span>${dot('color-mix(in srgb,#FFA726 22%,var(--bg))')}exponent (${a.expBits})</span>`;
        bhtml += `<span>${dot('color-mix(in srgb,#42A5F5 18%,var(--bg))')}mantissa (${a.manBits})</span>`;
        bhtml += `</div>`;
        vizEl.innerHTML = bhtml;

        // ── Detail rows ──────────────────────────────────────────────────────
        const expBitsStr = a.bits.slice(1, 1 + a.expBits);
        const manBitsStr = a.bits.slice(1 + a.expBits);
        const manHexLen  = Math.ceil(a.manBits / 4);
        const manHex     = BigInt('0b' + (manBitsStr || '0')).toString(16).toUpperCase().padStart(manHexLen, '0');

        const expHexLen  = Math.ceil(a.expBits / 4);
        let expDetail    = `raw ${a.exp} (0x${a.exp.toString(16).toUpperCase().padStart(expHexLen, '0')})`;
        const cls = a.cls;
        if      (cls === 'normal')           expDetail += `  ·  actual ${a.expActual}  =  ${a.exp} − ${a.expBias}`;
        else if (cls === 'subnormal')        expDetail += `  ·  subnormal, effective exp ${1 - a.expBias}`;
        else if (cls.includes('infinity'))   expDetail += '  ·  ∞';
        else if (cls === 'nan')              expDetail += '  ·  NaN';
        else                                 expDetail += '  ·  zero';

        const precision = bits === '32' ? 9 : 17;
        const valueStr  = Number.isFinite(a.value)
            ? parseFloat(a.value.toPrecision(precision)).toString()
            : a.value.toString();

        const clsLabels = {
            'normal': 'normal', 'subnormal': 'subnormal / denormal',
            '+zero': '+zero',   '-zero': '−zero',
            '+infinity': '+infinity', '-infinity': '−infinity', 'nan': 'NaN'
        };

        const row = (key, val) => `
            <div class="fdet-row">
                <span class="fdet-key">${key}</span>
                <span class="fdet-val">${val}</span>
            </div>`;

        detEl.innerHTML = [
            row('hex',      a.hex),
            row('sign',     `${a.sign}  <span style="color:var(--fg3);font-size:11px;">${a.sign ? 'negative' : 'positive'}</span>`),
            row('exponent', `${expBitsStr}  <span style="color:var(--fg3);font-size:11px;">${expDetail}</span>`),
            row('mantissa', `<span style="color:var(--fg3);">0x</span>${manHex}`),
            row('value',    `<span style="${cls === 'nan' ? 'color:var(--fg3)' : ''}">${valueStr}</span>`),
            row('class',    `<span style="color:var(--fg3);font-size:12px;">${clsLabels[cls] || cls}</span>`),
        ].join('');

        outEl.style.display = 'block';
    },

    // ── Analysis ──────────────────────────────────────────────────────────────

    _analyze32(hexStr) {
        if (!/^[0-9a-fA-F]{1,8}$/.test(hexStr)) throw new Error('invalid hex: up to 8 digits');
        const n    = parseInt(hexStr.padStart(8, '0'), 16);
        const buf  = new ArrayBuffer(4);
        const view = new DataView(buf);
        view.setUint32(0, n, false);
        return this._build(
            view.getFloat32(0, false),
            (n >>> 31) & 1,
            (n >>> 23) & 0xFF,
            n & 0x7FFFFF,
            127, 8, 23,
            n.toString(2).padStart(32, '0'),
            n.toString(16).toUpperCase().padStart(8, '0')
        );
    },

    _analyze64(hexStr) {
        if (!/^[0-9a-fA-F]{1,16}$/.test(hexStr)) throw new Error('invalid hex: up to 16 digits');
        const p    = hexStr.padStart(16, '0');
        const buf  = new ArrayBuffer(8);
        const view = new DataView(buf);
        view.setUint32(0, parseInt(p.slice(0,  8), 16), false);
        view.setUint32(4, parseInt(p.slice(8, 16), 16), false);
        const n = BigInt('0x' + p);
        return this._build(
            view.getFloat64(0, false),
            Number((n >> 63n) & 1n),
            Number((n >> 52n) & 0x7FFn),
            n & 0xFFFFFFFFFFFFFn,
            1023, 11, 52,
            n.toString(2).padStart(64, '0'),
            p.toUpperCase()
        );
    },

    _build(value, sign, exp, man, bias, expBits, manBits, bits, hex) {
        const maxExp  = (1 << expBits) - 1;
        const manZero = typeof man === 'bigint' ? man === 0n : man === 0;
        let cls;
        if      (exp === 0 && manZero)       cls = sign ? '-zero'     : '+zero';
        else if (exp === maxExp && manZero)   cls = sign ? '-infinity' : '+infinity';
        else if (exp === maxExp)              cls = 'nan';
        else if (exp === 0)                   cls = 'subnormal';
        else                                  cls = 'normal';
        return { value, sign, exp, man, expBias: bias, expActual: exp - bias,
                 cls, bits, hex, expBits, manBits };
    },

    // ── Conversion ────────────────────────────────────────────────────────────

    _floatToHex32(str) {
        const buf  = new ArrayBuffer(4);
        const view = new DataView(buf);
        view.setFloat32(0, this._parseFloatStr(str), false);
        return view.getUint32(0, false).toString(16).toUpperCase().padStart(8, '0');
    },

    _floatToHex64(str) {
        const buf  = new ArrayBuffer(8);
        const view = new DataView(buf);
        view.setFloat64(0, this._parseFloatStr(str), false);
        const h = view.getUint32(0, false).toString(16).padStart(8, '0');
        const l = view.getUint32(4, false).toString(16).padStart(8, '0');
        return (h + l).toUpperCase();
    },

    _parseFloatStr(str) {
        const s = str.trim().toLowerCase();
        if (s === 'nan')                                               return NaN;
        if (s === 'inf'  || s === '+inf'  || s === 'infinity'  || s === '+infinity')  return  Infinity;
        if (s === '-inf' || s === '-infinity')                         return -Infinity;
        const f = parseFloat(s);
        if (isNaN(f)) throw new Error('invalid float value');
        return f;
    }
};

window.registerTool(dataFloat);
