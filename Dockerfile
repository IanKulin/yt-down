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

# Install OS-level dependencies and Python packages for yt-dlp
RUN apk add --no-cache python3 py3-pip ffmpeg && \
    pip install yt-dlp pycryptodomex --break-system-packages

# Copy application code
COPY . .

# Copy only production node_modules from the dependencies stage
COPY --from=dependencies /app/node_modules ./node_modules

# Create data directories for the application
RUN mkdir -p /app/data/jobs/queued /app/data/jobs/active /app/data/partials /app/downloads

EXPOSE 3001

ENV NODE_ENV=production

CMD ["node", "server.js"]