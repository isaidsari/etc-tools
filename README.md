# /etc/tools

minimal developer utilities.

## tools

- **mongo.bindata** - mongodb binary/uuid converter with legacy encoding support
- **mongo.objectid** - mongodb objectid parser & generator with timestamp extraction
- **time.epoch** - timestamp converter with multiple format support (unix, iso, excel serial)

## usage

open `index.html` in browser. use `ctrl+k` to switch tools.
navigate via url: `#mongo.bindata`, `#mongo.objectid`, `#time.epoch`

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
│       └── time-epoch.js
└── README.md
```

add new tools:
1. create `js/tools/your-tool.js` with render/mount pattern:
   ```javascript
   const yourTool = {
       id: 'scope.name',
       title: 'Tool Title',
       render() { return `<div>...html...</div>`; },
       mount() { /* setup event listeners */ }
   };
   window.registerTool(yourTool);
   ```
2. add script tag to `index.html`
3. tool auto-registers and appears in palette

## license

mit
