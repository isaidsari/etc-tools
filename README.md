# /etc/tools

minimal developer utilities.

## tools

- **mongo.bindata** - mongodb bindata/uuid converter with legacy encoding support (subtypes 0/3/4, c#/java/python byte order)
- **mongo.objectid** - objectid parser & generator with timestamp extraction
- **time.epoch** - timestamp converter (unix s/ms/µs/ns, iso 8601, rfc 2822, sql, excel serial, mongodb isodate)
- **data.crc** - crc & checksum analyzer — 60+ algorithms (crc-4 through crc-64), target matching, custom parameters
- **data.struct** - binary struct analyzer — parse raw hex against c-struct definitions with interactive byte highlighting
- **data.float** - ieee 754 float inspector — float32/float64 hex ↔ decimal with bit-level visualization
- **data.jwt** - json web token decoder & signer — segment viz, claim humanization, hs256/384/512 verify/sign
- **stream.port** - web serial reader — byte stream capture with configurable frame delimiters (web serial api)

## usage

https://isaidsari.github.io/etc-tools/

or open `index.html` locally. use `ctrl+k` to switch tools.
navigate via url hash: `#data.crc`, `#data.struct`, `#stream.port`, etc.

## develop

```
etc-tools/
├── index.html              # single page, all tools
├── css/
│   └── style.css
├── js/
│   ├── core.js             # router, theme, toast, palette
│   └── tools/
│       ├── mongo-bindata.js
│       ├── mongo-objectid.js
│       ├── time-epoch.js
│       ├── data-crc.js
│       ├── data-struct.js
│       ├── data-float.js
│       ├── data-jwt.js
│       └── stream-port.js
└── README.md
```

adding a tool:
1. create `js/tools/<scope>-<name>.js`, export an object with `id`, `title`, `render()`, `mount()`
2. call `window.registerTool(...)` at the bottom
3. add a `<script>` tag in `index.html`
4. tool appears in the palette automatically

scripts:
- `node scripts/verify-crc.mjs` — runs every algorithm in `data.crc` against `"123456789"` and compares against the reveng check values embedded as `// check: XX` comments

## license

mit
