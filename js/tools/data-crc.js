/**
 * data.crc - CRC & Checksum Detective
 */

const crcLogic = {
    parseHex(str) {
        const clean = str.replace(/\s+/g, '').replace(/0x/g, '').toLowerCase();
        if (clean.length === 0) return new Uint8Array(0);
        if (clean.length % 2 !== 0) throw new Error("Invalid hex length. Must be even.");
        return new Uint8Array(clean.match(/.{1,2}/g).map(b => parseInt(b, 16)));
    },

    toHex(num, bytes) {
        let hex = num.toString(16).toUpperCase();
        return hex.padStart(bytes * 2, '0');
    },

    swap16(val) {
        return ((val & 0xFF) << 8) | ((val >> 8) & 0xFF);
    },

    swap32(val) {
        return (((val & 0xFF) << 24) |
            ((val & 0xFF00) << 8) |
            ((val >> 8) & 0xFF00) |
            ((val >>> 24) & 0xFF)) >>> 0;
    },

    // Popular CRC and checksum algorithms
    algos: [
        {
            name: "Checksum-8 (Sum)", size: 1,
            calc: (arr) => arr.reduce((a, b) => (a + b) & 0xFF, 0)
        },
        {
            name: "Checksum-8 (2's Complement)", size: 1,
            calc: (arr) => {
                const sum = arr.reduce((a, b) => (a + b) & 0xFF, 0);
                return ((~sum) + 1) & 0xFF;
            }
        },
        {
            name: "XOR-8", size: 1,
            calc: (arr) => arr.reduce((a, b) => a ^ b, 0)
        },
        {
            name: "CRC-8 (Standard)", size: 1,
            calc: (arr) => {
                let crc = 0x00;
                for (let b of arr) {
                    crc ^= b;
                    for (let i = 0; i < 8; i++) {
                        crc = crc & 0x80 ? ((crc << 1) ^ 0x07) : (crc << 1);
                    }
                }
                return crc & 0xFF;
            }
        },
        {
            name: "CRC-8 (MAXIM/DALLAS)", size: 1,
            calc: (arr) => {
                let crc = 0x00;
                for (let b of arr) {
                    crc ^= b;
                    for (let i = 0; i < 8; i++) {
                        crc = crc & 0x01 ? ((crc >> 1) ^ 0x8C) : (crc >> 1);
                    }
                }
                return crc & 0xFF;
            }
        },
        {
            name: "CRC-16 (MODBUS)", size: 2,
            calc: (arr) => {
                let crc = 0xFFFF;
                for (let b of arr) {
                    crc ^= b;
                    for (let i = 0; i < 8; i++) {
                        crc = crc & 0x0001 ? ((crc >> 1) ^ 0xA001) : (crc >> 1);
                    }
                }
                return crc & 0xFFFF;
            }
        },
        {
            name: "CRC-16 (CCITT-FALSE)", size: 2,
            calc: (arr) => {
                let crc = 0xFFFF;
                for (let b of arr) {
                    crc ^= (b << 8);
                    for (let i = 0; i < 8; i++) {
                        crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) : (crc << 1);
                    }
                }
                return crc & 0xFFFF;
            }
        },
        {
            name: "CRC-16 (XMODEM)", size: 2,
            calc: (arr) => {
                let crc = 0x0000;
                for (let b of arr) {
                    crc ^= (b << 8);
                    for (let i = 0; i < 8; i++) {
                        crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) : (crc << 1);
                    }
                }
                return crc & 0xFFFF;
            }
        },
        {
            name: "CRC-32", size: 4,
            calc: (arr) => {
                let crc = 0xFFFFFFFF;
                for (let b of arr) {
                    crc ^= b;
                    for (let i = 0; i < 8; i++) {
                        crc = crc & 1 ? ((crc >>> 1) ^ 0xEDB88320) : (crc >>> 1);
                    }
                }
                return (crc ^ 0xFFFFFFFF) >>> 0;
            }
        }
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
                        <label>target match (optional)</label> <input type="text" id="crc-target" placeholder="expected checksum, e.g. C5 CD" style="width: 100%; padding: 10px; font-family: var(--font); background: var(--bg); border: 1px solid var(--border); color: var(--fg); outline: none;">
                    </div>

                    <div class="actions">
                        <button class="btn btn-primary" id="crc-btn">analyze</button> <button class="btn" id="crc-clear">clear</button>
                    </div>

                    <div class="output-wrap">
                        <div id="crc-results" style="display:none; border: 1px solid var(--border); background: color-mix(in srgb, var(--fg) 3%, var(--bg)); overflow: hidden;">
                            <table style="width: 100%; text-align: left; border-collapse: collapse;">
                                <thead>
                                    <tr style="border-bottom: 1px solid var(--border); background: color-mix(in srgb, var(--fg) 5%, var(--bg));">
                                        <th style="padding: 10px 16px; font-weight: 500; color: var(--fg3);">algorithm</th>
                                        <th style="padding: 10px 16px; font-weight: 500; color: var(--fg3);">hex (big-endian)</th>
                                        <th style="padding: 10px 16px; font-weight: 500; color: var(--fg3);">hex (little-endian)</th>
                                    </tr>
                                </thead>
                                <tbody id="crc-table-body" style="font-family: var(--font); font-size: 13px;">
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
            
            <details class="ref">
                <summary>target matching</summary> <div class="ref-body">
                    <p style="font-size: 12px; color: var(--fg2); line-height: 1.6;">
                        Paste the payload <strong>without</strong> the checksum bytes into the main box, and the expected checksum bytes into the target match box. <br><br>
                        The analyzer will compute common algorithms. If an algorithm's output matches the target (in either Big or Little Endian order), the row will be highlighted. Useful for reverse-engineering undocumented protocols via FTDI dumps.
                    </p>
                </div>
            </details>

            <style>
                .crc-row { border-bottom: 1px solid var(--border); transition: background 0.2s; }
                .crc-row:last-child { border-bottom: none; }
                .crc-row:hover { background: color-mix(in srgb, var(--fg) 8%, var(--bg)); }
                .crc-match { background: color-mix(in srgb, var(--color-ok) 15%, var(--bg)) !important; border-left: 4px solid var(--color-ok); }
                .crc-match td { color: var(--fg) !important; font-weight: 500; }
            </style>
        `;
    },

    mount() {
        const resultsDiv = document.getElementById('crc-results');
        const tbody = document.getElementById('crc-table-body');
        const targetInput = document.getElementById('crc-target');

        document.getElementById('crc-btn').onclick = () => {
            const hexInput = document.getElementById('crc-input').value;
            const targetHexStr = targetInput.value.replace(/\s+/g, '').replace(/0x/g, '').toUpperCase();

            if (!hexInput.trim()) return;

            try {
                const bytes = crcLogic.parseHex(hexInput);
                let html = '';

                crcLogic.algos.forEach(algo => {
                    const val = algo.calc(bytes);
                    const hexBE = crcLogic.toHex(val, algo.size);

                    let hexLE = hexBE;
                    if (algo.size === 2) hexLE = crcLogic.toHex(crcLogic.swap16(val), 2);
                    if (algo.size === 4) hexLE = crcLogic.toHex(crcLogic.swap32(val), 4);

                    // Check for match with target (either BE or LE)
                    let isMatch = false;
                    if (targetHexStr) {
                        if (targetHexStr === hexBE || targetHexStr === hexLE) {
                            isMatch = true;
                        }
                    }

                    const rowClass = isMatch ? 'crc-row crc-match' : 'crc-row';

                    html += `
                        <tr class="${rowClass}">
                            <td style="padding: 10px 16px; color: var(--fg);">${algo.name}</td>
                            <td style="padding: 10px 16px; color: ${isMatch ? 'var(--fg)' : 'var(--fg2)'};">${hexBE}</td>
                            <td style="padding: 10px 16px; color: ${isMatch ? 'var(--fg)' : 'var(--fg3)'};">${algo.size > 1 ? hexLE : '-'}</td>
                        </tr>
                    `;
                });

                tbody.innerHTML = html;
                resultsDiv.style.display = 'block';

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
        };
    }
};

window.registerTool(dataCrc);