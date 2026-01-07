import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import prettierConfig from 'eslint-config-prettier';

export default [
  // Global ignores - must be separate object without 'files'
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      '*.config.js',
      '*.config.ts',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        // Window and document
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        console: 'readonly',
        // Timers
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        // Storage
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        // Network
        fetch: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        Request: 'readonly',
        Response: 'readonly',
        Headers: 'readonly',
        // DOM types
        HTMLElement: 'readonly',
        HTMLDivElement: 'readonly',
        SVGElement: 'readonly',
        SVGSVGElement: 'readonly',
        SVGGElement: 'readonly',
        SVGLineElement: 'readonly',
        SVGCircleElement: 'readonly',
        Element: 'readonly',
        Event: 'readonly',
        MouseEvent: 'readonly',
        MutationObserver: 'readonly',
        ResizeObserver: 'readonly',
        ResizeObserverCallback: 'readonly',
        ResizeObserverEntry: 'readonly',
        // Other browser APIs
        Audio: 'readonly',
        crypto: 'readonly',
        btoa: 'readonly',
        atob: 'readonly',
        getComputedStyle: 'readonly',
        // TypeScript/Fetch types
        RequestInit: 'readonly',
        // Encoding
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
        // IndexedDB
        indexedDB: 'readonly',
        IDBDatabase: 'readonly',
        IDBValidKey: 'readonly',
        // Node.js (for config files)
        process: 'readonly',
        // React types
        React: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      react: react,
      'react-hooks': reactHooks,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
  },
  prettierConfig,
];
