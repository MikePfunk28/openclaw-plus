#!/usr/bin/env node

import { createHash } from 'crypto';
import { UserManager } from '../server/lib/user-manager.mjs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dataDir = join(__dirname, '..', 'data');

// Test password hashing
function testPasswordHash() {
  const password = 'admin123';
  const expectedHash = '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9';

  const hash = createHash('sha256').update(password).digest('hex');

  console.log('\n🔐 Testing password hash:');
  console.log(`  Password: ${password}`);
  console.log(`  Expected: ${expectedHash}`);
  console.log(`  Computed: ${hash}`);
  console.log(`  Match: ${hash === expectedHash ? '✅ YES' : '❌ NO'}`);

  return hash === expectedHash;
}

// Test UserManager authentication
async function testUserManagerAuth() {
  console.log('\n👤 Testing UserManager authentication:');

  const userManager = new UserManager(dataDir);
  await userManager.initialize();

  console.log(`  Users loaded: ${userManager.users.size}`);
  console.log(`  User emails: ${[...userManager.users.keys()].join(', ')}`);

  // Check if admin user exists
  const adminUser = userManager.users.get('admin@localhost');
  if (adminUser) {
    console.log(`  Admin user found: ✅`);
    console.log(`    Email: ${adminUser.email}`);
    console.log(`    Role: ${adminUser.role}`);
    console.log(`    Password hash: ${adminUser.passwordHash}`);
  } else {
    console.log(`  Admin user found: ❌`);
    return false;
  }

  // Test authentication
  console.log('\n  Testing authenticate method:');
  const result = await userManager.authenticate('admin@localhost', 'admin123');

  console.log(`  Success: ${result.success}`);
  if (!result.success) {
    console.log(`  Error: ${result.error}`);
  }
  if (result.user) {
    console.log(`  User: ${result.user.email}`);
    console.log(`  Token: ${result.token ? result.token.substring(0, 20) + '...' : 'none'}`);
  }

  return result.success;
}

// Run tests
async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  Auth Debug Test');
  console.log('═══════════════════════════════════════');

  const hashOk = testPasswordHash();
  const authOk = await testUserManagerAuth();

  console.log('\n═══════════════════════════════════════');
  console.log('  Results:');
  console.log('═══════════════════════════════════════');
  console.log(`  Password hash: ${hashOk ? '✅' : '❌'}`);
  console.log(`  Auth method:   ${authOk ? '✅' : '❌'}`);
  console.log('═══════════════════════════════════════\n');

  process.exit(hashOk && authOk ? 0 : 1);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
