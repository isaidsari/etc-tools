/**
 * data.crc - CRC & Checksum Analyzer
 * Algorithms sourced from the RevEng catalog (https://reveng.sourceforge.io/crc-catalogue/)
 */

// Generic bit-by-bit CRC engine
function crcReflect(val, width) {
    let r = 0;
    for (let i = 0; i < width; i++) {
        if (val & (1 << i)) r |= (1 << (width - 1 - i));
    }
    return r >>> 0;
}

function makeCrc({ w, p, i = 0, ri = false, ro = false, xo = 0 }) {
    return (arr) => {
        let crc = i;
        for (let b of arr) {
            if (ri) b = crcReflect(b, 8);
            crc ^= b << (w - 8);
            for (let j = 0; j < 8; j++) {
                const msb = w === 32 ? (crc & 0x80000000) !== 0 : !!(crc & (1 << (w - 1)));
                crc <<= 1;
                if (msb) crc ^= p;
                if (w < 32) crc &= (1 << w) - 1;
            }
        }
        if (ro) crc = crcReflect(crc, w);
        return ((crc ^ xo) >>> 0);
    };
}

// Shorthand helpers
const C8  = (p, i=0x00,       ri=false, ro=false, xo=0x00)       => makeCrc({ w: 8,  p, i, ri, ro, xo });
const C16 = (p, i=0x0000,     ri=false, ro=false, xo=0x0000)     => makeCrc({ w: 16, p, i, ri, ro, xo });
const C32 = (p, i=0x00000000, ri=false, ro=false, xo=0x00000000) => makeCrc({ w: 32, p, i, ri, ro, xo });

const crcLogic = {
    parseHex(str) {
        const clean = str.replace(/\s+/g, '').replace(/0x/gi, '').toLowerCase();
        if (clean.length === 0) return new Uint8Array(0);
        if (clean.length % 2 !== 0) throw new Error('Invalid hex length. Must be even.');
        return new Uint8Array(clean.match(/.{1,2}/g).map(b => parseInt(b, 16)));
    },

    toHex(num, bytes) {
        return (num >>> 0).toString(16).toUpperCase().padStart(bytes * 2, '0');
    },

    swap16(val) { return ((val & 0xFF) << 8) | ((val >> 8) & 0xFF); },

    swap32(val) {
        return (((val & 0xFF) << 24) | ((val & 0xFF00) << 8) |
            ((val >> 8) & 0xFF00) | ((val >>> 24) & 0xFF)) >>> 0;
    },

    algos: [
        // ── Checksums ───────────────────────────────────────────────────────────────
        { g: 'Checksums', name: 'Checksum-8 (Modulo 256 / Sum)',   size: 1,
            calc: (a) => a.reduce((s, b) => (s + b) & 0xFF, 0) },
        { g: 'Checksums', name: "Checksum-8 (2's Complement)",     size: 1,
            calc: (a) => { const s = a.reduce((x, b) => (x + b) & 0xFF, 0); return ((~s) + 1) & 0xFF; } },
        { g: 'Checksums', name: 'XOR-8 / BCC',                    size: 1,
            calc: (a) => a.reduce((s, b) => s ^ b, 0) },
        { g: 'Checksums', name: 'NMEA-8',                         size: 1,
            calc: (a) => a.reduce((s, b) => s ^ b, 0) },
        { g: 'Checksums', name: 'Fletcher-16',                    size: 2,
            calc: (a) => { let s1=0, s2=0; for (const b of a) { s1=(s1+b)%255; s2=(s2+s1)%255; } return (s2<<8)|s1; } },
        { g: 'Checksums', name: 'Fletcher-32',                    size: 4,
            calc: (a) => { let s1=0, s2=0; for (let k=0; k<a.length; k+=2) { const w=a[k]|((a[k+1]??0)<<8); s1=(s1+w)%65535; s2=(s2+s1)%65535; } return ((s2<<16)|s1)>>>0; } },
        { g: 'Checksums', name: 'Adler-32',                       size: 4,
            calc: (a) => { const M=65521; let x=1, y=0; for (const b of a) { x=(x+b)%M; y=(y+x)%M; } return ((y<<16)|x)>>>0; } },

        // ── CRC-8 ───────────────────────────────────────────────────────────────────
        // Parameters: poly, init, refIn, refOut, xorOut   — check = CRC of "123456789"
        { g: 'CRC-8', name: 'CRC-8/SMBUS',          size: 1, calc: C8(0x07) },                              // check: F4
        { g: 'CRC-8', name: 'CRC-8/MAXIM-DOW',      size: 1, calc: C8(0x31, 0x00, true,  true) },           // check: A1
        { g: 'CRC-8', name: 'CRC-8/AUTOSAR',        size: 1, calc: C8(0x2F, 0xFF, false, false, 0xFF) },    // check: DF
        { g: 'CRC-8', name: 'CRC-8/BLUETOOTH',      size: 1, calc: C8(0xA7, 0x00, true,  true) },           // check: 26
        { g: 'CRC-8', name: 'CRC-8/CDMA2000',       size: 1, calc: C8(0x9B, 0xFF) },                        // check: DA
        { g: 'CRC-8', name: 'CRC-8/DARC',           size: 1, calc: C8(0x39, 0x00, true,  true) },           // check: 15
        { g: 'CRC-8', name: 'CRC-8/DVB-S2',         size: 1, calc: C8(0xD5) },                              // check: BC
        { g: 'CRC-8', name: 'CRC-8/GSM-A',          size: 1, calc: C8(0x1D) },                              // check: 37
        { g: 'CRC-8', name: 'CRC-8/GSM-B',          size: 1, calc: C8(0x49, 0x00, false, false, 0xFF) },    // check: 94
        { g: 'CRC-8', name: 'CRC-8/HITAG',          size: 1, calc: C8(0x1D, 0xFF) },                        // check: B4
        { g: 'CRC-8', name: 'CRC-8/I-432-1 (ITU)',  size: 1, calc: C8(0x07, 0x00, false, false, 0x55) },    // check: A1
        { g: 'CRC-8', name: 'CRC-8/I-CODE',         size: 1, calc: C8(0x1D, 0xFD) },                        // check: 7E
        { g: 'CRC-8', name: 'CRC-8/LTE',            size: 1, calc: C8(0x9B) },                              // check: EA
        { g: 'CRC-8', name: 'CRC-8/MIFARE-MAD',     size: 1, calc: C8(0x1D, 0xC7) },                        // check: 99
        { g: 'CRC-8', name: 'CRC-8/NRSC-5',         size: 1, calc: C8(0x31, 0xFF) },                        // check: F7
        { g: 'CRC-8', name: 'CRC-8/OPENSAFETY',     size: 1, calc: C8(0x2F) },                              // check: 3E
        { g: 'CRC-8', name: 'CRC-8/ROHC',           size: 1, calc: C8(0x07, 0xFF, true,  true) },           // check: D0
        { g: 'CRC-8', name: 'CRC-8/SAE-J1850',      size: 1, calc: C8(0x1D, 0xFF, false, false, 0xFF) },    // check: 4B
        { g: 'CRC-8', name: 'CRC-8/TECH-3250',      size: 1, calc: C8(0x1D, 0xFF, true,  true) },           // check: 97
        { g: 'CRC-8', name: 'CRC-8/WCDMA',          size: 1, calc: C8(0x9B, 0x00, true,  true) },           // check: 25

        // ── CRC-16 ──────────────────────────────────────────────────────────────────
        { g: 'CRC-16', name: 'CRC-16/MODBUS',              size: 2, calc: C16(0x8005, 0xFFFF, true,  true) },                  // check: 4B37
        { g: 'CRC-16', name: 'CRC-16/CCITT-FALSE',         size: 2, calc: C16(0x1021, 0xFFFF) },                               // check: 29B1
        { g: 'CRC-16', name: 'CRC-16/XMODEM',              size: 2, calc: C16(0x1021) },                                       // check: 31C3
        { g: 'CRC-16', name: 'CRC-16/ARC (IBM)',            size: 2, calc: C16(0x8005, 0x0000, true,  true) },                  // check: BB3D
        { g: 'CRC-16', name: 'CRC-16/CDMA2000',             size: 2, calc: C16(0xC867, 0xFFFF) },                               // check: 4C06
        { g: 'CRC-16', name: 'CRC-16/CMS',                  size: 2, calc: C16(0x8005, 0xFFFF) },                               // check: AEE7
        { g: 'CRC-16', name: 'CRC-16/DDS-110',              size: 2, calc: C16(0x8005, 0x800D) },                               // check: 9ECF
        { g: 'CRC-16', name: 'CRC-16/DECT-R',               size: 2, calc: C16(0x0589, 0x0000, false, false, 0x0001) },         // check: 007E
        { g: 'CRC-16', name: 'CRC-16/DECT-X',               size: 2, calc: C16(0x0589) },                                      // check: 007F
        { g: 'CRC-16', name: 'CRC-16/DNP',                  size: 2, calc: C16(0x3D65, 0x0000, true,  true,  0xFFFF) },        // check: EA82
        { g: 'CRC-16', name: 'CRC-16/EN-13757',             size: 2, calc: C16(0x3D65, 0x0000, false, false, 0xFFFF) },        // check: C2B7
        { g: 'CRC-16', name: 'CRC-16/GENIBUS',              size: 2, calc: C16(0x1021, 0xFFFF, false, false, 0xFFFF) },        // check: D64E
        { g: 'CRC-16', name: 'CRC-16/GSM',                  size: 2, calc: C16(0x1021, 0x0000, false, false, 0xFFFF) },        // check: CE3C
        { g: 'CRC-16', name: 'CRC-16/IBM-3740',             size: 2, calc: C16(0x1021, 0xFFFF) },                              // check: 29B1  (= CCITT-FALSE)
        { g: 'CRC-16', name: 'CRC-16/IBM-SDLC (B)',         size: 2, calc: C16(0x1021, 0xFFFF, true,  true,  0xF0B8) },        // check: 906E
        { g: 'CRC-16', name: 'CRC-16/ISO-IEC-14443-3-A',    size: 2, calc: C16(0x1021, 0x6363, true,  true) },                // check: BF05
        { g: 'CRC-16', name: 'CRC-16/KERMIT',               size: 2, calc: C16(0x1021, 0x0000, true,  true) },                // check: 2189
        { g: 'CRC-16', name: 'CRC-16/LJ1200',               size: 2, calc: C16(0x6F63) },                                     // check: BDF4
        { g: 'CRC-16', name: 'CRC-16/M17',                  size: 2, calc: C16(0x5935, 0xFFFF) },                              // check: 772B
        { g: 'CRC-16', name: 'CRC-16/MAXIM-DOW',            size: 2, calc: C16(0x8005, 0x0000, true,  true,  0xFFFF) },        // check: 44C2
        { g: 'CRC-16', name: 'CRC-16/MCRF4XX',              size: 2, calc: C16(0x1021, 0xFFFF, true,  true) },                // check: 6F91
        { g: 'CRC-16', name: 'CRC-16/NRSC-5',               size: 2, calc: C16(0x080B, 0xFFFF, true,  true) },                // check: A066
        { g: 'CRC-16', name: 'CRC-16/OPENSAFETY-A',         size: 2, calc: C16(0x5935) },                                     // check: 5D38
        { g: 'CRC-16', name: 'CRC-16/OPENSAFETY-B',         size: 2, calc: C16(0x755B) },                                     // check: 20FE
        { g: 'CRC-16', name: 'CRC-16/PROFIBUS',             size: 2, calc: C16(0x1DCF, 0xFFFF, false, false, 0xFFFF) },        // check: A819
        { g: 'CRC-16', name: 'CRC-16/RIELLO',               size: 2, calc: C16(0x1021, 0xB2AA, true,  true) },                // check: 63D0
        { g: 'CRC-16', name: 'CRC-16/SPI-FUJITSU',          size: 2, calc: C16(0x1021, 0x1D0F) },                             // check: E5CC
        { g: 'CRC-16', name: 'CRC-16/T10-DIF',              size: 2, calc: C16(0x8BB7) },                                     // check: D0DB
        { g: 'CRC-16', name: 'CRC-16/TELEDISK',             size: 2, calc: C16(0xA097) },                                     // check: 0FB3
        { g: 'CRC-16', name: 'CRC-16/TMS37157',             size: 2, calc: C16(0x1021, 0x89EC, true,  true) },                // check: 26B1
        { g: 'CRC-16', name: 'CRC-16/UMTS',                 size: 2, calc: C16(0x8005) },                                     // check: FEE8
        { g: 'CRC-16', name: 'CRC-16/USB',                  size: 2, calc: C16(0x8005, 0xFFFF, true,  true,  0xFFFF) },        // check: B4C8

        // ── CRC-32 ──────────────────────────────────────────────────────────────────
        { g: 'CRC-32', name: 'CRC-32/ISO-HDLC (Ethernet, ZIP, PNG)', size: 4, calc: C32(0x04C11DB7, 0xFFFFFFFF, true,  true,  0xFFFFFFFF) }, // check: CBF43926
        { g: 'CRC-32', name: 'CRC-32C (Castagnoli / iSCSI)',          size: 4, calc: C32(0x1EDC6F41, 0xFFFFFFFF, true,  true,  0xFFFFFFFF) }, // check: E3069283
        { g: 'CRC-32', name: 'CRC-32/AIXM',         size: 4, calc: C32(0x814141AB) },                                                         // check: 3010BF7F
        { g: 'CRC-32', name: 'CRC-32/AUTOSAR',      size: 4, calc: C32(0xF4ACFB13, 0xFFFFFFFF, true,  true,  0xFFFFFFFF) },                   // check: 1697D06A
        { g: 'CRC-32', name: 'CRC-32/BASE91-D',     size: 4, calc: C32(0xA833982B, 0xFFFFFFFF, true,  true,  0xFFFFFFFF) },                   // check: 87315576
        { g: 'CRC-32', name: 'CRC-32/BZIP2',        size: 4, calc: C32(0x04C11DB7, 0xFFFFFFFF, false, false, 0xFFFFFFFF) },                   // check: FC891918
        { g: 'CRC-32', name: 'CRC-32/CD-ROM-EDC',   size: 4, calc: C32(0x8001801B, 0x00000000, true,  true) },                                // check: 6EC2EDC4
        { g: 'CRC-32', name: 'CRC-32/CKSUM (POSIX)', size: 4, calc: C32(0x04C11DB7, 0x00000000, false, false, 0xFFFFFFFF) },                  // check: 765E7680
        { g: 'CRC-32', name: 'CRC-32/JAMCRC',       size: 4, calc: C32(0x04C11DB7, 0xFFFFFFFF, true,  true) },                                // check: 340BC6D9
        { g: 'CRC-32', name: 'CRC-32/MEF',          size: 4, calc: C32(0x741B8CD7, 0xFFFFFFFF, true,  true) },                                // check: D2C22F51
        { g: 'CRC-32', name: 'CRC-32/MPEG-2',       size: 4, calc: C32(0x04C11DB7, 0xFFFFFFFF) },                                             // check: 0376E6E7
        { g: 'CRC-32', name: 'CRC-32/XFER',         size: 4, calc: C32(0x000000AF) },                                                         // check: BD0BE338
    ]
};

// Tool definition
const dataCrc = {
    id: 'data.crc',
    title: 'CRC & Checksum Analyzer',

    render() {
        return `
            <div class="tool-title">${this.title}</div>
            <div class="tool-desc">compute and match crc & checksum algorithms against hex payloads</div>

            <div class="tool">
                <div class="tool-body panel active">

                    <div class="field">
                        <label>raw hex payload (without crc bytes)</label>
                        <textarea id="crc-input" placeholder="01 03 00 00 00 0A" style="font-family: var(--font); height: 80px;"></textarea>
                    </div>

                    <div class="field" style="max-width: 300px;">
                        <label>target match (optional)</label>
                        <input type="text" id="crc-target" placeholder="expected checksum, e.g. C5 CD" style="width: 100%; padding: 10px; font-family: var(--font); background: var(--bg); border: 1px solid var(--border); color: var(--fg); outline: none;">
                    </div>

                    <div class="actions">
                        <button class="btn btn-primary" id="crc-btn">analyze</button>
                        <button class="btn" id="crc-clear">clear</button>
                    </div>

                    <div id="crc-match-info" style="min-height: 18px; margin-bottom: 8px; font-size: 12px;"></div>

                    <div id="crc-results" style="display:none; border: 1px solid var(--border); background: color-mix(in srgb, var(--fg) 3%, var(--bg)); overflow: hidden; max-height: 480px; overflow-y: auto;">
                        <table style="width: 100%; text-align: left; border-collapse: collapse;">
                            <thead style="position: sticky; top: 0; z-index: 1;">
                                <tr style="border-bottom: 1px solid var(--border); background: color-mix(in srgb, var(--fg) 8%, var(--bg));">
                                    <th style="padding: 10px 16px; font-weight: 500; color: var(--fg3);">algorithm</th>
                                    <th style="padding: 10px 16px; font-weight: 500; color: var(--fg3);">hex (big-endian)</th>
                                    <th style="padding: 10px 16px; font-weight: 500; color: var(--fg3);">hex (little-endian)</th>
                                </tr>
                            </thead>
                            <tbody id="crc-table-body" style="font-family: var(--font); font-size: 13px;"></tbody>
                        </table>
                    </div>
                </div>
            </div>

            <details class="ref">
                <summary>target matching & verification</summary>
                <div class="ref-body">
                    <p style="font-size: 12px; color: var(--fg2); line-height: 1.6;">
                        Paste the payload <strong>without</strong> the checksum bytes, and the expected checksum into the target box.
                        Matching algorithms are highlighted in green and auto-scrolled to. Useful for reverse-engineering undocumented protocols.<br><br>
                        <strong>Verify:</strong> to check algorithm correctness, input <code>31 32 33 34 35 36 37 38 39</code> (ASCII "123456789").
                        Expected check values are documented in the RevEng catalog and in source comments.<br><br>
                        Covers ${crcLogic.algos.length} algorithms: checksums (Sum, XOR, NMEA, Fletcher, Adler) and all common CRC-8/16/32 variants.
                    </p>
                </div>
            </details>

            <style>
                .crc-row { border-bottom: 1px solid var(--border); transition: background 0.1s; }
                .crc-row:hover { background: color-mix(in srgb, var(--fg) 8%, var(--bg)); }
                .crc-match { background: color-mix(in srgb, var(--color-ok) 15%, var(--bg)) !important; border-left: 3px solid var(--color-ok); }
                .crc-match td { color: var(--fg) !important; font-weight: 500; }
                .crc-group td { padding: 5px 16px; font-size: 11px; color: var(--fg3); text-transform: uppercase; letter-spacing: 0.05em; background: color-mix(in srgb, var(--fg) 5%, var(--bg)); }
            </style>
        `;
    },

    mount() {
        const resultsDiv = document.getElementById('crc-results');
        const tbody = document.getElementById('crc-table-body');
        const matchInfo = document.getElementById('crc-match-info');

        document.getElementById('crc-btn').onclick = () => {
            const hexInput = document.getElementById('crc-input').value;
            const targetHexStr = document.getElementById('crc-target').value
                .replace(/\s+/g, '').replace(/0x/gi, '').toUpperCase();

            if (!hexInput.trim()) return;

            try {
                const bytes = crcLogic.parseHex(hexInput);
                let html = '';
                let currentGroup = null;
                let matchCount = 0;
                let firstMatchId = null;

                crcLogic.algos.forEach((algo, idx) => {
                    const val = algo.calc(bytes);
                    const hexBE = crcLogic.toHex(val, algo.size);
                    const hexLE = algo.size === 1 ? '-'
                        : algo.size === 2 ? crcLogic.toHex(crcLogic.swap16(val), 2)
                        : crcLogic.toHex(crcLogic.swap32(val), 4);

                    const isMatch = !!targetHexStr &&
                        (targetHexStr === hexBE || (algo.size > 1 && targetHexStr === hexLE));

                    if (isMatch) {
                        matchCount++;
                        if (!firstMatchId) firstMatchId = `crc-r-${idx}`;
                    }

                    // Group header row
                    if (algo.g !== currentGroup) {
                        currentGroup = algo.g;
                        html += `<tr class="crc-group"><td colspan="3">${currentGroup}</td></tr>`;
                    }

                    html += `
                        <tr class="crc-row${isMatch ? ' crc-match' : ''}" id="crc-r-${idx}">
                            <td style="padding: 9px 16px; color: var(--fg);">${algo.name}</td>
                            <td style="padding: 9px 16px; color: ${isMatch ? 'var(--fg)' : 'var(--fg2)'};">${hexBE}</td>
                            <td style="padding: 9px 16px; color: ${isMatch ? 'var(--fg)' : 'var(--fg3)'};">${hexLE}</td>
                        </tr>`;
                });

                tbody.innerHTML = html;
                resultsDiv.style.display = 'block';

                if (targetHexStr) {
                    if (matchCount > 0) {
                        matchInfo.textContent = `${matchCount} match${matchCount > 1 ? 'es' : ''} found`;
                        matchInfo.style.color = 'var(--color-ok)';
                        setTimeout(() => document.getElementById(firstMatchId)
                            ?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
                    } else {
                        matchInfo.textContent = 'no matches found';
                        matchInfo.style.color = 'var(--fg3)';
                    }
                } else {
                    matchInfo.textContent = '';
                }

            } catch (e) {
                toast.show(`Error: ${e.message}`);
            }
        };

        ['crc-input', 'crc-target'].forEach(id => {
            document.getElementById(id).onkeydown = (e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    document.getElementById('crc-btn').click();
                }
            };
        });

        document.getElementById('crc-clear').onclick = () => {
            document.getElementById('crc-input').value = '';
            document.getElementById('crc-target').value = '';
            resultsDiv.style.display = 'none';
            matchInfo.textContent = '';
        };
    }
};

window.registerTool(dataCrc);
