/**
 * stream.port - Web Serial API Reader & Framer
 */

const streamPort = {
    id: 'stream.port',
    title: 'Serial Port Reader',

    // State
    port: null,
    reader: null,
    keepReading: false,
    buffer: [],

    render() {
        return `
            <div class="tool-title">${this.title}</div>
            <div class="tool-desc">read and frame raw byte streams from serial devices via web serial api</div>

            <div class="tool">
                <div class="tool-body panel active">
                    
                    <div style="display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 16px;">
                        <div class="field" style="flex: 1; min-width: 120px;">
                            <label>baud rate</label>
                            <input type="number" id="serial-baud" value="115200" style="width: 100%; padding: 10px; font-family: var(--font); background: var(--bg); border: 1px solid var(--border); color: var(--fg); outline: none;">
                        </div>
                        
                        <div class="field" style="flex: 1; min-width: 120px;">
                            <label>frame delimiter (hex)</label>
                            <input type="text" id="serial-delim" placeholder="e.g., 0A or AA 55" style="width: 100%; padding: 10px; font-family: var(--font); background: var(--bg); border: 1px solid var(--border); color: var(--fg); outline: none;">
                        </div>
                    </div>

                    <div class="actions">
                        <button class="btn btn-primary" id="serial-connect">connect</button>
                        <button class="btn" id="serial-disconnect" style="display: none;">disconnect</button>
                        <button class="btn" id="serial-clear">clear output</button>
                        <span id="serial-status" style="margin-left: auto; align-self: center; font-size: 11px; color: var(--fg3);">disconnected</span>
                    </div>

                    <div class="output-wrap">
                        <div id="serial-output" style="height: 300px; overflow-y: auto; border: 1px solid var(--border); background: color-mix(in srgb, var(--fg) 3%, var(--bg)); padding: 12px; font-family: var(--font); font-size: 13px; line-height: 1.6; color: var(--fg);">
                            <div style="color: var(--fg3);">// waiting for connection...</div>
                        </div>
                    </div>
                </div>
            </div>

            <details class="ref">
                <summary>web serial api info</summary>
                <div class="ref-body">
                    <p style="font-size: 12px; color: var(--fg2); line-height: 1.6;">
                        This tool uses the browser's native Web Serial API. It requires a secure context (HTTPS or localhost) and works on most modern browsers (Chrome, Edge, Opera) excluding Firefox and Safari.<br><br>
                        <strong>Framing:</strong> If you specify a frame delimiter (e.g., <code>0A</code> for newline), the incoming byte stream will be split into readable blocks whenever that byte sequence is encountered. Leave empty for a continuous raw hex stream.
                    </p>
                </div>
            </details>
            
            <style>
                .serial-frame { border-bottom: 1px solid color-mix(in srgb, var(--fg) 10%, transparent); padding-bottom: 4px; margin-bottom: 4px; word-break: break-all; }
                .serial-frame:last-child { border-bottom: none; }
            </style>
        `;
    },

    unmount() {
        this.keepReading = false;
        if (this.reader) this.reader.cancel().catch(() => {});
        if (this.port) this.port.close().catch(() => {});
        this.reader = null;
        this.port = null;
        this.buffer = [];
    },

    mount() {
        const connectBtn = document.getElementById('serial-connect');
        const disconnectBtn = document.getElementById('serial-disconnect');
        const clearBtn = document.getElementById('serial-clear');
        const output = document.getElementById('serial-output');
        const status = document.getElementById('serial-status');
        const delimInput = document.getElementById('serial-delim');

        // Check browser support
        if (!("serial" in navigator)) {
            status.textContent = "web serial api not supported in this browser";
            status.style.color = "var(--color-err)";
            connectBtn.disabled = true;
            return;
        }

        const toHex = (num) => num.toString(16).padStart(2, '0').toUpperCase();

        const appendOutput = (hexStr, isFrameEnd = false) => {
            // Append to the last frame div or create a new one
            let lastFrame = output.lastElementChild;
            if (!lastFrame || lastFrame.classList.contains('frame-ended') || lastFrame.tagName !== 'DIV') {
                lastFrame = document.createElement('div');
                lastFrame.className = 'serial-frame';
                output.appendChild(lastFrame);
            }

            lastFrame.textContent += hexStr + ' ';

            if (isFrameEnd) {
                lastFrame.classList.add('frame-ended');
            }

            // Auto-scroll
            output.scrollTop = output.scrollHeight;
        };

        const readLoop = async () => {
            while (this.port.readable && this.keepReading) {
                this.reader = this.port.readable.getReader();
                try {
                    while (true) {
                        const { value, done } = await this.reader.read();
                        if (done) break;
                        if (value) {
                            // Parse delimiter once per chunk, not per byte
                            const delimStr = delimInput.value.replace(/\s+/g, '').toUpperCase();
                            const hasDelim = delimStr.length > 0 && delimStr.length % 2 === 0;

                            for (let i = 0; i < value.length; i++) {
                                const byteHex = toHex(value[i]);

                                if (hasDelim) {
                                    this.buffer.push(byteHex);
                                    const currentBufferStr = this.buffer.join('');

                                    if (currentBufferStr.endsWith(delimStr)) {
                                        const frameData = currentBufferStr.slice(0, -delimStr.length);
                                        if (frameData) appendOutput(frameData.match(/.{1,2}/g).join(' '), false);
                                        appendOutput(delimStr.match(/.{1,2}/g).join(' '), true);
                                        this.buffer = [];
                                    } else if (this.buffer.length > 1024) {
                                        // Prevent memory overflow if delimiter is never found
                                        appendOutput(this.buffer.join(' '), true);
                                        this.buffer = [];
                                    }
                                } else {
                                    appendOutput(byteHex, false);
                                }
                            }
                        }
                    }
                } catch (error) {
                    if (this.keepReading) toast.show('read error');
                } finally {
                    this.reader.releaseLock();
                }
            }
        };

        connectBtn.onclick = async () => {
            const baudRate = parseInt(document.getElementById('serial-baud').value, 10);
            if (!baudRate || isNaN(baudRate)) {
                toast.show("invalid baud rate");
                return;
            }

            try {
                this.port = await navigator.serial.requestPort();
                await this.port.open({ baudRate });

                this.keepReading = true;
                connectBtn.style.display = 'none';
                disconnectBtn.style.display = 'inline-block';
                status.textContent = "connected";
                status.style.color = "var(--color-ok)";

                output.innerHTML = ''; // Clear waiting text
                this.buffer = [];

                // Start reading asynchronously
                readLoop();

            } catch (error) {
                console.error("Connection failed:", error);
                toast.show("connection failed");
            }
        };

        disconnectBtn.onclick = async () => {
            this.keepReading = false;

            if (this.reader) {
                await this.reader.cancel();
            }
            if (this.port) {
                await this.port.close();
            }

            connectBtn.style.display = 'inline-block';
            disconnectBtn.style.display = 'none';
            status.textContent = "disconnected";
            status.style.color = "var(--fg3)";
            this.buffer = [];

            const lastFrame = document.createElement('div');
            lastFrame.style.color = "var(--fg3)";
            lastFrame.style.marginTop = "8px";
            lastFrame.textContent = "// connection closed";
            output.appendChild(lastFrame);
        };

        clearBtn.onclick = () => {
            output.innerHTML = '';
            this.buffer = [];
        };
    }
};

window.registerTool(streamPort);