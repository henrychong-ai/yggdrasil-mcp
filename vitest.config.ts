/**
 * Vitest Configuration - Ironclad Stack Compliant
 *
 * Features:
 * - TypeScript support with globals
 * - 80% coverage thresholds (enforced)
 * - V8 coverage provider
 *
 * @see https://vitest.dev/config/
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Enable global test APIs (describe, it, expect)
    globals: true,

    // Environment: 'node' for MCP server
    environment: 'node',

    // Test file patterns
    include: ['**/__tests__/**/*.test.ts', '**/*.test.ts', '**/*.spec.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],

    // Coverage configuration
    coverage: {
      // Use V8 for fast, accurate coverage
      provider: 'v8',

      // Output formats
      reporter: ['text', 'json', 'html', 'lcov'],

      // Files to include in coverage
      include: ['**/*.ts'],

      // Files to exclude from coverage
      exclude: [
        '**/__tests__/**',
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/*.d.ts',
        '**/dist/**',
        '**/node_modules/**',
        'vitest.config.ts',
        'index.ts', // MCP server bootstrap - thin wrapper, not testable without full server
      ],

      // Coverage thresholds (90% minimum - ENFORCED for public npm package)
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 90,
        statements: 90,
      },
    },

    // Pool configuration (threads for speed)
    pool: 'threads',

    // Timeout for individual tests (ms)
    testTimeout: 10_000,

    // Timeout for hooks (beforeAll, afterAll, etc.)
    hookTimeout: 10_000,
  },
});
