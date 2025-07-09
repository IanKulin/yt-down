#!/bin/bash

# Exit on any error
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Pushing Docker images...${NC}"

# Get version from package.json
VERSION=$(node -pe "require('./package.json').version")
IMAGE_NAME="ghcr.io/iankulin/yt-down"

if [ -z "$VERSION" ]; then
    echo -e "${RED}Error: Could not extract version from package.json${NC}"
    exit 1
fi

echo -e "${GREEN}Version: ${VERSION}${NC}"
echo -e "${GREEN}Pushing images for: ${IMAGE_NAME}${NC}"

# Extract major and minor versions
MAJOR_VERSION="${VERSION%%.*}"
MINOR_VERSION="${VERSION%.*}"

echo -e "${GREEN}Tags: latest, ${VERSION}, ${MINOR_VERSION}, ${MAJOR_VERSION}${NC}"

# Build and push multi-arch images
echo -e "${YELLOW}Building and pushing multi-arch images...${NC}"
docker buildx build --push --platform linux/amd64,linux/arm64 \
  -t "${IMAGE_NAME}:latest" \
  -t "${IMAGE_NAME}:${VERSION}" \
  -t "${IMAGE_NAME}:${MINOR_VERSION}" \
  -t "${IMAGE_NAME}:${MAJOR_VERSION}" .

echo -e "${GREEN}Successfully pushed Docker images:${NC}"
echo -e "  - ${IMAGE_NAME}:latest"
echo -e "  - ${IMAGE_NAME}:${VERSION}"
echo -e "  - ${IMAGE_NAME}:${MINOR_VERSION}"
echo -e "  - ${IMAGE_NAME}:${MAJOR_VERSION}"