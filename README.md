# Simple Monaco Editor

This project provides a streamlined setup for deploying the Monaco Editor locally. It includes custom themes, language support, and configuration options for a seamless code editing experience similar to Visual Studio Code.

## Directory Structure

```plaintext
simple-monaco-editor/
├── LICENSE                    # License file (BSD 3-Clause)
├── README.md                  # Project documentation
├── editor.js                  # JavaScript to initialize and configure the editor
├── index.html                 # Main HTML file to load the editor
├── languages.js               # Defines available languages for the editor
├── monaco-editor/             # Core files for Monaco Editor
├── styles.css                 # Styling for the editor and controls
└── themes/                    # Custom themes for the editor
    ├── index.js               # Aggregates all custom themes
    ├── one-dark-pro.js        # One Dark Pro theme
    └── one-dark-pro-transparent.js  # Transparent version of One Dark Pro theme
```

## Setup

1. **Clone the Repository**
   ```bash
   git clone https://github.com/yourusername/simple-monaco-editor.git
   cd simple-monaco-editor
   ```

2. **Open the Editor in a Browser**

   Open `index.html` in your web browser to start using the Monaco Editor with the provided themes and language options.

## Configuration

- **Themes**: Choose between several built-in and custom themes, including One Dark Pro and its transparent variant. You can select themes directly in the editor interface.
- **Languages**: Supports multiple programming languages defined in `languages.js`.

## Adding Custom Themes

To add additional themes:

1. **Create a New Theme File**  
   Add a `.js` file in the `themes/` directory and define your theme data. For example:

   ```javascript
   // themes/your-theme.js
   export const yourThemeData = {
       base: 'vs-dark',
       inherit: true,
       rules: [ /* theme syntax rules */ ],
       colors: { /* theme color settings */ },
   };
   ```

2. **Import and Register the Theme**  
   Open `themes/index.js` and import your new theme, then add it to the `customThemes` array:

   ```javascript
   import { yourThemeData } from './your-theme.js';

   export const customThemes = [
       { name: 'One-Dark-Pro', data: oneDarkProThemeData },
       { name: 'One-Dark-Pro-Transparent', data: oneDarkProTransparentThemeData },
       { name: 'Your-Theme', data: yourThemeData }, // Add your theme here
   ];
   ```

## Contributing

Contributions are welcome! You can submit issues or pull requests for additional themes, language support, or new features.

## License

This project is licensed under the [BSD 3-Clause License](LICENSE).
