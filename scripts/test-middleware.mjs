#!/usr/bin/env node

import { UserManager } from '../server/lib/user-manager.mjs';
import { buildUnifiedAuth } from '../server/lib/unified-auth.mjs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dataDir = join(__dirname, '..', 'data');

async function testMiddleware() {
  console.log('═══════════════════════════════════════');
  console.log('  Middleware Debug Test');
  console.log('═══════════════════════════════════════\n');

  // Initialize UserManager
  const userManager = new UserManager(dataDir);
  await userManager.initialize();

  console.log(`Users loaded: ${userManager.users.size}`);
  console.log(`User emails: ${[...userManager.users.keys()].join(', ')}\n`);

  // Create a test token by logging in
  const loginResult = await userManager.authenticate('admin@localhost', 'admin123');
  if (!loginResult.success) {
    console.error('❌ Login failed:', loginResult.error);
    process.exit(1);
  }

  console.log(`✅ Login successful`);
  console.log(`   Token: ${loginResult.token.substring(0, 20)}...\n`);

  // Build auth with empty config and userManager
  const config = {};
  const auth = buildUnifiedAuth(config, userManager);

  console.log(`Auth enabled: ${auth.authEnabled}\n`);

  // Test the middleware directly
  console.log('Testing middleware with session token...\n');

  const mockReq = {
    headers: {
      authorization: `Bearer ${loginResult.token}`
    }
  };

  const mockRes = {
    status: (code) => {
      console.log(`  Response status: ${code}`);
      return mockRes;
    },
    json: (data) => {
      console.log(`  Response JSON: ${JSON.stringify(data)}`);
      return mockRes;
    }
  };

  let nextCalled = false;
  const mockNext = () => {
    nextCalled = true;
    console.log('  ✅ next() was called');
  };

  try {
    // Call the middleware
    await auth.middleware(mockReq, mockRes, mockNext);

    console.log(`\n  next() called: ${nextCalled}`);
    console.log(`  req.auth set: ${mockReq.auth ? 'YES' : 'NO'}`);

    if (mockReq.auth) {
      console.log(`  req.auth.userId: ${mockReq.auth.userId}`);
      console.log(`  req.auth.name: ${mockReq.auth.name}`);
      console.log(`  req.auth.role: ${mockReq.auth.role}`);
      console.log('\n✅ Middleware works correctly!');
    } else {
      console.log('\n❌ Middleware did NOT set req.auth!');
    }

  } catch (error) {
    console.error('\n❌ Middleware error:', error);
    console.error(error.stack);
  }

  console.log('\n═══════════════════════════════════════\n');
}

testMiddleware().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
