# Feature Implementation Plan: Active Download File Size Display (Async Approach)

## Problem Analysis

File size is displayed for queued jobs but not for active downloads. When jobs immediately transition from queued → active (empty queue), they never get filesize metadata extracted. Synchronous extraction takes ~8 seconds, which is too long to block download start.

## Proposed Solution: Async Filesize Enhancement for Active Jobs

**Extend TitleEnhancementService to process active jobs without filesize metadata**

### Core Approach

- TitleEnhancementService continues background metadata extraction even after jobs become active
- Active jobs without filesize are processed alongside queued jobs
- UI shows "calculating..." initially, then updates to actual filesize once extracted
- Real-time updates via WebSocket when filesize becomes available

## Implementation Steps

### 1. Extend TitleEnhancementService Job Collection

- **Location**: `lib/services/titleEnhancementService.js`
- **Method**: Modify `getJobsNeedingEnhancement()` to include active jobs
- **Logic**: Return both queued jobs without titles AND active jobs without filesize

### 2. Update Job Processing Logic

- **Method**: Modify `processJob()` to handle active jobs
- **Active Job Handling**:
  - Extract metadata using existing `extractVideoMetadata()` method
  - Update active job file with filesize metadata
  - Broadcast WebSocket update for real-time UI refresh

### 3. JobManager Support for Active Job Updates

- **Location**: `lib/jobs.js`
- **Enhancement**: Ensure `updateJob()` can modify active job files
- **Verification**: Check that active jobs support metadata updates

### 4. QueueProcessor Integration

- **Location**: `lib/queueProcessor.js`
- **Enhancement**: Transfer any available filesize metadata when job starts
- **Progress Tracking**: Include filesize in downloadProgress Map if available

### 5. UI State Management

- **Initial State**: Active jobs show "calculating..." for filesize
- **Real-time Updates**: WebSocket updates trigger filesize display refresh
- **Consistency**: Maintain same formatting between queued and active states

### 6. API Response Updates

- **Location**: Routes and API endpoints
- **Enhancement**: Ensure filesize flows through active job API responses
- **Real-time**: WebSocket broadcasts include filesize updates

## Technical Implementation Details

### TitleEnhancementService Changes

```javascript
// Extend getJobsNeedingEnhancement() to include active jobs without filesize
async getJobsNeedingEnhancement() {
  const queuedJobs = await this.jobManager.getQueuedJobs();
  const activeJobs = await this.jobManager.getActiveJobs();

  const queuedNeedingTitles = queuedJobs.filter(job => !job.title);
  const activeNeedingFilesize = activeJobs.filter(job => !job.metadata?.filesize);

  return [...queuedNeedingTitles, ...activeNeedingFilesize];
}
```

### Job Processing Logic

```javascript
// Handle different enhancement needs based on job state
async processJob(job) {
  if (job.state === 'queued' && !job.title) {
    // Extract full metadata including filesize
    const metadata = await this.extractVideoMetadata(job.url);
    await this.jobManager.updateJob(job.hash, {
      title: metadata.title,
      metadata
    });
  } else if (job.state === 'active' && !job.metadata?.filesize) {
    // Extract only filesize metadata for active jobs
    const metadata = await this.extractVideoMetadata(job.url);
    await this.jobManager.updateJob(job.hash, {
      metadata: { ...job.metadata, filesize: metadata.filesize }
    });
  }
}
```

### UI Updates

- **Active Job Cards**: Show "calculating..." initially, update to actual filesize
- **Current Download Panel**: Add filesize display that updates in real-time
- **WebSocket Integration**: Trigger UI refresh when filesize becomes available

## Files to Modify

1. **`lib/services/titleEnhancementService.js`** - Extend to process active jobs
2. **`lib/jobs.js`** - Ensure active job updates work properly
3. **`lib/queueProcessor.js`** - Transfer filesize metadata to progress tracking
4. **`views/queue.ejs`** - Update UI to show filesize for active jobs
5. **`routes/api.js`** - Ensure filesize data flows through API responses

## Benefits

- **Non-blocking**: Downloads start immediately without delay
- **Real-time Updates**: UI updates when filesize becomes available
- **Consistent UX**: Same filesize display pattern for all jobs
- **Reliable**: Works regardless of queue state or timing
- **Scalable**: Leverages existing async infrastructure

## User Experience Flow

1. **Job Added**: User adds URL, job immediately starts downloading
2. **Initial Display**: Active job shows "calculating..." for filesize
3. **Background Processing**: TitleEnhancementService extracts filesize
4. **Real-time Update**: WebSocket updates UI with actual filesize
5. **Consistent Display**: Filesize remains visible throughout download

## Testing Strategy

1. **Empty Queue Test**: Add job to empty queue, verify filesize appears within ~8 seconds
2. **Busy Queue Test**: Verify filesize transfers from queued to active state
3. **Real-time Test**: Verify WebSocket updates trigger UI refresh
4. **Performance Test**: Ensure no impact on download start time

## Current State Analysis

### Queued Jobs File Size Collection

- **Method**: TitleEnhancementService uses `yt-dlp --dump-json --no-download` to extract metadata
- **Storage**: Stored in `job.metadata.filesize` within job JSON files
- **Priority**: `filesize_approx` > `filesize` > `requested_formats[0].filesize` > bitrate estimation
- **UI Display**: Shows formatted size or "calculating..." placeholder

### Active Download Progress Tracking

- **Method**: QueueProcessor parses real-time yt-dlp output during download
- **Current Data**: Captures percentage, speed, ETA, filename from progress lines
- **Storage**: Stored in `downloadProgress` Map with job hash as key
- **UI Display**: Shows progress in dedicated "Current Download" panel

### Timing Issue Details

1. Job created in queued state
2. QueueProcessor immediately picks up job (if queue empty)
3. Job moves queued → active within milliseconds
4. TitleEnhancementService polls every 2 seconds but job is already active
5. Result: Active job has no filesize information

## Implementation Notes

- **Extraction Time**: Synchronous filesize extraction takes ~8 seconds
- **Polling Frequency**: TitleEnhancementService polls every 2 seconds
- **WebSocket Updates**: Real-time UI updates when metadata becomes available
- **Graceful Degradation**: Falls back to "calculating..." when filesize unavailable
