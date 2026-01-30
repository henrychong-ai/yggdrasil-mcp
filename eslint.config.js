// ESLint Flat Config - TypeScript Strict + Full Plugin Stack
// Lint skill compliant configuration for yggdrasil-mcp

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import stylistic from '@stylistic/eslint-plugin';
import importPlugin from 'eslint-plugin-import';
import unicorn from 'eslint-plugin-unicorn';
import sonarjs from 'eslint-plugin-sonarjs';
import promise from 'eslint-plugin-promise';
import n from 'eslint-plugin-n';
import vitest from 'eslint-plugin-vitest';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  // =============================================================================
  // IGNORES
  // =============================================================================
  {
    ignores: ['dist/', 'node_modules/', 'coverage/', '*.config.js', '*.config.mjs'],
  },

  // =============================================================================
  // CORE PLUGINS
  // =============================================================================

  // Base ESLint recommended
  eslint.configs.recommended,

  // TypeScript strict + stylistic
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  // Parser options for type-aware linting (all TS files)
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.eslint.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // Stylistic plugin
  stylistic.configs.recommended,

  // Import plugin
  {
    plugins: {
      import: importPlugin,
    },
    rules: {
      'import/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      'import/no-duplicates': 'error',
      'import/no-cycle': 'error',
      'import/no-unresolved': 'off',
    },
  },

  // Unicorn plugin
  {
    plugins: {
      unicorn,
    },
    rules: {
      ...unicorn.configs.recommended.rules,
      'unicorn/filename-case': [
        'error',
        {
          cases: { kebabCase: true, pascalCase: true },
        },
      ],
      'unicorn/prevent-abbreviations': 'off',
      'unicorn/no-null': 'off',
    },
  },

  // SonarJS plugin
  {
    plugins: {
      sonarjs,
    },
    rules: {
      ...sonarjs.configs.recommended.rules,
    },
  },

  // Promise plugin
  {
    plugins: {
      promise,
    },
    rules: {
      ...promise.configs.recommended.rules,
    },
  },

  // =============================================================================
  // CONDITIONAL PLUGINS
  // =============================================================================

  // Node.js (MCP server)
  {
    plugins: { n },
    rules: {
      ...n.configs.recommended.rules,
      'n/no-missing-import': 'off',
      'n/no-unpublished-import': 'off',
    },
  },

  // Vitest (unit testing)
  {
    files: ['**/*.test.ts', '**/*.spec.ts', '**/__tests__/**/*.ts'],
    plugins: {
      vitest,
    },
    rules: {
      ...vitest.configs.recommended.rules,
      'vitest/no-focused-tests': 'error',
      'vitest/no-disabled-tests': 'warn',
      // Relax strict rules for tests
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
    },
  },

  // =============================================================================
  // CUSTOM RULE OVERRIDES
  // =============================================================================
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports',
          fixStyle: 'separate-type-imports',
        },
      ],
      '@typescript-eslint/consistent-type-exports': 'error',
      // Allow numbers and booleans in template literals (common pattern)
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        {
          allowNumber: true,
          allowBoolean: true,
        },
      ],
      '@stylistic/semi': ['error', 'always'],
      '@stylistic/quotes': ['error', 'single', { avoidEscape: true }],
      '@stylistic/comma-dangle': ['error', 'always-multiline'],
      '@stylistic/max-len': ['error', { code: 100, ignoreUrls: true, ignoreStrings: true }],
      // This is a CLI tool - process.exit is appropriate
      'n/no-process-exit': 'off',
      // Allow hashbang for CLI entry point
      'n/hashbang': 'off',
    },
  },

  // =============================================================================
  // PRETTIER (must be last)
  // =============================================================================
  prettier
);
