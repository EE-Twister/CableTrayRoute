import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const app = express();
app.use(express.json());

// Serve static files so the frontend can be loaded from the same server.
app.use(express.static(process.cwd()));

// Basic in-memory session store
const sessions = new Map();

// Ensure data directory exists
const dataDir = path.join(process.cwd(), 'server_data');
await fs.mkdir(dataDir, { recursive: true });

// Load users from disk if present
const usersFile = path.join(dataDir, 'users.json');
let users = {};
try {
  users = JSON.parse(await fs.readFile(usersFile, 'utf-8'));
} catch {
  users = {};
}

async function saveUsers() {
  await fs.writeFile(usersFile, JSON.stringify(users, null, 2));
}

// --- Auth endpoints ---
app.post('/signup', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Missing credentials' });
  if (users[username]) return res.status(409).json({ error: 'User exists' });
  users[username] = { password };
  await saveUsers();
  res.status(201).json({ message: 'User created' });
});

app.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  const user = users[username];
  if (!user || user.password !== password) return res.status(401).json({ error: 'Invalid credentials' });
  const token = crypto.randomBytes(16).toString('hex');
  sessions.set(token, username);
  res.json({ token });
});

function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const [, token] = header.split(' ');
  const username = sessions.get(token);
  if (!username) return res.status(401).json({ error: 'Unauthorized' });
  req.username = username;
  next();
}

// --- Project endpoints ---
app.post('/projects/:project', auth, async (req, res) => {
  const project = req.params.project;
  const username = req.username;
  const userDir = path.join(dataDir, username, project);
  await fs.mkdir(userDir, { recursive: true });
  const version = Date.now().toString();
  await fs.writeFile(path.join(userDir, `${version}.json`), JSON.stringify(req.body, null, 2));
  res.json({ version });
});

app.get('/projects/:project', auth, async (req, res) => {
  const project = req.params.project;
  const username = req.username;
  const projDir = path.join(dataDir, username, project);
  try {
    const files = await fs.readdir(projDir);
    const versions = files.filter(f => f.endsWith('.json')).sort();
    if (!versions.length) return res.status(404).json({ error: 'Not found' });
    const latest = versions[versions.length - 1];
    const data = JSON.parse(await fs.readFile(path.join(projDir, latest), 'utf-8'));
    res.json({ version: latest.replace('.json', ''), data });
  } catch {
    res.status(404).json({ error: 'Not found' });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});

