// editor.js

(async () => {
  await loadMonacoEditor();

  const { customThemes } = await import('./themes/index.js');
  const { languages } = await import('./languages.js');

  initializeEditor(customThemes, languages);
})().catch(error => {
  console.error('Error initializing the editor:', error);
});

function loadMonacoEditor() {
  return new Promise((resolve, reject) => {
    const loaderScript = document.createElement('script');
    loaderScript.src = './monaco-editor/min/vs/loader.js';
    loaderScript.onload = resolve;
    loaderScript.onerror = reject;
    document.head.appendChild(loaderScript);
  });
}

function initializeEditor(customThemes = [], languages = []) {
  require.config({
    baseUrl: './monaco-editor/min',
    paths: { 'vs': 'vs' },
  });

  require(['vs/editor/editor.main'], () => {
    const themeSelect = document.getElementById('theme-select');
    const languageSelect = document.getElementById('language-select');
    const tabbarEl = document.getElementById('tabbar');
    const addTabBtn = document.getElementById('add-tab');

    // ---- Themes ----
    customThemes.forEach(theme => monaco.editor.defineTheme(theme.name, theme.data));
    const themes = [
      { value: 'vs', text: 'Visual Studio' },
      { value: 'vs-dark', text: 'Visual Studio Dark' },
      { value: 'hc-black', text: 'High Contrast Dark' },
      ...customThemes.map(t => ({ value: t.name, text: t.displayName || t.name.replace(/-/g, ' ') })),
    ];
    populateSelect(themeSelect, themes, 'editorTheme', 'vs-dark');

    // ---- Languages ----
    populateSelect(languageSelect, languages, 'editorLanguage', 'markdown');

    // ---- Editor instance ----
    const editor = monaco.editor.create(document.getElementById('editor-container'), {
      value: '', // will be replaced by active tab model
      language: 'markdown',
      theme: localStorage.getItem('editorTheme') || 'vs-dark',
      padding: { top: 44 },
      automaticLayout: true,
      fontFamily: 'JetBrains Mono, monospace',
      formatOnType: true,
      formatOnPaste: true,
      fontSize: 14,
      lineHeight: 20,
      minimap: { enabled: true, side: "right", renderCharacters: false },
      quickSuggestions: { other: true, comments: true, strings: true },
      autoIndent: "full",
    });

    // ---- Tab State ----
    const LS_TABS = 'tabsMetaV1';
    const LS_ACTIVE = 'activeTabIdV1';

    /** @type {{id:string,name:string,language:string, uri:string}[]} */
    let tabs = safeParse(localStorage.getItem(LS_TABS), []);
    let activeTabId = localStorage.getItem(LS_ACTIVE) || null;
    const models = new Map(); // id -> ITextModel

    // Helpers
    const uuid = () => (crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now() + Math.random());
    const modelKey = id => `model:${id}`;
    const getTab = id => tabs.find(t => t.id === id);
    const getModel = (id) => models.get(id);
    const setActive = (id) => {
      activeTabId = id;
      localStorage.setItem(LS_ACTIVE, id);
      updateTabbar();
      const tab = getTab(id);
      const model = ensureModel(tab);
      editor.setModel(model);
      languageSelect.value = tab.language;
      // keep typing flow seamless when switching tabs; put caret at end
      focusEditorAtEnd();
    };
    const ensureModel = (tab) => {
      let m = getModel(tab.id);
      if (m) return m;
      const uri = monaco.Uri.parse(tab.uri);
      const value = localStorage.getItem(modelKey(tab.id)) ?? defaultContent();
      m = monaco.editor.createModel(value, tab.language, uri);
      models.set(tab.id, m);
      return m;
    };
    const persistTabs = () => localStorage.setItem(LS_TABS, JSON.stringify(tabs));

    function defaultContent() { return '# Start Writing here\n'; }

    // ---- Create first tab if none ----
    if (!Array.isArray(tabs) || tabs.length === 0) {
      const id = uuid();
      tabs = [{ id, name: 'Untitled', language: localStorage.getItem('editorLanguage') || 'markdown', uri: `inmemory://${id}` }];
      persistTabs();
      activeTabId = id;
      localStorage.setItem(LS_ACTIVE, id);
    } else if (!activeTabId || !getTab(activeTabId)) {
      activeTabId = tabs[0].id;
      localStorage.setItem(LS_ACTIVE, activeTabId);
    }

    // Build models for all tabs lazily on switch; ensure active is ready
    ensureModel(getTab(activeTabId));
    updateTabbar();
    setActive(activeTabId); // sets model on editor

    // ---- Saving (per-model) with debounce; background-only, no UI rebuild ----
    const saveTimeouts = new Map(); // id -> timeout

    const scheduleSave = () => {
      const id = activeTabId;
      const model = editor.getModel();
      if (!model) return;
      const value = model.getValue();

      // debounce per-tab
      const prev = saveTimeouts.get(id);
      if (prev) clearTimeout(prev);
      const to = setTimeout(() => {
        localStorage.setItem(modelKey(id), value);
        setTabDirty(id, false); // mark clean without rebuilding the whole tabbar
        saveTimeouts.delete(id);
      }, 700);
      saveTimeouts.set(id, to);
    };

    editor.onDidChangeModelContent(() => {
      // mark dirty immediately for active tab without full rerender
      const t = getTab(activeTabId);
      if (t && !t._dirty) { setTabDirty(t.id, true); }
      scheduleSave();
    });

    // ---- UI events ----
    themeSelect.addEventListener('change', e => {
      const selectedTheme = e.target.value;
      monaco.editor.setTheme(selectedTheme);
      localStorage.setItem('editorTheme', selectedTheme);
    });

    languageSelect.addEventListener('change', e => {
      const lang = e.target.value;
      const tab = getTab(activeTabId);
      const model = ensureModel(tab);
      monaco.editor.setModelLanguage(model, lang);
      tab.language = lang;
      persistTabs();
      localStorage.setItem('editorLanguage', lang); // keep global default too
    });

    addTabBtn.addEventListener('click', () => createTab());

    function createTab(name = 'Untitled', language = localStorage.getItem('editorLanguage') || 'markdown', value = defaultContent()) {
      const id = uuid();
      const uri = `inmemory://${id}`;
      tabs.push({ id, name, language, uri });
      persistTabs();
      localStorage.setItem(modelKey(id), value);
      updateTabbar();
      setActive(id);
      // After activation, immediately start inline rename for better UX
      const activeNameEl = tabbarEl.querySelector('.tab.active .name');
      if (activeNameEl) startInlineRename(getTab(id), activeNameEl);
    }

    const closedStack = [];

    function closeTab(id) {
      if (tabs.length === 1) {
        // Always keep at least one tab
        const t = getTab(id);
        const val = localStorage.getItem(modelKey(id));
        closedStack.push({ ...t, value: val });
        localStorage.removeItem(modelKey(id));
        const newId = uuid();
        tabs = [{ id: newId, name: 'Untitled', language: t?.language || 'markdown', uri: `inmemory://${newId}` }];
        persistTabs();
        updateTabbar();
        setActive(newId);
        return;
      }

      const idx = tabs.findIndex(t => t.id === id);
      if (idx === -1) return;

      // dispose model
      const m = getModel(id);
      let content = null;
      if (m) { content = m.getValue(); m.dispose(); models.delete(id); }

      // drop storage
      if (content === null) content = localStorage.getItem(modelKey(id));
      localStorage.removeItem(modelKey(id));

      // push to stack for reopen
      const tmeta = getTab(id);
      if (tmeta) closedStack.push({ ...tmeta, value: content });

      // choose next active
      const closingActive = id === activeTabId;
      tabs.splice(idx, 1);
      persistTabs();
      updateTabbar();

      if (closingActive) {
        const next = tabs[idx] || tabs[idx - 1];
        setActive(next.id);
      }
      // refocus editor after closing
      focusEditorAtEnd();
    }

    function reopenClosedTab() {
      const last = closedStack.pop();
      if (!last) return;
      createTab(last.name, last.language, last.value ?? defaultContent());
    }

    function renameTab(id, newName) {
      const t = getTab(id);
      if (!t) return;
      t.name = (newName || 'Untitled').trim() || 'Untitled';
      persistTabs();
      updateTabbar();
    }

    function updateTabbar() {
      // remove existing dynamic tabs (keep the add button)
      [...tabbarEl.querySelectorAll('.tab')].forEach(n => n.remove());

      tabs.forEach(tab => {
        const el = document.createElement('div');
        el.className = 'tab' + (tab.id === activeTabId ? ' active' : '') + (tab._dirty ? ' dirty' : '');
        el.dataset.id = tab.id;
        el.title = tab.name;

        const dot = document.createElement('span');
        dot.className = 'dirty-dot';
        el.appendChild(dot);

        const nameSpan = document.createElement('span');
        nameSpan.className = 'name';
        nameSpan.textContent = tab.name;
        // Inline rename on click if active
        nameSpan.addEventListener('click', (e) => {
          if (tab.id !== activeTabId) return; // clicking inactive name just activates via parent
          e.stopPropagation();
          startInlineRename(tab, nameSpan);
        });
        el.appendChild(nameSpan);

        const close = document.createElement('span');
        close.className = 'close';
        close.textContent = '×';
        close.title = 'Close (Ctrl/Cmd+W)';
        close.addEventListener('click', (e) => {
          e.stopPropagation();
          closeTab(tab.id);
        });
        el.appendChild(close);

        // activate on click
        el.addEventListener('click', () => setActive(tab.id));

        // remove prompt-based rename; handled inline on name click when active

        tabbarEl.appendChild(el);
      });
      // keep add button at start
      tabbarEl.prepend(addTabBtn);
    }

    function setTabDirty(id, dirty) {
      const t = getTab(id);
      if (t) t._dirty = !!dirty;
      const el = tabbarEl.querySelector(`.tab[data-id="${id}"]`);
      if (el) el.classList.toggle('dirty', !!dirty);
    }

    function startInlineRename(tab, nameSpan) {
      // Replace name span with an input for quick inline rename
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'rename-input';
      input.value = tab.name;
      input.setAttribute('maxlength', '120');
      // size and style to fit
      input.style.width = nameSpan.offsetWidth ? nameSpan.offsetWidth + 'px' : '140px';
      nameSpan.replaceWith(input);
      input.focus();
      input.select();

      const commit = () => {
        renameTab(tab.id, input.value);
        // return focus to the editor so user can type immediately at end
        setTimeout(() => focusEditorAtEnd(), 0);
      };
      const cancel = () => {
        updateTabbar();
        setTimeout(() => focusEditorAtEnd(), 0);
      };

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
        else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
      });
      input.addEventListener('blur', commit);
    }

    // ---- Keybindings ----
    // Register commands directly with Monaco so it handles preventDefault.
    // New Tab (Cmd/Ctrl + T)
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyT, () => createTab());
    // Close Tab (Cmd/Ctrl + W)
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyW, () => closeTab(activeTabId));
    // Reopen Closed (Cmd/Ctrl + Shift + T)
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyT, () => reopenClosedTab());

    // Next/Prev: Ctrl/Cmd+Tab and Ctrl/Cmd+Shift+Tab (may be intercepted by browser/OS)
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Tab, () => {
      const idx = tabs.findIndex(t => t.id === activeTabId);
      const next = tabs[(idx + 1) % tabs.length];
      setActive(next.id);
    });
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Tab, () => {
      const idx = tabs.findIndex(t => t.id === activeTabId);
      const prev = tabs[(idx - 1 + tabs.length) % tabs.length];
      setActive(prev.id);
    });

    // Numeric switching (browser-safe): Cmd/Ctrl+Alt+1..9
    window.addEventListener('keydown', (e) => {
      const ctrlOrCmd = e.metaKey || e.ctrlKey;
      const alt = e.altKey;
      if (!ctrlOrCmd || !alt) return;
      if (e.key >= '1' && e.key <= '9') {
        e.preventDefault();
        const num = parseInt(e.key, 10);
        if (num === 9) {
          setActive(tabs[tabs.length - 1].id);
        } else {
          const idx = num - 1;
          if (tabs[idx]) setActive(tabs[idx].id);
        }
      }
    }, { capture: true });

    // Global fallback for editor-like shortcuts when focus is outside Monaco
    window.addEventListener('keydown', (e) => {
      const ctrlOrCmd = e.metaKey || e.ctrlKey;
      if (!ctrlOrCmd || e.altKey) return; // mirror pure Cmd/Ctrl chords only
      if (e.defaultPrevented) return; // if Monaco or others handled it

      const key = (e.key || '').toLowerCase();
      if (key === 't' && !e.shiftKey) {
        e.preventDefault();
        createTab();
      } else if (key === 'w' && !e.shiftKey) {
        e.preventDefault();
        closeTab(activeTabId);
      } else if (key === 't' && e.shiftKey) {
        e.preventDefault();
        reopenClosedTab();
      }
    });

    function focusEditorAtEnd() {
      const model = editor.getModel();
      if (!model) { editor.focus(); return; }
      const lastLine = model.getLineCount();
      const lastCol = model.getLineMaxColumn(lastLine);
      editor.setPosition({ lineNumber: lastLine, column: lastCol });
      editor.revealLine(lastLine);
      editor.focus();
    }
  });
}

// --- unchanged helpers from your original ---
function populateSelect(selectElement, options, storageKey, defaultValue) {
  const storedValue = localStorage.getItem(storageKey) || defaultValue;
  options.forEach(option => {
    const opt = document.createElement('option');
    opt.value = option.value;
    opt.textContent = option.text;
    if (option.value === storedValue) opt.selected = true;
    selectElement.appendChild(opt);
  });
  localStorage.setItem(storageKey, storedValue);
}

// Not used anymore but kept for compatibility if you call it elsewhere
function getInitialEditorContent() {
  return localStorage.getItem('editorContent') || '# Start Writing here\n';
}

function safeParse(s, fallback) {
  try { return JSON.parse(s); } catch { return fallback; }
}
