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

# Push the images built by docker-build.sh (run `npm run docker:build` first)
if ! docker image inspect "${IMAGE_NAME}:${VERSION}" > /dev/null 2>&1; then
    echo -e "${RED}Error: ${IMAGE_NAME}:${VERSION} not found locally. Run 'npm run docker:build' first.${NC}"
    exit 1
fi

for TAG in latest "${VERSION}" "${MINOR_VERSION}" "${MAJOR_VERSION}"; do
    docker push "${IMAGE_NAME}:${TAG}"
done

echo -e "${GREEN}Successfully pushed Docker images:${NC}"
echo -e "  - ${IMAGE_NAME}:latest"
echo -e "  - ${IMAGE_NAME}:${VERSION}"
echo -e "  - ${IMAGE_NAME}:${MINOR_VERSION}"
echo -e "  - ${IMAGE_NAME}:${MAJOR_VERSION}"
