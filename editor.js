// editor.js

// (No global controller stub; rely on in-app keybindings)

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
    const tabsScrollEl = document.getElementById('tabs-scroll');
    const addTabBtn = document.getElementById('add-tab');
    const historyBtn   = document.getElementById('history-button');
    const historyPanel = document.getElementById('history-panel');
    const historyList  = document.getElementById('history-list');
    const historyClear = document.getElementById('history-clear');
    const tabsHostEl = tabsScrollEl || tabbarEl;
    // track whether to scroll the tab bar fully to the end after rebuild
    let scrollToEndNext = false;

    const DEFAULT_TAG_COLOR = '#8E8E93'; // Finder-style neutral gray
    const TAG_COLORS = ['#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#007AFF', '#AF52DE', '#8E8E93'];
    let colorPaletteState = null;

    const closeColorPalette = () => {
      if (!colorPaletteState) return;
      if (colorPaletteState.el && colorPaletteState.el.isConnected) {
        colorPaletteState.el.remove();
      }
      if (colorPaletteState.cleanup) {
        colorPaletteState.cleanup();
      }
      colorPaletteState = null;
    };

    // ---- Recently Closed (persistent history) ----
    const LS_HISTORY = 'closedHistoryV1';
    const MAX_HISTORY = 20;
    let closedHistory = safeParse(localStorage.getItem(LS_HISTORY), []) || [];

    function persistHistory() {
      try {
        localStorage.setItem(LS_HISTORY, JSON.stringify(closedHistory));
      } catch (e) {
        // trim until it fits; keep at least a few
        while (closedHistory.length > 5) {
          closedHistory.pop();
          try { localStorage.setItem(LS_HISTORY, JSON.stringify(closedHistory)); break; } catch (_) {}
        }
      }
    }
    function pushClosedHistory(entry) {
      const rec = {
        _hid: entry._hid || (crypto && crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random())),
        name: normalizeTabName(typeof entry.name === 'string' ? entry.name : ''),
        language: entry.language || 'markdown',
        value: entry.value ?? '',
        color: normalizeColor(entry.color),
        closedAt: Date.now(),
      };
      closedHistory.unshift(rec);
      if (closedHistory.length > MAX_HISTORY) closedHistory.length = MAX_HISTORY;
      persistHistory();
    }
    function removeHistoryByHid(hid) {
      const idx = closedHistory.findIndex(r => r._hid === hid);
      if (idx >= 0) {
        closedHistory.splice(idx, 1);
        persistHistory();
      }
    }
    function renderHistory() {
      if (!historyList) return;
      historyList.innerHTML = '';
      if (!closedHistory.length) {
        const empty = document.createElement('div');
        empty.style.opacity = '0.7';
        empty.style.fontSize = '12px';
        empty.textContent = 'No recently closed tabs.';
        historyList.appendChild(empty);
        return;
      }
      closedHistory.forEach((item, i) => {
        const row = document.createElement('div');
        row.className = 'history-item';

        const title = document.createElement('span');
        title.className = 'title';
        const displayName = (item.name || '').trim() || 'Untitled';
        title.textContent = displayName;
        title.title = displayName;

        const meta = document.createElement('span');
        meta.className = 'meta';
        meta.textContent = item.language;

        const del = document.createElement('button');
        del.className = 'delete';
        del.textContent = '×';
        del.title = 'Remove from history';

        title.addEventListener('click', () => {
          closedHistory.splice(i, 1);
          persistHistory();
          createTab(item.name, item.language, item.value ?? defaultContent(), item.color);
          if (historyPanel) historyPanel.hidden = true;
          focusEditorAtEnd();
        });

        del.addEventListener('click', (e) => {
          e.stopPropagation();
          closedHistory.splice(i, 1);
          persistHistory();
          renderHistory();
        });

        row.appendChild(title);
        row.appendChild(meta);
        row.appendChild(del);
        historyList.appendChild(row);
      });
    }

    // Toggle panel
    historyBtn?.addEventListener('click', () => {
      const willOpen = historyPanel.hidden;
      historyPanel.hidden = !willOpen;
      if (willOpen) renderHistory();
    });
    historyClear?.addEventListener('click', () => {
      closedHistory = [];
      persistHistory();
      renderHistory();
    });
    // Close panel on click-away / Escape
    document.addEventListener('click', (e) => {
      if (!historyPanel || historyPanel.hidden) return;
      const t = e.target;
      if (t === historyBtn) return;
      if (!historyPanel.contains(t)) historyPanel.hidden = true;
    });
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      let handled = false;
      if (historyPanel && !historyPanel.hidden) {
        historyPanel.hidden = true;
        handled = true;
      }
      if (colorPaletteState) {
        closeColorPalette();
        handled = true;
      }
      if (renameState) {
        cancelRename();
        handled = true;
      }
      if (handled) e.preventDefault();
    });

    // ---- Themes ----
    customThemes.forEach(theme => monaco.editor.defineTheme(theme.name, theme.data));
    const themes = [
      { value: 'vs', text: 'VS' },
      { value: 'vs-dark', text: 'VS Dark' },
      { value: 'hc-black', text: 'HC Dark' },
      ...customThemes.map(t => ({ value: t.name, text: t.displayShortName || t.displayName || t.name.replace(/-/g, ' ') })),
    ];
    populateSelect(themeSelect, themes, 'editorTheme', 'vs-dark');
    // Apply UI colors to match theme
    applyThemeToUI(themeSelect.value, customThemes);

    // ---- Languages ----
    populateSelect(languageSelect, languages, 'editorLanguage', 'markdown');
    // Compact selects to current option text
    const _selectMeasurer = document.createElement('span');
    _selectMeasurer.style.cssText = 'position:absolute;top:-9999px;left:-9999px;white-space:pre;visibility:hidden;';
    document.body.appendChild(_selectMeasurer);
    function fitSelectWidth(sel, minPx = 44, padPx = 16) {
      const cs = getComputedStyle(sel);
      _selectMeasurer.style.fontFamily = cs.fontFamily;
      _selectMeasurer.style.fontSize = cs.fontSize;
      _selectMeasurer.style.fontWeight = cs.fontWeight;
      _selectMeasurer.textContent = sel.options[sel.selectedIndex]?.text || '';
      const w = Math.ceil(_selectMeasurer.getBoundingClientRect().width + padPx);
      sel.style.width = Math.max(minPx, w) + 'px';
    }
    fitSelectWidth(themeSelect);
    fitSelectWidth(languageSelect);

    // ---- Editor instance ----
    const editor = monaco.editor.create(document.getElementById('editor-container'), {
      value: '', // will be replaced by active tab model
      language: 'markdown',
      theme: localStorage.getItem('editorTheme') || 'vs-dark',
      // Editor is placed below the tab bar; minimal top padding is enough
      padding: { top: 8 },
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

    /** @type {{id:string,name:string,language:string,uri:string,color:string,_dirty?:boolean}[]} */
    let tabs = safeParse(localStorage.getItem(LS_TABS), []);
    let activeTabId = localStorage.getItem(LS_ACTIVE) || null;
    const models = new Map(); // id -> ITextModel
    let renameState = null;
    let pendingRenameId = null;

    // Helpers
    const uuid = () => (crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now() + Math.random());
    const modelKey = id => `model:${id}`;
    const getTab = id => tabs.find(t => t.id === id);
    const getModel = (id) => models.get(id);
    const normalizeColor = (input, fallback = DEFAULT_TAG_COLOR) => {
      if (typeof input !== 'string') return fallback;
      const hex = input.trim();
      if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex)) {
        const normalized = hex.length === 4
          ? '#' + hex.slice(1).split('').map(c => c + c).join('')
          : hex;
        return normalized.toUpperCase();
      }
      return fallback;
    };
    const normalizeTabName = (input, maxLen = 120) => {
      if (typeof input !== 'string') return '';
      let name = input.replace(/[\u0000-\u001F\u007F]/g, '');
      name = name.replace(/\s+/g, ' ').trim();
      if (name.length > maxLen) name = name.slice(0, maxLen).trim();
      return name;
    };
    const setTabElActiveState = (el, isActive) => {
      if (!el) return;
      el.classList.toggle('active', !!isActive);
      el.setAttribute('aria-selected', isActive ? 'true' : 'false');
      el.setAttribute('tabindex', isActive ? '0' : '-1');
    };
    const TAB_ACTIVATE_THRESHOLD = 6;
    const isTabInteractiveTarget = (target) => {
      if (!target || !target.closest) return false;
      return !!target.closest('.tab-color, .tab-color-palette, .close, .rename-input, button, input, select, textarea');
    };

    if (!Array.isArray(tabs)) tabs = [];
    let tabsNeedPersist = false;
    tabs = tabs.filter(Boolean).map((tab) => {
      const id = tab.id || uuid();
      const color = normalizeColor(tab.color);
      const name = normalizeTabName(typeof tab.name === 'string' ? tab.name : '');
      const language = tab.language || 'markdown';
      const uri = tab.uri || `inmemory://${id}`;
      const normalized = {
        ...tab,
        id,
        name,
        language,
        uri,
        color,
      };
      if (tab.id !== normalized.id || tab.name !== normalized.name || tab.language !== normalized.language || tab.uri !== normalized.uri || tab.color !== normalized.color) {
        tabsNeedPersist = true;
      }
      return normalized;
    });
    const setActive = (id) => {
      if (!id) return;
      if (renameState && renameState.tabId !== id) {
        commitRename({ focusEditor: false });
      }
      const prevId = activeTabId;
      activeTabId = id;
      localStorage.setItem(LS_ACTIVE, id);
      closeColorPalette();
      const prevEl = tabsHostEl?.querySelector(`.tab[data-id="${prevId}"]`);
      setTabElActiveState(prevEl, false);
      const nextEl = tabsHostEl?.querySelector(`.tab[data-id="${id}"]`);
      setTabElActiveState(nextEl, true);
      const tab = getTab(id);
      const model = ensureModel(tab);
      editor.setModel(model);
      languageSelect.value = tab.language;
      fitSelectWidth(languageSelect);
      // ensure the active tab is visible when switching
      ensureActiveTabVisible();
      if (pendingRenameId === id) {
        pendingRenameId = null;
        const nameEl = tabsHostEl?.querySelector(`.tab[data-id="${id}"] .name`);
        if (nameEl) startInlineRename(tab, nameEl);
        return;
      }
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

    if (tabsNeedPersist) { persistTabs(); }

    function defaultContent() { return ''; }

    // ---- Create first tab if none ----
    if (!Array.isArray(tabs) || tabs.length === 0) {
      const id = uuid();
      tabs = [{
        id,
        name: '',
        language: localStorage.getItem('editorLanguage') || 'markdown',
        uri: `inmemory://${id}`,
        color: DEFAULT_TAG_COLOR,
      }];
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
      applyThemeToUI(selectedTheme, customThemes);
      fitSelectWidth(themeSelect);
    });

    languageSelect.addEventListener('change', e => {
      const lang = e.target.value;
      const tab = getTab(activeTabId);
      const model = ensureModel(tab);
      monaco.editor.setModelLanguage(model, lang);
      tab.language = lang;
      persistTabs();
      localStorage.setItem('editorLanguage', lang); // keep global default too
      fitSelectWidth(languageSelect);
    });

    addTabBtn.addEventListener('click', () => { scrollToEndNext = true; createTab(); });

    function createTab(name = '', language = localStorage.getItem('editorLanguage') || 'markdown', value = defaultContent(), color = DEFAULT_TAG_COLOR) {
      commitRename({ focusEditor: false });
      scrollToEndNext = true;
      const id = uuid();
      const uri = `inmemory://${id}`;
      const safeName = normalizeTabName(name);
      const safeColor = normalizeColor(color);
      tabs.push({ id, name: safeName, language, uri, color: safeColor });
      persistTabs();
      localStorage.setItem(modelKey(id), value);
      updateTabbar();
      setActive(id);
    }

    const closedStack = [];

    function closeTab(id) {
      commitRename({ focusEditor: false });
      if (tabs.length === 1) {
        // Always keep at least one tab
        const t = getTab(id);
        const val = localStorage.getItem(modelKey(id));
        const hist = { ...t, value: val, _hid: (crypto && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()+Math.random())), closedAt: Date.now() };
        closedStack.push(hist);
        pushClosedHistory(hist);
        localStorage.removeItem(modelKey(id));
        const newId = uuid();
        tabs = [{
          id: newId,
          name: '',
          language: t?.language || 'markdown',
          uri: `inmemory://${newId}`,
          color: normalizeColor(t?.color),
        }];
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

      // push to stack and persistent history for reopen
      const tmeta = getTab(id);
      if (tmeta) {
        const histObj = { ...tmeta, value: content, _hid: (crypto && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()+Math.random())), closedAt: Date.now() };
        closedStack.push(histObj);
        pushClosedHistory(histObj);
      }

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
      commitRename({ focusEditor: false });
      let last = closedStack.pop();
      if (!last) {
        last = closedHistory.shift();
        if (!last) return;
        persistHistory();
      } else if (last._hid) {
        removeHistoryByHid(last._hid);
      }
      createTab(last.name, last.language, last.value ?? defaultContent(), last.color);
    }

    function renameTab(id, newName, options = {}) {
      const t = getTab(id);
      if (!t) return;
      const normalized = normalizeTabName(newName);
      if (t.name === normalized) return;
      t.name = normalized;
      persistTabs();
      if (options.skipDom) return;
      const tabEl = tabsHostEl?.querySelector(`.tab[data-id="${id}"]`);
      if (!tabEl) {
        updateTabbar();
        return;
      }
      tabEl.title = t.name ? t.name : 'Add title';
      const nameEl = tabEl.querySelector('.name');
      if (nameEl) {
        nameEl.textContent = t.name || '';
        nameEl.classList.toggle('placeholder', !t.name);
        nameEl.title = t.name ? 'Rename title (Double click or F2)' : 'Add title (Double click or F2)';
      }
    }

    function setTabColor(id, color) {
      const t = getTab(id);
      if (!t) return;
      const normalized = normalizeColor(color);
      if (t.color === normalized) return;
      t.color = normalized;
      persistTabs();
      const swatch = tabsHostEl?.querySelector(`.tab[data-id="${id}"] .tab-color`);
      if (swatch) {
        swatch.style.setProperty('--tag-color', normalized);
        swatch.style.backgroundColor = normalized;
      }
    }

    const openColorPalette = (anchorEl, tab) => {
      const reopenSame = colorPaletteState && colorPaletteState.tabId === tab.id;
      closeColorPalette();
      if (reopenSame) return;

      const palette = document.createElement('div');
      palette.className = 'tab-color-palette';

      TAG_COLORS.forEach((hex) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.style.setProperty('--swatch-color', hex);
        if (normalizeColor(hex) === normalizeColor(tab.color)) {
          btn.classList.add('active');
        }
        btn.addEventListener('click', (event) => {
          event.stopPropagation();
          setTabColor(tab.id, hex);
          closeColorPalette();
        });
        palette.appendChild(btn);
      });

      document.body.appendChild(palette);

      const anchorRect = anchorEl.getBoundingClientRect();
      const paletteRect = palette.getBoundingClientRect();
      const top = anchorRect.bottom + window.scrollY + 6;
      let left = anchorRect.left + window.scrollX - (paletteRect.width - anchorRect.width) / 2;
      left = Math.max(6, Math.min(left, window.scrollX + window.innerWidth - paletteRect.width - 6));
      palette.style.top = `${Math.round(top)}px`;
      palette.style.left = `${Math.round(left)}px`;

      const onDocPointer = (event) => {
        if (palette.contains(event.target) || anchorEl.contains(event.target)) return;
        closeColorPalette();
      };
      document.addEventListener('pointerdown', onDocPointer, true);

      colorPaletteState = {
        el: palette,
        tabId: tab.id,
        cleanup: () => document.removeEventListener('pointerdown', onDocPointer, true),
      };
    };

    function createNameSpan(tab) {
      const nameSpan = document.createElement('span');
      const hasName = !!tab.name;
      nameSpan.className = 'name' + (hasName ? '' : ' placeholder');
      nameSpan.textContent = tab.name || '';
      nameSpan.title = hasName ? 'Rename title (Double click or F2)' : 'Add title (Double click or F2)';
      nameSpan.addEventListener('click', (event) => {
        event.stopPropagation();
        if (tab.id !== activeTabId) {
          setActive(tab.id);
        } else {
          focusEditorAtEnd();
        }
      });
      return nameSpan;
    }

    function requestRename(id) {
      const tab = getTab(id);
      if (!tab) return;
      if (renameState && renameState.tabId === id) return;
      if (id !== activeTabId) {
        pendingRenameId = id;
        setActive(id);
        return;
      }
      const nameEl = tabsHostEl?.querySelector(`.tab[data-id="${id}"] .name`);
      if (nameEl) startInlineRename(tab, nameEl);
    }

    function commitRename(options = {}) {
      if (!renameState) return;
      const { tabId, input, tabEl } = renameState;
      renameState = null;
      const tab = getTab(tabId);
      if (tab) {
        renameTab(tabId, input.value, { skipDom: true });
        if (input.isConnected) {
          const nameSpan = createNameSpan(tab);
          input.replaceWith(nameSpan);
        }
        if (tabEl) tabEl.title = tab.name ? tab.name : 'Add title';
      } else if (input.isConnected) {
        input.remove();
      }
      if (options.focusEditor !== false) {
        setTimeout(() => focusEditorAtEnd(), 0);
      }
    }

    function cancelRename(options = {}) {
      if (!renameState) return;
      const { tabId, input, tabEl } = renameState;
      renameState = null;
      const tab = getTab(tabId);
      if (tab && input.isConnected) {
        const nameSpan = createNameSpan(tab);
        input.replaceWith(nameSpan);
        if (tabEl) tabEl.title = tab.name ? tab.name : 'Add title';
      } else if (input.isConnected) {
        input.remove();
      }
      if (options.focusEditor !== false) {
        setTimeout(() => focusEditorAtEnd(), 0);
      }
    }

    function updateTabbar() {
      const container = tabsHostEl;
      if (!container) return;

      if (renameState) commitRename({ focusEditor: false });
      closeColorPalette();

      [...container.querySelectorAll('.tab')].forEach(n => n.remove());

      tabs.forEach(tab => {
        const colorValue = normalizeColor(tab.color);
        const el = document.createElement('div');
        el.className = 'tab' + (tab._dirty ? ' dirty' : '');
        el.dataset.id = tab.id;
        el.title = tab.name ? tab.name : 'Add title';
        el.setAttribute('role', 'tab');
        setTabElActiveState(el, tab.id === activeTabId);

        const dot = document.createElement('span');
        dot.className = 'dirty-dot';
        el.appendChild(dot);

        const tagBtn = document.createElement('button');
        tagBtn.type = 'button';
        tagBtn.className = 'tab-color';
        tagBtn.style.setProperty('--tag-color', colorValue);
        tagBtn.style.backgroundColor = colorValue;
        tagBtn.title = 'Change tab color (Alt click to cycle, Shift click to reset)';
        el.appendChild(tagBtn);

        const cyclePreset = () => {
          const current = normalizeColor(tab.color);
          const idx = TAG_COLORS.indexOf(current);
          const next = TAG_COLORS[(idx + 1) % TAG_COLORS.length];
          setTabColor(tab.id, next);
          closeColorPalette();
        };

        tagBtn.addEventListener('click', (event) => {
          event.stopPropagation();
          if (event.shiftKey) {
            event.preventDefault();
            setTabColor(tab.id, DEFAULT_TAG_COLOR);
            closeColorPalette();
            return;
          }
          if (event.altKey) {
            event.preventDefault();
            cyclePreset();
            return;
          }
          openColorPalette(tagBtn, tab);
        });
        tagBtn.addEventListener('contextmenu', (event) => {
          event.preventDefault();
          event.stopPropagation();
          openColorPalette(tagBtn, tab);
        });

        const nameSpan = createNameSpan(tab);
        el.appendChild(nameSpan);

        const close = document.createElement('span');
        close.className = 'close';
        close.textContent = '×';
        close.title = 'Close (Ctrl/Cmd+W)';
        close.addEventListener('click', (event) => {
          event.stopPropagation();
          closeTab(tab.id);
        });
        el.appendChild(close);

        let downState = null;
        const onPointerDown = (event) => {
          if (event.button !== 0) return;
          if (isTabInteractiveTarget(event.target)) return;
          downState = { id: event.pointerId, x: event.clientX, y: event.clientY };
        };
        const onPointerUp = (event) => {
          if (!downState || downState.id !== event.pointerId) return;
          const dx = event.clientX - downState.x;
          const dy = event.clientY - downState.y;
          downState = null;
          if (Math.hypot(dx, dy) <= TAB_ACTIVATE_THRESHOLD) {
            setActive(tab.id);
          }
        };
        const onPointerCancel = (event) => {
          if (downState && downState.id === event.pointerId) downState = null;
        };
        const onMouseDown = (event) => {
          if (event.button !== 0) return;
          if (isTabInteractiveTarget(event.target)) return;
          downState = { x: event.clientX, y: event.clientY };
        };
        const onMouseUp = (event) => {
          if (!downState) return;
          const dx = event.clientX - downState.x;
          const dy = event.clientY - downState.y;
          downState = null;
          if (Math.hypot(dx, dy) <= TAB_ACTIVATE_THRESHOLD) {
            setActive(tab.id);
          }
        };
        const onMouseLeave = () => { downState = null; };

        if ('PointerEvent' in window) {
          el.addEventListener('pointerdown', onPointerDown);
          el.addEventListener('pointerup', onPointerUp);
          el.addEventListener('pointercancel', onPointerCancel);
        } else {
          el.addEventListener('mousedown', onMouseDown);
          el.addEventListener('mouseup', onMouseUp);
          el.addEventListener('mouseleave', onMouseLeave);
        }

        el.addEventListener('click', (event) => {
          if (event.defaultPrevented) return;
          if (isTabInteractiveTarget(event.target)) return;
          setActive(tab.id);
        });
        el.addEventListener('dblclick', (event) => {
          if (event.defaultPrevented) return;
          if (isTabInteractiveTarget(event.target)) return;
          event.preventDefault();
          requestRename(tab.id);
        });

        container.appendChild(el);
      });

      if (addTabBtn && addTabBtn.parentElement !== tabbarEl) {
        tabbarEl.appendChild(addTabBtn);
      }

      ensureActiveTabVisible();
      if (scrollToEndNext) { scrollToEnd(); scrollToEndNext = false; }
    }

    function setTabDirty(id, dirty) {
      const t = getTab(id);
      if (t) t._dirty = !!dirty;
      const el = tabsHostEl?.querySelector(`.tab[data-id="${id}"]`);
      if (el) el.classList.toggle('dirty', !!dirty);
    }

    function startInlineRename(tab, nameSpan) {
      if (!tab || !nameSpan || renameState) return;
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'rename-input';
      input.value = tab.name;
      input.setAttribute('maxlength', '120');
      input.setAttribute('aria-label', 'Rename tab');
      input.placeholder = 'Untitled';
      // size and style to fit
      const width = Math.max(nameSpan.offsetWidth, 80);
      input.style.width = width + 'px';
      input.style.minWidth = '40px';
      const tabEl = nameSpan.closest('.tab');
      nameSpan.replaceWith(input);
      input.focus();
      input.select();
      input.addEventListener('click', (e) => e.stopPropagation());

      renameState = { tabId: tab.id, input, tabEl };

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
        else if (e.key === 'Escape') { e.preventDefault(); cancelRename(); }
      });
      input.addEventListener('blur', () => commitRename());
    }

    // ---- Keybindings ----
    // Register commands directly with Monaco so it handles preventDefault.
    // New Tab (Cmd/Ctrl + T)
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyT, () => createTab());
    // Close Tab (Cmd/Ctrl + W)
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyW, () => closeTab(activeTabId));
    // Reopen Closed (Cmd/Ctrl + Shift + T)
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyT, () => reopenClosedTab());
    // Rename Tab (F2)
    editor.addCommand(monaco.KeyCode.F2, () => requestRename(activeTabId));

    // Helpers for cycling
    const cycleNext = () => {
      const idx = tabs.findIndex(t => t.id === activeTabId);
      const next = tabs[(idx + 1) % tabs.length];
      setActive(next.id);
    };
    const cyclePrev = () => {
      const idx = tabs.findIndex(t => t.id === activeTabId);
      const prev = tabs[(idx - 1 + tabs.length) % tabs.length];
      setActive(prev.id);
    };

    // (No external control API; keyboard shortcuts below handle cycling)

    // Next/Prev: Ctrl/Cmd+Tab and Ctrl/Cmd+Shift+Tab (often intercepted by browser)
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Tab, cycleNext);
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Tab, cyclePrev);

    // Reliable alternatives that browsers don't steal as often
    // Ctrl/Cmd + Alt + ArrowRight/ArrowLeft
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Alt | monaco.KeyCode.RightArrow, cycleNext);
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Alt | monaco.KeyCode.LeftArrow, cyclePrev);

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

    window.addEventListener('keydown', (e) => {
      if (e.key !== 'F2' || e.defaultPrevented) return;
      const target = e.target;
      const tag = target && target.tagName ? target.tagName.toLowerCase() : '';
      if (tag === 'input' || tag === 'textarea' || target?.isContentEditable) return;
      e.preventDefault();
      requestRename(activeTabId);
    }, { capture: true });

    const scrollEl = tabsHostEl || tabbarEl;
    if (scrollEl) {
      let scrollbarFadeTimeout = null;
      const bumpScrollbarVisibility = () => {
        if (!scrollEl.classList.contains('show-scrollbar')) {
          scrollEl.classList.add('show-scrollbar');
        }
        if (scrollbarFadeTimeout) clearTimeout(scrollbarFadeTimeout);
        scrollbarFadeTimeout = setTimeout(() => {
          scrollEl.classList.remove('show-scrollbar');
          scrollbarFadeTimeout = null;
        }, 1200);
      };

      const onTabbarWheel = (e) => {
        if (e.ctrlKey) return; // allow pinch zoom gestures
        if (scrollEl.scrollWidth <= scrollEl.clientWidth) return;
        let dx = e.deltaX;
        const unit = e.deltaMode === 1 ? 16 : (e.deltaMode === 2 ? scrollEl.clientWidth : 1);
        if (dx === 0 && Math.abs(e.deltaY) > 0) {
          dx = e.deltaY;
          e.preventDefault();
        }
        if (dx !== 0) {
          e.preventDefault();
          bumpScrollbarVisibility();
          scrollEl.scrollLeft += dx * unit;
        }
      };
      scrollEl.addEventListener('wheel', onTabbarWheel, { passive: false });

      let panPointerId = null;
      let panStartX = 0;
      let panStartScroll = 0;
      let panActive = false;
      const PAN_ACTIVATE_THRESHOLD = 6;
      scrollEl.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        if (scrollEl.scrollWidth <= scrollEl.clientWidth) return;
        const tgt = e.target;
        if (
          tgt.closest('.tab-color') ||
          tgt.closest('.tab-color-palette') ||
          tgt.closest('.close') ||
          tgt.closest('.rename-input') ||
          tgt.closest('button') ||
          tgt.closest('input') ||
          tgt.closest('select')
        ) {
          return;
        }
        panPointerId = e.pointerId;
        panStartX = e.clientX;
        panStartScroll = scrollEl.scrollLeft;
        panActive = false;
      });
      scrollEl.addEventListener('pointermove', (e) => {
        if (panPointerId == null || e.pointerId !== panPointerId) return;
        const delta = e.clientX - panStartX;
        if (!panActive) {
          if (Math.abs(delta) < PAN_ACTIVATE_THRESHOLD) return;
          panActive = true;
          scrollEl.setPointerCapture(panPointerId);
          scrollEl.classList.add('panning');
          bumpScrollbarVisibility();
        }
        scrollEl.scrollLeft = panStartScroll - delta;
        bumpScrollbarVisibility();
      });
      const endPan = (e) => {
        if (panPointerId == null || e.pointerId !== panPointerId) return;
        if (panActive) {
          scrollEl.releasePointerCapture(panPointerId);
          scrollEl.classList.remove('panning');
        }
        panPointerId = null;
        panActive = false;
        bumpScrollbarVisibility();
      };
      scrollEl.addEventListener('pointerup', endPan);
      scrollEl.addEventListener('pointercancel', endPan);

      scrollEl.addEventListener('mouseenter', bumpScrollbarVisibility);
      scrollEl.addEventListener('mouseleave', () => {
        if (scrollbarFadeTimeout) {
          clearTimeout(scrollbarFadeTimeout);
          scrollbarFadeTimeout = null;
        }
        scrollEl.classList.remove('show-scrollbar');
      });
    }

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

    // Minimal global listener: allow cycling even if focus isn't in Monaco
    window.addEventListener('keydown', (e) => {
      const ctrlOrCmd = e.metaKey || e.ctrlKey;
      if (!ctrlOrCmd || !e.altKey) return;
      if (e.defaultPrevented) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); cycleNext(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); cyclePrev(); }
    }, { capture: true });

    function focusEditorAtEnd() {
      const model = editor.getModel();
      if (!model) { editor.focus(); return; }
      const lastLine = model.getLineCount();
      const lastCol = model.getLineMaxColumn(lastLine);
      editor.setPosition({ lineNumber: lastLine, column: lastCol });
      editor.revealLine(lastLine);
      editor.focus();
    }

    function ensureActiveTabVisible() {
      const container = tabsHostEl || tabbarEl;
      const el = container?.querySelector(`.tab[data-id="${activeTabId}"]`);
      if (!el) return;
      el.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' });
    }

    function scrollToEnd() {
      const container = tabsHostEl || tabbarEl;
      if (!container) return;
      container.scrollTo({ left: container.scrollWidth, behavior: 'smooth' });
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

// --- Theme to UI bridge ---
function applyThemeToUI(themeId, customThemes) {
  const custom = Array.isArray(customThemes) ? customThemes.find(t => t.name === themeId) : null;
  const data = custom && custom.data ? custom.data : null;
  const base = (data && data.base) || (themeId === 'vs' ? 'vs' : (themeId === 'hc-black' ? 'hc-black' : 'vs-dark'));
  const colors = (data && data.colors) || {};
  const isDark = base !== 'vs';

  const bg = colors['editor.background'] || (base === 'vs' ? '#ffffff' : base === 'hc-black' ? '#000000' : '#1e1e1e');
  const fg = colors['editor.foreground'] || (isDark ? '#e6e6e6' : '#111111');
  const mixTarget = isDark ? '#ffffff' : '#000000';
  const isHighContrast = (base === 'hc-black');

  let surface;
  let surfaceHover;
  let surfaceActive;
  let border;
  let activeOutline;

  let activeBorderWidth = '0.5px';
  let tabBorderWidth = '0.5px';

  if (isHighContrast) {
    const hcBase = bg || '#000000';
    surface = hcBase;
    surfaceHover = mixHex(hcBase, '#ffffff', 0.1);
    surfaceActive = hcBase;
    border = rgbaFromHex('#ffffff', 0.35);
    activeOutline = '#ffffff';
    activeBorderWidth = '0.3px';
  } else {
    surface = mixHex(bg, mixTarget, isDark ? 0.12 : 0.06);
    surfaceHover = mixHex(bg, mixTarget, isDark ? 0.18 : 0.10);
    surfaceActive = mixHex(bg, mixTarget, isDark ? 0.24 : 0.14);
    border = rgbaFromHex(mixTarget, isDark ? 0.18 : 0.16);
    activeOutline = rgbaFromHex(mixTarget, isDark ? 0.22 : 0.18);
  }

  const dirty = colors['list.warningForeground'] || (isDark ? '#f59e0b' : '#d97706');

  const root = document.documentElement.style;
  root.setProperty('--ui-bg', bg);
  root.setProperty('--ui-fg', fg);
  root.setProperty('--ui-surface', surface);
  root.setProperty('--ui-surface-hover', surfaceHover);
  root.setProperty('--ui-surface-active', surfaceActive);
  root.setProperty('--ui-border', border);
  root.setProperty('--ui-select-bg', surface);
  root.setProperty('--ui-select-fg', fg);
  root.setProperty('--ui-dirty', dirty);
  root.setProperty('--ui-tab-active-outline', activeOutline);
  root.setProperty('--ui-tab-active-border-width', activeBorderWidth);
  root.setProperty('--ui-tab-border-width', tabBorderWidth);
}

function hexToRgb(hex) {
  let h = (hex || '').toString().trim();
  if (h.startsWith('#')) h = h.slice(1);
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  if (h.length >= 6) h = h.slice(0, 6);
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex({ r, g, b }) {
  const to = (v) => v.toString(16).padStart(2, '0');
  return `#${to(Math.max(0, Math.min(255, r)))}${to(Math.max(0, Math.min(255, g)))}${to(Math.max(0, Math.min(255, b)))}`;
}

function mixHex(hexA, hexB, t) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  const m = (x, y) => Math.round(x + (y - x) * t);
  return rgbToHex({ r: m(a.r, b.r), g: m(a.g, b.g), b: m(a.b, b.b) });
}

function rgbaFromHex(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
