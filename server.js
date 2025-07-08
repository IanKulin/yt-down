import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import Logger from '@iankulin/logger';
import QueueProcessor from './lib/queueProcessor.js';
import { JobManager } from './lib/jobs.js';
import { cleanupActiveDownloads } from './lib/utils.js';
import {
  JobService,
  DownloadService,
  NotificationService,
  SettingsService,
} from './lib/services/index.js';

import queueRoutes from './routes/queue.js';
import downloadsRoutes from './routes/downloads.js';
import settingsRoutes from './routes/settings.js';
import apiRoutes from './routes/api.js';
import { handleError, notFoundHandler } from './lib/errorHandler.js';

const execAsync = promisify(exec);

// Valid log levels for @iankulin/logger (from most to least verbose)
const validLogLevels = ['silent', 'error', 'warn', 'info', 'debug'];
const logLevel = process.env.LOG_LEVEL?.toLowerCase() || 'info';

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

const app = express();
const PORT = process.env.PORT || 3001;
const server = createServer(app);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Initialize queue processor and job manager
const queueProcessor = new QueueProcessor({
  logger,
  baseDir: __dirname,
});

const jobManager = new JobManager({
  logger,
  baseDir: __dirname,
});

// WebSocket server setup
const wss = new WebSocketServer({ server });

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

// Middleware to attach logger, services, and legacy objects to requests
app.use((req, res, next) => {
  req.logger = logger;

  // Inject services
  req.services = {
    jobs: jobService,
    downloads: downloadService,
    notifications: notificationService,
    settings: settingsService,
  };

  // Keep existing objects for backward compatibility during transition
  req.queueProcessor = queueProcessor;
  req.jobManager = jobManager;

  next();
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

// Use route modules
app.use('/', queueRoutes);
app.use('/', downloadsRoutes);
app.use('/', settingsRoutes);
app.use('/', apiRoutes);

// Error handling middleware (must be after all routes)
app.use(notFoundHandler);
app.use(handleError);

server.listen(PORT, async () => {
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
});

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Received SIGINT. Gracefully shutting down...');
  await queueProcessor.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM. Gracefully shutting down...');
  await queueProcessor.stop();
  process.exit(0);
});
