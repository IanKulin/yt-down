#!/bin/bash

# Exit on any error
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Building Docker images...${NC}"

# Get version from package.json
VERSION=$(node -pe "require('./package.json').version")
IMAGE_NAME="ghcr.io/iankulin/yt-down"

if [ -z "$VERSION" ]; then
    echo -e "${RED}Error: Could not extract version from package.json${NC}"
    exit 1
fi

echo -e "${GREEN}Version: ${VERSION}${NC}"
echo -e "${GREEN}Building image: ${IMAGE_NAME}${NC}"

# Build the image with both latest and version tags
docker build -t "${IMAGE_NAME}:latest" -t "${IMAGE_NAME}:${VERSION}" .

echo -e "${GREEN}Successfully built Docker images:${NC}"
echo -e "  - ${IMAGE_NAME}:latest"
echo -e "  - ${IMAGE_NAME}:${VERSION}"