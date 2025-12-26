FROM denoland/deno:alpine

WORKDIR /app

# Install OS-level dependencies and Python packages for yt-dlp
RUN apk add --no-cache python3 py3-pip ffmpeg && \
    pip install yt-dlp pycryptodomex --break-system-packages

# Copy application code
COPY . .

# Cache Deno dependencies
RUN deno cache server.js

# Create data directories for the application
RUN mkdir -p /app/data/jobs/queued /app/data/jobs/active /app/data/partials /app/downloads

EXPOSE 3001

CMD ["deno", "run", "--allow-all", "server.js"]
