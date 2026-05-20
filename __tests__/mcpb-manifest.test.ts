import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Validates the MCPB manifest at `mcpb/manifest.json` against the
 * expectations encoded in our build pipeline (scripts/build-mcpb.sh) and
 * the v3 distribution plan.
 *
 * Manifest spec reference: https://github.com/anthropics/mcpb
 */

const manifestPath = resolve(process.cwd(), 'mcpb/manifest.json');
const iconPath = resolve(process.cwd(), 'mcpb/icon.png');
const packagePath = resolve(process.cwd(), 'package.json');

type Manifest = {
  manifest_version: string;
  name: string;
  display_name: string;
  version: string;
  description: string;
  long_description?: string;
  author: { name: string; email?: string; url?: string };
  homepage: string;
  documentation?: string;
  support?: string;
  repository: { type: string; url: string };
  license: string;
  keywords?: string[];
  icon: string;
  server: {
    type: string;
    entry_point: string;
    mcp_config: { command: string; args: string[]; env?: Record<string, string> };
  };
  tools: Array<{ name: string; description: string }>;
  compatibility?: {
    claude_desktop?: string;
    platforms?: string[];
    runtimes?: { node?: string };
  };
};

function loadManifest(): Manifest {
  expect(existsSync(manifestPath), 'mcpb/manifest.json missing').toBe(true);
  return JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest;
}

function loadPackage(): { version: string; name: string } {
  return JSON.parse(readFileSync(packagePath, 'utf8')) as { version: string; name: string };
}

describe('MCPB manifest', () => {
  it('parses as valid JSON', () => {
    expect(() => loadManifest()).not.toThrow();
  });

  it('declares manifest_version 0.3', () => {
    expect(loadManifest().manifest_version).toBe('0.3');
  });

  it('has package name yggdrasil-mcp', () => {
    expect(loadManifest().name).toBe('yggdrasil-mcp');
  });

  it('version matches package.json (single source of truth)', () => {
    const manifest = loadManifest();
    const pkg = loadPackage();
    expect(manifest.version).toBe(pkg.version);
  });

  it('declares MIT license', () => {
    expect(loadManifest().license).toBe('MIT');
  });

  it('points at repo + homepage + issues URLs that match the GitHub project', () => {
    const m = loadManifest();
    expect(m.homepage).toMatch(/github\.com\/henrychong-ai\/yggdrasil-mcp/);
    expect(m.repository.url).toMatch(/github\.com\/henrychong-ai\/yggdrasil-mcp/);
    if (m.support) {
      expect(m.support).toMatch(/github\.com\/henrychong-ai\/yggdrasil-mcp\/issues/);
    }
  });

  describe('server config', () => {
    it('uses node runtime', () => {
      expect(loadManifest().server.type).toBe('node');
    });

    it('entry_point points at server/dist/index.js (build script layout)', () => {
      expect(loadManifest().server.entry_point).toBe('server/dist/index.js');
    });

    it('mcp_config command is node with ${__dirname}-relative arg', () => {
      const cfg = loadManifest().server.mcp_config;
      expect(cfg.command).toBe('node');
      expect(cfg.args).toHaveLength(1);
      expect(cfg.args[0]).toContain('${__dirname}');
      expect(cfg.args[0]).toContain('server/dist/index.js');
    });
  });

  describe('tools', () => {
    it('declares the 6 Yggdrasil tools', () => {
      const toolNames = loadManifest().tools.map((t) => t.name);
      expect(toolNames).toEqual(
        expect.arrayContaining([
          'sequential_thinking',
          'deep_planning',
          'list_plans',
          'get_plan',
          'promote_plan',
          'archive_plans',
        ])
      );
      expect(toolNames).toHaveLength(6);
    });

    it('every tool has a non-empty description', () => {
      const tools = loadManifest().tools;
      for (const tool of tools) {
        expect(tool.description.length).toBeGreaterThan(0);
      }
    });
  });

  describe('compatibility', () => {
    it('requires Node.js >=24', () => {
      const node = loadManifest().compatibility?.runtimes?.node;
      expect(node).toBeDefined();
      // Accept >=24 or >=24.0.0
      expect(node).toMatch(/^>=24(\.0\.0)?$/);
    });

    it('lists all 3 desktop platforms', () => {
      const platforms = loadManifest().compatibility?.platforms;
      expect(platforms).toEqual(expect.arrayContaining(['darwin', 'win32', 'linux']));
    });
  });

  describe('icon', () => {
    it('manifest references icon.png', () => {
      expect(loadManifest().icon).toBe('icon.png');
    });

    it('icon file exists alongside manifest', () => {
      expect(existsSync(iconPath)).toBe(true);
    });

    it('icon is a non-empty PNG file', () => {
      const stats = statSync(iconPath);
      expect(stats.size).toBeGreaterThan(0);

      // Validate PNG magic bytes (89 50 4E 47 0D 0A 1A 0A)
      const header = readFileSync(iconPath).subarray(0, 8);
      expect(header[0]).toBe(0x89);
      expect(header[1]).toBe(0x50);
      expect(header[2]).toBe(0x4e);
      expect(header[3]).toBe(0x47);
    });
  });
});
