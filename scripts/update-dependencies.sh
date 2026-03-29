#!/bin/bash

# Security-focused dependency update script
# Updates packages with security patches

echo "🔐 Updating dependencies for security patches..."

# Update production dependencies
npm update better-sqlite3 dotenv zod next react react-dom

# Update dev dependencies
npm update --save-dev @types/node @types/react typescript tailwindcss @tailwindcss/postcss

echo "✅ Dependencies updated"
echo "🔍 Running security audit..."
npm audit --production

echo "📦 Checking for remaining outdated packages..."
npm outdated

