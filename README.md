# yt-down

A simple, file-based web application for queueing and managing downloads with `yt-dlp`.

## Features

- **Web Interface**: Manage your download queue, view completed downloads, and adjust settings from a web UI.
- **Queue System**: Add URLs to a queue for background processing. The app prevents duplicate URLs and tracks the state of each download (queued, active, finished).
- **File-Based Storage**: The application uses the filesystem to manage the queue and store downloaded files.
- **Customisable Settings**: Configure video quality, subtitles, and download speed limits.
- **Automatic Processing**: The application automatically processes the queue in the background, downloading one file at a time.

## Installation and Usage

This application is designed to be run with Docker and Docker Compose.

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/)
- [Docker Compose](https://docs.docker.com/compose/install/)

### Running the Application

1.  **Create the docker-compose.yaml file:**

- download from [github](https://github.com/IanKulin/yt-down/blob/main/docker-compose.yaml)

3.  **Build and start the container:**

    ```bash
    docker compose up --build
    ```

    This command will build the Docker image and start the application. You can access the web interface at [http://localhost:3001](http://localhost:3001).

## Technical Overview for Developers

This section provides a brief overview of the project's architecture and development patterns for those who wish to contribute or modify the application.

### Core Technologies

- **Backend**: Node.js with Express.js
- **Frontend**: EJS (Embedded JavaScript) templates for server-side rendering
- **Styling**: A single, consolidated CSS file with custom properties for theming (including automatic light/dark mode).
- **Core Dependency**: `yt-dlp` (installed in the Docker image)

### Project Structure

- `server.js`: The main application entry point. Initializes the Express server, middleware, and queue processor.
- `lib/`: Contains the core application logic.
  - `queueProcessor.js`: Manages the background download queue.
  - `settings.js`: Handles loading and saving application settings.
  - `utils.js`: Provides utility functions for file operations, hashing, etc.
- `routes/`: Defines the application's routes.
  - `api.js`: API endpoints for retrieving application state.
  - `downloads.js`: Routes for managing downloaded files.
  - `queue.js`: Routes for the main queue interface.
  - `settings.js`: Routes for the settings page.
- `views/`: EJS templates for the web interface.
- `public/`: Static assets (CSS).
- `data/`: (Git-ignored) Stores the application's data.
  - `urls/`: Contains the queue files (queued, active, finished).
  - `downloads/`: Stores the downloaded video and subtitle files.
  - `settings.json`: Stores user-defined settings.

### Development Commands

- `npm install`: Install dependencies.
- `npm test`: Run the test suite.
- `npm run lint`: Lint the codebase.
- `npm run format`: Format the code with Prettier.
- `npm run docker:build`: Build the Docker image.
- `npm run docker:push`: Push the Docker image to the configured registry.
