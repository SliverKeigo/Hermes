import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['public/**/*.html'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Default configuration for TypeScript files (assuming Node.js context)
    files: ['**/*.ts', '**/*.mts', '**/*.cts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off', // Allow any for now as we use it in some places
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
    },
    languageOptions: {
      globals: {
        // Here we can add specific globals if needed for TS files that are not Node or Browser
      },
      parserOptions: {
        project: './tsconfig.json',
      },
    },
    ignores: ['dist/', 'node_modules/', 'public/locales/'], // Ignore locale JSON files
  },
  {
    // Specific configuration for browser-side JavaScript files
    files: ['public/**/*.js'], // Target JavaScript files in the public directory
    languageOptions: {
      ecmaVersion: 2021, // Use a modern ECMAScript version
      sourceType: 'module', // Treat files as ES Modules
      globals: {
        // Define browser globals
        window: 'readonly',
        document: 'readonly',
        localStorage: 'readonly',
        fetch: 'readonly',
        navigator: 'readonly',
        console: 'readonly', // console is often used in browser JS
      },
    },
    rules: {
      'no-undef': 'error', // Ensure all other globals are defined
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }], // Keep this
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }], // Allow specific console methods
      // If you are using TypeScript for public/js, you might need to adjust parser
    },
    // We are not using TypeScript for public/js, so no parser here
  },
);
