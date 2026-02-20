
## Strict Requirements

### Runtime & Package Manager

**Use Bun exclusively. No Node.js or npm under any circumstances.**

- Use `bun` for all runtime operations
- Use `bun install` for dependency installation (never `npm install`)
- Use `bun run` for scripts (never `npm run`)
- Use `bun test` for testing (never `npm test` or `jest` directly)
- Use `bunx` for executing packages (never `npx`)
- All scripts in package.json should assume Bun runtime

### Code Style

- TypeScript for all source code
- Use ES modules (import/export), never CommonJS (require)
- Prefer async/await over callbacks or raw promises
- Use strict TypeScript settings

### Linting & Formatting

**Always run linting and formatting after completing code changes.**

After making code changes, run:

1. `bun run lint:fix` - Fix linting issues automatically
2. `bun run format` - Format code with oxfmt

If lint issues cannot be auto-fixed, resolve them manually before considering the task complete.

Available scripts:

- `bun run lint` - Check for linting issues (oxlint)
- `bun run lint:fix` - Auto-fix linting issues
- `bun run format` - Format all files (oxfmt)
- `bun run format:check` - Check formatting without modifying files
- `bun run knip` - Find unused files, exports, and dependencies