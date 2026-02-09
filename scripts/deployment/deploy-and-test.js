/**
 * Deploy and Test Script for Android Device
 *
 * This script deploys the built code to Android device via ACS MCP
 * and runs basic tests to verify functionality
 */

import { readdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';

// MCP Configuration
const ANODE_HOST = process.env.ANODE_HOST || '192.168.31.102';
const ANODE_PORT = process.env.ANODE_PORT || '8765';
const TARGET_DIR = '/sdcard/ACS/.anode-clawdbot';

console.log('=== Anode ClawdBot Deployment Script ===');
console.log(`Target: ${ANODE_HOST}:${ANODE_PORT}`);
console.log(`Deploy to: ${TARGET_DIR}`);
console.log('');

/**
 * Deploy files to Android device
 *
 * Note: This is a template. Actual deployment requires MCP tools
 * which should be available through claude.ai/code when MCP server is running
 */
async function deploy() {
  console.log('📦 Starting deployment...');

  // List of files to deploy
  const filesToDeploy = [
    'dist/**/*.js',
    'dist/**/*.js.map',
    'package.json',
    'assets/**/*',
  ];

  console.log('Files to deploy:', filesToDeploy);
  console.log('');
  console.log('⚠️  To deploy, use Claude Code with MCP server configured:');
  console.log('   1. Ensure @anode177/mcp-client is installed');
  console.log('   2. Configure MCP server in Claude settings');
  console.log('   3. Use MCP tools to write files to device');
  console.log('');

  return true;
}

/**
 * Run tests on device
 */
async function runTests() {
  console.log('🧪 Running tests...');
  console.log('');

  const tests = [
    {
      name: 'Phase 1: Core Architecture',
      file: 'dist/tests/phase1-e2e.js',
      description: 'Test config, session, model API, agent manager',
    },
    {
      name: 'Phase 2: Tool System',
      file: 'dist/tests/phase2-tools.js',
      description: 'Test 17 built-in tools',
    },
    {
      name: 'Phase 3: UI Components',
      file: 'dist/tests/phase3-ui.js',
      description: 'Test UI components (mock)',
    },
    {
      name: 'Phase 4: Plugin System',
      file: 'dist/tests/phase4-plugins.js',
      description: 'Test plugin system with 3 example plugins',
    },
  ];

  console.log('Test files to run:');
  tests.forEach((test, i) => {
    console.log(`  ${i + 1}. ${test.name}`);
    console.log(`     File: ${test.file}`);
    console.log(`     ${test.description}`);
    console.log('');
  });

  console.log('⚠️  To run tests on device:');
  console.log('   node <test-file> (on Android device via ACS terminal)');
  console.log('');

  return true;
}

/**
 * Verify deployment
 */
async function verify() {
  console.log('✅ Verifying deployment...');
  console.log('');

  const checksToPerform = [
    'Check if all .js files are present',
    'Check if package.json exists',
    'Check if node_modules are available',
    'Run a simple require() test',
    'Check if Anode APIs are accessible',
  ];

  console.log('Verification steps:');
  checksToPerform.forEach((check, i) => {
    console.log(`  ${i + 1}. ${check}`);
  });
  console.log('');

  console.log('⚠️  Verification requires MCP tools to read files from device');
  console.log('');

  return true;
}

/**
 * Main deployment workflow
 */
async function main() {
  try {
    console.log('Step 1: Deploy files');
    console.log('─────────────────────');
    await deploy();

    console.log('Step 2: Run tests');
    console.log('─────────────────────');
    await runTests();

    console.log('Step 3: Verify');
    console.log('─────────────────────');
    await verify();

    console.log('');
    console.log('✅ Deployment workflow completed!');
    console.log('');
    console.log('Next steps:');
    console.log('  1. Use Claude Code MCP tools to deploy files');
    console.log('  2. Connect to device via ACS terminal');
    console.log('  3. Run: cd /sdcard/ACS/.anode-clawdbot');
    console.log('  4. Run: node dist/index.js');
    console.log('');

  } catch (error) {
    console.error('❌ Deployment failed:', error);
    process.exit(1);
  }
}

// Run if this is the main module
if (import.meta.url === `file://${process.argv[1]}`.replace(/\\/g, '/')) {
  main();
}

export { deploy, runTests, verify };
