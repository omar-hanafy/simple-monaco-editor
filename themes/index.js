// themes/index.js

import { oneDarkProThemeData } from './one-dark-pro.js';
import { oneDarkProTransparentThemeData } from './one-dark-pro-transparent.js';

export const customThemes = [
    {
        name: 'one-dark-pro',
        displayName: 'One Dark Pro',
        data: oneDarkProThemeData,
    },
    {
        name: 'one-dark-pro-transparent',
        displayName: 'One Dark Pro Transparent',
        data: oneDarkProTransparentThemeData,
    },
    // Add more themes as needed
];
