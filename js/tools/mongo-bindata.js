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

    // Parse BinData input formats
    parse(s) {
        s = s.trim();
        let m;

        // BinData(n, "...")
        if ((m = s.match(/BinData\s*\(\s*(\d+)\s*,\s*["']([^"']+)["']\s*\)/i)))
            return { sub: +m[1], b64: m[2] };

        // Binary.createFromBase64("...", n)
        if ((m = s.match(/Binary\.createFromBase64\s*\(\s*["']([^"']+)["']\s*,\s*(\d+)\s*\)/i)))
            return { sub: +m[2], b64: m[1] };

        // UUID("...")
        if ((m = s.match(/UUID\s*\(\s*["']([^"']+)["']\s*\)/i)))
            return { sub: 4, b64: this.toB64(this.uuidToBytes(m[1])) };

        // Raw base64
        if (/^[A-Za-z0-9+/]+=*$/.test(s) && s.length >= 4)
            return { sub: null, b64: s };

        throw new Error('invalid format');
    },

    // Conversion utilities
    toBytes: b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0)),
    toB64: bytes => btoa(String.fromCharCode(...bytes)),
    toHex: bytes => [...bytes].map(b => b.toString(16).padStart(2, '0')).join(''),

    fromHex(hex) {
        const h = hex.replace(/\s/g, '');
        if (h.length % 2) throw new Error('invalid hex');
        return new Uint8Array(h.match(/.{2}/g).map(b => parseInt(b, 16)));
    },

    toUuid(b) {
        const h = this.toHex(b);
        return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
    },

    uuidToBytes(u) {
        const h = u.replace(/-/g, '');
        if (h.length !== 32) throw new Error('invalid uuid');
        return this.fromHex(h);
    },

    isUuid: s => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s),

    // Decode BinData to readable format
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

    // Encode value to BinData format
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

// ============================================
// UI Handlers
// ============================================

document.addEventListener('DOMContentLoaded', () => {
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
});
