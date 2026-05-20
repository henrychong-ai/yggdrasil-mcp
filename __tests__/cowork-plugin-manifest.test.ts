import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Validates the Claude Code / Cowork plugin manifest at
 * `cowork-plugin/.claude-plugin/plugin.json` and the bundled `.mcp.json`.
 *
 * Spec reference: https://code.claude.com/docs/en/plugins-reference
 */

const pluginRoot = resolve(process.cwd(), 'cowork-plugin');
const manifestPath = resolve(pluginRoot, '.claude-plugin/plugin.json');
const mcpJsonPath = resolve(pluginRoot, '.mcp.json');
const packagePath = resolve(process.cwd(), 'package.json');

type PluginManifest = {
  name: string;
  description: string;
  version: string;
  author?: { name: string; email?: string; url?: string };
  homepage?: string;
  repository?: string;
  license?: string;
  keywords?: string[];
};

type McpJson = {
  mcpServers: Record<
    string,
    {
      command: string;
      args?: string[];
      env?: Record<string, string>;
      cwd?: string;
    }
  >;
};

function loadManifest(): PluginManifest {
  expect(existsSync(manifestPath), '.claude-plugin/plugin.json missing').toBe(true);
  return JSON.parse(readFileSync(manifestPath, 'utf8')) as PluginManifest;
}

function loadMcpJson(): McpJson {
  expect(existsSync(mcpJsonPath), 'cowork-plugin/.mcp.json missing').toBe(true);
  return JSON.parse(readFileSync(mcpJsonPath, 'utf8')) as McpJson;
}

function loadPackage(): { version: string; name: string } {
  return JSON.parse(readFileSync(packagePath, 'utf8')) as { version: string; name: string };
}

describe('Cowork/Code plugin manifest', () => {
  it('parses as valid JSON', () => {
    expect(() => loadManifest()).not.toThrow();
  });

  it('declares plugin name yggdrasil-mcp', () => {
    expect(loadManifest().name).toBe('yggdrasil-mcp');
  });

  it('version matches package.json (single source of truth)', () => {
    expect(loadManifest().version).toBe(loadPackage().version);
  });

  it('has non-empty description', () => {
    expect(loadManifest().description.length).toBeGreaterThan(0);
  });

  it('points at the GitHub repo for homepage + repository', () => {
    const m = loadManifest();
    if (m.homepage) {
      expect(m.homepage).toMatch(/github\.com\/henrychong-ai\/yggdrasil-mcp/);
    }
    if (m.repository) {
      expect(m.repository).toMatch(/github\.com\/henrychong-ai\/yggdrasil-mcp/);
    }
  });

  it('declares MIT license', () => {
    expect(loadManifest().license).toBe('MIT');
  });
});

describe('Cowork/Code plugin .mcp.json', () => {
  it('parses as valid JSON', () => {
    expect(() => loadMcpJson()).not.toThrow();
  });

  it('declares an yggdrasil mcpServers entry', () => {
    const mcp = loadMcpJson();
    expect(mcp.mcpServers).toBeDefined();
    expect(mcp.mcpServers.yggdrasil).toBeDefined();
  });

  it('uses npx as the command (canonical pattern per Anthropic plugins-reference)', () => {
    expect(loadMcpJson().mcpServers.yggdrasil.command).toBe('npx');
  });

  it('args invoke yggdrasil-mcp via npx -y (non-interactive npm fetch)', () => {
    const args = loadMcpJson().mcpServers.yggdrasil.args;
    expect(args).toBeDefined();
    expect(args).toEqual(['-y', 'yggdrasil-mcp']);
  });
});

describe('Cowork/Code plugin filesystem layout', () => {
  it('plugin.json is inside .claude-plugin/ (per Anthropic spec)', () => {
    expect(existsSync(manifestPath)).toBe(true);
  });

  it('.mcp.json is at plugin root, NOT inside .claude-plugin/', () => {
    const wrongPath = resolve(pluginRoot, '.claude-plugin/.mcp.json');
    expect(existsSync(wrongPath)).toBe(false);
    expect(existsSync(mcpJsonPath)).toBe(true);
  });

  it('does NOT place commands/agents/skills/hooks inside .claude-plugin/', () => {
    // Anthropic spec warning: only plugin.json goes in .claude-plugin/
    const forbidden = ['commands', 'agents', 'skills', 'hooks'];
    for (const dir of forbidden) {
      const wrongPath = resolve(pluginRoot, `.claude-plugin/${dir}`);
      expect(
        existsSync(wrongPath),
        `${dir}/ must NOT be inside .claude-plugin/ — keep it at plugin root if present`
      ).toBe(false);
    }
  });
});
