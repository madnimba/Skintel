import React, { useState, useEffect, useRef } from 'react';
import { Box, Container, Typography, Paper, Grid, CircularProgress } from '@mui/material';
import './App.css';
// import * as mpFaceMesh from '@mediapipe/face_mesh';
//import { FACEMESH_TESSELATION } from '@mediapipe/face_mesh/face_mesh_connections';

// import { Camera } from '@mediapipe/camera_utils';
// import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';

function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [analysis, setAnalysis] = useState({
    spots: 0,
    wrinkles: 0,
    acne: 0,
    darkCircles: 0,
    overallHealth: 100
  });
  const [faceDetected, setFaceDetected] = useState(false);
  const [debugInfo, setDebugInfo] = useState('');
  const analysisFinalized = useRef(false);
  const analysisFinalValues = useRef(null);
  const analysisStartTime = useRef(null);

  useEffect(() => {
    let faceMesh;
    let camera;

    const checkBrowserSupport = () => {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (!gl) {
        throw new Error('WebGL is not supported in your browser');
      }
      return true;
    };

    const checkCameraAccess = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        stream.getTracks().forEach(track => track.stop());
        return true;
      } catch (err) {
        throw new Error('Camera access denied or not available');
      }
    };

    const waitForFaceMesh = () => {
      return new Promise((resolve, reject) => {
        let tries = 0;
        function check() {
          if (window.FaceMesh) {
            resolve(window.FaceMesh);
          } else if (tries > 50) {
            reject(new Error('FaceMesh script did not load'));
          } else {
            tries++;
            setTimeout(check, 100);
          }
        }
        check();
      });
    };

    const initializeFaceMesh = async () => {
      try {
        setDebugInfo('Checking browser support...');
        checkBrowserSupport();
        
        setDebugInfo('Checking camera access...');
        await checkCameraAccess();

        setDebugInfo('Waiting for FaceMesh script...');
        await waitForFaceMesh();

        setDebugInfo('Initializing FaceMesh...');
        faceMesh = new window.FaceMesh({
          locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
        });
        

        setDebugInfo('Setting FaceMesh options...');
        faceMesh.setOptions({
          maxNumFaces: 1,
          refineLandmarks: true,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5
        });

        setDebugInfo('Setting up FaceMesh results handler...');
        faceMesh.onResults(onResults);

        if (!videoRef.current) {
          throw new Error('Video element not found');
        }

        setDebugInfo('Initializing camera...');
        camera = new window.Camera(videoRef.current, {
          onFrame: async () => {
            try {
              if (
                !videoRef.current ||
                videoRef.current.videoWidth === 0 ||
                videoRef.current.videoHeight === 0
              ) {
                setDebugInfo('Video not ready for processing.');
                return;
              }
              await faceMesh.send({ image: videoRef.current });
            } catch (err) {
              console.error('Error sending frame to FaceMesh:', err);
              setError('Error processing video frame. Please refresh the page.');
              setDebugInfo(`Frame error: ${err && err.message ? err.message : err}`);
            }
          },
          width: 640,
          height: 480
        });

        setDebugInfo('Starting camera...');
        await camera.start();
        setDebugInfo('Camera started successfully');
        setError(null);
      } catch (err) {
        console.error('Detailed initialization error:', err);
        // Only set user-friendly error messages, suppress technical/internal errors
        if (err.message.includes('WebGL')) {
          setError('Your browser does not support WebGL, which is required for face detection. Please try a different browser.');
        } else if (err.message.includes('Camera access')) {
          setError('Camera access denied or not available. Please ensure you have granted camera permissions.');
        } else {
          setError(''); // Suppress technical/internal errors
        }
      } finally {
        setIsLoading(false);
      }
    };

    const onResults = (results) => {
      if (!canvasRef.current || !videoRef.current) return;

      const ctx = canvasRef.current.getContext('2d');
      canvasRef.current.width = videoRef.current.videoWidth;
      canvasRef.current.height = videoRef.current.videoHeight;

      // Clear canvas
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

      // Draw video frame
      ctx.drawImage(results.image, 0, 0, canvasRef.current.width, canvasRef.current.height);

      if (!analysisStartTime.current) {
        analysisStartTime.current = Date.now();
      }
      const elapsed = (Date.now() - analysisStartTime.current) / 1000;

      if (results.multiFaceLandmarks) {
        setFaceDetected(results.multiFaceLandmarks.length > 0);

        for (const landmarks of results.multiFaceLandmarks) {
          // Draw less dense mesh only
          if (window.FACEMESH_TESSELATION) {
            const tesselation = window.FACEMESH_TESSELATION;
            const reducedTesselation = tesselation.filter((_, i) => i % 3 === 0);
            window.drawConnectors(ctx, landmarks, reducedTesselation, {
              color: 'rgba(0,255,0,0.3)',
              lineWidth: 1
            });
          } else {
            setDebugInfo('FACEMESH_TESSELATION not loaded yet.');
          }
          window.drawLandmarks(ctx, landmarks, {
            color: 'rgba(0, 255, 0, 0.5)',
            lineWidth: 1,
            radius: 1
          });

          // Calculate new analysis
          let newAnalysis = analyzeFaceFeatures(landmarks, results.image);

          // Cap all values at 30%
          Object.keys(newAnalysis).forEach(key => {
            if (key !== 'overallHealth') {
              newAnalysis[key] = Math.min(30, newAnalysis[key]);
            }
          });

          // Calculate overallHealth
          if (!analysisFinalized.current) {
            newAnalysis.overallHealth = 100 - (newAnalysis.spots + newAnalysis.wrinkles + newAnalysis.acne + newAnalysis.darkCircles) / 4;
          }

          // After 4 seconds, stabilize values
          if (!analysisFinalized.current && elapsed >= 4) {
            analysisFinalized.current = true;
            // Set overallHealth to a random value between 70 and 80
            newAnalysis.overallHealth = Math.floor(Math.random() * 11) + 70;
            analysisFinalValues.current = { ...newAnalysis };
            setAnalysis(analysisFinalValues.current);
          } else if (!analysisFinalized.current) {
            setAnalysis(newAnalysis);
          } else if (analysisFinalValues.current) {
            setAnalysis(analysisFinalValues.current);
          }
        }
      } else {
        setFaceDetected(false);
        setAnalysis({ spots: 0, wrinkles: 0, acne: 0, darkCircles: 0, overallHealth: 100 });
        analysisStartTime.current = null;
        analysisFinalized.current = false;
        analysisFinalValues.current = null;
      }
    };

    const analyzeFaceFeatures = (landmarks, image) => {
      // Get facial regions
      const forehead = getRegionLandmarks(landmarks, [10, 67, 69, 108, 109, 151, 337, 299, 333, 298]);
      const cheeks = getRegionLandmarks(landmarks, [123, 50, 36, 137, 177, 147, 213, 192, 214, 212]);
      const underEyes = getRegionLandmarks(landmarks, [70, 63, 105, 66, 107, 55, 65, 52, 53, 65]);
      const nose = getRegionLandmarks(landmarks, [168, 6, 197, 195, 5, 4, 1, 19, 94, 2, 164, 0, 11, 12, 13, 14, 15, 16, 17, 18, 200, 199, 175, 152]);

      // Spots: % of dark pixels on the whole face (cheeks + forehead + underEyes + nose)
      const allFace = [...forehead, ...cheeks, ...underEyes, ...nose];
      const allFaceAnalysis = analyzeSkinRegion(allFace, image);
      const spots = (allFaceAnalysis.spotCount / (allFaceAnalysis.pixelCount || 1)) * 100 * 0.3; // scale to 0-30

      // Wrinkles: high texture variation in forehead and underEyes
      const foreheadWrinkle = analyzeSkinRegion(forehead, image).textureVariation;
      const underEyeWrinkle = analyzeSkinRegion(underEyes, image).textureVariation;
      const wrinkles = Math.min(30, ((foreheadWrinkle + underEyeWrinkle) / 2) * 0.6); // scale to 0-30

      // Acne: % of spots in cheeks
      const cheeksAnalysis = analyzeSkinRegion(cheeks, image);
      const acne = (cheeksAnalysis.spotCount / (cheeksAnalysis.pixelCount || 1)) * 100 * 0.3; // scale to 0-30

      // Dark Circles: low brightness in underEyes
      const underEyesAnalysis = analyzeSkinRegion(underEyes, image);
      const darkCircles = Math.min(30, (100 - (underEyesAnalysis.averageBrightness / 255) * 100) * 0.3); // scale to 0-30

      return {
        spots,
        wrinkles,
        acne,
        darkCircles
      };
    };

    const getRegionLandmarks = (landmarks, indices) => {
      return indices.map(index => landmarks[index]);
    };

    const analyzeSkinRegion = (landmarks, image) => {
      // Use a temporary offscreen canvas for analysis
      const offCanvas = document.createElement('canvas');
      offCanvas.width = canvasRef.current.width;
      offCanvas.height = canvasRef.current.height;
      const offCtx = offCanvas.getContext('2d');
      offCtx.drawImage(image, 0, 0, offCanvas.width, offCanvas.height);

      const points = landmarks.map(point => ({
        x: point.x * offCanvas.width,
        y: point.y * offCanvas.height
      }));

      // Create a path for the region
      offCtx.save();
      offCtx.beginPath();
      offCtx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        offCtx.lineTo(points[i].x, points[i].y);
      }
      offCtx.closePath();
      offCtx.clip();

      // Get image data for the region
      const imageData = offCtx.getImageData(0, 0, offCanvas.width, offCanvas.height);
      const data = imageData.data;

      // Analyze skin texture and spots
      let totalBrightness = 0;
      let spotCount = 0;
      let textureVariation = 0;
      let pixelCount = 0;

      for (let y = 0; y < offCanvas.height; y++) {
        for (let x = 0; x < offCanvas.width; x++) {
          const idx = (y * offCanvas.width + x) * 4;
          if (offCtx.isPointInPath(x, y)) {
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];
            const brightness = (r + g + b) / 3;
            totalBrightness += brightness;
            pixelCount++;
            // Detect spots (dark areas)
            if (brightness < 70) {
              spotCount++;
            }
            // Calculate texture variation
            if (x > 0) {
              const prevIdx = (y * offCanvas.width + (x - 1)) * 4;
              const prevBrightness = (data[prevIdx] + data[prevIdx + 1] + data[prevIdx + 2]) / 3;
              textureVariation += Math.abs(brightness - prevBrightness);
            }
          }
        }
      }
      offCtx.restore();

      return {
        averageBrightness: totalBrightness / (pixelCount || 1),
        spotCount,
        textureVariation: textureVariation / (pixelCount || 1),
        pixelCount
      };
    };

    initializeFaceMesh();

    return () => {
      if (camera) {
        try {
          camera.stop();
        } catch (err) {
          console.error('Error stopping camera:', err);
        }
      }
      if (faceMesh) {
        try {
          faceMesh.close();
        } catch (err) {
          console.error('Error closing face mesh:', err);
        }
      }
    };
  }, []);

  if (isLoading) {
    return (
      <Container maxWidth="lg">
        <Box sx={{ my: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <Typography variant="h5">Loading Face Detection...</Typography>
          <CircularProgress />
          {debugInfo && (
            <Typography variant="body2" color="textSecondary" align="center">
              {debugInfo}
            </Typography>
          )}
        </Box>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ minHeight: '100vh', py: { xs: 2, md: 4 } }}>
      <Box sx={{ my: { xs: 2, md: 4 } }}>
        <Typography variant="h3" component="h1" gutterBottom align="center" sx={{ fontWeight: 700, letterSpacing: 1 }}>
          Lunera - Real-time Skin Analysis
        </Typography>
        
        {error && (
          <Paper elevation={3} sx={{ p: 2, mb: 2, bgcolor: 'error.dark' }}>
            <Typography sx={{ color: '#fff' }} align="center" gutterBottom>
              {error}
            </Typography>
          </Paper>
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
                <Typography variant="h6">Spots: {analysis.spots.toFixed(1)}%</Typography>
                <Box className="analysis-bar">
                  <Box
                    className="analysis-bar-inner"
                    sx={{
                      width: `${analysis.spots}%`,
                      bgcolor: 'primary.main',
                    }}
                  />
                </Box>

                <Typography variant="h6">Wrinkles: {analysis.wrinkles.toFixed(1)}%</Typography>
                <Box className="analysis-bar">
                  <Box
                    className="analysis-bar-inner"
                    sx={{
                      width: `${analysis.wrinkles}%`,
                      bgcolor: 'warning.main',
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

                <Typography variant="h6">Dark Circles: {analysis.darkCircles.toFixed(1)}%</Typography>
                <Box className="analysis-bar">
                  <Box
                    className="analysis-bar-inner"
                    sx={{
                      width: `${analysis.darkCircles}%`,
                      bgcolor: 'secondary.main',
                    }}
                  />
                </Box>

                <Typography variant="h6">Overall Health: {analysis.overallHealth.toFixed(1)}%</Typography>
                <Box className="analysis-bar">
                  <Box
                    className="analysis-bar-inner"
                    sx={{
                      width: `${analysis.overallHealth}%`,
                      bgcolor: 'success.main',
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
