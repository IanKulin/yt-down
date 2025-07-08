# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- `npm install` - Install dependencies
- `npm test` - Run test suite using Node.js built-in test runner
- `npm run lint` - Lint codebase with ESLint (max 0 warnings)
- `npm run format` - Format code with Prettier
- `npm run docker:build` - Build Docker image using script
- `npm run docker:push` - Push Docker image to registry
- `LOG_LEVEL=debug npm start` - start app with debugging logs

IMPORTANT: Check tests pass at the start of each session, and at the end of each change, always lint, test and format.

## Architecture Overview

This is a Node.js web application that provides a queue-based system for downloading videos using `yt-dlp`. The application uses a file-based storage system and processes downloads in the background.

### Core Components

**Server (`server.js`)**

- Express.js application with WebSocket server for real-time client notifications
- WebSocket server provides instant updates with automatic polling fallback
- Initializes QueueProcessor, JobManager, and service layer
- Injects services into request context for route handlers

**QueueProcessor (`lib/queueProcessor.js`)**

- Background service that polls for queued downloads every 5 seconds
- Manages download states: queued → active → finished
- Spawns `yt-dlp` processes and parses progress output
- Handles retry logic (moves failed downloads back to queue)
- Tracks real-time download progress and broadcasts WebSocket notifications
- Broadcasts state changes for job transitions and progress updates

**Settings System (`lib/settings.js`)**

- File-based configuration stored in `data/settings.json`
- Builds `yt-dlp` command arguments based on user preferences
- Supports video quality limits, subtitles, rate limiting
- Prefers h.264 MP4 format with fallback chains

**Jobs System (`lib/jobs.js`)**

- Provides Job class for structured download job management with validation
- JobManager handles job lifecycle, state transitions, and atomic file operations
- Manages job retry logic with configurable retry limits
- Supports job metadata, title updates, and duplicate prevention
- Provides cleanup functionality for interrupted jobs on application restart

**Service Layer (`lib/services/`)**

- **JobService**: Abstracts job operations from route handlers - job creation, deletion, cancellation, and status retrieval; broadcasts WebSocket notifications
- **DownloadService**: Handles file operations with security validation, download preparation, and file management
- **NotificationService**: Centralizes notification management - creation, retrieval, and dismissal of notifications; broadcasts WebSocket notifications
- **SettingsService**: Manages settings validation, normalization, and persistence with support for different input formats
- Services are injected into route handlers via `req.services` for clean separation of concerns

**File-Based Queue System**

Each "Download Job" is a small JSON file containing the URL. They are moved through these directories to represent the app state.

- `data/jobs/queued/` - Pending downloads
- `data/jobs/active/` - Currently downloading
- `data/jobs/finished/` - Completed downloads

**Download Progress System**

The "currently downloading" and "finished downloading" locations are split up to facilitate cleanups of partially downloaded media

- `data/downloads/active` - Currently downloading
- `data/downloads/finished` - Downloaded video/subtitle files

### Routes Structure

- `/` - Queue management interface (queue.js) - uses JobService
- `/downloads` - Downloaded files browser (downloads.js) - uses DownloadService
- `/settings` - Configuration page (settings.js) - uses SettingsService
- `/api/state` - Application state endpoint (api.js) - uses JobService and NotificationService
- `/api/notifications/dismiss` - Notification management (api.js) - uses NotificationService

### View Templates (`views/`)

- `queue.ejs` - Main queue interface with real-time progress updates via WebSocket
- `downloads.ejs` - Downloaded files management interface with WebSocket notifications
- `settings.ejs` - Settings configuration interface with WebSocket notifications
- `partials/header.ejs` - Shared header partial with navigation

### Key Patterns

**Service Layer Architecture**: Business logic separated from HTTP concerns using service classes
**Real-time Updates**: WebSocket-based change notifications with automatic fallback to polling for reliability
**Error Handling**: Services handle business logic errors; error notifications sent via WebSocket
**File Operations**: DownloadService centralizes security validation and file operations
**Progress Tracking**: Real-time parsing of yt-dlp output with fragment and regular progress detection; broadcasts progress via WebSocket
**Notification System**: Unified WebSocket-based notification system
**Dependency Injection**: Services injected via `req.services` for clean testability

### Environment Variables

- `PORT` - Server port (default: 3001)
- `LOG_LEVEL` - Logging level: silent, error, warn, info, debug (default: info)

### Docker Deployment

The application is designed for Docker deployment with docker-compose.yaml. The Docker image includes yt-dlp and all necessary dependencies.

## Testing & Debugging

### Tests

Tests are located in `test/` directory and use Node.js built-in test runner. Key test files:

- `queueProcessor.test.js` - Core download processing logic and configuration
- `jobs.test.js` - Job system, JobManager, and lifecycle management
- `settings.test.js` - Configuration system and yt-dlp argument building
- `utils.test.js` - Utility functions, file operations, and helpers
- `api.test.js` - API endpoints and state management
- `errorHandler.test.js` - Error handling middleware and response formatting
- `errors.test.js` - Custom error classes and error structures
- `validators.test.js` - Input validation functions
- `helpers.js` - Test utilities and shared testing functions

**Running tests:**

- `npm test` - Run all tests
- `npm test -- test/api.test.js` - Run specific test file
- Tests use Node.js built-in test runner with concurrency set to 1

**Debug logging:**

- `LOG_LEVEL=debug node server.js 2>&1 | tee temp/app.log`

### Tool use

- use the `temp` directory to store logs
- use the `temp` directory to write any disposable node or bash scripts you need
- assume a MacOS environment for CLI tools
- Playwright MCP is available for screenshots of the UI
