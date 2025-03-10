import 'dotenv/config';
import { config } from 'dotenv';
import express from 'express';
import { createHelia } from 'helia';
import { unixfs } from '@helia/unixfs';
import { FsDatastore } from 'datastore-fs';
import dhive from '@hiveio/dhive';
import WebTorrent from 'webtorrent';
import multer from 'multer';
import { fileURLToPath } from 'url';
import path from 'path';
import cors from 'cors';

// Polyfill CustomEvent (Fix Render Deployment Issue)
global.CustomEvent = class CustomEvent extends Event {
  constructor(event, params = {}) {
    super(event, params);
    this.detail = params.detail;
  }
};

// Resolve paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
config({ path: path.join(rootDir, '.env') });

const app = express();
const port = process.env.PORT || 5000;

// CORS configuration for Netlify frontend
app.use(cors({
  origin: ['http://localhost:5173', 'https://cryptostreamweb3.netlify.app'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type']
}));

// Dummy in-memory storage for creators
let creators = [
  { name: 'Harsh Katiyar', followers: '80k', username: 'harshkatiyar', image: 'https://i.ibb.co/SwVNJK5r/12.jpg' },
  { name: 'Samay Raina', followers: '56k', username: 'samayraina', image: 'https://i.ibb.co/mFCxdzkF/samay.jpg' },
];

// In-memory storage for user points
const userPoints = {};

(async () => {
  let helia;
  let fs;
  let client;
  let torrentClient;
  let hiveKey;

  try {
    console.log('Initializing Helia (IPFS)...');
    const datastore = new FsDatastore(path.join(__dirname, 'helia-datastore'));
    helia = await createHelia({ datastore });
    fs = unixfs(helia);
    console.log('✅ Helia node initialized with persistent storage');

    if (!process.env.HIVE_POSTING_KEY) {
      throw new Error('❌ HIVE_POSTING_KEY is missing in .env file');
    }
    console.log('🔑 Hive Posting Key loaded');

    client = new dhive.Client('https://api.hive.blog');
    torrentClient = new WebTorrent();
    hiveKey = dhive.PrivateKey.fromString(process.env.HIVE_POSTING_KEY);

    app.use(express.json());
    app.use(express.static('public'));
    app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

    const upload = multer({
      storage: multer.memoryStorage(),
      limits: { fileSize: 100 * 1024 * 1024 },
    });

    app.post('/api/upload', upload.single('video'), async (req, res) => {
      const { filename, username, category = 'video', premium = 'false' } = req.body;
      const videoBuffer = req.file?.buffer;

      if (!videoBuffer || !filename || !username) {
        return res.status(400).json({ error: '❌ Missing required fields (video, filename, username)' });
      }

      try {
        console.log('📤 Uploading video to IPFS...');
        const cid = await fs.addBytes(videoBuffer);
        console.log('✅ Video uploaded to IPFS, CID:', cid.toString());

        console.log('🔗 Creating torrent...');
        const torrent = await new Promise((resolve, reject) => {
          const torrentInstance = torrentClient.seed(videoBuffer, { name: filename }, (torrent) => {
            resolve(torrent);
          });
          torrentInstance.on('error', reject);
        });
        console.log('✅ Torrent created:', torrent.magnetURI);

        await helia.pins.add(cid);
        console.log('📌 CID pinned:', cid.toString());

        const permlink = `${username}-${Date.now()}`;
        const jsonMetadata = JSON.stringify({
          cid: cid.toString(),
          torrent: torrent.magnetURI,
          premium: premium === 'true',
          image: 'https://via.placeholder.com/300x200',
        });

        const operations = [['comment', {
          parent_author: '',
          parent_permlink: category,
          author: username,
          permlink,
          title: filename,
          body: `Video uploaded: ${cid.toString()}`,
          json_metadata: jsonMetadata,
        }]];

        try {
          const broadcastResult = await client.broadcast.sendOperations(operations, hiveKey);
          console.log('✅ Hive broadcast successful:', broadcastResult);
        } catch (error) {
          throw new Error('❌ Failed to post to Hive: ' + error.message);
        }

        res.json({
          cid: cid.toString(),
          torrent: torrent.magnetURI,
          permlink,
          premium: premium === 'true',
          image: 'https://via.placeholder.com/300x200',
        });
      } catch (error) {
        console.error('❌ Upload error:', error);
        res.status(500).json({ error: 'Failed to upload video: ' + error.message });
      }
    });

    app.get('/api/videos', async (req, res) => {
      const { tag = 'video', limit = 20, premium = 'false' } = req.query;
      try {
        const posts = await client.database.getDiscussions('trending', {
          tag,
          limit: Math.min(parseInt(limit), 100),
        });

        const videos = posts.map((post) => {
          let metadata = {};
          try {
            metadata = JSON.parse(post.json_metadata || '{}');
          } catch (e) {
            console.error('❌ Failed to parse metadata for post:', post.permlink, e);
          }
          return {
            cid: metadata.cid || '',
            torrent: metadata.torrent || '',
            title: post.title,
            author: post.author,
            permlink: post.permlink,
            category: post.category || post.parent_permlink,
            views: post.net_votes || 0,
            premium: metadata.premium || false,
            image: metadata.image || 'https://via.placeholder.com/300x200',
          };
        }).filter((v) => premium === 'false' || v.premium === (premium === 'true'));

        res.json(videos);
      } catch (error) {
        res.status(500).json({ error: 'Failed to fetch videos: ' + error.message });
      }
    });

    app.get('/api/creators', (req, res) => {
      res.json(creators);
    });

    app.put('/api/creators/:username', (req, res) => {
      const { username } = req.params;
      const { name, followers, image } = req.body;
      creators = creators.map((c) => (c.username === username ? { ...c, name, followers, image } : c));
      res.json({ message: '✅ Creator updated' });
    });

    app.delete('/api/creators/:username', (req, res) => {
      const { username } = req.params;
      creators = creators.filter((c) => c.username !== username);
      res.json({ message: '✅ Creator deleted' });
    });

    app.get('/api/comments/:author/:permlink', async (req, res) => {
      const { author, permlink } = req.params;
      try {
        const comments = await client.database.getContentReplies({ author, permlink });
        res.json(
          comments.map((c) => ({
            author: c.author,
            permlink: c.permlink,
            body: c.body,
            created: c.created,
          }))
        );
      } catch (error) {
        console.error('❌ Comments fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch comments: ' + error.message });
      }
    });

    app.post('/api/reward-points', async (req, res) => {
      const { username, activity } = req.body;
      if (!username || !activity) {
        return res.status(400).json({ error: 'Missing username or activity' });
      }

      try {
        const points = activity === 'comment' ? 10 : 0;
        userPoints[username] = (userPoints[username] || 0) + points;
        console.log(`Awarded ${points} points to ${username} for ${activity}`);

        res.json({ message: `Awarded ${points} points for ${activity}! Total points: ${userPoints[username]}` });
      } catch (error) {
        console.error('❌ Reward points error:', error);
        res.status(500).json({ error: 'Failed to award points: ' + error.message });
      }
    });

    app.listen(port, () => console.log(`🚀 CryptoStream Server running on port ${port}`));
  } catch (error) {
    console.error('❌ Server initialization failed:', error);
    process.exit(1);
  }
})();