import express from 'express';
import session from 'express-session';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';
import Logger from '@iankulin/logger';
import QueueProcessor from './lib/queueProcessor.js';
import { JobManager } from './lib/jobs.js';
import { cleanupActiveDownloads } from './lib/utils.js';

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

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Session configuration for flash messages
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'yt-down-session-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false, // Set to true in production with HTTPS
      httpOnly: true,
      maxAge: 1000 * 60 * 60, // 1 hour
    },
  })
);

// Initialize queue processor and job manager
const queueProcessor = new QueueProcessor({
  logger,
  baseDir: __dirname,
});

const jobManager = new JobManager({
  logger,
  baseDir: __dirname,
});

// Middleware to attach logger, queueProcessor, and jobManager to requests
app.use((req, res, next) => {
  req.logger = logger;
  req.queueProcessor = queueProcessor;
  req.jobManager = jobManager;
  next();
});

// Flash message middleware
app.use(async (req, res, next) => {
  // Handle session flash messages only
  res.locals.flashMessage = req.session.flashMessage;
  res.locals.flashType = req.session.flashType;
  delete req.session.flashMessage;
  delete req.session.flashType;

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

app.listen(PORT, async () => {
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
