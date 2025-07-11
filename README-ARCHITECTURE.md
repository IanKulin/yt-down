# Architecture Guide

This guide explains the architecture of yt-down to help understand and maintain the codebase.

## What This Application Does

This is a Node.js web application that provides a queue-based system for downloading videos using `yt-dlp`. Users can add URLs to a queue, and the application processes downloads in the background while providing real-time progress updates.

**Key Features:**
- Web-based queue management interface
- Background download processing
- Real-time progress updates via WebSocket
- File-based job storage and state management
- Configurable download settings
- Automatic retry for failed downloads

## High-Level Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Web Browser   │◄───┤   WebSocket     │◄───┤ QueueProcessor  │
│   (EJS Views)   │    │   Real-time     │    │ (Background)    │
└─────────────────┘    │   Updates       │    └─────────────────┘
         │             └─────────────────┘              │
         │                                              │
         ▼                                              ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Express.js     │◄───┤   Service       │◄───┤ File-based      │
│  Routes         │    │   Layer         │    │ Job Storage     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## Core Components

### 1. QueueProcessor (`lib/queueProcessor.js`)
**Purpose**: The heart of the application - handles background download processing.

**Key Responsibilities:**
- Polls for queued jobs every 5 seconds
- Spawns `yt-dlp` processes for downloads
- Parses download progress from `yt-dlp` output
- Manages job state transitions (queued → active → completed)
- Handles retry logic for failed downloads
- Broadcasts real-time progress updates via WebSocket

**How it works:**
```javascript
// Simplified flow
async processQueue() {
  const queuedJobs = await this.getQueuedJobs();
  for (const job of queuedJobs) {
    await this.startDownload(job);
    // Moves job from 'queued' to 'active' directory
  }
}
```

### 2. Jobs System (`lib/jobs.js`)
**Purpose**: Manages the lifecycle of download jobs with file-based storage.

**Key Components:**
- `Job` class: Represents a download job with metadata
- `JobManager` class: Handles job file operations and state management

**Job States:**
- `QUEUED`: Job is waiting to be processed
- `ACTIVE`: Job is currently being downloaded
- `FAILED`: Job failed and may be retried

**File Storage Pattern:**
```
data/jobs/
├── queued/     # Jobs waiting to be processed
├── active/     # Jobs currently downloading
└── failed/     # Jobs that failed (for retry)
```

### 3. Service Layer (`lib/services/`)
**Purpose**: Abstracts business logic from HTTP route handlers.

**Services:**
- `JobService`: Job creation, deletion, status retrieval
- `DownloadService`: File operations and download management
- `NotificationService`: User notifications and alerts
- `SettingsService`: Configuration management
- `TitleEnhancementService`: Background title fetching

**Dependency Injection Pattern:**
```javascript
// In server.js - services are injected into requests
app.use((req, res, next) => {
  req.services = {
    jobs: jobService,
    downloads: downloadService,
    // ... other services
  };
  next();
});
```

### 4. WebSocket System (`server.js`)
**Purpose**: Provides real-time updates to the web interface.

**How it works:**
- WebSocket server runs alongside HTTP server
- `broadcastChange()` function sends updates to all connected clients
- UI automatically refreshes when jobs change state or progress updates

### 5. Settings System (`lib/settings.js`)
**Purpose**: Manages configuration for `yt-dlp` downloads.

**Features:**
- Builds command-line arguments for `yt-dlp`
- Supports video quality limits, subtitles, rate limiting
- Prefers h.264 MP4 format with fallback chains
- Stored in `data/settings.json`

## Data Flow

### 1. Adding a Job
```
User submits URL → JobService.createJob() → Job file created in queued/ → WebSocket broadcast
```

### 2. Processing Downloads
```
QueueProcessor polls → Finds queued job → Moves to active/ → Spawns yt-dlp → 
Parses progress → Broadcasts updates → Download completes → Deletes job file
```

### 3. Real-time Updates
```
State change → broadcastChange() → WebSocket message → Browser receives → UI updates
```

## File System Structure

### Job Storage
```
data/
├── jobs/
│   ├── queued/           # JSON files for pending jobs
│   ├── active/           # JSON files for downloading jobs
│   └── failed/           # JSON files for failed jobs
├── partials/             # Temporary download files
├── settings.json         # Application configuration
└── notifications.json    # User notifications
```

### Download Storage
```
downloads/                # Completed video files
├── video1.mp4
├── video2.mp4
└── ...
```

## API Structure

### Routes (`routes/`)
- `queue.js`: Main queue management interface (`/`)
- `downloads.js`: Downloaded files browser (`/downloads`)
- `settings.js`: Configuration page (`/settings`)
- `api.js`: REST API endpoints (`/api/state`, `/api/notifications`)

### Key API Endpoints
- `GET /api/state`: Returns current application state (jobs, progress, notifications)
- `POST /job/add`: Adds new job to queue
- `DELETE /job/:id`: Removes job from queue
- `POST /api/notifications/dismiss`: Dismisses notifications

## UI Architecture

### Templates (`views/`)
- `queue.ejs`: Main interface with real-time progress
- `downloads.ejs`: File browser for completed downloads
- `settings.ejs`: Configuration interface
- `partials/header.ejs`: Shared navigation

### Real-time Updates
```javascript
// In websocket.js
const ws = new WebSocket(`ws://${window.location.host}`);
ws.onmessage = (event) => {
  if (event.data === 'changed') {
    updateUI(); // Refresh job status and progress
  }
};
```

## Testing Architecture

### Test Structure (`test/`)
- Uses Node.js built-in test runner
- Tests run with `--test-concurrency=1` for file system safety
- Each component has dedicated test files

### Key Test Files
- `queueProcessor.test.js`: Download processing logic
- `jobs.test.js`: Job lifecycle management
- `api.test.js`: API endpoints
- `settings.test.js`: Configuration system

### Test Patterns
```javascript
import { test, before, after } from 'node:test';
import assert from 'node:assert';

test('should process queued jobs', async () => {
  // Setup test data
  // Execute functionality
  // Assert expected results
});
```

## Development Workflow

### Getting Started
1. `npm install` - Install dependencies
2. `npm test` - Run test suite
3. `npm run lint` - Check code style
4. `npm run format` - Format code
5. `npm start` - Start development server

### Quality Gates
- All tests must pass (`npm test`)
- Code must lint without warnings (`npm run lint`)
- Code must be formatted (`npm run format`)

### Key Development Patterns

#### 1. Service Layer Pattern
Always use services for business logic:
```javascript
// Good - in route handler
const jobs = await req.services.jobs.getJobsForDisplay();

// Bad - direct database/file access
const jobs = await fs.readdir('data/jobs/queued');
```

#### 2. Error Handling
Use the asyncHandler wrapper for async routes:
```javascript
router.get('/api/state', asyncHandler(async (req, res) => {
  // Your async code here
}));
```

#### 3. WebSocket Updates
Always broadcast changes after state modifications:
```javascript
// After creating/updating/deleting jobs
this.broadcastChange();
```

## Common Tasks

### Adding a New API Endpoint
1. Add route to appropriate file in `routes/`
2. Use `req.services` for business logic
3. Wrap async handlers with `asyncHandler`
4. Add tests in corresponding test file

### Modifying Job Processing
1. Update `QueueProcessor` class
2. Add tests in `queueProcessor.test.js`
3. Consider WebSocket broadcast implications

### Adding Configuration Options
1. Update `lib/settings.js`
2. Add validation logic
3. Update settings UI in `views/settings.ejs`
4. Add tests in `settings.test.js`

## Architecture Decisions

### Why File-Based Storage?
- **Simplicity**: No database setup required
- **Reliability**: File system operations are atomic
- **Debugging**: Easy to inspect job state manually
- **Scalability**: Sufficient for single-instance deployment

### Why WebSocket for Real-time Updates?
- **Efficiency**: Push-based updates vs. polling
- **Responsiveness**: Instant UI updates
- **Fallback**: Automatic degradation to polling if WebSocket fails

### Why Service Layer?
- **Testability**: Easy to mock services in tests
- **Separation of Concerns**: Business logic separate from HTTP handling
- **Reusability**: Services can be used across different routes
