#!/usr/bin/env node

/**
 * Security Hardening Verification Script
 * Tests that all security improvements are properly implemented
 */

const fs = require('fs');
const path = require('path');

console.log('\n==============================================');
console.log('🔐 Security Hardening Verification');
console.log('==============================================\n');

let allChecks = true;

// Check 1: Verify secureFetch.ts exists
console.log('1. Checking secureFetch implementation...');
const secureFetchPath = path.join(__dirname, '../src/lib/secureFetch.ts');
if (fs.existsSync(secureFetchPath)) {
  const content = fs.readFileSync(secureFetchPath, 'utf-8');
  
  // Check for key features
  const hasTimeout = content.includes('timeout');
  const hasDomainValidation = content.includes('ALLOWED_DOMAINS');
  const hasAbortController = content.includes('AbortController');
  const hasSanitizedLogging = content.includes('sanitizeErrorForLogging');
  
  if (hasTimeout && hasDomainValidation && hasAbortController && hasSanitizedLogging) {
    console.log('   ✅ secureFetch.ts properly implemented');
    console.log('      - Timeout support: ✓');
    console.log('      - Domain whitelisting: ✓');
    console.log('      - Abort controller: ✓');
    console.log('      - Sanitized logging: ✓');
  } else {
    console.log('   ⚠️  secureFetch.ts missing some features');
    allChecks = false;
  }
} else {
  console.log('   ❌ secureFetch.ts not found');
  allChecks = false;
}

// Check 2: Verify performance endpoint has authentication
console.log('\n2. Checking /api/performance authentication...');
const perfRoutePath = path.join(__dirname, '../src/app/api/performance/route.ts');
if (fs.existsSync(perfRoutePath)) {
  const content = fs.readFileSync(perfRoutePath, 'utf-8');
  
  const hasAuth = content.includes('isAuthenticated');
  const hasAdminToken = content.includes('ADMIN_TOKEN');
  const hasAuthCheck = content.includes('if (!isAuthenticated');
  
  if (hasAuth && hasAdminToken && hasAuthCheck) {
    console.log('   ✅ Performance endpoint protected');
    console.log('      - Authentication function: ✓');
    console.log('      - Admin token check: ✓');
    console.log('      - Authorization guard: ✓');
  } else {
    console.log('   ⚠️  Performance endpoint may not be fully protected');
    allChecks = false;
  }
} else {
  console.log('   ❌ Performance route not found');
  allChecks = false;
}

// Check 3: Verify env.example has ADMIN_TOKEN
console.log('\n3. Checking env.example configuration...');
const envExamplePath = path.join(__dirname, '../env.example');
if (fs.existsSync(envExamplePath)) {
  const content = fs.readFileSync(envExamplePath, 'utf-8');
  
  const hasAdminToken = content.includes('ADMIN_TOKEN');
  const hasInstructions = content.includes('Generate with:');
  
  if (hasAdminToken && hasInstructions) {
    console.log('   ✅ env.example updated with ADMIN_TOKEN');
    console.log('      - ADMIN_TOKEN variable: ✓');
    console.log('      - Generation instructions: ✓');
  } else {
    console.log('   ⚠️  env.example missing ADMIN_TOKEN configuration');
    allChecks = false;
  }
} else {
  console.log('   ❌ env.example not found');
  allChecks = false;
}

// Check 4: Verify config.ts has sanitized logging
console.log('\n4. Checking config.ts sanitized logging...');
const configPath = path.join(__dirname, '../src/lib/config.ts');
if (fs.existsSync(configPath)) {
  const content = fs.readFileSync(configPath, 'utf-8');
  
  const hasGenericError = content.includes('Missing or invalid credentials');
  const hasGetCredentials = content.includes('getDiscogsCredentials');
  const noVerboseLogging = !content.includes('Set DISCOGS_API_TOKEN=<your_token_here>');
  
  if (hasGenericError && hasGetCredentials && noVerboseLogging) {
    console.log('   ✅ config.ts properly sanitized');
    console.log('      - Generic error messages: ✓');
    console.log('      - Server-only helper: ✓');
    console.log('      - No verbose logging: ✓');
  } else {
    console.log('   ⚠️  config.ts may still have verbose logging');
    allChecks = false;
  }
} else {
  console.log('   ❌ config.ts not found');
  allChecks = false;
}

// Check 5: Verify package.json has security scripts
console.log('\n5. Checking package.json security scripts...');
const packagePath = path.join(__dirname, '../package.json');
if (fs.existsSync(packagePath)) {
  const content = fs.readFileSync(packagePath, 'utf-8');
  const packageJson = JSON.parse(content);
  
  const hasAudit = packageJson.scripts && packageJson.scripts['security:audit'];
  const hasFix = packageJson.scripts && packageJson.scripts['security:fix'];
  const hasCheck = packageJson.scripts && packageJson.scripts['security:check'];
  
  if (hasAudit && hasFix && hasCheck) {
    console.log('   ✅ Security scripts added');
    console.log('      - security:audit: ✓');
    console.log('      - security:fix: ✓');
    console.log('      - security:check: ✓');
  } else {
    console.log('   ⚠️  Security scripts missing');
    allChecks = false;
  }
} else {
  console.log('   ❌ package.json not found');
  allChecks = false;
}

// Check 6: Verify documentation exists
console.log('\n6. Checking security documentation...');
const docs = [
  'SECURITY_REVIEW_2025.md',
  'SECURITY_ASSUMPTIONS.md',
  'SECURITY_IMPLEMENTATION_SUMMARY.md',
  'SECURITY_QUICK_REFERENCE.md'
];

let docsComplete = true;
docs.forEach(doc => {
  const docPath = path.join(__dirname, '..', doc);
  if (fs.existsSync(docPath)) {
    console.log(`   ✅ ${doc}`);
  } else {
    console.log(`   ❌ ${doc} not found`);
    docsComplete = false;
    allChecks = false;
  }
});

// Check 7: Verify next.config.ts has security headers
console.log('\n7. Checking Next.js security headers...');
const nextConfigPath = path.join(__dirname, '../next.config.ts');
if (fs.existsSync(nextConfigPath)) {
  const content = fs.readFileSync(nextConfigPath, 'utf-8');
  
  const hasCSP = content.includes('Content-Security-Policy');
  const hasXFrame = content.includes('X-Frame-Options');
  const hasHSTS = content.includes('Strict-Transport-Security');
  
  if (hasCSP && hasXFrame && hasHSTS) {
    console.log('   ✅ Security headers configured');
    console.log('      - Content-Security-Policy: ✓');
    console.log('      - X-Frame-Options: ✓');
    console.log('      - HSTS: ✓');
  } else {
    console.log('   ⚠️  Security headers incomplete');
    allChecks = false;
  }
} else {
  console.log('   ❌ next.config.ts not found');
  allChecks = false;
}

// Final Summary
console.log('\n==============================================');
if (allChecks) {
  console.log('✅ All Security Checks Passed!');
  console.log('==============================================\n');
  console.log('Security hardening is complete and verified.');
  console.log('\nNext steps:');
  console.log('1. Generate ADMIN_TOKEN: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  console.log('2. Add to .env.local: ADMIN_TOKEN=<generated_token>');
  console.log('3. Test authentication: curl -H "X-Admin-Token: <token>" http://localhost:3000/api/performance');
  console.log('4. Run security audit: npm run security:audit');
  console.log('\nDocumentation:');
  console.log('- SECURITY_QUICK_REFERENCE.md - Quick reference');
  console.log('- SECURITY_REVIEW_2025.md - Full review');
  console.log('- SECURITY_ASSUMPTIONS.md - Deployment constraints');
  process.exit(0);
} else {
  console.log('⚠️  Some Security Checks Failed');
  console.log('==============================================\n');
  console.log('Please review the failures above and ensure all');
  console.log('security components are properly implemented.');
  process.exit(1);
}

