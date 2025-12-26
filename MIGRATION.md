# Node.js to Deno Migration Plan for yt-down

## What You've Already Identified

You correctly identified these three critical areas:

- (a) File access APIs (`fs/promises`)
- (b) Process spawning (`child_process`)
- (c) Dependencies (logger has Deno version)

## Additional Changes Required

### 1. **Module System & Import Specifiers**

**Current State:**

- Uses ESM with Node.js built-in imports: `import fs from 'fs/promises'`
- Uses `__dirname` / `__filename` via `fileURLToPath(import.meta.url)`
- Imports use `.js` extensions for local files

**Changes Needed:**

- Replace all `node:*` and built-in module imports with Deno equivalents
- Update `__dirname` / `__filename` pattern to use `import.meta.url` directly
- Add full URLs for third-party dependencies or use import maps
- Example:
  ```javascript
  // Before (Node.js)
  import fs from 'fs/promises';
  import path from 'path';
  const __dirname = path.dirname(fileURLToPath(import.meta.url));

  // After (Deno)
  import { join } from 'https://deno.land/std/path/mod.ts';
  const __dirname = new URL('.', import.meta.url).pathname;
  ```

### 2. **Path Module** (`path`)

**Current Usage:** 50+ uses across all files

- `path.join()`, `path.dirname()`, `path.resolve()`, `path.extname()`,
  `path.basename()`

**Changes Needed:**

- Replace with `std/path` from Deno standard library
- Import from: `https://deno.land/std/path/mod.ts`
- API is similar but not identical (may need minor adjustments)

**Files Affected:** server.js, queueProcessor.js, jobs.js, settings.js,
utils.js, downloadService.js, all route files

### 3. **Cryptography** (`crypto`)

**Current Usage:**

- `crypto.createHash('sha256').update(url).digest('hex')` for job ID generation
- Used in: `lib/jobs.js:37-41`

**Changes Needed:**

- Replace with Web Crypto API (native in Deno) or `std/crypto`
- Example:
  ```javascript
  // Before
  import crypto from 'crypto';
  crypto.createHash('sha256').update(url).digest('hex');

  // After
  import { crypto } from 'https://deno.land/std/crypto/mod.ts';
  // Use Web Crypto API or std/crypto functions
  ```

### 4. **HTTP Server & Framework** (Hono.js)

**Current State:**

- Uses `@hono/node-server` v1.11.0 for Node.js HTTP server adapter
- Server created with: `serve({ fetch: app.fetch, port: PORT })`

**Changes Needed:**

- Replace `@hono/node-server` with Hono's native Deno adapter
- Hono has excellent Deno support at `deno.land/x/hono`
- Use Deno's native HTTP server (Deno.serve)
- Example:
  ```javascript
  // Before
  import { serve } from '@hono/node-server';
  serve({ fetch: app.fetch, port: PORT });

  // After
  import { Hono } from 'https://deno.land/x/hono/mod.ts';
  Deno.serve({ port: PORT }, app.fetch);
  ```

**Files Affected:** server.js

### 5. **WebSocket Implementation**

**Current State:**

- Uses `ws` library (v8.18.0) with Node.js HTTP server
- Creates WebSocket server: `new WebSocketServer({ server })`
- Client checks: `client.readyState === client.OPEN`

**Changes Needed:**

- Replace with Deno's native WebSocket support from `std/ws`
- Or use Web standard WebSocket API (built into Deno)
- Deno has excellent WebSocket support via `std/ws` or native implementation
- May require refactoring WebSocket lifecycle management

**Files Affected:** server.js (lines 8, 81-87, 211-221)

### 6. **Testing Framework**

**Current State:**

- Uses Node.js built-in test runner (`node:test`)
- Command: `node --test --test-concurrency=1`
- Uses `node:assert` with strict mode
- Test utilities in `test/helpers.js`

**Changes Needed:**

- Replace with Deno's built-in test runner
- Replace `node:assert` with Deno assertions from `std/assert`
- Update test syntax:
  ```javascript
  // Before
  import { beforeEach, describe, test } from 'node:test';
  import assert from 'node:assert/strict';

  // After
  import {
    beforeEach,
    describe,
    it,
  } from 'https://deno.land/std/testing/bdd.ts';
  import {
    assertEquals,
    assertExists,
  } from 'https://deno.land/std/assert/mod.ts';
  ```
- Mock functionality: Deno has different mocking - may need
  `std/testing/mock.ts`
- Test command: `deno test --allow-all` (with appropriate permissions)

**Files Affected:** All 10 test files, test/helpers.js

### 7. **Linting & Formatting Tools**

**Current State:**

- ESLint v9.30.1 with flat config (`eslint.config.js`)
- Prettier v3.6.2 with `.prettierrc`
- NPM scripts: `npm run lint`, `npm run format`

**Changes Needed:**

- **Replace entirely with Deno built-ins:**
  - `deno lint` (replaces ESLint)
  - `deno fmt` (replaces Prettier)
- Remove all dev dependencies (eslint, prettier, plugins)
- Update scripts to `deno lint` and `deno fmt`
- Configure via `deno.json` if needed (both have sensible defaults)
- Delete: `eslint.config.js`, `.prettierrc`

**Benefits:** No dev dependencies, faster execution, built-in tools

### 8. **Template Engine** (EJS)

**Current State:**

- Uses `ejs` v3.1.10 for server-side templates
- 4 template files in `views/` directory

**Options:**

1. **Use Deno's npm compatibility** to continue using EJS
2. **Switch to Deno-native template engine:**
   - `eta` (Deno-compatible, similar to EJS)
   - `handlebars` (available for Deno)
   - `deno.land/x/dejs` (Deno-specific EJS-like)

**Recommendation:** Try Deno's npm compatibility first, then switch if issues
arise

**Files Affected:** server.js, all route files using `c.html()`

### 9. **Environment Variables & Process Object**

**Current Usage:**

- `process.env.PORT`, `process.env.LOG_LEVEL`, `process.env.NODE_ENV`
- `process.stdout.isTTY`, `process.platform`, `process.version`
- `process.exit(1)`
- Signal handlers: `process.on('SIGINT', ...)`, `process.on('SIGTERM', ...)`

**Changes Needed:**

- `process.env.X` → `Deno.env.get('X')`
- `process.platform` → `Deno.build.os`
- `process.version` → `Deno.version.deno`
- `process.exit(code)` → `Deno.exit(code)`
- Signal handlers may need different approach in Deno

**Files Affected:** server.js (primary), potentially others

### 10. **Timers & Async Operations**

**Current Usage:**

- `import { setImmediate } from 'timers'`
- `setInterval()`, `clearInterval()`, `setTimeout()`

**Changes Needed:**

- Remove `setImmediate` import (not needed in Deno, use `queueMicrotask()`)
- `setInterval`, `setTimeout`, `clearInterval` - already global in Deno (no
  changes needed)

**Files Affected:** queueProcessor.js, titleEnhancementService.js

### 11. **File Streams**

**Current Usage:**

- `import { createReadStream } from 'fs'` in downloads.js
- Returns Node.js ReadStream for file downloads

**Changes Needed:**

- Replace with Deno file operations
- Use `Deno.open()` to get file handle, then `readable` property for streaming
- Example:
  ```javascript
  // Before
  const fileStream = createReadStream(filePath);
  return c.body(fileStream);

  // After
  const file = await Deno.open(filePath);
  return c.body(file.readable);
  ```

**Files Affected:** routes/downloads.js

### 12. **Utility Functions** (`util` module)

**Current Usage:**

- `import { promisify } from 'util'` for converting callbacks to promises
- Used with `exec()` from child_process

**Changes Needed:**

- Not needed in Deno (everything is async-first)
- Deno.Command returns promises natively
- Remove promisify imports and usage

**Files Affected:** server.js, versionService.js

### 13. **NPM Scripts & Package Management**

**Current State:**

- `package.json` with npm scripts
- Dependencies managed via npm

**Changes Needed:**

- Create `deno.json` (or `deno.jsonc`) for configuration
- Define tasks in deno.json:
  ```json
  {
    "tasks": {
      "start": "deno run --allow-all server.js",
      "test": "deno test --allow-all",
      "lint": "deno lint",
      "format": "deno fmt"
    },
    "imports": {
      "hono": "https://deno.land/x/hono/mod.ts"
    }
  }
  ```
- Use import maps for dependency management
- Remove package.json, package-lock.json, node_modules/

### 14. **Docker Configuration**

**Current State:**

- Base image: `node:24-alpine`
- Multi-stage build with npm dependencies
- OS packages: python3, py3-pip, ffmpeg, yt-dlp

**Changes Needed:**

- Change base image to `denoland/deno:alpine` or `denoland/deno:latest`
- Remove npm-specific steps (npm ci, node_modules)
- Keep OS packages (yt-dlp, ffmpeg still required)
- Update CMD/ENTRYPOINT:
  ```dockerfile
  # Before
  CMD ["node", "server.js"]

  # After
  CMD ["deno", "run", "--allow-all", "server.js"]
  ```
- Potentially smaller image size (Deno ~60MB vs Node ~170MB)

**Files Affected:** Dockerfile, scripts/docker-build.sh, scripts/docker-push.sh

### 15. **Permissions System** (NEW in Deno)

**Deno Security Model:** Deno requires explicit permissions for file system,
network, environment, etc.

**Permissions Needed:**

- `--allow-read` - Read files (jobs, settings, downloads)
- `--allow-write` - Write files (jobs, downloads, settings)
- `--allow-net` - HTTP server and WebSocket
- `--allow-env` - Read environment variables (PORT, LOG_LEVEL)
- `--allow-run=yt-dlp,ffmpeg` - Spawn yt-dlp and ffmpeg processes

**Development:**

- Use `--allow-all` for development convenience
- Production: Specify exact permissions for security

**Files Affected:** deno.json tasks, Docker CMD, documentation

### 16. **JSON File Reading** (synchronous)

**Current Usage:**

- `readFileSync()` for package.json in server.js

**Changes Needed:**

- Replace with async `Deno.readTextFile()` or keep sync with
  `Deno.readTextFileSync()`
- Or use dynamic import for JSON:
  `await import('./file.json', { assert: { type: 'json' } })`

**Files Affected:** server.js

### 17. **Error Classes & Types** (Optional)

**Current State:**

- Uses custom error classes (lib/errors.js)
- Standard JavaScript error inheritance

**Changes Needed:**

- Consider converting to TypeScript (.ts files) to leverage Deno's native
  TypeScript support
- No required changes for JavaScript, but TypeScript would be beneficial

## Summary of All Changes

| Category            | Effort     | Complexity |
| ------------------- | ---------- | ---------- |
| File access APIs    | Medium     | Medium     |
| Process spawning    | Medium     | Medium     |
| Dependencies        | Low-Medium | Low        |
| Module imports      | Medium     | Low        |
| Path module         | Low        | Low        |
| Crypto module       | Low        | Low        |
| HTTP server (Hono)  | Low        | Low        |
| WebSocket           | Medium     | Medium     |
| Testing framework   | Medium     | Medium     |
| Linting/Formatting  | Low        | Low        |
| Template engine     | Low-Medium | Low        |
| Environment/Process | Low        | Low        |
| File streams        | Low        | Low        |
| NPM scripts         | Low        | Low        |
| Docker              | Medium     | Medium     |
| Permissions         | Low        | Low        |

## Critical Files Requiring Changes

### Core Application (16 files)

- `server.js` - HTTP server, WebSocket, env vars, process handling
- `lib/queueProcessor.js` - fs/promises, child_process, path, timers
- `lib/jobs.js` - fs/promises, path, crypto
- `lib/settings.js` - fs/promises, path
- `lib/utils.js` - fs/promises, path
- `lib/services/downloadService.js` - fs/promises, path, streams
- `lib/services/jobService.js` - path
- `lib/services/notificationService.js` - path
- `lib/services/settingsService.js` - path
- `lib/services/titleEnhancementService.js` - child_process, path
- `lib/services/versionService.js` - child_process, util
- `routes/queue.js` - path
- `routes/downloads.js` - fs streams, path
- `routes/settings.js` - path
- `routes/api.js` - path
- `lib/errors.js` - (optional: convert to TypeScript)

### Tests (10 files + 1 helper)

- All test files need Deno test API updates
- `test/helpers.js` - fs/promises, path

### Configuration (3-4 files)

- Create: `deno.json` or `deno.jsonc`
- Delete: `package.json`, `.prettierrc`, `eslint.config.js`

### Docker (2-3 files)

- `Dockerfile` - base image, commands
- `scripts/docker-build.sh` - potentially update
- `scripts/docker-push.sh` - potentially update

## Migration Strategy Recommendations

1. **Start with utilities** - Migrate `lib/utils.js` and `lib/errors.js` first
2. **Core modules next** - Settings, Jobs classes
3. **Services layer** - Migrate all services
4. **Server & routes** - HTTP server, WebSocket, routes
5. **Tests** - Update test files to Deno test runner
6. **Docker** - Final step after application runs locally
7. **Consider TypeScript** - Leverage Deno's native TS support for better DX

## Potential Benefits

- Smaller Docker image (~60MB vs ~170MB)
- Faster startup time
- No dev dependencies (built-in lint, fmt, test)
- TypeScript support without transpilation
- Better security model (explicit permissions)
- Modern async APIs throughout
- Single executable deployment option
