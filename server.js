import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';
import { WebSocketServer } from 'ws';
import { readFileSync } from 'fs';
import Logger from '@iankulin/logger';
import QueueProcessor from './lib/queueProcessor.js';
import { JobManager } from './lib/jobs.js';
import { cleanupActiveDownloads } from './lib/utils.js';
import {
  JobService,
  DownloadService,
  NotificationService,
  SettingsService,
  TitleEnhancementService,
  VersionService,
} from './lib/services/index.js';

import queueRoutes from './routes/queue.js';
import downloadsRoutes from './routes/downloads.js';
import settingsRoutes from './routes/settings.js';
import apiRoutes from './routes/api.js';
import creditsRoutes from './routes/credits.js';
import { handleError, notFoundHandler } from './lib/errorHandler.js';

const execAsync = promisify(exec);

// Valid log levels for @iankulin/logger (from most to least verbose)
const validLogLevels = ['silent', 'error', 'warn', 'info', 'debug'];
const logLevel = process.env.LOG_LEVEL?.toLowerCase() || 'debug';

// Validate log level
if (!validLogLevels.includes(logLevel)) {
  console.warn(
    `Invalid LOG_LEVEL "${process.env.LOG_LEVEL}". Using default "info" level. Valid levels: ${validLogLevels.join(', ')}`
  );
}

const logger = new Logger({
  format: 'simple',
  level: validLogLevels.includes(logLevel) ? logLevel : 'info',
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read app version from package.json
const packageJson = JSON.parse(
  readFileSync(path.join(__dirname, 'package.json'), 'utf8')
);
const appVersion = packageJson.version;

// Log app version first
logger.info(`Starting yt-down v${appVersion}`);

const app = new Hono();
const PORT = process.env.PORT || 3001;

// Initialize queue processor and job manager
const queueProcessor = new QueueProcessor({
  logger,
  baseDir: __dirname,
});

const jobManager = new JobManager({
  logger,
  baseDir: __dirname,
});

// Create HTTP server first
const server = serve({
  fetch: app.fetch,
  port: PORT,
});

// Then create WebSocket server using the HTTP server
const wss = new WebSocketServer({ server });

// Broadcast function to send "changed" message to all connected clients
const broadcastChange = () => {
  const message = 'changed';
  wss.clients.forEach((client) => {
    if (client.readyState === client.OPEN) {
      try {
        client.send(message);
      } catch (error) {
        logger.error('Error sending WebSocket message:', error);
      }
    }
  });
  logger.debug('Broadcast "changed" message to all WebSocket clients');
};

// Pass broadcastChange to QueueProcessor
queueProcessor.setBroadcastChange(broadcastChange);

// Initialize services (after broadcastChange is defined)
const notificationService = new NotificationService({
  logger,
  baseDir: __dirname,
  broadcastChange,
});

const jobService = new JobService({
  jobManager,
  queueProcessor,
  logger,
  broadcastChange,
  notificationService,
});

const downloadService = new DownloadService({
  logger,
  notificationService,
});

const settingsService = new SettingsService({
  logger,
});

const titleEnhancementService = new TitleEnhancementService({
  jobManager,
  logger,
  broadcastChange,
});

const versionService = new VersionService({
  logger,
});

// Middleware to attach logger, services, and view data to Hono context
app.use(async (c, next) => {
  // Set services and logger in Hono context
  c.set('logger', logger);
  c.set('services', {
    jobs: jobService,
    downloads: downloadService,
    notifications: notificationService,
    settings: settingsService,
    titleEnhancement: titleEnhancementService,
    versions: versionService,
  });

  // Set view data for EJS templates
  c.set('viewData', {
    appVersion,
    toolVersions: versionService.getVersions(),
  });

  await next();
});

// Request logging middleware
app.use(async (c, next) => {
  const logger = c.get('logger');
  const start = Date.now();

  logger.debug(`→ ${c.req.method} ${c.req.path}`);

  await next();

  const duration = Date.now() - start;
  logger.debug(`← ${c.req.method} ${c.req.path} ${c.res.status} ${duration}ms`);
});

async function checkYtDlpExists() {
  try {
    await execAsync('yt-dlp --version');
    return true;
  } catch {
    return false;
  }
}

logger.debug('isTTY:', process.stdout.isTTY);
logger.debug('Platform:', process.platform);
logger.debug('Node version:', process.version);

// Group routes logically
const webRoutes = new Hono();
webRoutes.route('/', queueRoutes);
webRoutes.route('/', downloadsRoutes);
webRoutes.route('/', settingsRoutes);
webRoutes.route('/', creditsRoutes);

// Apply route groups with clear separation
app.route('/', webRoutes);
app.route('/api', apiRoutes);

// Static file serving - serve public directory at root route
app.use('/*', serveStatic({ root: './public' }));

// Error handling middleware (must be after all routes)
app.notFound(notFoundHandler);
app.onError(async (err, c) => {
  return await handleError(err, c);
});

// WebSocket connection handling
wss.on('connection', (ws, req) => {
  logger.debug(`WebSocket client connected from ${req.socket.remoteAddress}`);

  ws.on('close', () => {
    logger.debug('WebSocket client disconnected');
  });

  ws.on('error', (error) => {
    logger.error('WebSocket error:', error);
  });
});

// Initialize services after server is ready
(async () => {
  // Initialize version service
  await versionService.initialize();

  // Check if yt-dlp is available
  const ytDlpExists = await checkYtDlpExists();
  if (!ytDlpExists) {
    logger.error(
      'yt-dlp not found in PATH. Please install yt-dlp to use this application.'
    );
    process.exit(1);
  }

  logger.info(`yt-dlp queue server running on port ${PORT}`);

  // Clean up any abandoned downloads from previous runs
  await cleanupActiveDownloads(logger, jobManager);

  // Start the queue processor
  await queueProcessor.start();

  // Start the title enhancement service
  await titleEnhancementService.start();
})();

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Received SIGINT. Gracefully shutting down...');
  await queueProcessor.stop();
  titleEnhancementService.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM. Gracefully shutting down...');
  await queueProcessor.stop();
  titleEnhancementService.stop();
  process.exit(0);
});
