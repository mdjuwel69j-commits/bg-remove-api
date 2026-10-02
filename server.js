const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs/promises');
const { v4: uuidv4 } = require('uuid');
const { spawn } = require('child_process');

const app = express();
const PORT = Number(process.env.PORT || 3001);
const PYTHON_BIN = process.env.PYTHON_BIN || process.env.PYTHON || 'python3';

const APP_ROOT = __dirname;
const UPLOADS_DIR = path.join(APP_ROOT, 'uploads');
const OUTPUTS_DIR = path.join(APP_ROOT, 'outputs');

app.use(cors());
app.use(express.json({ limit: '10mb' }));

async function ensureDirectories() {
  await Promise.all([
    fs.mkdir(UPLOADS_DIR, { recursive: true }),
    fs.mkdir(OUTPUTS_DIR, { recursive: true })
  ]);
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const safeName = `${uuidv4()}${path.extname(file.originalname || '.png')}`;
    cb(null, safeName);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
      return;
    }
    cb(new Error('Only JPEG, JPG, PNG, and WebP image files are allowed.'));
  }
});

function runPythonModel(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(APP_ROOT, 'model.py');
    const child = spawn(PYTHON_BIN, [scriptPath, inputPath, outputPath], {
      cwd: APP_ROOT,
      env: process.env
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      reject(new Error(`Failed to start Python process: ${error.message}`));
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true, stdout, stderr });
        return;
      }

      reject(new Error(stderr.trim() || stdout.trim() || `Python process exited with code ${code}`));
    });
  });
}

async function cleanUpFile(filePath) {
  if (!filePath) return;

  try {
    await fs.unlink(filePath);
  } catch (_error) {
    // ignore cleanup errors
  }
}

async function removeBackgroundFromFile(inputPath, outputPath) {
  await runPythonModel(inputPath, outputPath);

  try {
    await fs.access(outputPath);
  } catch (error) {
    throw new Error('Output file was not created by the Python model.');
  }
}

async function processUploadedFile(inputPath, originalName) {
  const outputFileName = `processed-${uuidv4()}${path.extname(originalName || '.png')}`;
  const outputPath = path.join(OUTPUTS_DIR, outputFileName);

  await removeBackgroundFromFile(inputPath, outputPath);
  return { outputPath, inputPath };
}

function determineOutputExtension(contentType) {
  const map = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/webp': '.webp'
  };

  return map[contentType] || '.png';
}

app.get('/health', (_req, res) => {
  res.json({
    status: 'OK',
    service: 'Background Remover API',
    version: '1.0.0'
  });
});

app.get('/', (_req, res) => {
  res.json({
    name: 'Background Remover API',
    version: '1.0.0',
    endpoints: {
      'GET /health': 'Check API health',
      'POST /remove-background': 'Remove background from uploaded image',
      'POST /remove-background-url': 'Remove background from remote image URL'
    },
    usage: {
      upload: 'multipart/form-data with field name "image"',
      url: 'JSON body: { "imageUrl": "https://example.com/image.jpg" }'
    }
  });
});

app.post('/remove-background', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided.' });
    }

    const { outputPath, inputPath } = await processUploadedFile(req.file.path, req.file.originalname);

    res.sendFile(outputPath, async (err) => {
      if (err) {
        console.error('Error sending processed image:', err);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Unable to send processed image' });
        }
      }

      await cleanUpFile(inputPath);
      await cleanUpFile(outputPath);
    });
  } catch (error) {
    console.error('Upload processing failed:', error);

    if (req.file && req.file.path) {
      await cleanUpFile(req.file.path);
    }

    return res.status(500).json({
      error: 'Failed to process image',
      details: error.message
    });
  }
});

app.post('/remove-background-url', async (req, res) => {
  try {
    const { imageUrl } = req.body || {};

    if (!imageUrl || typeof imageUrl !== 'string') {
      return res.status(400).json({ error: 'A valid imageUrl is required in JSON body.' });
    }

    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'bg-remove-api/1.0'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch remote image: ${response.status} ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    if (!contentType.startsWith('image/')) {
      throw new Error('The remote URL did not return an image.');
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const extension = determineOutputExtension(contentType);
    const inputPath = path.join(UPLOADS_DIR, `${uuidv4()}${extension}`);
    const outputPath = path.join(OUTPUTS_DIR, `processed-${uuidv4()}${extension}`);

    await fs.writeFile(inputPath, buffer);
    await removeBackgroundFromFile(inputPath, outputPath);

    res.sendFile(outputPath, async (err) => {
      if (err) {
        console.error('Error sending processed image from URL:', err);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Unable to send processed image from URL' });
        }
      }

      await cleanUpFile(inputPath);
      await cleanUpFile(outputPath);
    });
  } catch (error) {
    console.error('URL processing failed:', error);
    return res.status(500).json({
      error: 'Failed to process image from URL',
      details: error.message
    });
  }
});

app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum size is 10MB.' });
    }
  }

  console.error('Unhandled server error:', error);
  return res.status(500).json({ error: 'Internal server error' });
});

async function startServer() {
  await ensureDirectories();

  app.listen(PORT, () => {
    console.log(`Background Remover API running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
  });
}

startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

module.exports = app;










































































































































































































































































































































