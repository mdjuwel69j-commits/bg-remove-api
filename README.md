# Free Background Remover API

A real background-removal API built with Node.js and the Python `rembg` library.

## Features

- Remove background from uploaded images
- Remove background from remote image URLs
- Simple REST API
- Health check endpoint
- Automatic temporary file cleanup
- CORS enabled

## Prerequisites

- Node.js 18+
- Python 3.10+
- `pip`

## Installation

1. Install Node dependencies:

```bash
npm install
```

2. Install Python dependencies:

```bash
pip install -r requirements.txt
```

## Start the API

Development mode:

```bash
npm run dev
```

Production mode:

```bash
npm start
```

The server listens on:

```bash
http://localhost:3001
```

## API Endpoints

### GET /health

Check if the server is running.

### POST /remove-background

Upload an image file to remove the background.

Example:

```bash
curl -X POST \
  -F "image=@/path/to/example.jpg" \
  http://localhost:3001/remove-background \
  --output result.png
```

### POST /remove-background-url

Process an image directly from a remote URL.

Example:

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"imageUrl":"https://example.com/image.jpg"}' \
  http://localhost:3001/remove-background-url \
  --output result.png
```

## Notes

- The output image is returned as a PNG image.
- Temporary files are cleaned up automatically after sending the processed file.
- `rembg` is the actual model used for background removal.

## Example JavaScript client

```javascript
const formData = new FormData();
formData.append('image', fileInput.files[0]);

const response = await fetch('http://localhost:3001/remove-background', {
  method: 'POST',
  body: formData
});

const blob = await response.blob();
const url = URL.createObjectURL(blob);
console.log(url);
```

## Troubleshooting

If the app fails to start:

- Ensure Python is installed and available in PATH
- Run: `python3 --version`
- Install Python dependencies: `pip install -r requirements.txt`
- Verify `rembg` is installed successfully

## License

MIT
