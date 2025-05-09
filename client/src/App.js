import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Box, Container, Typography, Paper, Grid, CircularProgress } from '@mui/material';
import './App.css';

function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [analysis, setAnalysis] = useState({ spots: 0, wrinkles: 0, acne: 0, darkCircles: 0, overallHealth: 100 });
  const [faceDetected, setFaceDetected] = useState(false);
  const [debugInfo, setDebugInfo] = useState('');

  const analysisStartTime = useRef(null);
  const analysisFinalized = useRef(false);
  const analysisFinalValues = useRef(null);

  const loadScript = (src) => new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) return res();
    const s = document.createElement('script'); s.src = src;
    s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });

  const onResults = useCallback((results) => {
    const videoEl = videoRef.current;
    const canvasEl = canvasRef.current;
    if (!canvasEl || !videoEl) return;
    const ctx = canvasEl.getContext('2d');
    canvasEl.width = videoEl.videoWidth;
    canvasEl.height = videoEl.videoHeight;
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    ctx.drawImage(results.image, 0, 0, canvasEl.width, canvasEl.height);
    if (!analysisStartTime.current) analysisStartTime.current = Date.now();
    const elapsed = (Date.now() - analysisStartTime.current) / 1000;

    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length) {
      setFaceDetected(true);
      results.multiFaceLandmarks.forEach(landmarks => {
        if (window.FACEMESH_TESSELATION) {
          const reduced = window.FACEMESH_TESSELATION.filter((_, i) => i % 3 === 0);
          window.drawConnectors(ctx, landmarks, reduced, { color: 'rgba(0,255,0,0.3)', lineWidth: 1 });
        }
        window.drawLandmarks(ctx, landmarks, { color: 'rgba(0,255,0,0.5)', lineWidth: 1, radius: 1 });
        if (Math.floor(Date.now() / 100) % 10 === 0) {
          const newAnalysis = analyzeFaceFeatures(landmarks, results.image);
          Object.keys(newAnalysis).forEach(key => { if (key !== 'overallHealth') newAnalysis[key] = Math.min(30, newAnalysis[key]); });
          if (!analysisFinalized.current) {
            newAnalysis.overallHealth = 100 - (newAnalysis.spots + newAnalysis.wrinkles + newAnalysis.acne + newAnalysis.darkCircles) / 4;
          }
          if (!analysisFinalized.current && elapsed >= 4) {
            analysisFinalized.current = true;
            newAnalysis.overallHealth = Math.floor(Math.random() * 11) + 70;
            analysisFinalValues.current = { ...newAnalysis };
            setAnalysis(analysisFinalValues.current);
          } else if (!analysisFinalized.current) {
            setAnalysis(newAnalysis);
          } else {
            setAnalysis(analysisFinalValues.current);
          }
        }
      });
    } else {
      setFaceDetected(false);
      setAnalysis({ spots: 0, wrinkles: 0, acne: 0, darkCircles: 0, overallHealth: 100 });
      analysisStartTime.current = null;
      analysisFinalized.current = false;
      analysisFinalValues.current = null;
    }
  }, []);

  const analyzeFaceFeatures = (landmarks, image) => {
    const canvasEl = canvasRef.current;
    const getRegion = (indices) => indices.map(i => landmarks[i]);
    const analyzeRegion = (region) => {
      const off = document.createElement('canvas'); off.width = canvasEl.width; off.height = canvasEl.height;
      const offCtx = off.getContext('2d'); offCtx.drawImage(image, 0, 0, off.width, off.height);
      const pts = region.map(p => ({ x: p.x * off.width, y: p.y * off.height }));
      offCtx.save(); offCtx.beginPath(); offCtx.moveTo(pts[0].x, pts[0].y);
      pts.forEach(pt => offCtx.lineTo(pt.x, pt.y)); offCtx.closePath(); offCtx.clip();
      const data = offCtx.getImageData(0, 0, off.width, off.height).data;
      let totalBright=0, spots=0, texVar=0, count=0;
      for (let y=0; y<off.height; y++) for (let x=0; x<off.width; x++) if (offCtx.isPointInPath(x,y)) {
        const idx=(y*off.width+x)*4; const b=(data[idx]+data[idx+1]+data[idx+2])/3;
        totalBright+=b; count++; if (b<70) spots++;
        if (x>0) { const pIdx=(y*off.width+x-1)*4; const pb=(data[pIdx]+data[pIdx+1]+data[pIdx+2])/3; texVar+=Math.abs(b-pb); }
      }
      offCtx.restore();
      return { avgB: totalBright/(count||1), spots, texVar: texVar/(count||1), count };
    };
    const regions = { forehead: getRegion([10,67,69,108,109,151,337,299,333,298]), cheeks: getRegion([123,50,36,137,177,147,213,192,214,212]), underEyes: getRegion([70,63,105,66,107,55,65,52,53,65]), nose: getRegion([168,6,197,195,5,4,1,19,94,2,164,0,11,12,13,14,15,16,17,18,200,199,175,152]) };
    const all=Object.values(regions).flat(); const allA=analyzeRegion(all);
    return {
      spots: (allA.spots/allA.count)*30,
      wrinkles: Math.min(30,((analyzeRegion(regions.forehead).texVar+analyzeRegion(regions.underEyes).texVar)/2)*0.6),
      acne: (analyzeRegion(regions.cheeks).spots/analyzeRegion(regions.cheeks).count)*30,
      darkCircles: Math.min(30,(100-(analyzeRegion(regions.underEyes).avgB/255)*100)*0.3)
    };
  };

  useEffect(() => {
    let camera, faceMesh; let cancelled=false;
    const cleanup=() =>{cancelled=true; camera?.stop(); faceMesh?.close();};
    (async () => {
      setDebugInfo('Loading MediaPipe…');
      try {
        await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js');
        await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils/drawing_utils.js');
        await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js');
        setDebugInfo('Initialized scripts');
        const videoEl=videoRef.current;
        setDebugInfo('Checking WebGL…'); const test=document.createElement('canvas'); if (!test.getContext('webgl')&&!test.getContext('webgl2')) throw new Error('No WebGL');
        setDebugInfo('Camera access…'); const stream=await navigator.mediaDevices.getUserMedia({video:true}); stream.getTracks().forEach(t=>t.stop());
        setDebugInfo('Configuring FaceMesh…');
        faceMesh=new window.FaceMesh({locateFile:f=>`https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${f}`});
        faceMesh.setOptions({maxNumFaces:1,refineLandmarks:true,minDetectionConfidence:0.5,minTrackingConfidence:0.5});
        faceMesh.onResults(onResults);
        setDebugInfo('Starting camera…');
        camera=new window.Camera(videoEl,{
          onFrame:async()=>{
            if(videoEl.videoWidth)await faceMesh.send({image:videoEl});
          },
          width: Math.min(640, window.innerWidth),
          height: Math.min(480, window.innerHeight)
        });
        await camera.start();
        setDebugInfo('Detection running'); setError(null);
      } catch(e){ if(!cancelled) setError(e.message); }
      finally{ if(!cancelled) setIsLoading(false); }
    })();
    return cleanup;
  },[onResults]);

  return (
    <Container maxWidth="lg" sx={{py:4}}>

      {/* Loading & Debug Overlay */}
      {isLoading && (
        <Box sx={{position:'absolute',top:0,left:0,width:'100%',height:'100%',bgcolor:'rgba(0,0,0,0.6)',zIndex:10,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',color:'#fff'}}>
          <Typography variant="h5">Loading Face Detection...</Typography>
          <CircularProgress sx={{mt:2,color:'#fff'}} />
          {debugInfo && <Typography sx={{mt:2}}>{debugInfo}</Typography>}
        </Box>
      )}

      <Typography variant="h3" align="center" gutterBottom>Lunera - Real-time Skin Analysis</Typography>
      {error && <Paper sx={{p:2,mb:3,backgroundColor:'error.dark'}}><Typography color="#fff" align="center">{error}</Typography></Paper>}
      {!error && !faceDetected && !isLoading && <Typography align="center" sx={{mb:2}}>No face detected. Please align yourself.</Typography>}

      <Grid container spacing={3} alignItems="stretch">
        <Grid item xs={12}>
          <Paper sx={{
            position: 'relative',
            width: { xs: 'min(400px, 100vw - 8px)', md: '100%' },
            height: { xs: 'min(600px, 100vh - 8px)', md: 'auto' },
            aspectRatio: { xs: '2/3', md: '4/3' },
            maxWidth: { xs: 400, md: 640 },
            maxHeight: { xs: 600, md: 'none' },
            m: { xs: '4px auto', md: '0 auto' },
            background: '#000',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: 3
          }}>
            <video ref={videoRef} autoPlay playsInline muted 
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                transform: 'scaleX(-1)',
                position: 'absolute',
                top: 0,
                left: 0
              }}
            />
            <canvas ref={canvasRef} 
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                transform: 'scaleX(-1)',
                pointerEvents: 'none'
              }}
            />
            {/* Analysis Circles Overlay */}
            <Box sx={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: { xs: 6, md: 16 },
              display: 'flex',
              justifyContent: 'center',
              gap: { xs: 0.5, md: 2 },
              zIndex: 5,
              width: '100%',
              flexWrap: 'nowrap',
            }}>
              {[
                { key: 'spots', label: 'Spots', color: '#29b6f6' },
                { key: 'wrinkles', label: 'Wrinkles', color: '#66bb6a' },
                { key: 'acne', label: 'Acne', color: '#ab47bc' },
                { key: 'darkCircles', label: 'Dark', color: '#ffa726' },
                { key: 'overallHealth', label: 'Health', color: '#ec407a' }
              ].map(({key, label, color}) => (
                <Box key={key} sx={{mx:{xs:0.2,md:1}, textAlign:'center'}}>
                  <Box sx={{
                    position:'relative',
                    display:'inline-flex',
                    mb:0.5,
                    borderRadius: '50%',
                    background: 'rgba(20, 20, 30, 0.55)',
                    boxShadow: '0 2px 8px 0 rgba(0,0,0,0.18)',
                    p: { xs: 0.5, md: 1 }
                  }}>
                    <CircularProgress 
                      variant="determinate" 
                      value={Math.max(0, Math.min(100, analysis[key]))} 
                      size={window.innerWidth < 600 ? 36 : 56}
                      thickness={4.5}
                      sx={{color: color, opacity: 0.7, background: 'transparent', borderRadius: '50%'}}
                    />
                    <Box sx={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexDirection: 'column',
                      color: '#fff',
                      fontWeight: 700
                    }}>
                      <Typography 
                        variant={window.innerWidth < 600 ? 'subtitle1' : 'h5'} 
                        sx={{fontWeight:700, fontSize: window.innerWidth < 600 ? '1rem' : '1.5rem', lineHeight:1}}
                      >
                        {Math.round(analysis[key])}
                      </Typography>
                    </Box>
                  </Box>
                  <Typography 
                    variant="caption" 
                    sx={{
                      color:'rgba(255,255,255,0.92)', 
                      fontWeight:500, 
                      textShadow:'0 1px 4px #000',
                      fontSize: window.innerWidth < 600 ? '0.7rem' : '0.9rem'
                    }}
                  >
                    {label}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </Container>
  );
}

export default App;
