/**
 * data.struct - Binary/Hex to C-Struct Parser with Highlighting
 */

const structParser = {
    types: {
        'int8_t': { size: 1, get: (v, o, le) => v.getInt8(o) },
        'uint8_t': { size: 1, get: (v, o, le) => v.getUint8(o) },
        'int16_t': { size: 2, get: (v, o, le) => v.getInt16(o, le) },
        'uint16_t': { size: 2, get: (v, o, le) => v.getUint16(o, le) },
        'int32_t': { size: 4, get: (v, o, le) => v.getInt32(o, le) },
        'uint32_t': { size: 4, get: (v, o, le) => v.getUint32(o, le) },
        'int64_t': { size: 8, get: (v, o, le) => v.getBigInt64(o, le).toString() },
        'uint64_t': { size: 8, get: (v, o, le) => v.getBigUint64(o, le).toString() },
        'float': { size: 4, get: (v, o, le) => Number(v.getFloat32(o, le).toFixed(4)) },
        'double': { size: 8, get: (v, o, le) => v.getFloat64(o, le) }
    },

    parseStructDef(def) {
        const lines = def.split('\n');
        const fields = [];
        for (let line of lines) {
            line = line.trim();
            if (!line || line.startsWith('//') || line.startsWith('struct') || line === '{' || line === '}' || line === '};') continue;

            // ex: uint16_t temperature; veya uint8_t mac[6];
            const match = line.match(/^([a-z0-9_]+)\s+([a-z0-9_]+)(?:\[(\d+)\])?\s*;?$/i);
            if (match) {
                const type = match[1];
                const name = match[2];
                const arrayLen = match[3] ? parseInt(match[3], 10) : null;

                if (!this.types[type]) throw new Error(`Unknown type: ${type}`);
                fields.push({ type, name, arrayLen });
            }
        }
        return fields;
    },

    parse(hexString, structDef, littleEndian = true) {
        const cleanHex = hexString.replace(/\s+/g, '').replace(/0x/g, '');
        if (cleanHex.length % 2 !== 0) throw new Error("Invalid hex length. Must be even.");

        const bytes = new Uint8Array(cleanHex.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []);
        const view = new DataView(bytes.buffer);

        const fields = this.parseStructDef(structDef);
        const results = [];
        let offset = 0;

        for (const field of fields) {
            const typeInfo = this.types[field.type];
            const itemSize = typeInfo.size;
            const count = field.arrayLen || 1;
            const totalSize = itemSize * count;

            if (offset + totalSize > view.byteLength) {
                results.push({ name: field.name, error: "EOF", start: offset, length: view.byteLength - offset });
                break;
            }

            let val;
            if (field.arrayLen) {
                val = [];
                for (let i = 0; i < count; i++) {
                    val.push(typeInfo.get(view, offset + (i * itemSize), littleEndian));
                }
            } else {
                val = typeInfo.get(view, offset, littleEndian);
            }

            results.push({
                name: field.name,
                type: field.type + (field.arrayLen ? `[${field.arrayLen}]` : ''),
                value: val,
                start: offset,
                length: totalSize
            });

            offset += totalSize;
        }

        return { bytes, results, processedLength: offset };
    }
};

// Tool definition
const dataStruct = {
    id: 'data.struct',
    title: 'Binary Struct Analyzer',

    render() {
        return `
            <div class="tool-title">${this.title}</div>

            <div class="tool">
                <div class="tool-body panel active" id="parser">
                    
                    <div style="display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 16px;">
                        <div class="field" style="flex: 1; min-width: 250px;">
                            <label>raw hex data</label>
                            <textarea id="hex-input" placeholder="04 30 00 ..." style="font-family: var(--font); height: 180px;"></textarea>
                        </div>
                        
                        <div class="field" style="flex: 1; min-width: 250px;">
                            <label>c-struct definition</label>
                            <textarea id="struct-input" placeholder="struct Payload {&#10;    uint8_t header;&#10;    uint16_t value;&#10;};" style="font-family: var(--font); height: 180px;"></textarea>
                        </div>
                    </div>

                    <div class="seg" style="margin-bottom: 20px;">
                        <span class="seg-label">endianness</span>
                        <label><input type="radio" name="p-endian" value="le" checked><span>little-endian</span></label>
                        <label><input type="radio" name="p-endian" value="be"><span>big-endian</span></label>
                    </div>

                    <div class="actions">
                        <button class="btn btn-primary" id="parse-btn">analyze</button>
                        <button class="btn" id="parse-clear">clear</button>
                    </div>

                    <div id="interactive-output" style="display: none; border: 1px solid var(--border); background: color-mix(in srgb, var(--fg) 3%, var(--bg));">
                        <div style="display: flex; flex-wrap: wrap;">
                            <div id="hex-view" style="flex: 1; padding: 16px; font-family: var(--font); font-size: 13px; line-height: 1.8; border-right: 1px solid var(--border); min-width: 200px;"></div>
                            <div id="struct-view" style="flex: 1; padding: 16px; font-family: var(--font); font-size: 13px; min-width: 250px;"></div>
                        </div>
                    </div>
                </div>
            </div>

            <details class="ref">
                <summary>supported types & reference</summary>
                <div class="ref-body">
                    <table>
                        <tr><th>type</th><th>size (bytes)</th><th>description</th></tr>
                        <tr><td><code>uint8_t / int8_t</code></td><td>1</td><td>8-bit integer</td></tr>
                        <tr><td><code>uint16_t / int16_t</code></td><td>2</td><td>16-bit integer</td></tr>
                        <tr><td><code>uint32_t / int32_t</code></td><td>4</td><td>32-bit integer</td></tr>
                        <tr><td><code>uint64_t / int64_t</code></td><td>8</td><td>64-bit integer</td></tr>
                        <tr><td><code>float</code></td><td>4</td><td>32-bit floating point</td></tr>
                        <tr><td><code>double</code></td><td>8</td><td>64-bit floating point</td></tr>
                    </table>
                    <p style="margin-top: 12px; font-size: 12px; color: var(--fg2);">
                        <strong>Arrays:</strong> Fixed-size arrays are supported (e.g., <code>uint8_t mac[6];</code>).<br>
                        <strong>Comments:</strong> Use <code>//</code> for comments. <code>struct { ... }</code> wrappers are auto-ignored.
                    </p>
                </div>
            </details>

            <style>
                .hex-byte { display: inline-block; width: 22px; text-align: center; color: var(--fg2); transition: all 0.1s; border-radius: 2px; }
                .hex-byte.active { background: var(--fg); color: var(--bg); font-weight: bold; }
                .struct-row { padding: 4px 8px; border-radius: 4px; cursor: default; display: flex; justify-content: space-between; margin-bottom: 2px; }
                .struct-row:hover { background: color-mix(in srgb, var(--fg) 8%, var(--bg)); }
                .s-type { color: var(--fg3); font-size: 11px; margin-right: 8px; width: 80px; display: inline-block; }
                .s-name { color: var(--fg); font-weight: 500; }
                .s-val { color: var(--fg2); }
            </style>
        `;
    },
    mount() {
        const interactiveBox = document.getElementById('interactive-output');
        const hexView = document.getElementById('hex-view');
        const structView = document.getElementById('struct-view');

        document.getElementById('parse-btn').onclick = () => {
            const hex = document.getElementById('hex-input').value;
            const struct = document.getElementById('struct-input').value;
            const isLE = radio('p-endian') === 'le';

            if (!hex.trim() || !struct.trim()) return;

            try {
                const parsed = structParser.parse(hex, struct, isLE);

                // Hex View
                let hexHtml = '';
                parsed.bytes.forEach((b, i) => {
                    const hexStr = b.toString(16).padStart(2, '0').toUpperCase();
                    hexHtml += `<span class="hex-byte" data-idx="${i}">${hexStr}</span> `;
                });
                hexView.innerHTML = hexHtml;

                // Struct View
                let structHtml = '';
                parsed.results.forEach((r, idx) => {
                    const valStr = Array.isArray(r.value) ? `[${r.value.join(', ')}]` : r.value;
                    const errStr = r.error ? `<span style="color:red">ERR: ${r.error}</span>` : valStr;

                    structHtml += `
                        <div class="struct-row" data-start="${r.start}" data-len="${r.length}">
                            <div>
                                <span class="s-type">${r.type}</span>
                                <span class="s-name">${r.name}</span>
                            </div>
                            <span class="s-val">${errStr}</span>
                        </div>
                    `;
                });
                structView.innerHTML = structHtml;
                interactiveBox.style.display = 'block';

                // Hover (Highlight)
                document.querySelectorAll('.struct-row').forEach(row => {
                    row.onmouseenter = () => {
                        const start = parseInt(row.dataset.start);
                        const len = parseInt(row.dataset.len);
                        for (let i = start; i < start + len; i++) {
                            const byteEl = hexView.querySelector(`[data-idx="${i}"]`);
                            if (byteEl) byteEl.classList.add('active');
                        }
                    };
                    row.onmouseleave = () => {
                        document.querySelectorAll('.hex-byte').forEach(el => el.classList.remove('active'));
                    };
                });

            } catch (e) {
                toast.show(`Error: ${e.message}`);
            }
        };

        document.getElementById('parse-clear').onclick = () => {
            document.getElementById('hex-input').value = '';
            document.getElementById('struct-input').value = '';
            interactiveBox.style.display = 'none';
        };
    }
};

window.registerTool(dataStruct);