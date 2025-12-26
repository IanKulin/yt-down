import { Hono } from 'hono';
import { serveStatic } from 'hono/deno';
import { dirname } from '@std/path';
import Logger from '@iankulin/logger';
import QueueProcessor from './lib/queueProcessor.js';
import { JobManager } from './lib/jobs.js';
import { cleanupActiveDownloads } from './lib/utils.js';
import {
  DownloadService,
  JobService,
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

// Import deno.json for version
import denoConfig from './deno.json' with { type: 'json' };

// Valid log levels for @iankulin/logger (from most to least verbose)
const validLogLevels = ['silent', 'error', 'warn', 'info', 'debug'];
const logLevel = Deno.env.get('LOG_LEVEL')?.toLowerCase() || 'info';

// Validate log level
if (!validLogLevels.includes(logLevel)) {
  console.warn(
    `Invalid LOG_LEVEL "${
      Deno.env.get('LOG_LEVEL')
    }". Using default "info" level. Valid levels: ${validLogLevels.join(', ')}`,
  );
}

const logger = new Logger({
  format: 'simple',
  callerLevel: "error",
  level: validLogLevels.includes(logLevel) ? logLevel : 'info',
});

const __dirname = dirname(new URL(import.meta.url).pathname);

const appVersion = denoConfig.version;

// Log app version first
logger.info(`Starting yt-down v${appVersion}`);

const app = new Hono();
const PORT = parseInt(Deno.env.get('PORT') || '3001');

// Initialize queue processor and job manager
const queueProcessor = new QueueProcessor({
  logger,
  baseDir: __dirname,
});

const jobManager = new JobManager({
  logger,
  baseDir: __dirname,
});

// WebSocket clients storage
const wsClients = new Set();

// Broadcast function to send "changed" message to all connected clients
const broadcastChange = () => {
  const message = 'changed';
  wsClients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
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

// Middleware to inject dependencies into Hono context
app.use(async (c, next) => {
  c.set('logger', logger);
  c.set('services', {
    jobs: jobService,
    downloads: downloadService,
    notifications: notificationService,
    settings: settingsService,
    titleEnhancement: titleEnhancementService,
    versions: versionService,
  });
  c.set('viewData', {
    appVersion,
    toolVersions: versionService.getVersions(),
  });

  await next();
});

// Request logging middleware
app.use(async (c, next) => {
  const logger = c.get('logger');
  // Only do timing work if debug logging is enabled
  if (logger.level() === 'debug') {
    const start = Date.now();
    logger.debug(`→ ${c.req.method} ${c.req.path}`);
    await next();
    const duration = Date.now() - start;
    logger.debug(
      `← ${c.req.method} ${c.req.path} ${c.res.status} ${duration}ms`,
    );
  } else {
    await next();
  }
});

async function checkYtDlpExists() {
  try {
    const command = new Deno.Command('yt-dlp', {
      args: ['--version'],
      stdout: 'piped',
      stderr: 'piped',
    });
    const { code } = await command.output();
    return code === 0;
  } catch {
    return false;
  }
}

logger.debug('isTTY:', Deno.stdout.isTerminal());
logger.debug('Platform:', Deno.build.os);
logger.debug('Deno version:', Deno.version.deno);

// Web routes
app.route('/', queueRoutes);
app.route('/', downloadsRoutes);
app.route('/', settingsRoutes);
app.route('/', creditsRoutes);

// API routes
app.route('/api', apiRoutes);

// Static file serving - serve public directory at root route
app.use(
  '/*',
  serveStatic({
    root: `${__dirname}/public`,
    rewriteRequestPath: (path) => path,
  }),
);

// Error handling middleware (must be after all routes)
app.notFound(notFoundHandler);
app.onError(async (err, c) => {
  return await handleError(err, c);
});

// Initialize services after server is ready
(async () => {
  // Initialize version service
  await versionService.initialize();

  // Check if yt-dlp is available
  const ytDlpExists = await checkYtDlpExists();
  if (!ytDlpExists) {
    logger.error(
      'yt-dlp not found in PATH. Please install yt-dlp to use this application.',
    );
    Deno.exit(1);
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
Deno.addSignalListener('SIGINT', async () => {
  logger.info('Received SIGINT. Gracefully shutting down...');
  await queueProcessor.stop();
  titleEnhancementService.stop();
  Deno.exit(0);
});

Deno.addSignalListener('SIGTERM', async () => {
  logger.info('Received SIGTERM. Gracefully shutting down...');
  await queueProcessor.stop();
  titleEnhancementService.stop();
  Deno.exit(0);
});

// Start HTTP server with WebSocket support
Deno.serve({ port: PORT }, (req) => {
  // Check for WebSocket upgrade request
  if (req.headers.get('upgrade') === 'websocket') {
    const { socket, response } = Deno.upgradeWebSocket(req);

    socket.onopen = () => {
      wsClients.add(socket);
      logger.debug('WebSocket client connected');
    };

    socket.onclose = () => {
      wsClients.delete(socket);
      logger.debug('WebSocket client disconnected');
    };

    socket.onerror = (error) => {
      logger.error('WebSocket error:', error);
    };

    return response;
  }

  // Handle regular HTTP requests through Hono
  return app.fetch(req);
});
