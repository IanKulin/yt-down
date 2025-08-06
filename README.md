# yt-down

A web application for queueing and managing video downloads from various sources with `yt-dlp`. Particularly suitable for self-hosting.

## Features

- **Web Interface**: Manage your download queue, view completed downloads, and adjust settings from a web UI.
- **Queue System**: Add URLs to a queue for background processing. The app prevents duplicate URLs and tracks the state of each download including showing a progress bar.
- **Customisable Settings**: Configure video quality, subtitles, and download speed limits.
- **Automatic Processing**: The application automatically processes the queue in the background, downloading one file at a time.

## Installation

This application is designed to be run with Docker and Docker Compose. It could be cloned and run directly with Node.js (v22+) but because of it's close dependency on particular versions of yt-dlp and ffmpeg, Docker deployment is highly recommended.

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/)

### Running the Application

1.  **Create the docker-compose.yaml file:**

- copy from [github](https://github.com/IanKulin/yt-down/blob/main/docker-compose.yaml) and save it to your working directory
- create the `data` and `downloads` directory
- ` docker compose up`

### Docker Volume Configuration

The default `docker-compose.yaml` file mounts two directories:

- `./data:/app/data` - Application state (jobs, settings, partial downloads)
- `./downloads:/app/downloads` - Finished downloads

This structure allows you to mount the downloads directory to a separate location, such as a different drive or network storage, while keeping the application data local. For example:

```yaml
volumes:
  - ./data:/app/data
  - /mnt/media/downloads:/app/downloads # Custom download location
```

## Developing

See separate [README-ARCHITECTURE.md](https://github.com/IanKulin/yt-down/blob/main/README-ARCHITECTURE.md).

## Legal

### License

This app is licensed under the [MIT License](https://github.com/IanKulin/yt-down/blob/main/LICENSE.md).

### Third-Party Licenses

SVG symbols used in this app are from [Lucide](https://lucide.dev/), licensed under the [ISC License](https://lucide.dev/license).
