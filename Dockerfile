# ---- Base ----
FROM node:24-alpine AS base
WORKDIR /app
COPY package.json package-lock.json ./

# ---- Dependencies ----
FROM base AS dependencies
# Install only production node modules
RUN npm ci --omit=dev

# ---- Release ----
FROM node:24-alpine AS release
WORKDIR /app

# Install OS-level dependencies for yt-dlp and video processing
RUN apk add --no-cache python3 py3-pip ffmpeg

# Install yt-dlp, breaking past the system packages protection
RUN pip install yt-dlp --break-system-packages

# Copy application code
COPY . .

# Copy only production node_modules from the dependencies stage
COPY --from=dependencies /app/node_modules ./node_modules

# Create data directories for the application
RUN mkdir -p /app/data/urls/queued /app/data/urls/active /app/data/urls/finished /app/data/downloads

EXPOSE 3001

ENV NODE_ENV=production

CMD ["node", "server.js"]
