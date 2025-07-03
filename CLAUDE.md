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

# Code quality and formatting
npm run lint
npm run format

# No build process required - runs directly on Node.js

# Docker
npm run docker:build
npm run docker:push
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

### Server Architecture

**Main Server (server.js)**:

- Express 5.1.0 (web framework)
- EJS 3.1.10 (templating)
- `@iankulin/logger` (custom logging - instantiate with `new Logger()`)
- Route module imports and middleware setup
- Queue processor initialization and lifecycle management

**Route Modules**:

**Queue Routes (`routes/queue.js`)**:

- `GET /` - Main queue interface (renders `queue.ejs`)
- `POST /url/add` - Add URL to queue
- `POST /url/delete` - Remove URL by hash

**Downloads Routes (`routes/downloads.js`)**:

- `GET /downloads` - Downloads management interface (renders `downloads.ejs`)
- `GET /download/:filename` - Download individual files to user's machine
- `POST /file/delete` - Delete downloaded files from server

**Settings Routes (`routes/settings.js`)**:

- `GET /settings` - Settings configuration interface (renders `settings.ejs`)
- `POST /settings` - Update download settings

**API Routes (`routes/api.js`)**:

- `GET /api/state` - JSON API returning complete queue state

**Utility Functions (`lib/utils.js`)**:

- `readUrlsFromDirectory(dir, dirType)` - Generic directory reader
- `createUrlHash(url)` - SHA-256 hash generation
- `ensureDirectoryExists(dir)` - Auto-create missing directories
- `getDownloadedFiles()` - Scan downloads directory and group related files
- `formatFileSize(bytes)` - Human-readable file size formatting
- `getQueuedUrls()`, `getActiveUrls()`, `getFinishedUrls()` - Directory-specific URL readers

### Frontend Templates & Styling

**CSS Architecture (`public/css/main.css`)**:
- Single consolidated CSS file with CSS custom properties for theming
- Automatic light/dark theme support via `@media (prefers-color-scheme: dark)`
- Responsive design with consistent styling across all interface elements

**UI Template Patterns**:
- **Consistent header layout** - flexbox with title left-aligned, navigation right-aligned
- **Modal confirmation system** - overlay with keyboard support for destructive actions
- **File grouping** - intelligent grouping of related video/subtitle files
- **Form validation** - client-side validation with error/success messaging
- **Security** - URL escaping for JavaScript safety, path traversal protection

### Queue Processing System (lib/queueProcessor.js)

**Automatic Background Processing**:

- **Polling interval**: 5 seconds (configurable)
- **Concurrent downloads**: 1 at a time (configurable via `maxConcurrent`)
- **File movement**: queued → active → finished as downloads progress
- **Auto-retry**: Failed downloads moved back to queued directory
- **Graceful shutdown**: Waits for active downloads to complete

**yt-dlp Integration**:
- Dynamic command building via `lib/settings.js` based on user preferences
- Format selection prioritizes h.264 MP4 with quality constraints using DASH video+audio
- Hidden technical settings for retries and timeouts (not user-configurable)
- Debug logging outputs complete command for troubleshooting

**Download Storage**: All downloaded files stored in `data/downloads/`

### API Response Format

The `/api/state` endpoint returns comprehensive queue state:

```json
{
  "queued": [{ "hash": "...", "url": "..." }],
  "active": [{ "hash": "...", "url": "..." }],
  "finished": [{ "hash": "...", "url": "..." }],
  "counts": {
    "queued": 2,
    "active": 1,
    "finished": 1,
    "total": 4
  },
  "processor": {
    "isProcessing": true,
    "activeDownloads": 1,
    "maxConcurrent": 1,
    "pollInterval": 5000
  },
  "timestamp": "2025-07-01T11:45:05.790Z"
}
```

## Development Patterns

- **ES modules**: Uses `import`/`export` syntax throughout
- **Modular architecture**: Routes organized in separate modules (`routes/`) with shared utilities (`lib/`)
- **Async/await**: All file operations are promisified
- **Parallel processing**: `Promise.all()` for reading multiple directories
- **Error boundaries**: Comprehensive try/catch with user-friendly redirects
- **Hash-based security**: No direct file path exposure to users
- **Middleware pattern**: Logger and queue processor injected via Express middleware
- **CSS organization**: Single consolidated stylesheet with CSS custom properties
- **Theme-aware design**: Automatic light/dark mode support via media queries
- **Code quality**: ESLint and Prettier ensure consistent formatting and catch errors. Run `npm run lint`, `npm run format` and `npm test` to ensure code quality and fix any errors before considering the task complete

## Project Structure Notes

- **No build process** - direct Node.js execution
- **Modular organization** - routes in `routes/` directory, utilities in `lib/` directory
- **Data directory is gitignored** - contains user queue data
- **Template-based UI** - queue management (`queue.ejs`), downloads management (`downloads.ejs`), and settings (`settings.ejs`)
- **JSON settings storage** - user preferences stored in `data/settings.json`
- **No external database** - filesystem serves as persistence layer
- **Port 3001 default** - configurable via `PORT` environment variable
- **Background processing** - automatic queue processing starts with server
- **yt-dlp dependency** - requires yt-dlp installed on system PATH

## Docker Support

**Commands**:
```bash
npm run docker:build    # Build container
npm run docker:push     # Push to registry
docker compose up -d    # Run with volume mounting
```

**Configuration**:
- Alpine Linux base with Node.js 24, yt-dlp, and ffmpeg
- Mount `./data` to `/app/data` for persistent storage
- Exposes port 3001, runs in production mode

## Development Guidelines

### Core Patterns

**File Operations**:
- Use `createUrlHash(url)` for filename generation
- Use `ensureDirectoryExists()` before file operations
- Handle `ENOENT` errors gracefully for missing files
- Check all three directories (`queued`, `active`, `finished`) when needed

**Security**:
- Implement path traversal protection for file operations
- No direct file path exposure to users (use hash-based references)
- Validate and trim URLs before processing

**UI Consistency**:
- Follow existing modal confirmation patterns for destructive actions
- Maintain file grouping logic for related video/subtitle pairs
- Use `formatFileSize()` for consistent size display
- Test both light and dark themes for UI changes
- Use Playwright tool for checking UI changes

### Key System Components

**Settings Storage** (`data/settings.json`):
```json
{
  "videoQuality": "1080p",
  "subtitles": true,
  "autoSubs": true,
  "subLanguage": "en",
  "rateLimit": "180K"
}
```

**Queue Processor** (`lib/queueProcessor.js`):
- Automatic polling every 5 seconds
- File transitions: queued → active → finished
- Key methods: `start()`, `stop()`, `getStatus()`

**Downloads Organization**:
- Files grouped by base filename (video + subtitles)
- Supported formats: `.mkv`, `.mp4`, `.webm`, `.avi`, `.mov` (video), `.srt`, `.vtt` (subtitles)
- Sorted by modification date
- Fragments of in-process download hidden

## CSS and Theming

**Key Variables**:
- `--container-max-width: 1200px`
- `--bg-primary`, `--bg-secondary`, `--bg-tertiary`
- `--text-primary`, `--text-secondary`, `--text-muted`
- `--accent-primary`, `--accent-success`, `--accent-danger`
- `--border-light`, `--border-medium`, `--border-dark`

**Guidelines**:
- Always use CSS variables via `var(--variable-name)`
- Add styles to main.css, avoid inline styles
- Test both light and dark themes
- Use `var(--accent-primary)` for primary buttons, `var(--accent-danger)` for destructive actions
