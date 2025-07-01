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
const ACTIVE_DIR = path.join(__dirname, 'data', 'urls', 'active');
const FINISHED_DIR = path.join(__dirname, 'data', 'urls', 'finished');

async function ensureDirectoryExists(dir) {
    try {
        await fs.access(dir);
    } catch {
        await fs.mkdir(dir, { recursive: true });
    }
}

async function readUrlsFromDirectory(dir, dirType) {
    try {
        await ensureDirectoryExists(dir);
        const files = await fs.readdir(dir);
        const urls = [];
        
        for (const file of files) {
            if (file.endsWith('.txt')) {
                const filePath = path.join(dir, file);
                const url = await fs.readFile(filePath, 'utf-8');
                urls.push({
                    hash: file.replace('.txt', ''),
                    url: url.trim()
                });
            }
        }
        
        return urls;
    } catch (error) {
        logger.error(`Error reading ${dirType} URLs:`, error);
        return [];
    }
}

async function getQueuedUrls() {
    return await readUrlsFromDirectory(QUEUE_DIR, 'queued');
}

async function getActiveUrls() {
    return await readUrlsFromDirectory(ACTIVE_DIR, 'active');
}

async function getFinishedUrls() {
    return await readUrlsFromDirectory(FINISHED_DIR, 'finished');
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

app.post('/url/delete', async (req, res) => {
    try {
        const { hash } = req.body;
        
        if (!hash || !hash.trim()) {
            return res.redirect('/?error=' + encodeURIComponent('Invalid hash provided'));
        }
        
        const trimmedHash = hash.trim();
        const filename = `${trimmedHash}.txt`;
        const filePath = path.join(QUEUE_DIR, filename);
        
        try {
            const url = await fs.readFile(filePath, 'utf-8');
            await fs.unlink(filePath);
            logger.info(`Deleted URL from queue: ${url.trim()} (hash: ${trimmedHash})`);
            
            res.redirect('/?message=' + encodeURIComponent('URL deleted from queue successfully'));
        } catch (error) {
            if (error.code === 'ENOENT') {
                return res.redirect('/?error=' + encodeURIComponent('URL not found in queue'));
            }
            throw error;
        }
        
    } catch (error) {
        logger.error('Error deleting URL from queue:', error);
        res.redirect('/?error=' + encodeURIComponent('Failed to delete URL from queue'));
    }
});

app.get('/api/state', async (req, res) => {
    try {
        const [queuedUrls, activeUrls, finishedUrls] = await Promise.all([
            getQueuedUrls(),
            getActiveUrls(),
            getFinishedUrls()
        ]);
        
        const state = {
            queued: queuedUrls,
            active: activeUrls,
            finished: finishedUrls,
            counts: {
                queued: queuedUrls.length,
                active: activeUrls.length,
                finished: finishedUrls.length,
                total: queuedUrls.length + activeUrls.length + finishedUrls.length
            },
            timestamp: new Date().toISOString()
        };
        
        res.json(state);
        
    } catch (error) {
        logger.error('Error getting state:', error);
        res.status(500).json({ 
            error: 'Failed to get state',
            timestamp: new Date().toISOString()
        });
    }
});

app.listen(PORT, () => {
    logger.info(`yt-dlp queue server running on port ${PORT}`);
});