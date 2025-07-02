import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SETTINGS_FILE = path.join(__dirname, '../data/settings.json');

const DEFAULT_SETTINGS = {
  videoQuality: 'no-limit', // 720p, 1080p, 1440p, 2160p, no-limit
  subtitles: true,
  autoSubs: true,
  subLanguage: 'en',
  rateLimit: '180K', // no-limit, 180K, 360K, 720K, 1440K
};

export async function loadSettings() {
  try {
    const data = await fs.readFile(SETTINGS_FILE, 'utf-8');
    const settings = JSON.parse(data);

    // Merge with defaults to ensure all settings exist
    return { ...DEFAULT_SETTINGS, ...settings };
  } catch (error) {
    if (error.code === 'ENOENT') {
      // Settings file doesn't exist, create it with defaults
      await saveSettings(DEFAULT_SETTINGS);
      return { ...DEFAULT_SETTINGS };
    }
    throw error;
  }
}

export async function saveSettings(settings) {
  try {
    // Ensure the data directory exists
    const dataDir = path.dirname(SETTINGS_FILE);
    try {
      await fs.access(dataDir);
    } catch {
      await fs.mkdir(dataDir, { recursive: true });
    }

    await fs.writeFile(
      SETTINGS_FILE,
      JSON.stringify(settings, null, 2),
      'utf-8'
    );
  } catch (error) {
    throw new Error(`Failed to save settings: ${error.message}`);
  }
}

export async function getYtDlpArgs(url) {
  const settings = await loadSettings();

  const args = [
    // Hidden defaults - keep current retry behavior
    '--fragment-retries',
    '20',
    '--retries',
    'infinite',
    '--socket-timeout',
    '30',

    // Output format
    '-o',
    '%(title)s.%(ext)s',
  ];

  // Build format selector combining quality and codec preferences
  // Handle DASH formats (separate video/audio) properly
  let formatSelector = '';

  if (settings.videoQuality !== 'no-limit') {
    const height = settings.videoQuality.replace('p', '');
    // Prefer h.264 mp4 video + m4a audio, fallback to any mp4 video + audio
    formatSelector = `bestvideo[height<=${height}][ext=mp4][vcodec^=avc1]+bestaudio[ext=m4a]/bestvideo[height<=${height}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=${height}][ext=mp4]+bestaudio/best[height<=${height}]`;
  } else {
    // No quality limit - prefer h.264 mp4 video + m4a audio
    formatSelector =
      'bestvideo[ext=mp4][vcodec^=avc1]+bestaudio[ext=m4a]/bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo[ext=mp4]+bestaudio/best';
  }

  args.push('--format', formatSelector);

  // Rate limiting
  if (settings.rateLimit !== 'no-limit') {
    args.push('--limit-rate', settings.rateLimit);
  }

  // Subtitles
  if (settings.subtitles) {
    args.push('--write-subs');
    if (settings.subLanguage) {
      args.push('--sub-lang', settings.subLanguage);
    }
    args.push('--convert-subs', 'srt');
  }

  if (settings.autoSubs) {
    args.push('--write-auto-subs');
  }

  // Add the URL last
  args.push(url);

  return args;
}

export function getAvailableOptions() {
  return {
    videoQualities: [
      { value: 'no-limit', label: 'No limit' },
      { value: '720p', label: '720p' },
      { value: '1080p', label: '1080p' },
      { value: '1440p', label: '1440p' },
      { value: '2160p', label: '2160p (4K)' },
    ],
    rateLimits: [
      { value: 'no-limit', label: 'No limit' },
      { value: '180K', label: '180 KB/s' },
      { value: '360K', label: '360 KB/s' },
      { value: '720K', label: '720 KB/s' },
      { value: '1440K', label: '1.4 MB/s' },
    ],
    subLanguages: [
      { value: 'en', label: 'English' },
      { value: 'es', label: 'Spanish' },
      { value: 'fr', label: 'French' },
      { value: 'de', label: 'German' },
      { value: 'it', label: 'Italian' },
      { value: 'pt', label: 'Portuguese' },
      { value: 'ru', label: 'Russian' },
      { value: 'ja', label: 'Japanese' },
      { value: 'ko', label: 'Korean' },
      { value: 'zh', label: 'Chinese' },
    ],
  };
}
