/**
 * /etc/tools - core functionality
 * theme, toast notifications, command palette
 */

// Tools registry
const tools = [];
const registeredTools = {};
let currentTool = null;

// Register a tool
window.registerTool = (tool) => {
    registeredTools[tool.id] = tool;

    // Add to palette list
    const [scope, name] = tool.id.split('.');
    tools.push({
        id: tool.id,
        name: name,
        scope: scope,
        desc: tool.title || tool.id
    });
};

// -- router

const router = {
    container: null,

    // Navigate to a tool
    navigate(toolId) {
        const tool = registeredTools[toolId];
        if (!tool) {
            // Default to first registered tool
            const firstToolId = Object.keys(registeredTools)[0];
            if (firstToolId) this.navigate(firstToolId);
            return;
        }

        // Re-selecting the active tool would wipe its input on remount
        if (toolId === currentTool) return;

        // Unmount current tool
        if (currentTool && registeredTools[currentTool]) {
            const prev = registeredTools[currentTool];
            try { if (prev.unmount) prev.unmount(); } catch (e) { console.error('unmount error', e); }
        }

        // Render new tool
        if (!this.container) {
            this.container = document.getElementById('tool-container');
        }

        if (this.container) {
            this.container.innerHTML = tool.render();
            currentTool = toolId;

            // Mount tool (setup event handlers)
            try { if (tool.mount) tool.mount(); } catch (e) { console.error('mount error', e); }

            // Update header
            const toolMeta = tools.find(t => t.id === toolId);
            if (toolMeta) {
                const triggerText = document.getElementById('tool-trigger-text');
                if (triggerText) {
                    triggerText.innerHTML = `<span class="scope">${toolMeta.scope}.</span>${toolMeta.name}`;
                }
            }

            // Update URL hash
            if (window.location.hash !== '#' + toolId) {
                history.replaceState(null, null, '#' + toolId);
            }

            // Update document title
            document.title = `/etc/tools · ${toolId}`;
        }
    },

    // Initialize router
    init() {
        this.container = document.getElementById('tool-container');

        // Handle hash changes
        window.addEventListener('hashchange', () => {
            const hash = window.location.hash.slice(1);
            if (hash) this.navigate(hash);
        });

        // Initial load (wait for tools to register)
        setTimeout(() => {
            const hash = window.location.hash.slice(1);
            this.navigate(hash || Object.keys(registeredTools)[0]);
        }, 0);
    }
};

// -- theme (three-way: auto / light / dark)

const THEME_CYCLE = ['auto', 'light', 'dark'];
const THEME_MEDIA = window.matchMedia('(prefers-color-scheme: dark)');

function resolveTheme(mode) {
    if (mode === 'auto') return THEME_MEDIA.matches ? 'dark' : 'light';
    return mode;
}

function applyTheme(mode) {
    document.documentElement.dataset.theme = resolveTheme(mode);
    document.documentElement.dataset.themeMode = mode;
    localStorage.setItem('theme-mode', mode);
    const btn = document.getElementById('theme-switch');
    if (btn) btn.textContent = `[${mode}]`;
}

function initTheme() {
    const saved = localStorage.getItem('theme-mode');
    // back-compat: old 'theme' key with 'dark'/'light' value
    const legacy = localStorage.getItem('theme');
    const mode = saved || legacy || 'auto';
    applyTheme(mode);
    // When in auto mode, react to system change
    THEME_MEDIA.addEventListener('change', () => {
        if (document.documentElement.dataset.themeMode === 'auto') {
            applyTheme('auto');
        }
    });
}

function cycleTheme() {
    const current = document.documentElement.dataset.themeMode || 'auto';
    const next = THEME_CYCLE[(THEME_CYCLE.indexOf(current) + 1) % THEME_CYCLE.length];
    applyTheme(next);
}

// -- toast

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

// -- palette

const palette = {
    el: null,
    input: null,
    list: null,
    index: 0,

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
        const currentIndex = tools.findIndex(t => t.id === currentTool);
        this.index = currentIndex >= 0 ? currentIndex : 0;
        this.render(tools);
        this.input.focus();
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
            <button class="palette-item${i === this.index ? ' selected' : ''}" data-id="${t.id}">
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
            item.classList.toggle('selected', i === this.index);
        });
        items[this.index]?.scrollIntoView({ block: 'nearest' });
    },

    select(id) {
        const tool = tools.find(t => t.id === id);
        if (!tool) return;

        router.navigate(id);
        this.close();
    },

    filter(query) {
        const q = query.toLowerCase();
        const filtered = tools.filter(t =>
            t.id.includes(q) || t.name.includes(q) || t.desc.includes(q)
        );
        this.index = 0;
        this.render(filtered);
    },

    handleKeydown(e) {
        const items = this.list.querySelectorAll('.palette-item');

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            this.index = Math.min(this.index + 1, items.length - 1);
            this.updateSelection();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            this.index = Math.max(this.index - 1, 0);
            this.updateSelection();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const selected = items[this.index];
            if (selected) this.select(selected.dataset.id);
        } else if (e.key === 'Escape') {
            this.close();
        }
    }
};

// -- copy

function initCopyDelegation() {
    document.addEventListener('click', async (e) => {
        const btn = e.target.closest('.output-copy');
        if (!btn) return;
        const output = document.getElementById(btn.dataset.target);
        if (!output) return;
        const text = output.textContent.trim();
        if (!text) return;
        try {
            await navigator.clipboard.writeText(text);
            toast.show('copied');
        } catch {
            toast.show('failed');
        }
    });
}

// -- utilities

function radio(name) {
    return document.querySelector(`input[name="${name}"]:checked`)?.value;
}

function bindCtrlEnter(inputId, actionId) {
    document.getElementById(inputId)?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            document.getElementById(actionId)?.click();
        }
    });
}

// Debounce input → run, with leading clear when emptied
function liveBind(input, run, ms = 200) {
    if (typeof input === 'string') input = document.getElementById(input);
    if (!input) return;
    let timer = null;
    input.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(run, ms);
    });
}

// Set / clear input error state (red border + small error message below).
// Looks for a sibling `.error-msg` div; creates one inline if missing.
function setError(input, message) {
    if (typeof input === 'string') input = document.getElementById(input);
    if (!input) return;
    input.classList.add('input-error');
    let msg = input.parentNode.querySelector('.error-msg');
    if (!msg) {
        msg = document.createElement('div');
        msg.className = 'error-msg';
        input.parentNode.insertBefore(msg, input.nextSibling);
    }
    msg.textContent = message;
}

function clearError(input) {
    if (typeof input === 'string') input = document.getElementById(input);
    if (!input) return;
    input.classList.remove('input-error');
    const msg = input.parentNode.querySelector('.error-msg');
    if (msg) msg.remove();
}

// Expose for tools
window.liveBind   = liveBind;
window.setError   = setError;
window.clearError = clearError;

async function safeCopy(text) {
    try {
        await navigator.clipboard.writeText(text);
        toast.show('copied');
    } catch {
        toast.show('failed');
    }
}

// -- keyboard shortcuts

function initKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            palette.open();
        }
        if (e.key === 'Escape') {
            palette.close();
        }
    });
}

// -- init

function initTabDelegation() {
    document.addEventListener('click', (e) => {
        const tab = e.target.closest('.tool-tab');
        if (!tab) return;
        document.querySelectorAll('.tool-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        const panel = document.getElementById(tab.dataset.panel);
        if (panel) panel.classList.add('active');
    });
}

document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    router.init();
    toast.init();
    palette.init();
    initTabDelegation();
    initCopyDelegation();
    initKeyboardShortcuts();

    // Theme toggle (auto → light → dark → auto …)
    document.getElementById('theme-switch').onclick = cycleTheme;

    // Tool trigger
    document.getElementById('tool-trigger').onclick = () => palette.open();
});
