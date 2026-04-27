# Package.json Changes for CLI Support

This document shows the required changes to package.json to support CLI functionality.

## New Dependencies

Add these to the `dependencies` section:

```json
{
  "dependencies": {
    "commander": "^12.0.0",
    "glob": "^10.3.10"
  }
}
```

**Rationale:**
- `commander`: Industry-standard CLI argument parsing
- `glob`: File pattern matching (already used implicitly via VS Code, but needed for Node.js)

## New Scripts

Add these to the `scripts` section:

```json
{
  "scripts": {
    "cli": "node out/cli/analyze.js",
    "cli:example": "npm run compile && npm run cli -- --root . --format github-summary --verbose",
    "cli:json": "npm run compile && npm run cli -- --root . --format json --output ddp-analysis.json",
    "cli:dev": "npm run compile && npm run cli -- --root . --format github-summary"
  }
}
```

**Usage:**
```bash
# Development/testing
npm run cli:example

# Generate JSON output
npm run cli:json

# Direct invocation
npm run cli -- --help
```

## Binary Entry Point

Add this to enable global installation and `npx` usage:

```json
{
  "bin": {
    "ddp-analyze": "./out/cli/analyze.js"
  }
}
```

**Enables:**
```bash
# After npm install -g
ddp-analyze --root . --format json

# Or via npx (no install)
npx dependable-dependencies --root . --format github-summary
```

## Complete package.json (Relevant Sections)

```json
{
  "name": "dependable-dependencies",
  "displayName": "Dependable Dependencies Risk",
  "description": "Surfaces high-risk code using Rank × CRAP (Dependable Dependencies principle).",
  "version": "0.1.0",
  "publisher": "local",
  "repository": {
    "type": "git",
    "url": "https://github.com/reschex/dep-deps"
  },
  "engines": {
    "vscode": "^1.85.0",
    "node": ">=18.0.0"
  },
  "categories": [
    "Other"
  ],
  "activationEvents": [
    "onStartupFinished"
  ],
  "main": "./out/extension.js",
  "bin": {
    "ddp-analyze": "./out/cli/analyze.js"
  },
  "scripts": {
    "vscode:prepublish": "npm run compile",
    "compile": "tsc -p ./",
    "watch": "tsc -watch -p ./",
    "pretest": "npm run compile && npm run lint",
    "lint": "eslint src --ext ts",
    "test": "vitest",
    "test:coverage": "vitest run --coverage",
    "cli": "node out/cli/analyze.js",
    "cli:example": "npm run compile && npm run cli -- --root . --format github-summary --verbose",
    "cli:json": "npm run compile && npm run cli -- --root . --format json --output ddp-analysis.json",
    "cli:dev": "npm run compile && npm run cli -- --root . --format github-summary"
  },
  "dependencies": {
    "commander": "^12.0.0",
    "glob": "^10.3.10"
  },
  "devDependencies": {
    "@types/vscode": "^1.85.0",
    "@types/node": "20.x",
    "@typescript-eslint/eslint-plugin": "^6.15.0",
    "@typescript-eslint/parser": "^6.15.0",
    "eslint": "^8.56.0",
    "typescript": "^5.3.3",
    "@vitest/coverage-v8": "^1.1.0",
    "vitest": "^1.1.0",
    "@stryker-mutator/core": "^8.0.0",
    "@stryker-mutator/vitest-runner": "^8.0.0"
  }
}
```

## Verification

After making these changes, run:

```bash
# Install new dependencies
npm install

# Verify compilation
npm run compile

# Test CLI (should show help)
npm run cli -- --help

# Test example run
npm run cli:example
```

## Backwards Compatibility

✅ **No breaking changes:**
- Existing VS Code extension functionality unchanged
- All existing scripts still work
- New dependencies are additive (don't conflict)
- Binary entry point doesn't affect extension activation

## Publishing Considerations

When publishing to npm or VS Code Marketplace:

1. **VS Code Extension:** Use `vsce package` as usual
2. **npm Package:** Can be published separately or as unified package
3. **Dual-purpose:** package.json supports both extension and CLI use cases

**Recommended:** Keep as single package to avoid drift between implementations.

## TypeScript Configuration

Ensure `tsconfig.json` includes CLI files:

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2022",
    "outDir": "out",
    "lib": ["ES2022"],
    "sourceMap": true,
    "rootDir": "src",
    "strict": true
  },
  "include": [
    "src/**/*"
  ],
  "exclude": [
    "node_modules",
    ".vscode-test"
  ]
}
```

**Note:** The `"include": ["src/**/*"]` already covers `src/cli/` — no changes needed!

## GitHub Actions Workflow Updates

Update `.github/workflows/ci.yml` to demonstrate CLI:

```yaml
# Add after existing test step
- name: Test CLI
  run: |
    npm run compile
    npm run cli -- --help
    npm run cli -- --root . --format json --output test-output.json

- name: Upload CLI Test Output
  uses: actions/upload-artifact@v4
  with:
    name: cli-test-output
    path: test-output.json
```

## Installation Instructions (for users)

Add to README.md:

````markdown
### CLI Usage (GitHub Actions, CI/CD)

Install as a dev dependency:

```bash
npm install --save-dev dependable-dependencies
```

Run analysis:

```bash
npx ddp-analyze --root . --format github-summary
```

Or add to package.json scripts:

```json
{
  "scripts": {
    "analyze": "ddp-analyze --root . --format json --output analysis.json"
  }
}
```

Then use in CI:

```bash
npm run analyze
```
````

---

**Questions?** See [ARCHITECTURE_SUMMARY.md](./ARCHITECTURE_SUMMARY.md) for complete documentation.
