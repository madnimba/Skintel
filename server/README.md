# BeautyCam - Real-time Face Analysis

A web application that provides real-time face analysis using your device's camera. The application simulates face analysis metrics such as dullness, acne, and dryness.

## Features

- Real-time camera feed
- Live face analysis simulation
- Beautiful Material-UI interface
- Real-time updates using WebSocket

## Prerequisites

- Node.js (v14 or higher)
- npm (v6 or higher)
- Modern web browser with camera access

## Installation

1. Clone the repository
2. Install backend dependencies:
```bash
npm install
```

3. Install frontend dependencies:
```bash
cd client
npm install
```

## Running the Application

1. Start the backend server:
```bash
npm run dev
```

2. In a new terminal, start the frontend:
```bash
npm run client
```

The application will be available at:
- Frontend: http://localhost:3000
- Backend: http://localhost:5000

## Usage

1. Open your browser and navigate to http://localhost:3000
2. Allow camera access when prompted
3. View the real-time analysis results on the right side of the screen

## Note

This is a simulation application and does not use actual AI models for face analysis. The metrics shown are randomly generated for demonstration purposes. 