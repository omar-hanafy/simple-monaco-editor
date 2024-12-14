// editor.js

(async () => {
    // Load Monaco Editor
    await loadMonacoEditor();

    // Import themes and languages
    const { customThemes } = await import('./themes/index.js');
    const { languages } = await import('./languages.js');

    // Initialize the editor
    initializeEditor(customThemes, languages);
})().catch(error => {
    console.error('Error initializing the editor:', error);
});

/**
 * Dynamically loads the Monaco Editor's loader script.
 */
function loadMonacoEditor() {
    return new Promise((resolve, reject) => {
        const loaderScript = document.createElement('script');
        loaderScript.src = './monaco-editor/min/vs/loader.js';
        loaderScript.onload = resolve;
        loaderScript.onerror = reject;
        document.head.appendChild(loaderScript);
    });
}

/**
 * Initializes the Monaco Editor with themes and languages.
 * @param {Array} customThemes - Array of custom themes.
 * @param {Array} languages - Array of available languages.
 */
function initializeEditor(customThemes = [], languages = []) {
    require.config({
        baseUrl: './monaco-editor/min',
        paths: { 'vs': 'vs' },
    });

    require(['vs/editor/editor.main'], () => {
        const themeSelect = document.getElementById('theme-select');
        const languageSelect = document.getElementById('language-select');

        // Define custom themes
        customThemes.forEach(theme => {
            monaco.editor.defineTheme(theme.name, theme.data);
        });

        // Built-in themes
        const themes = [
            { value: 'vs', text: 'Visual Studio' },
            { value: 'vs-dark', text: 'Visual Studio Dark' },
            { value: 'hc-black', text: 'High Contrast Dark' },
            // Add custom themes
            ...customThemes.map(theme => ({
                value: theme.name,
                text: theme.displayName || theme.name.replace(/-/g, ' '),
            })),
        ];

        // Populate theme options
        populateSelect(themeSelect, themes, 'editorTheme', 'vs-dark');

        // Populate language options
        populateSelect(languageSelect, languages, 'editorLanguage', 'markdown');

        // Create the editor instance
        const editor = monaco.editor.create(document.getElementById('editor-container'), {
            value: getInitialEditorContent(),
            language: localStorage.getItem('editorLanguage') || 'markdown',
            theme: localStorage.getItem('editorTheme') || 'vs-dark',
            padding: { top: 20 },
            automaticLayout: true,
            fontFamily: 'JetBrains Mono, monospace',
            formatOnType: true,
            formatOnPaste: true,
            fontSize: 14,
            lineHeight: 20,
            minimap: {
                enabled: true,
                side: "right",
                renderCharacters: false
            },
            quickSuggestions: {
                other: true,
                comments: true,
                strings: true
            },
            autoIndent: "full",
            
        });

        // Save content on every change with performance optimization
        const saveStatus = document.getElementById('save-status');
        let saveTimeout;
        let saveInProgress = false;

        editor.onDidChangeModelContent(() => {
            const editorContent = editor.getValue();

            if (!saveInProgress) {
                saveInProgress = true;
                saveStatus.textContent = 'Saving...';
            }

            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(() => {
                localStorage.setItem('editorContent', editorContent);
                saveStatus.textContent = 'Saved';
                saveInProgress = false;
            }, 1000); // Debounce: Save after 1 second of inactivity
        });

        // Event listeners for theme and language changes
        themeSelect.addEventListener('change', event => {
            const selectedTheme = event.target.value;
            monaco.editor.setTheme(selectedTheme);
            localStorage.setItem('editorTheme', selectedTheme);
        });

        languageSelect.addEventListener('change', event => {
            const selectedLanguage = event.target.value;
            monaco.editor.setModelLanguage(editor.getModel(), selectedLanguage);
            localStorage.setItem('editorLanguage', selectedLanguage);
        });
    });
}

/**
 * Populates a select element with options and handles persistence.
 * @param {HTMLElement} selectElement - The select element to populate.
 * @param {Array} options - The options to populate.
 * @param {string} storageKey - The localStorage key for persistence.
 * @param {string} defaultValue - The default value if none is stored.
 */
function populateSelect(selectElement, options, storageKey, defaultValue) {
    const storedValue = localStorage.getItem(storageKey) || defaultValue;
    options.forEach(option => {
        const opt = document.createElement('option');
        opt.value = option.value;
        opt.textContent = option.text;
        if (option.value === storedValue) {
            opt.selected = true;
        }
        selectElement.appendChild(opt);
    });
    localStorage.setItem(storageKey, storedValue);
}

/**
 * Retrieves the initial content for the editor.
 * @returns {string} - The initial content.
 */
function getInitialEditorContent() {
    return localStorage.getItem('editorContent') || '# Start Writing here\n';
}
