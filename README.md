# BeautyCam - AI-Powered Beauty Camera App

A full-stack application that provides AI-powered beauty camera features using face-api.js and TensorFlow.js.

## Project Structure

- `/client` - React frontend application
- `/server` - Node.js backend server

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- Git

## Setup Instructions

### Backend Setup

1. Navigate to the server directory:
   ```bash
   cd server
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file in the server directory with the following variables:
   ```
   PORT=5000
   ```

4. Start the server:
   ```bash
   npm start
   ```

### Frontend Setup

1. Navigate to the client directory:
   ```bash
   cd client
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm start
   ```

## Deployment

### GitHub Setup

1. Initialize git repository (if not already done):
   ```bash
   git init
   ```

2. Add all files:
   ```bash
   git add .
   ```

3. Commit changes:
   ```bash
   git commit -m "Initial commit"
   ```

4. Create a new repository on GitHub and follow the instructions to push your code.

### Render Deployment

1. Create a new Web Service on Render
2. Connect your GitHub repository
3. Configure the following settings:
   - Build Command: `cd client && npm install && npm run build`
   - Start Command: `cd server && npm install && npm start`
   - Environment Variables:
     - Add any necessary environment variables from your `.env` file

## Technologies Used

- Frontend:
  - React
  - face-api.js
  - TensorFlow.js
  - Material-UI

- Backend:
  - Node.js
  - Express

## License

MIT 