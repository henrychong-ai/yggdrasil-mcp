import { homedir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { PersistenceManager, resolvePlansDirectory } from '../persistence.js';

/**
 * Guards the test suite itself: no test may read or write the developer's real
 * plans directory. `vitest.config.ts` points YGGDRASIL_PLANS_DIR at a throwaway
 * directory for every worker; if that is removed, these fail before any other
 * test can leave session files or a rewritten index behind.
 */
describe('test isolation', () => {
  const realPlansDir = path.join(homedir(), '.claude', 'plans');

  it('runs with a plans directory override in place', () => {
    const override = process.env['YGGDRASIL_PLANS_DIR'];
    expect(override, 'vitest.config.ts must set YGGDRASIL_PLANS_DIR').toBeTruthy();
    expect(path.resolve(override ?? '')).not.toBe(realPlansDir);
  });

  it('resolves the default plans directory away from the real one', () => {
    expect(path.resolve(resolvePlansDirectory())).not.toBe(realPlansDir);
    expect(path.resolve(new PersistenceManager().getPlansDir())).not.toBe(realPlansDir);
  });
});
