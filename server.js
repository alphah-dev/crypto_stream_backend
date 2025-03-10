// import 'dotenv/config';
// import { config } from 'dotenv';
// import express from 'express';
// import { createHelia } from 'helia';
// import { unixfs } from '@helia/unixfs';
// import DatastoreFS from 'datastore-fs';
// const FsDatastore = DatastoreFS;
// import dhive from '@hiveio/dhive';
// import WebTorrent from 'webtorrent';
// import multer from 'multer';
// import { fileURLToPath } from 'url';
// import path from 'path';
// import cors from 'cors';


// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);
// const rootDir = path.resolve(__dirname, '..');
// config({ path: path.join(rootDir, '.env') });

// const app = express();
// const port = process.env.PORT || 5000;

// (async () => {
//   let helia;
//   let fs;
//   let client;
//   let torrentClient;
//   let hiveKey;

//   try {
//     const datastore = new FsDatastore(path.join(__dirname, 'helia-datastore'));
//     helia = await createHelia({ datastore });
//     fs = unixfs(helia);
//     console.log('Helia node initialized with persistent storage');

    
//     console.log('HIVE_POSTING_KEY from env:', process.env.HIVE_POSTING_KEY);
//     if (!process.env.HIVE_POSTING_KEY) {
//       throw new Error('HIVE_POSTING_KEY is not defined in .env');
//     }

//     client = new dhive.Client('https://api.hive.blog');
//     torrentClient = new WebTorrent();
//     hiveKey = dhive.PrivateKey.fromString(process.env.HIVE_POSTING_KEY);
//     console.log('Hive key loaded successfully');

    
//     app.use(express.json());
//     app.use(express.static('public'));
//     app.use(cors());
//     const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

    
//     app.post('/api/upload', upload.single('video'), async (req, res) => {
//       const { filename, username, category = 'video', premium = 'false' } = req.body;
//       const videoBuffer = req.file?.buffer;
//       if (!videoBuffer || !filename || !username) {
//         return res.status(400).json({ error: 'Missing required fields (video, filename, username)' });
//       }
//       try {
//         const content = videoBuffer;
//         const cid = await fs.addBytes(content);
//         const torrent = await new Promise((resolve, reject) => {
//           const torrentInstance = torrentClient.seed(content, { name: filename }, (torrent) => {
//             resolve(torrent);
//           });
//           torrentInstance.on('error', reject);
//         });
//         await helia.pins.add(cid);

        
//         const permlink = `${username}-${Date.now()}`;
//         const jsonMetadata = JSON.stringify({ cid: cid.toString(), torrent: torrent.magnetURI, premium: premium === 'true' });
//         const operations = [['comment', {
//           parent_author: '',
//           parent_permlink: category,
//           author: username,
//           permlink,
//           title: filename,
//           body: `Video uploaded: ${cid.toString()}`,
//           json_metadata: jsonMetadata,
//         }]];
//         try {
//           const broadcastResult = await client.broadcast.sendOperations(operations, hiveKey);
//           console.log('Hive broadcast successful:', broadcastResult);
//         } catch (error) {
//           console.error('Hive broadcast failed:', error);
//           throw new Error('Failed to post to Hive: ' + error.message);
//         }

//         res.json({
//           cid: cid.toString(),
//           torrent: torrent.magnetURI,
//           permlink,
//           premium: premium === 'true',
//         });
//       } catch (error) {
//         console.error('Upload error:', error);
//         res.status(500).json({ error: 'Failed to upload video: ' + error.message });
//       }
//     });

    
//     app.get('/api/videos', async (req, res) => {
//       const { tag = 'video', limit = 20, premium = 'false' } = req.query;
//       try {
//         const posts = await client.database.getDiscussions('trending', {
//           tag,
//           limit: Math.min(parseInt(limit), 100),
//         });
//         const videos = posts.map(post => {
//           let metadata = {};
//           try {
//             metadata = JSON.parse(post.json_metadata);
//           } catch {}
//           return {
//             cid: metadata.cid || '',
//             torrent: metadata.torrent || '',
//             title: post.title,
//             author: post.author,
//             permlink: post.permlink,
//             category: post.category || post.parent_permlink,
//             views: post.net_votes || 0,
//             premium: metadata.premium || false,
//           };
//         }).filter(v => premium === 'false' || v.premium === (premium === 'true'));
//         res.json(videos);
//       } catch (error) {
//         console.error('Videos fetch error:', error);
//         res.status(500).json({ error: 'Failed to fetch videos: ' + error.message });
//       }
//     });

    
//     app.get('/api/comments/:author/:permlink', async (req, res) => {
//       const { author, permlink } = req.params;
//       try {
//         const comments = await client.database.getContentReplies({ author, permlink });
//         res.json(comments.map(c => ({
//           author: c.author,
//           permlink: c.permlink,
//           body: c.body,
//           created: c.created,
//         })));
//       } catch (error) {
//         console.error('Comments fetch error:', error);
//         res.status(500).json({ error: 'Failed to fetch comments: ' + error.message });
//       }
//     });

//     app.post('/api/reward-points', async (req, res) => {
//       const { username, activity } = req.body;
//       if (!username || !activity) {
//         return res.status(400).json({ error: 'Missing username or activity' });
//       }
//       const points = activity === 'upload' ? 100 : activity === 'comment' ? 50 : 0;
//       if (points === 0) {
//         return res.status(400).json({ error: 'Invalid activity' });
//       }
//       try {
//         const amount = `${(points / 100).toFixed(3)} HIVE`;
//         const memo = `Earned ${points} Ecency Points for ${activity}`;
//         const activeKey = dhive.PrivateKey.fromString(process.env.HIVE_ACTIVE_KEY);
//         await client.broadcast.transfer({
//           from: platformWallet,
//           to: username,
//           amount,
//           memo,
//         }, activeKey);
//         res.json({ username, points, message: memo });
//       } catch (error) {
//         console.error('Reward error:', error);
//         res.status(500).json({ error: 'Failed to reward points: ' + error.message });
//       }
//     });

//     app.listen(port, () => console.log(`CryptoStream Server on http://localhost:${port}`));
//   } catch (error) {
//     console.error('Server initialization failed:', error);
//     process.exit(1);
//   }
// })();   

import 'dotenv/config';
import { config } from 'dotenv';
import express from 'express';
import { createHelia } from 'helia';
import { unixfs } from '@helia/unixfs';
import DatastoreFS from 'datastore-fs';
const FsDatastore = DatastoreFS;
import dhive from '@hiveio/dhive';
import WebTorrent from 'webtorrent';
import multer from 'multer';
import { fileURLToPath } from 'url';
import path from 'path';
import cors from 'cors';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
config({ path: path.join(rootDir, '.env') });

const app = express();
const port = process.env.PORT || 5000;

// In-memory storage for creators (replace with a database in production)
let creators = [
  { name: 'Harsh Katiyar', followers: '80k', username: 'harshkatiyar', image: 'https://i.ibb.co/SwVNJK5r/12.jpg' },
  { name: 'Samay Raina', followers: '56k', username: 'samayraina', image: 'https://i.ibb.co/mFCxdzkF/samay.jpg' },
];

(async () => {
  let helia;
  let fs;
  let client;
  let torrentClient;
  let hiveKey;

  try {
    const datastore = new FsDatastore(path.join(__dirname, 'helia-datastore'));
    helia = await createHelia({ datastore });
    fs = unixfs(helia);
    console.log('Helia node initialized with persistent storage');

    console.log('HIVE_POSTING_KEY from env:', process.env.HIVE_POSTING_KEY);
    if (!process.env.HIVE_POSTING_KEY) {
      throw new Error('HIVE_POSTING_KEY is not defined in .env');
    }

    client = new dhive.Client('https://api.hive.blog');
    torrentClient = new WebTorrent();
    hiveKey = dhive.PrivateKey.fromString(process.env.HIVE_POSTING_KEY);
    console.log('Hive key loaded successfully');

    app.use(express.json());
    app.use(express.static('public'));
    app.use(cors());

    // Serve uploaded images
    app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

    const upload = multer({
      storage: multer.memoryStorage(),
      limits: { fileSize: 100 * 1024 * 1024 }, // 100MB max
    });

    // Upload API
    app.post('/api/upload', upload.single('video'), async (req, res) => {
      const { filename, username, category = 'video', premium = 'false' } = req.body;
      const videoBuffer = req.file?.buffer;

      console.log('Upload request received:', { filename, username, category, premium, hasFile: !!req.file });

      if (!videoBuffer || !filename || !username) {
        console.error('Missing required fields:', { videoBuffer: !!videoBuffer, filename, username });
        return res.status(400).json({ error: 'Missing required fields (video, filename, username)' });
      }

      try {
        const content = videoBuffer;
        const cid = await fs.addBytes(content);
        console.log('Video uploaded to IPFS, CID:', cid.toString());

        const torrent = await new Promise((resolve, reject) => {
          const torrentInstance = torrentClient.seed(content, { name: filename }, (torrent) => {
            resolve(torrent);
          });
          torrentInstance.on('error', reject);
        });
        console.log('Torrent created:', torrent.magnetURI);

        await helia.pins.add(cid);
        console.log('CID pinned:', cid.toString());

        const permlink = `${username}-${Date.now()}`;
        const jsonMetadata = JSON.stringify({
          cid: cid.toString(),
          torrent: torrent.magnetURI,
          premium: premium === 'true',
          image: 'https://via.placeholder.com/300x200', // Ensure a default image
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
          console.log('Hive broadcast successful:', broadcastResult);
        } catch (error) {
          console.error('Hive broadcast failed:', error);
          throw new Error('Failed to post to Hive: ' + error.message);
        }

        res.json({
          cid: cid.toString(),
          torrent: torrent.magnetURI,
          permlink,
          premium: premium === 'true',
          image: 'https://via.placeholder.com/300x200', // Ensure a default image in response
        });
      } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Failed to upload video: ' + error.message });
      }
    });

    // Fetch videos API
    app.get('/api/videos', async (req, res) => {
      const { tag = 'video', limit = 20, premium = 'false' } = req.query;
      try {
        const posts = await client.database.getDiscussions('trending', {
          tag,
          limit: Math.min(parseInt(limit), 100),
        });
        console.log('Fetched posts:', posts.length); // Debug log
        const videos = posts.map((post) => {
          let metadata = {};
          try {
            metadata = JSON.parse(post.json_metadata || '{}'); // Default to empty object if parsing fails
            console.log('Post metadata:', post.permlink, metadata); // Debug log
          } catch (e) {
            console.error('Failed to parse metadata for post:', post.permlink, e);
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
            image: metadata.image || 'https://via.placeholder.com/300x200', // Ensure a fallback image
          };
        }).filter((v) => premium === 'false' || v.premium === (premium === 'true'));
        console.log('Processed videos:', videos.length); // Debug log
        res.json(videos);
      } catch (error) {
        console.error('Videos fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch videos: ' + error.message });
      }
    });

    // Fetch creators API
    app.get('/api/creators', (req, res) => {
      res.json(creators);
    });

    // Update creator API
    app.put('/api/creators/:username', (req, res) => {
      const { username } = req.params;
      const { name, followers, image } = req.body;
      creators = creators.map((c) =>
        c.username === username ? { ...c, name, followers, image } : c
      );
      res.json({ message: 'Creator updated' });
    });

    // Delete creator API
    app.delete('/api/creators/:username', (req, res) => {
      const { username } = req.params;
      creators = creators.filter((c) => c.username !== username);
      res.json({ message: 'Creator deleted' });
    });

    // Fetch comments API
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
        console.error('Comments fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch comments: ' + error.message });
      }
    });

    // Reward points API
    app.post('/api/reward-points', async (req, res) => {
      const { username, activity } = req.body;
      if (!username || !activity) {
        return res.status(400).json({ error: 'Missing username or activity' });
      }
      const points = activity === 'upload' ? 100 : activity === 'comment' ? 50 : 0;
      if (points === 0) {
        return res.status(400).json({ error: 'Invalid activity' });
      }
      try {
        const amount = `${(points / 100).toFixed(3)} HIVE`;
        const memo = `Earned ${points} Ecency Points for ${activity}`;
        const activeKey = dhive.PrivateKey.fromString(process.env.HIVE_ACTIVE_KEY);
        const platformWallet = 'cryptostream';
        await client.broadcast.transfer(
          {
            from: platformWallet,
            to: username,
            amount,
            memo,
          },
          activeKey
        );
        res.json({ username, points, message: memo });
      } catch (error) {
        console.error('Reward error:', error);
        res.status(500).json({ error: 'Failed to reward points: ' + error.message });
      }
    });

    app.listen(port, () => console.log(`CryptoStream Server on http://localhost:${port}`));
  } catch (error) {
    console.error('Server initialization failed:', error);
    process.exit(1);
  }
})();