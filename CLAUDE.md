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
- `GET /downloads` - Downloads management interface (renders `downloads.ejs`)
- `GET /download/:filename` - Download individual files to user's machine
- `POST /file/delete` - Delete downloaded files from server
- `GET /api/state` - JSON API returning complete queue state

**Core Functions**:
- `readUrlsFromDirectory(dir, dirType)` - Generic directory reader
- `createUrlHash(url)` - SHA-256 hash generation
- `ensureDirectoryExists(dir)` - Auto-create missing directories
- `getDownloadedFiles()` - Scan downloads directory and group related files
- `formatFileSize(bytes)` - Human-readable file size formatting

### Frontend Templates

**Queue Interface (views/queue.ejs)**:
- **Modal confirmation system** for deletions with overlay and keyboard support
- **Responsive flex-based layout** with URL content and delete buttons
- **Client-side form validation** and error/success message display
- **URL escaping** for JavaScript safety in onclick handlers
- **Navigation link** to downloads page

**Downloads Interface (views/downloads.ejs)**:
- **File grouping system** - groups video and subtitle files by base name
- **File type badges** - visual indicators for video vs subtitle files
- **Download functionality** - direct download links for each file
- **Delete functionality** - modal confirmation for file deletion
- **File metadata display** - file sizes, modification dates
- **Responsive design** - consistent styling with queue interface
- **Navigation** - back to queue page

### Queue Processing System (lib/queueProcessor.js)

**Automatic Background Processing**:
- **Polling interval**: 5 seconds (configurable)
- **Concurrent downloads**: 1 at a time (configurable via `maxConcurrent`)
- **File movement**: queued → active → finished as downloads progress
- **Auto-retry**: Failed downloads moved back to queued directory
- **Graceful shutdown**: Waits for active downloads to complete

**yt-dlp Integration**:
```bash
yt-dlp \
  --fragment-retries 20 \
  --retries infinite \
  --socket-timeout 30 \
  --limit-rate 180K \
  -o "%(title)s.%(ext)s" \
  --write-subs \
  --write-auto-subs \
  --sub-lang "en" \
  --convert-subs srt \
  [URL]
```

**Download Storage**: All downloaded files stored in `data/downloads/`

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

- **ES modules**: Uses `import`/`export` syntax
- **Async/await**: All file operations are promisified
- **Parallel processing**: `Promise.all()` for reading multiple directories
- **Error boundaries**: Comprehensive try/catch with user-friendly redirects
- **Hash-based security**: No direct file path exposure to users

## Project Structure Notes

- **No build process** - direct Node.js execution
- **Data directory is gitignored** - contains user queue data
- **Template-based UI** - queue management (`queue.ejs`) and downloads management (`downloads.ejs`)
- **No external database** - filesystem serves as persistence layer
- **Port 3000 default** - configurable via `PORT` environment variable
- **Background processing** - automatic queue processing starts with server
- **yt-dlp dependency** - requires yt-dlp installed on system PATH

## Working with URLs

When adding URL management features:
1. Always use `createUrlHash(url)` for filename generation
2. Check all three directories (`queued`, `active`, `finished`) when needed
3. Use `ensureDirectoryExists()` before file operations
4. Handle `ENOENT` errors gracefully for missing files
5. Trim URLs and validate before processing

## Queue Processing

The queue processor (`lib/queueProcessor.js`) handles:
- **Automatic polling** of queued directory every 5 seconds
- **File transitions**: queued → active during download → finished on success
- **Error handling**: Failed downloads return to queued for retry
- **Process management**: Spawns yt-dlp child processes with proper cleanup
- **Concurrent limiting**: Configurable max downloads (default: 1)
- **Graceful shutdown**: Waits for active downloads before server stop

**Key methods**:
- `start()` - Begin background processing
- `stop()` - Graceful shutdown with active download completion
- `getStatus()` - Current processor state for API responses

## Downloads Management

### File Organization System

Downloaded files are automatically organized in `data/downloads/` with intelligent grouping:

- **Video files**: `.mkv`, `.mp4`, `.webm`, `.avi`, `.mov` formats
- **Subtitle files**: `.srt`, `.vtt` formats  
- **File grouping**: Related files (video + subtitles) grouped by base filename
- **Sorting**: Most recently modified files appear first

### Downloads Interface Features

**File Display**:
- Grouped presentation of related files (video + subtitles)
- File type badges for easy identification
- File metadata (size, modification date)
- Clean, responsive layout matching queue interface

**User Actions**:
- **Download**: Direct download to user's machine via `/download/:filename`
- **Delete**: Server-side file deletion with modal confirmation
- **Navigation**: Seamless movement between queue and downloads pages

**Security Features**:
- **Path traversal protection**: Prevents access outside downloads directory
- **File validation**: Only serves files within designated downloads folder
- **Error handling**: Graceful handling of missing or inaccessible files

### Working with Downloads

When extending downloads functionality:
1. Use `getDownloadedFiles()` for file discovery and grouping
2. Implement path security checks for any file operations
3. Follow existing modal confirmation patterns for destructive actions
4. Maintain file grouping logic for related video/subtitle pairs
5. Use `formatFileSize()` for consistent size display