# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
# Start the application
npm start
# or
node server.js

# Run tests
npm test

# No build process required - runs directly on Node.js
```

## Architecture Overview

This is a file-based yt-dlp queue management web application built with Express.js and EJS templating.

### Core URL Management System

The application uses a **file-based storage system** where URLs are stored as text files with SHA-256 hash filenames:

- **File naming**: `{sha256-hash}.txt` (e.g., `0424974c68530290458c8d58674e2637f65abc127057957d7b3acbd24c208f93.txt`)
- **File content**: Plain URL text (e.g., `https://www.youtube.com/watch?v=dQw4w9WgXcQ`)
- **Directory structure**:
  - `data/urls/queued/` - Pending downloads
  - `data/urls/active/` - Currently processing 
  - `data/urls/finished/` - Completed downloads

This design prevents duplicate URLs and provides collision-resistant unique identification.

### Server Architecture (server.js)

**Key Dependencies**: 
- Express 5.1.0 (web framework)
- EJS 3.1.10 (templating)
- `@iankulin/logger` (custom logging - instantiate with `new Logger()`)

**Route Structure**:
- `GET /` - Main queue interface (renders `queue.ejs`)
- `POST /url/add` - Add URL to queue
- `POST /url/delete` - Remove URL by hash
- `GET /api/state` - JSON API returning complete queue state

**Core Functions**:
- `readUrlsFromDirectory(dir, dirType)` - Generic directory reader
- `createUrlHash(url)` - SHA-256 hash generation
- `ensureDirectoryExists(dir)` - Auto-create missing directories

### Frontend (views/queue.ejs)

Single-page EJS template with inline CSS and JavaScript featuring:
- **Modal confirmation system** for deletions with overlay and keyboard support
- **Responsive flex-based layout** with URL content and delete buttons
- **Client-side form validation** and error/success message display
- **URL escaping** for JavaScript safety in onclick handlers

### API Response Format

The `/api/state` endpoint returns comprehensive queue state:

```json
{
  "queued": [{"hash": "...", "url": "..."}],
  "active": [{"hash": "...", "url": "..."}],
  "finished": [{"hash": "...", "url": "..."}],
  "counts": {
    "queued": 2, "active": 1, "finished": 1, "total": 4
  },
  "timestamp": "2025-07-01T11:45:05.790Z"
}
```

## Development Patterns

- **ES modules**: Uses `import`/`export` syntax
- **Async/await**: All file operations are promisified
- **Parallel processing**: `Promise.all()` for reading multiple directories
- **Error boundaries**: Comprehensive try/catch with user-friendly redirects
- **Hash-based security**: No direct file path exposure to users

## Project Structure Notes

- **No build process** - direct Node.js execution
- **Data directory is gitignored** - contains user queue data
- **Single template file** - all UI in `queue.ejs`
- **No external database** - filesystem serves as persistence layer
- **Port 3000 default** - configurable via `PORT` environment variable

## Working with URLs

When adding URL management features:
1. Always use `createUrlHash(url)` for filename generation
2. Check all three directories (`queued`, `active`, `finished`) when needed
3. Use `ensureDirectoryExists()` before file operations
4. Handle `ENOENT` errors gracefully for missing files
5. Trim URLs and validate before processing