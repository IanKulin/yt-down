import express from 'express';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import Logger from '@iankulin/logger';

const logger = new Logger({ format: 'simple' });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const QUEUE_DIR = path.join(__dirname, 'data', 'urls', 'queued');

async function ensureDirectoryExists(dir) {
    try {
        await fs.access(dir);
    } catch {
        await fs.mkdir(dir, { recursive: true });
    }
}

async function getQueuedUrls() {
    try {
        const files = await fs.readdir(QUEUE_DIR);
        const urls = [];
        
        for (const file of files) {
            if (file.endsWith('.txt')) {
                const filePath = path.join(QUEUE_DIR, file);
                const url = await fs.readFile(filePath, 'utf-8');
                urls.push({
                    hash: file.replace('.txt', ''),
                    url: url.trim()
                });
            }
        }
        
        return urls;
    } catch (error) {
        logger.error('Error reading queued URLs:', error);
        return [];
    }
}

function createUrlHash(url) {
    return crypto.createHash('sha256').update(url).digest('hex');
}

app.get('/', async (req, res) => {
    try {
        const queuedUrls = await getQueuedUrls();
        res.render('queue', { 
            queuedUrls,
            message: req.query.message,
            error: req.query.error
        });
    } catch (error) {
        logger.error('Error rendering queue page:', error);
        res.status(500).send('Server error');
    }
});

app.post('/url/add', async (req, res) => {
    try {
        const { url } = req.body;
        
        if (!url || !url.trim()) {
            return res.redirect('/?error=' + encodeURIComponent('Please enter a valid URL'));
        }
        
        const trimmedUrl = url.trim();
        const urlHash = createUrlHash(trimmedUrl);
        const filename = `${urlHash}.txt`;
        const filePath = path.join(QUEUE_DIR, filename);
        
        await ensureDirectoryExists(QUEUE_DIR);
        
        try {
            await fs.access(filePath);
            return res.redirect('/?error=' + encodeURIComponent('URL already exists in queue'));
        } catch {
            // File doesn't exist, we can proceed
        }
        
        await fs.writeFile(filePath, trimmedUrl, 'utf-8');
        logger.info(`Added URL to queue: ${trimmedUrl} (hash: ${urlHash})`);
        
        res.redirect('/?message=' + encodeURIComponent('URL added to queue successfully'));
        
    } catch (error) {
        logger.error('Error adding URL to queue:', error);
        res.redirect('/?error=' + encodeURIComponent('Failed to add URL to queue'));
    }
});

app.listen(PORT, () => {
    logger.info(`yt-dlp queue server running on port ${PORT}`);
});