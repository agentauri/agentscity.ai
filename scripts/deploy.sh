#!/bin/bash
# AgentsCity Deployment Script
# Usage: ./scripts/deploy.sh [environment]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
SERVER_DIR="${ROOT_DIR}/apps/server"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Environment (default: production)
ENVIRONMENT="${1:-production}"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  AgentsCity Deployment${NC}"
echo -e "${GREEN}  Environment: ${ENVIRONMENT}${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Check if fly CLI is installed
if ! command -v fly &> /dev/null; then
    echo -e "${RED}Error: Fly CLI is not installed${NC}"
    echo "Install it with: curl -L https://fly.io/install.sh | sh"
    exit 1
fi

# Check if logged in
if ! fly auth whoami &> /dev/null; then
    echo -e "${YELLOW}Not logged in to Fly.io. Running fly auth login...${NC}"
    fly auth login
fi

# Navigate to repository root (where fly.toml is)
cd "${ROOT_DIR}"

echo -e "${YELLOW}Step 1: Checking Fly.io app status...${NC}"
if ! fly status --app agentscity-server &> /dev/null; then
    echo -e "${YELLOW}App not found. Creating agentscity-server...${NC}"
    fly apps create agentscity-server --org personal
fi

echo -e "${YELLOW}Step 2: Checking secrets...${NC}"
SECRETS=$(fly secrets list --app agentscity-server 2>/dev/null || echo "")

check_secret() {
    if echo "$SECRETS" | grep -q "$1"; then
        echo -e "  ${GREEN}[OK]${NC} $1 is set"
    else
        echo -e "  ${RED}[MISSING]${NC} $1 is not set"
        return 1
    fi
}

MISSING_SECRETS=0
check_secret "DATABASE_URL" || MISSING_SECRETS=1
check_secret "REDIS_URL" || MISSING_SECRETS=1

# LLM keys are optional, just warn
echo "$SECRETS" | grep -q "ANTHROPIC_API_KEY" || echo -e "  ${YELLOW}[WARN]${NC} ANTHROPIC_API_KEY not set (Claude will be unavailable)"
echo "$SECRETS" | grep -q "GOOGLE_API_KEY" || echo -e "  ${YELLOW}[WARN]${NC} GOOGLE_API_KEY not set (Gemini will be unavailable)"

if [ $MISSING_SECRETS -eq 1 ]; then
    echo ""
    echo -e "${RED}Error: Required secrets are missing${NC}"
    echo "Set them with:"
    echo "  fly secrets set DATABASE_URL=\"postgres://...\" --app agentscity-server"
    echo "  fly secrets set REDIS_URL=\"redis://...\" --app agentscity-server"
    exit 1
fi

echo ""
echo -e "${YELLOW}Step 3: Building and deploying...${NC}"

# Deploy
fly deploy --config fly.toml --remote-only

echo ""
echo -e "${YELLOW}Step 4: Verifying deployment...${NC}"

# Wait for deployment to stabilize
sleep 5

# Health check
HEALTH_URL="https://agentscity-server.fly.dev/health"
echo "Checking health endpoint: ${HEALTH_URL}"

if curl -sf "${HEALTH_URL}" > /dev/null; then
    echo -e "${GREEN}Health check passed!${NC}"
else
    echo -e "${RED}Health check failed. Checking logs...${NC}"
    fly logs --app agentscity-server -n 50
    exit 1
fi

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Deployment Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Application URL: https://agentscity-server.fly.dev"
echo "Health Check:    https://agentscity-server.fly.dev/health"
echo "API Status:      https://agentscity-server.fly.dev/api/status"
echo "API Docs:        https://agentscity-server.fly.dev/api/docs"
echo ""
echo "Useful commands:"
echo "  fly logs --app agentscity-server        # View logs"
echo "  fly status --app agentscity-server      # Check status"
echo "  fly ssh console --app agentscity-server # SSH access"
