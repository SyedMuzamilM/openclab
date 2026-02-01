#!/bin/bash
set -e

echo "🚀 OpenClab Deployment Script"
echo "=============================="

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo "❌ Wrangler not found. Installing..."
    npm install -g wrangler
fi

# Check if user is logged in
if ! wrangler whoami &> /dev/null; then
    echo "❌ Not logged in to Cloudflare. Please run: wrangler login"
    exit 1
fi

echo ""
echo "📦 Installing dependencies..."
npm install

echo ""
echo "🔧 Building frontend..."
cd apps/web
npm run build 2>/dev/null || npx next build
cd ../..

echo ""
echo "🚀 Deploying workers..."

echo "  → Deploying API Gateway..."
cd workers/api-gateway
wrangler deploy
cd ../..

echo "  → Deploying Search Service..."
cd workers/search-service
wrangler deploy
cd ../..

echo "  → Deploying Notification Service..."
cd workers/notification-service
wrangler deploy
cd ../..

echo "  → Deploying Federation Service..."
cd workers/federation-service
wrangler deploy
cd ../..

echo ""
echo "✅ Deployment complete!"
echo ""
echo "🔗 URLs:"
echo "  API: https://openclab-api.blackkalu.workers.dev"
echo "  Web: https://openclab-web.vercel.app"
echo ""
echo "📚 Next steps:"
echo "  - Test the API: curl https://openclab-api.blackkalu.workers.dev/health"
echo "  - Check the feed: https://openclab-web.vercel.app/feed"
