/**
 * /etc/tools - core functionality
 * theme, toast notifications, command palette
 */

// Tools registry - add new tools here
const tools = [
    { id: 'mongo.bindata', name: 'bindata', scope: 'mongo', desc: 'binary/uuid converter' },
    { id: 'mongo.objectid', name: 'objectid', scope: 'mongo', desc: 'objectid parser', soon: true },
    { id: 'time.epoch', name: 'epoch', scope: 'time', desc: 'timestamp converter', soon: true },
    { id: 'text.unicode', name: 'unicode', scope: 'text', desc: 'character inspector', soon: true },
];

let currentTool = 'mongo.bindata';
let paletteIndex = 0;

// ============================================
// Theme
// ============================================

function initTheme() {
    const saved = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = saved || (prefersDark ? 'dark' : 'light');
    setTheme(theme);
}

function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('theme', theme);
    document.getElementById('theme-switch').textContent = `[${theme === 'dark' ? 'light' : 'dark'}]`;
}

function toggleTheme() {
    const current = document.documentElement.dataset.theme;
    setTheme(current === 'dark' ? 'light' : 'dark');
}

// ============================================
// Toast
// ============================================

const toast = {
    el: null,
    timeout: null,

    init() {
        this.el = document.getElementById('toast');
    },

    show(msg) {
        if (!this.el) return;
        clearTimeout(this.timeout);
        this.el.textContent = msg;
        this.el.classList.add('show');
        this.timeout = setTimeout(() => this.el.classList.remove('show'), 1800);
    }
};

// ============================================
// Command Palette
// ============================================

const palette = {
    el: null,
    input: null,
    list: null,

    init() {
        this.el = document.getElementById('palette');
        this.input = document.getElementById('palette-input');
        this.list = document.getElementById('palette-list');

        if (!this.el) return;

        // Event listeners
        this.el.onclick = (e) => {
            if (e.target === this.el) this.close();
        };

        this.input.oninput = () => this.filter(this.input.value);
        this.input.onkeydown = (e) => this.handleKeydown(e);
    },

    open() {
        this.el.classList.add('open');
        this.input.value = '';
        this.render(tools);
        this.input.focus();
        paletteIndex = 0;
        this.updateSelection();
    },

    close() {
        this.el.classList.remove('open');
    },

    render(items) {
        if (items.length === 0) {
            this.list.innerHTML = '<div class="palette-empty">no tools found</div>';
            return;
        }

        this.list.innerHTML = items.map((t, i) => `
            <button class="palette-item${i === paletteIndex ? ' selected' : ''}" data-id="${t.id}">
                <span class="name"><span class="scope">${t.scope}.</span>${t.name}</span>
                <span class="desc">${t.desc}${t.soon ? ' (soon)' : ''}</span>
            </button>
        `).join('');

        this.list.querySelectorAll('.palette-item').forEach(item => {
            item.onclick = () => this.select(item.dataset.id);
        });
    },

    updateSelection() {
        const items = this.list.querySelectorAll('.palette-item');
        items.forEach((item, i) => {
            item.classList.toggle('selected', i === paletteIndex);
        });
        items[paletteIndex]?.scrollIntoView({ block: 'nearest' });
    },

    select(id) {
        const tool = tools.find(t => t.id === id);
        if (tool?.soon) {
            toast.show('coming soon');
            return;
        }
        currentTool = id;
        document.querySelector('.tool-trigger span').innerHTML =
            `<span class="scope">${tool.scope}.</span>${tool.name}`;
        this.close();
        // TODO: load tool content dynamically
    },

    filter(query) {
        const q = query.toLowerCase();
        const filtered = tools.filter(t =>
            t.id.includes(q) || t.name.includes(q) || t.desc.includes(q)
        );
        paletteIndex = 0;
        this.render(filtered);
    },

    handleKeydown(e) {
        const items = this.list.querySelectorAll('.palette-item');

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            paletteIndex = Math.min(paletteIndex + 1, items.length - 1);
            this.updateSelection();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            paletteIndex = Math.max(paletteIndex - 1, 0);
            this.updateSelection();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const selected = items[paletteIndex];
            if (selected) this.select(selected.dataset.id);
        } else if (e.key === 'Escape') {
            this.close();
        }
    }
};

// ============================================
// Tabs
// ============================================

function initTabs() {
    document.querySelectorAll('.tool-tab').forEach(tab => {
        tab.onclick = () => {
            document.querySelectorAll('.tool-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(tab.dataset.panel).classList.add('active');
        };
    });
}

// ============================================
// Copy
// ============================================

function initCopyButtons() {
    document.querySelectorAll('.output-copy').forEach(btn => {
        btn.onclick = async () => {
            const output = document.getElementById(btn.dataset.target);
            const text = output.textContent.trim();
            if (!text) return;

            try {
                await navigator.clipboard.writeText(text);
                toast.show('copied');
            } catch {
                toast.show('failed');
            }
        };
    });
}

// ============================================
// Utilities
// ============================================

function radio(name) {
    return document.querySelector(`input[name="${name}"]:checked`)?.value;
}

// ============================================
// Global Keyboard Shortcuts
// ============================================

function initKeyboardShortcuts() {
    document.onkeydown = (e) => {
        // Ctrl/Cmd + K - open palette
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            palette.open();
        }
        // Escape - close palette
        if (e.key === 'Escape') {
            palette.close();
        }
    };
}

// ============================================
// Initialize
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    toast.init();
    palette.init();
    initTabs();
    initCopyButtons();
    initKeyboardShortcuts();

    // Theme toggle
    document.getElementById('theme-switch').onclick = toggleTheme;

    // Tool trigger
    document.getElementById('tool-trigger').onclick = () => palette.open();
});
