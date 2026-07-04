#!/usr/bin/env node

/**
 * Setup script for Discogs Collection Manager
 * Helps users configure their environment variables
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

async function setup() {
  console.log('🎵 Discogs Collection Manager Setup');
  console.log('=====================================\n');

  const envLocalPath = path.join(process.cwd(), '.env.local');
  const envExamplePath = path.join(process.cwd(), 'env.example');

  // Check if .env.local already exists
  if (fs.existsSync(envLocalPath)) {
    console.log('⚠️  .env.local already exists!');
    const overwrite = await question('Do you want to overwrite it? (y/N): ');
    if (overwrite.toLowerCase() !== 'y' && overwrite.toLowerCase() !== 'yes') {
      console.log('Setup cancelled.');
      rl.close();
      return;
    }
  }

  console.log('📝 Please provide your Discogs API credentials:');
  console.log('   Get your API token from: https://www.discogs.com/settings/developers\n');

  const apiToken = await question('Discogs API Token: ');
  const username = await question('Discogs Username: ');
  const appUrl = await question('App URL (default: http://localhost:3000): ') || 'http://localhost:3000';

  if (!apiToken || !username) {
    console.log('❌ API Token and Username are required!');
    rl.close();
    return;
  }

  // Create env.local content
  const envContent = `# Discogs API Configuration
DISCOGS_API_TOKEN=${apiToken}
DISCOGS_USERNAME=${username}

# Next.js Configuration
NEXT_PUBLIC_APP_URL=${appUrl}
`;

  try {
    fs.writeFileSync(envLocalPath, envContent);
    console.log('\n✅ Environment configuration saved to .env.local');
    console.log('🔒 This file is automatically ignored by Git for security');
    console.log('\n🚀 You can now run: npm run dev');
  } catch (error) {
    console.error('❌ Error writing .env.local:', error.message);
  }

  rl.close();
}

// Run setup
setup().catch(console.error);
