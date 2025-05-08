import React, { useState, useEffect, useRef } from 'react';
import { Box, Container, Typography, Paper, Grid, CircularProgress } from '@mui/material';
import './App.css';

// Global OpenCV loading state
let openCVLoadingPromise = null;

function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [isOpenCVLoaded, setIsOpenCVLoaded] = useState(false);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [analysis, setAnalysis] = useState({
    dullness: 0,
    acne: 0,
    dryness: 0
  });
  const [faceDetected, setFaceDetected] = useState(false);

  // Load OpenCV.js
  useEffect(() => {
    const loadOpenCV = () => {
      if (openCVLoadingPromise) {
        return openCVLoadingPromise;
      }

      openCVLoadingPromise = new Promise((resolve, reject) => {
        if (window.cv) {
          console.log('OpenCV.js already loaded');
          resolve();
          return;
        }

        const script = document.createElement('script');
        script.src = 'https://docs.opencv.org/4.8.0/opencv.js';
        script.async = true;
        script.onload = () => {
          if (window.cv) {
            console.log('OpenCV.js loaded successfully');
            resolve();
          } else {
            reject(new Error('OpenCV.js failed to load'));
          }
        };
        script.onerror = () => reject(new Error('Failed to load OpenCV.js'));
        document.body.appendChild(script);
      });

      return openCVLoadingPromise;
    };

    const initialize = async () => {
      try {
        setIsLoading(true);
        await loadOpenCV();
        setIsOpenCVLoaded(true);
        setError(null);
      } catch (error) {
        console.error('Error loading OpenCV:', error);
        setError('Failed to load OpenCV. Please refresh the page.');
      } finally {
        setIsLoading(false);
      }
    };

    initialize();
  }, []);

  // Start video and face detection
  useEffect(() => {
    if (!isOpenCVLoaded) return;

    let stream;
    let animationFrameId;
    let faceCascade;

    const startVideo = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ 
          video: {
            width: 640,
            height: 480,
            facingMode: "user"
          }
        });
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await new Promise((resolve) => {
            videoRef.current.onloadedmetadata = () => {
              resolve();
            };
          });
          console.log('Camera stream started successfully');
        }
      } catch (err) {
        console.error("Error accessing camera:", err);
        setError('Failed to access camera. Please make sure you have granted camera permissions.');
      }
    };

    const loadFaceCascade = async () => {
      try {
        console.log('Starting to load face cascade...');
        faceCascade = new window.cv.CascadeClassifier();
        console.log('Cascade classifier created');

        // Fetch as ArrayBuffer
        const modelPath = '/haarcascade_frontalface_default.xml';
        console.log('Fetching cascade file from:', modelPath);
        const response = await fetch(modelPath);
        if (!response.ok) {
          throw new Error(`Failed to fetch cascade file: ${response.statusText} (${response.status})`);
        }
        const buffer = await response.arrayBuffer();
        const data = new Uint8Array(buffer);
        const fileName = 'haarcascade_frontalface_default.xml';
        // Write to OpenCV FS (ignore error if file exists)
        try {
          window.cv.FS_createDataFile('/', fileName, data, true, false, false);
          console.log('Cascade file written to OpenCV FS');
        } catch (e) {
          if (e.message && e.message.includes('File exists')) {
            console.log('Cascade file already exists in OpenCV FS, continuing...');
          } else {
            throw e;
          }
        }
        // Load by filename
        const success = faceCascade.load(fileName);
        if (!success) {
          throw new Error('Failed to load cascade classifier - load() returned false');
        }
        console.log('Face cascade loaded successfully');
      } catch (err) {
        console.error('Error loading face cascade:', err);
        setError(`Failed to load face detection model: ${err.message}`);
        throw err;
      }
    };

    const detectFaces = async () => {
      if (!videoRef.current || !canvasRef.current || !faceCascade) {
        console.log('Missing required components:', {
          video: !!videoRef.current,
          canvas: !!canvasRef.current,
          cascade: !!faceCascade,
          videoReady: videoRef.current?.readyState === 4
        });
        return;
      }

      const videoWidth = videoRef.current.videoWidth;
      const videoHeight = videoRef.current.videoHeight;
      if (!videoWidth || !videoHeight) {
        animationFrameId = requestAnimationFrame(detectFaces);
        return;
      }

      let foundFace = false;

      try {
        // Set canvas dimensions to match video
        canvasRef.current.width = videoWidth;
        canvasRef.current.height = videoHeight;

        // Use an offscreen canvas to grab the video frame
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = videoWidth;
        tempCanvas.height = videoHeight;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(videoRef.current, 0, 0, videoWidth, videoHeight);

        // Read the frame into a Mat
        const src = window.cv.imread(tempCanvas);
        const gray = new window.cv.Mat();
        window.cv.cvtColor(src, gray, window.cv.COLOR_RGBA2GRAY);

        // Histogram equalization for better contrast
        const equalized = new window.cv.Mat();
        window.cv.equalizeHist(gray, equalized);

        // Detect faces (further tuned parameters)
        const faces = new window.cv.RectVector();
        const minSize = new window.cv.Size(30, 30); // smaller min size
        faceCascade.detectMultiScale(equalized, faces, 1.05, 2, 0, minSize); // more sensitive params

        // Get canvas context
        const ctx = canvasRef.current.getContext('2d');
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

        // Draw face rectangles and analyze skin
        for (let i = 0; i < faces.size(); i++) {
          foundFace = true;
          const face = faces.get(i);

          // Draw face rectangle
          ctx.strokeStyle = '#00ff00';
          ctx.lineWidth = 2;
          ctx.strokeRect(face.x, face.y, face.width, face.height);

          // Analyze skin in face region
          const faceRegion = equalized.roi(face);
          const spots = detectSpots(faceRegion, face);

          // Draw spots
          spots.forEach(spot => {
            ctx.beginPath();
            ctx.strokeStyle = 'rgba(255, 0, 0, 0.8)';
            ctx.lineWidth = 2;
            ctx.arc(face.x + spot.x, face.y + spot.y, spot.radius, 0, 2 * Math.PI);
            ctx.stroke();
          });

          // Update analysis
          const newAnalysis = {
            dullness: calculateDullness(spots, face),
            acne: calculateAcne(spots),
            dryness: calculateDryness(spots, face)
          };

          setAnalysis(newAnalysis);

          faceRegion.delete();
        }

        setFaceDetected(foundFace);
        if (!foundFace) {
          setAnalysis({ dullness: 0, acne: 0, dryness: 0 });
        }

        // Clean up
        src.delete();
        gray.delete();
        equalized.delete();
        faces.delete();
      } catch (err) {
        console.error('Error in face detection:', err);
      }
      animationFrameId = requestAnimationFrame(detectFaces);
    };

    // Enhanced spot (acne/blemish) detection
    const detectSpots = (faceRegion, face) => {
      const spots = [];
      const rows = faceRegion.rows;
      const cols = faceRegion.cols;
      // Use adaptive thresholding for better spot detection
      const thresh = new window.cv.Mat();
      window.cv.adaptiveThreshold(
        faceRegion,
        thresh,
        255,
        window.cv.ADAPTIVE_THRESH_MEAN_C,
        window.cv.THRESH_BINARY_INV,
        11,
        2
      );
      // Find local minima (potential blemishes)
      for (let y = 2; y < rows - 2; y += 2) {
        for (let x = 2; x < cols - 2; x += 2) {
          const pixel = thresh.ucharPtr(y, x)[0];
          if (pixel > 200) { // strong response in thresholded image
            // Check if this is a local minimum in the original region
            let isSpot = true;
            const center = faceRegion.ucharPtr(y, x)[0];
            for (let dy = -2; dy <= 2; dy++) {
              for (let dx = -2; dx <= 2; dx++) {
                if (dy === 0 && dx === 0) continue;
                const ny = y + dy;
                const nx = x + dx;
                if (ny >= 0 && ny < rows && nx >= 0 && nx < cols) {
                  const npixel = faceRegion.ucharPtr(ny, nx)[0];
                  if (center > npixel - 10) {
                    isSpot = false;
                    break;
                  }
                }
              }
              if (!isSpot) break;
            }
            if (isSpot) {
              spots.push({
                x,
                y,
                radius: 4,
                intensity: center
              });
            }
          }
        }
      }
      thresh.delete();
      return spots;
    };

    const calculateDullness = (spots, face) => {
      const foreheadSpots = spots.filter(spot => 
        spot.y < face.height * 0.3
      );
      return Math.min(100, Math.max(0, foreheadSpots.length * 10));
    };

    const calculateAcne = (spots) => {
      return Math.min(100, Math.max(0, spots.length * 5));
    };

    const calculateDryness = (spots, face) => {
      const cheekSpots = spots.filter(spot => 
        spot.x < face.width * 0.3 || spot.x > face.width * 0.7
      );
      return Math.min(100, Math.max(0, cheekSpots.length * 8));
    };

    const initialize = async () => {
      try {
        console.log('Starting initialization...');
        await startVideo();
        console.log('Video started');
        await loadFaceCascade();
        console.log('Face cascade loaded');
        detectFaces();
        console.log('Face detection started');
      } catch (err) {
        console.error('Initialization error:', err);
        setError(`Failed to initialize face detection: ${err.message}`);
      }
    };

    initialize();

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
      if (faceCascade) {
        faceCascade.delete();
      }
    };
  }, [isOpenCVLoaded]);

  if (isLoading) {
    return (
      <Container maxWidth="lg">
        <Box sx={{ my: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <Typography variant="h5">Loading OpenCV...</Typography>
          <CircularProgress />
        </Box>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ minHeight: '100vh', py: { xs: 2, md: 4 } }}>
      <Box sx={{ my: { xs: 2, md: 4 } }}>
        <Typography variant="h3" component="h1" gutterBottom align="center" sx={{ fontWeight: 700, letterSpacing: 1 }}>
          BeautyCam - Real-time Face Analysis
        </Typography>
        
        {error && (
          <Typography color="error" align="center" gutterBottom>
            {error}
          </Typography>
        )}
        {!error && !faceDetected && (
          <Typography color="textSecondary" align="center" gutterBottom>
            No face detected. Please ensure your face is visible to the camera.
          </Typography>
        )}
        
        <Grid container spacing={3} alignItems="stretch">
          <Grid item xs={12} md={6}>
            <Paper elevation={3} sx={{ p: { xs: 1, md: 2 }, position: 'relative', minHeight: { xs: 240, md: 400 }, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                style={{ width: '100%', borderRadius: '12px', background: '#23263a' }}
              />
              <canvas
                ref={canvasRef}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  borderRadius: '12px',
                  pointerEvents: 'none'
                }}
              />
            </Paper>
          </Grid>
          
          <Grid item xs={12} md={6}>
            <Paper elevation={3} sx={{ p: { xs: 1.5, md: 3 }, minHeight: { xs: 200, md: 400 }, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <Typography variant="h5" gutterBottom sx={{ fontWeight: 600 }}>
                Analysis Results
              </Typography>
              
              <Box sx={{ mt: 2 }}>
                <Typography variant="h6">Dullness: {analysis.dullness.toFixed(1)}%</Typography>
                <Box className="analysis-bar">
                  <Box
                    className="analysis-bar-inner"
                    sx={{
                      width: `${analysis.dullness}%`,
                      bgcolor: 'primary.main',
                    }}
                  />
                </Box>

                <Typography variant="h6">Acne: {analysis.acne.toFixed(1)}%</Typography>
                <Box className="analysis-bar">
                  <Box
                    className="analysis-bar-inner"
                    sx={{
                      width: `${analysis.acne}%`,
                      bgcolor: 'error.main',
                    }}
                  />
                </Box>

                <Typography variant="h6">Dryness: {analysis.dryness.toFixed(1)}%</Typography>
                <Box className="analysis-bar">
                  <Box
                    className="analysis-bar-inner"
                    sx={{
                      width: `${analysis.dryness}%`,
                      bgcolor: 'warning.main',
                    }}
                  />
                </Box>
              </Box>
            </Paper>
          </Grid>
        </Grid>
      </Box>
    </Container>
  );
}

export default App;
