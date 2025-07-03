import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';
import Logger from '@iankulin/logger';
import QueueProcessor from './lib/queueProcessor.js';

import queueRoutes from './routes/queue.js';
import downloadsRoutes from './routes/downloads.js';
import settingsRoutes from './routes/settings.js';
import apiRoutes from './routes/api.js';

const execAsync = promisify(exec);

const logger = new Logger({ format: 'simple' });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Initialize queue processor
const queueProcessor = new QueueProcessor({
  logger,
  baseDir: __dirname,
});

// Middleware to attach logger and queueProcessor to requests
app.use((req, res, next) => {
  req.logger = logger;
  req.queueProcessor = queueProcessor;
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

// Use route modules
app.use('/', queueRoutes);
app.use('/', downloadsRoutes);
app.use('/', settingsRoutes);
app.use('/', apiRoutes);

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
