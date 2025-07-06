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

## Architecture Overview

This is a Node.js web application that provides a queue-based system for downloading videos using `yt-dlp`. The application uses a file-based storage system and processes downloads in the background.

### Core Components

**Server (`server.js`)**

- Express.js application with session management for flash messages
- Initializes QueueProcessor and attaches logger/processor to requests
- Graceful shutdown handling for SIGINT/SIGTERM
- Validates `yt-dlp` availability on startup

**QueueProcessor (`lib/queueProcessor.js`)**

- Background service that polls for queued downloads every 5 seconds
- Manages download states: queued → active → finished
- Spawns `yt-dlp` processes and parses progress output
- Handles retry logic (moves failed downloads back to queue)
- Tracks real-time download progress and generates notifications

**Settings System (`lib/settings.js`)**

- File-based configuration stored in `data/settings.json`
- Builds `yt-dlp` command arguments based on user preferences
- Supports video quality limits, subtitles, rate limiting
- Prefers h.264 MP4 format with fallback chains

**File-Based Queue System**

- `data/urls/queued/` - Pending downloads (hash.txt files containing URLs)
- `data/urls/active/` - Currently downloading
- `data/urls/finished/` - Completed downloads
- `data/downloads/` - Downloaded video/subtitle files
- URLs are hashed (SHA256) to prevent duplicates

### Routes Structure

- `/` - Queue management interface (queue.js)
- `/downloads` - Downloaded files browser (downloads.js)
- `/settings` - Configuration page (settings.js)
- `/api/state` - Real-time application state (api.js)
- `/api/notifications/dismiss` - Notification management (api.js)

### View Templates (`views/`)

- `queue.ejs` - Main queue interface with real-time progress updates
- `downloads.ejs` - Downloaded files management interface
- `settings.ejs` - Settings configuration interface
- `partials/header.ejs` - Shared header partial with navigation

### Key Patterns

**Error Handling**: All routes use try-catch with logger.error() and flash messages
**File Operations**: Utils module provides helpers for directory operations and file grouping
**Progress Tracking**: Real-time parsing of yt-dlp output with fragment and regular progress detection
**Notification System**: Completion events stored in `data/notifications.json`

### Environment Variables

- `PORT` - Server port (default: 3001)
- `LOG_LEVEL` - Logging level: silent, error, warn, info, debug (default: info)

### Docker Deployment

The application is designed for Docker deployment with docker-compose.yaml. The Docker image includes yt-dlp and all necessary dependencies.

## Testing & Debugging

### Tests

Tests are located in `test/` directory and use Node.js built-in test runner. Key test files:

- `queueProcessor.test.js` - Core download processing logic
- `settings.test.js` - Configuration system
- `utils.test.js` - Utility functions
- `api.test.js` - API endpoints
  Running tests:
- `npm test` - Run all tests
- `npm test -- test/api.test.js` - Run specific test file
  Debug logging
- `LOG_LEVEL=debug node server.js 2>&1 | tee temp/app.log`

### Tool use

- use the `temp` directory to store logs
- use the `temp` directory to write any disposable node or bash scripts you need
- assume a MacOS environment for CLI tools
- Playwright MCP is available for screenshots of the UI
