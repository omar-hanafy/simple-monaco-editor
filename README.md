# Simple Monaco Editor

This is a minimal setup of the Monaco Editor, a powerful code editor that powers Visual Studio Code. This repository provides a simple, lightweight way to deploy Monaco Editor locally.

## Directory Structure

```
simple-monaco-editor/
├── code_editor.html        # Main HTML file to load the editor
├── editor.js               # JavaScript to initialize and configure the editor
├── languages.js            # Language options for the editor
├── themes/                 # Directory for custom themes
│   ├── index.js           # Aggregates all custom themes
│   └── one-dark-pro.js     # Example custom theme (One Dark Pro)
├── monaco-editor/          # Monaco Editor core files (minified)
│   └── min/                # Required minified build for deployment
└── package.json            # Optional, only if using npm dependency management
```

## Setup

1. **Clone the Repository**
   ```bash
   git clone https://github.com/yourusername/simple-monaco-editor.git
   cd simple-monaco-editor
   ```

2. **Open the Editor in a Browser**

   Open `code_editor.html` in your web browser to start using the Monaco Editor with the provided themes and language options.

## Adding Custom Themes

To add more themes:
1. Create a new `.js` file in the `themes/` directory and define the theme data.
2. Add the theme to `index.js` by importing it and adding it to the `customThemes` array.

Example of a theme file:

```javascript
// themes/your-theme.js
export const yourThemeData = {
    base: 'vs-dark',
    inherit: true,
    rules: [ /* your theme rules here */ ],
    colors: { /* your theme colors here */ },
};
```

## Contributing

Feel free to open issues or submit pull requests for additional themes, language support, or features.

## License

This project is licensed under the [BSD 3-Clause](LICENSE).
