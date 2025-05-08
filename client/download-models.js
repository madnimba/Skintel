const https = require('https');
const fs = require('fs');
const path = require('path');

const models = [
  {
    name: 'ssd_mobilenetv1_model-weights_manifest.json',
    url: 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/ssd_mobilenetv1_model-weights_manifest.json'
  },
  {
    name: 'ssd_mobilenetv1_model-shard1',
    url: 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/ssd_mobilenetv1_model-shard1'
  },
  {
    name: 'face_landmark_68_model-weights_manifest.json',
    url: 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/face_landmark_68_model-weights_manifest.json'
  },
  {
    name: 'face_landmark_68_model-shard1',
    url: 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/face_landmark_68_model-shard1'
  },
  {
    name: 'face_recognition_model-weights_manifest.json',
    url: 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/face_recognition_model-weights_manifest.json'
  },
  {
    name: 'face_recognition_model-shard1',
    url: 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/face_recognition_model-shard1'
  }
];

const downloadFile = (model) => {
  return new Promise((resolve, reject) => {
    const filePath = path.join(__dirname, 'public', 'models', model.name);
    const file = fs.createWriteStream(filePath);

    console.log(`Downloading ${model.name}...`);
    
    https.get(model.url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download ${model.name}: ${response.statusCode}`));
        return;
      }

      let data = [];
      response.on('data', (chunk) => {
        data.push(chunk);
      });

      response.on('end', () => {
        const buffer = Buffer.concat(data);
        fs.writeFile(filePath, buffer, (err) => {
          if (err) {
            reject(err);
            return;
          }
          console.log(`Successfully downloaded ${model.name}`);
          resolve();
        });
      });
    }).on('error', (err) => {
      fs.unlink(filePath, () => {}); // Delete the file if there's an error
      reject(err);
    });
  });
};

const downloadAll = async () => {
  try {
    // Create models directory if it doesn't exist
    const modelsDir = path.join(__dirname, 'public', 'models');
    if (!fs.existsSync(modelsDir)) {
      fs.mkdirSync(modelsDir, { recursive: true });
    }

    // Remove existing model files
    const existingFiles = fs.readdirSync(modelsDir);
    for (const file of existingFiles) {
      fs.unlinkSync(path.join(modelsDir, file));
    }

    // Download all models
    for (const model of models) {
      await downloadFile(model);
    }
    
    console.log('All models downloaded successfully!');
  } catch (error) {
    console.error('Error downloading models:', error);
    process.exit(1);
  }
};

downloadAll(); 