/* global require, monaco */

// Load Monaco editor core script
const loaderScript = document.createElement('script');
loaderScript.src = './monaco-editor/min/vs/loader.js';
loaderScript.onload = loadDependencies;
document.head.appendChild(loaderScript);

/**
 * Load theme and language data separately, then initialize the editor
 */
async function loadDependencies() {
    try {
        const themeModule = await import('./themes/themes.js');
        const languageModule = await import('./languages.js');

        initializeEditor(themeModule.customThemes, languageModule.languages);
    } catch (error) {
        console.error('Error loading dependencies:', error);
        initializeEditor([], []); // Pass empty arrays for themes and languages
    }
}

/**
 * Function to initialize the Monaco editor with theme and language data
 * @param {Array<{name: string, data: import('monaco-editor').IStandaloneThemeData}>} customThemes - Array of custom themes
 * @param {Array} languages - List of available languages
 */
function initializeEditor(customThemes = [], languages = []) {
    require.config({
        baseUrl: './monaco-editor/min', paths: {'vs': 'vs'},
    });

    require(['vs/editor/editor.main'], function () {
        const themeSelect = document.getElementById('theme-select');
        const languageSelect = document.getElementById('language-select');

        // Define each custom theme and add it to the theme list
        customThemes.forEach(theme => {
            monaco.editor.defineTheme(theme.name, theme.data);
        });

        // Retrieve stored preferences
        const storedTheme = localStorage.getItem('editorTheme') || 'vs-dark';
        const storedLanguage = localStorage.getItem('editorLanguage') || 'markdown';
        let userSelectedTheme = !!localStorage.getItem('editorTheme');

        // Built-in themes
        const themes = [
            {value: 'vs-light', text: 'Visual Studio'},
            {value: 'vs-dark', text: 'Visual Studio Dark'},
            {value: 'hc-black', text: 'High Contrast Dark'},
        ];

        // Add custom themes to the list
        customThemes.forEach(theme => {
            themes.push({value: theme.name, text: theme.name.replace(/-/g, ' ')});
        });

        // Populate theme options
        themes.forEach(theme => {
            addOption(themeSelect, theme.value, theme.text, theme.value === storedTheme);
        });

        // Create the editor instance
        const editor = monaco.editor.create(document.getElementById('editor-container'), {
            value: '# Start Writing here\n',
            language: storedLanguage,
            theme: storedTheme,
            padding: {top: 20},
            automaticLayout: true,
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 14,
            lineHeight: 20,
        });

        // Handle theme and language selection changes
        themeSelect.addEventListener('change', (event) => {
            const selectedTheme = event.target.value;
            monaco.editor.setTheme(selectedTheme);
            localStorage.setItem('editorTheme', selectedTheme);
            userSelectedTheme = true;
        });

        languageSelect.addEventListener('change', (event) => {
            const selectedLanguage = event.target.value;
            monaco.editor.setModelLanguage(editor.getModel(), selectedLanguage);
            localStorage.setItem('editorLanguage', selectedLanguage);
        });

        // Populate language options
        languages.forEach(lang => {
            addOption(languageSelect, lang.value, lang.text, lang.value === storedLanguage);
        });
    });
}

/**
 * Utility function to add an option to a select element
 * @param {HTMLElement} selectElement - The select element to add options to
 * @param {string} value - The value for the option
 * @param {string} text - The text for the option
 * @param {boolean} isSelected - Whether the option should be selected by default
 */
function addOption(selectElement, value, text, isSelected) {
    const option = document.createElement('option');
    option.value = value;
    option.text = text;
    if (isSelected) {
        option.selected = true;
    }
    selectElement.appendChild(option);
}
