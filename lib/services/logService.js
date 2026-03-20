import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MAX_LOG_SIZE = 500 * 1024; // 500KB
const TRUNCATE_TO = 250 * 1024; // 250KB

export class LogService {
  constructor(options = {}) {
    this.logger = options.logger;
    this.baseDir = options.baseDir || path.join(__dirname, '../..');
    this.logFile = path.join(this.baseDir, 'data', 'ytdlp-stderr.log');
  }

  async appendLines(hash, data) {
    const timestamp = new Date().toISOString();
    const lines = data
      .toString()
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => `[${timestamp}] [${hash}] ${l}`)
      .join('\n');

    if (!lines) return;

    try {
      await fs.appendFile(this.logFile, lines + '\n', 'utf-8');
      await this._rotateIfNeeded();
    } catch (error) {
      this.logger?.warn('Failed to write to stderr log:', error);
    }
  }

  async _rotateIfNeeded() {
    try {
      const stat = await fs.stat(this.logFile);
      if (stat.size <= MAX_LOG_SIZE) return;

      const content = await fs.readFile(this.logFile, 'utf-8');
      const truncated = content.slice(-TRUNCATE_TO);
      // Trim to the first newline so we don't write a partial line
      const firstNewline = truncated.indexOf('\n');
      const clean =
        firstNewline >= 0 ? truncated.slice(firstNewline + 1) : truncated;
      await fs.writeFile(this.logFile, clean, 'utf-8');
    } catch {
      // Ignore rotation errors
    }
  }

  async getTailLines(n = 500) {
    try {
      const content = await fs.readFile(this.logFile, 'utf-8');
      const lines = content.split('\n').filter(Boolean);
      return lines.slice(-n);
    } catch {
      return [];
    }
  }
}
