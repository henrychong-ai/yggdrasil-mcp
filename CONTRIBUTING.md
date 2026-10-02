# Contributing to Yggdrasil-MCP

Thank you for your interest in contributing to Yggdrasil-MCP!

## How to Contribute

### Reporting Bugs

1. Check existing [issues](https://github.com/henrychong-ai/yggdrasil-mcp/issues) to avoid duplicates
2. Use the bug report template
3. Include reproduction steps, expected vs actual behavior, and environment details

### Suggesting Features

1. Open a feature request issue
2. Describe the use case and proposed solution
3. Be open to discussion and alternative approaches

### Pull Requests

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Ensure all checks pass (see below)
5. Submit a pull request

## Development Setup

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/yggdrasil-mcp.git
cd yggdrasil-mcp

# Install dependencies
pnpm install

# Run the full quality check
pnpm check
```

## Quality Requirements

All contributions must pass:

```bash
# Linting (zero warnings)
pnpm lint

# Formatting
pnpm format:check

# Type checking
pnpm typecheck

# Public-content check (no personal paths, secret references or private hosts)
pnpm public:check

# Tests (90% coverage minimum)
pnpm test
```

`pnpm check` runs lint, format check, typecheck and the public-content check in one command. It does not run the tests: run `pnpm test` separately.

This repository is public. `pnpm public:check` fails if a tracked file contains a personal home path, a real secret-manager reference, a private host name or a private identifier; use placeholders and environment variables instead. The pre-commit hook and CI run it too.

## Code Style

- **TypeScript**: Strict mode enabled
- **Oxlint**: Linting with zero warnings allowed (see .oxlintrc.json)
- **Biome**: Auto-formatting (see biome.json)
- **Tests**: Vitest with 90% coverage threshold

## Commit Messages

Use clear, descriptive commit messages:

- `feat:` New features
- `fix:` Bug fixes
- `docs:` Documentation changes
- `chore:` Maintenance tasks
- `test:` Test additions/changes
- `refactor:` Code refactoring

## Questions?

Open an issue or start a discussion. We're happy to help!
