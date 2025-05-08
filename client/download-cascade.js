const https = require('https');
const fs = require('fs');
const path = require('path');

const CASCADE_URL = 'https://raw.githubusercontent.com/opencv/opencv/master/data/haarcascades/haarcascade_frontalface_default.xml';
const PUBLIC_DIR = path.join(__dirname, 'public');

// Create public directory if it doesn't exist
if (!fs.existsSync(PUBLIC_DIR)) {
  fs.mkdirSync(PUBLIC_DIR, { recursive: true });
}

console.log('Downloading face cascade XML file...');

https.get(CASCADE_URL, (response) => {
  if (response.statusCode !== 200) {
    console.error(`Failed to download cascade file: ${response.statusCode}`);
    process.exit(1);
  }

  const filePath = path.join(PUBLIC_DIR, 'haarcascade_frontalface_default.xml');
  const fileStream = fs.createWriteStream(filePath);

  response.pipe(fileStream);

  fileStream.on('finish', () => {
    fileStream.close();
    console.log('Face cascade XML file downloaded successfully!');
  });
}).on('error', (err) => {
  console.error('Error downloading cascade file:', err);
  process.exit(1);
}); 