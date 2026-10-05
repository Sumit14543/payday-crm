import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'production';
const configuredApiTarget = process.env.API_TARGET || process.env.VITE_API_URL || '';
const API_TARGET = configuredApiTarget && !configuredApiTarget.startsWith('/')
  ? configuredApiTarget
  : 'https://payday-api.waqtmoney.com/api';
const UPLOAD_TARGET = API_TARGET.replace(/\/api\/?$/, '');

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

const distPath = join(__dirname, 'dist');
const distExists = existsSync(distPath);

if (distExists) {
  app.use(express.static(distPath));
  console.log('Serving from dist directory (production mode)');
} else {
  console.log('No dist directory found. Run "npm run build" first or use "npm run dev" for development.');
}

app.use('/api', async (req, res) => {
  const targetUrl = `${API_TARGET}${req.originalUrl.replace(/^\/api/, '')}`;

  try {
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: {
        'content-type': req.headers['content-type'] || 'application/json',
        authorization: req.headers.authorization || '',
      },
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body || {}),
    });
    const text = await response.text();

    res.status(response.status);
    res.setHeader('content-type', response.headers.get('content-type') || 'application/json');
    res.send(text);
  } catch (error) {
    res.status(502).json({
      success: false,
      message: `Unable to reach backend API at ${API_TARGET}`,
    });
  }
});

app.use('/uploads', async (req, res) => {
  const targetUrl = `${UPLOAD_TARGET}${req.originalUrl}`;

  try {
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: {
        authorization: req.headers.authorization || '',
        'x-user-email': req.headers['x-user-email'] || '',
        'x-user-name': req.headers['x-user-name'] || '',
        'x-user-role': req.headers['x-user-role'] || '',
      },
    });
    const bytes = Buffer.from(await response.arrayBuffer());

    res.status(response.status);
    res.setHeader('content-type', response.headers.get('content-type') || 'application/octet-stream');
    res.send(bytes);
  } catch (error) {
    res.status(502).json({
      success: false,
      message: `Unable to reach backend uploads at ${UPLOAD_TARGET}`,
    });
  }
});

app.use((req, res) => {
  if (distExists) {
    res.sendFile(join(__dirname, 'dist', 'index.html'));
    return;
  }

  res.status(503).send(`
    <html>
      <head><title>PayDay Loan CRM - Build Required</title></head>
      <body style="font-family: Arial; padding: 40px; max-width: 800px; margin: 0 auto;">
        <h1>PayDay Loan CRM</h1>
        <h2>Build Required</h2>
        <p>The application needs to be built before it can be served.</p>
        <h3>Quick Start:</h3>
        <ol>
          <li><strong>For Development:</strong> Run <code>npm run dev</code></li>
          <li><strong>For Production:</strong> Run <code>npm run build</code> then <code>npm start</code></li>
        </ol>
      </body>
    </html>
  `);
});

app.listen(PORT, () => {
  console.log('\n' + '='.repeat(60));
  console.log('PayDay Loan CRM - Server Started Successfully!');
  console.log('='.repeat(60));
  console.log(`\nServer URL: http://localhost:${PORT}`);
  console.log(`Environment: ${NODE_ENV}`);
  console.log(`Started at: ${new Date().toLocaleString()}`);

  if (!distExists) {
    console.log('\nWARNING: No build found!');
    console.log('\nTo run the application:');
    console.log('   1. Development mode: npm run dev');
    console.log('   2. Production mode:  npm run build && npm start');
  } else {
    console.log('\nApplication is ready!');
    console.log(`   Open http://localhost:${PORT} in your browser`);
  }

  console.log('\nAvailable API Endpoints:');
  console.log(`   Proxy /api -> ${API_TARGET}`);
  console.log('\n' + '='.repeat(60) + '\n');
});
