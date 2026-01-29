# /etc/tools

minimal developer utilities.

## tools

- **mongo.bindata** - mongodb binary/uuid converter with legacy encoding support
- 

## usage

open in browser. use `ctrl+k` to switch tools.

## develop

```
etc-tools/
├── index.html
├── css/
│   └── style.css
├── js/
│   ├── core.js           # theme, toast, palette
│   └── tools/
│       └── mongo-bindata.js
└── README.md
```

add new tools:
1. create `js/tools/your-tool.js`
2. add to `tools` array in `core.js`
3. add script tag in `index.html`

## license

mit
