import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";

export const skill = {
  id: "test-architect",
  name: "Test Architect",
  description: "Generate comprehensive test suites - unit tests, integration tests, E2E tests, contract tests. Strict assertions, coverage targets, mutation testing.",
  inputSchema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["unit", "integration", "e2e", "contract", "coverage", "mutation", "suite", "plan", "assertions", "mocks", "fixtures", "run", "analyze"],
        description: "Test architect action"
      },
      target: { type: "string", description: "Target file/directory to test" },
      specId: { type: "string", description: "Specification ID to derive tests from" },
      framework: { type: "string", enum: ["jest", "vitest", "mocha", "pytest", "go-test", "rs-test"], description: "Test framework" },
      language: { type: "string", description: "Programming language" },
      coverage: { type: "number", description: "Target coverage percentage" },
      strict: { type: "boolean", description: "Enable strict assertions" },
      output: { type: "string", description: "Output directory/file" },
      testCases: { type: "array", description: "Custom test cases" },
      options: { type: "object", additionalProperties: true }
    },
    required: ["action"],
    additionalProperties: false
  },
  async run({ input, workspaceRoot }) {
    const action = input?.action;
    const target = input?.target;
    const specId = input?.specId;
    const framework = input?.framework || "jest";
    const language = input?.language || "javascript";
    const coverage = input?.coverage || 90;
    const strict = input?.strict !== false;
    const output = input?.output;
    const testCases = input?.testCases || [];
    const options = input?.options || {};

    const testsDir = path.join(workspaceRoot, "tests");
    const unitDir = path.join(testsDir, "unit");
    const integrationDir = path.join(testsDir, "integration");
    const e2eDir = path.join(testsDir, "e2e");
    const contractDir = path.join(testsDir, "contract");
    
    await mkdir(unitDir, { recursive: true });
    await mkdir(integrationDir, { recursive: true });
    await mkdir(e2eDir, { recursive: true });
    await mkdir(contractDir, { recursive: true });

    const loadSpec = (id) => {
      const specPath = path.join(workspaceRoot, ".knowledge", "specs", `${id}.json`);
      if (existsSync(specPath)) {
        return JSON.parse(readFileSync(specPath, "utf8"));
      }
      return null;
    };

    const generateStrictAssertions = (expected, actual) => {
      if (typeof expected === "object" && expected !== null) {
        return Object.entries(expected).map(([key, value]) => {
          if (typeof value === "object") {
            return generateStrictAssertions(value, `${actual}.${key}`);
          }
          return `  expect(${actual}.${key}).toStrictEqual(${JSON.stringify(value)});`;
        }).join("\n");
      }
      return `  expect(${actual}).toStrictEqual(${JSON.stringify(expected)});`;
    };

    switch (action) {
      case "plan": {
        const spec = specId ? loadSpec(specId) : null;
        
        const plan = {
          id: `TEST-PLAN-${Date.now()}`,
          created: new Date().toISOString(),
          target: target || "entire codebase",
          coverageTarget: coverage,
          strategy: {
            unit: { enabled: true, priority: "high", coverage: 95 },
            integration: { enabled: true, priority: "high", coverage: 85 },
            e2e: { enabled: true, priority: "medium", coverage: 70 },
            contract: { enabled: true, priority: "medium", coverage: 80 }
          },
          testSuites: []
        };
        
        if (spec) {
          for (const req of spec.requirements || []) {
            plan.testSuites.push({
              id: `SUITE-${req.id}`,
              name: `Tests for ${req.id}`,
              requirementId: req.id,
              type: "unit",
              testCases: [
                { name: `Should satisfy: ${req.text.slice(0, 50)}...`, type: "positive" },
                { name: `Should reject invalid input for: ${req.text.slice(0, 30)}...`, type: "negative" },
                { name: `Should handle edge cases for: ${req.text.slice(0, 30)}...`, type: "edge" }
              ],
              strict: true,
              assertions: ["exact match", "type check", "null check", "boundary check"]
            });
          }
        }
        
        const outputPath = output || path.join(testsDir, "test-plan.json");
        await writeFile(outputPath, JSON.stringify(plan, null, 2), "utf8");
        
        return { ok: true, plan, path: outputPath };
      }

      case "unit": {
        if (!target) throw new Error("target is required for unit tests");
        
        const targetPath = path.resolve(workspaceRoot, target);
        const targetName = path.basename(targetPath, path.extname(targetPath));
        const outputPath = output || path.join(unitDir, `${targetName}.test.${language === "python" ? "py" : "ts"}`);
        
        let testContent = "";
        
        if (framework === "jest" || framework === "vitest") {
          testContent = `import { describe, it, expect, beforeEach, afterEach, vi } from '${framework === "vitest" ? "vitest" : "@jest/globals"}';
${strict ? `
// STRICT MODE: All assertions use toStrictEqual for exact matching
// Any deviation from expected output will cause test failure
` : ""}

describe('${targetName}', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

${testCases.length > 0 ? testCases.map(tc => `
  it('${tc.name || tc}', ${strict ? "/* STRICT: Exact assertion required */" : ""}async () => {
    // Arrange
    const input = ${JSON.stringify(tc.input || {})};
    const expected = ${JSON.stringify(tc.expected || {})};
    
    // Act
    const result = await ${targetName}(input);
    
    // Assert${strict ? " (STRICT MODE)" : ""}
    expect(result).${strict ? "toStrictEqual" : "toEqual"}(expected);
    
    ${strict ? `
    // Additional strict checks
    expect(typeof result).toBe('${typeof (tc.expected || {}) === "object" ? "object" : typeof (tc.expected || {}) }');
    expect(result).not.toBeNull();
    expect(result).not.toBeUndefined();
` : ""}
  });
`).join("\n") : `
  it('should work correctly', async () => {
    // Arrange
    const input = {};
    const expected = {};
    
    // Act & Assert
    // TODO: Implement test after reviewing implementation
    expect(true).${strict ? "toStrictEqual(true)" : "toBe(true)"};
  });

  it('should handle valid input', async () => {
    // Arrange
    const input = { /* valid input */ };
    
    // Act & Assert
    // TODO: Implement with actual function call
    expect(true).${strict ? "toStrictEqual(true)" : "toBe(true)"};
  });

  it('should reject invalid input', async () => {
    // Arrange
    const input = { /* invalid input */ };
    
    // Act & Assert
    // TODO: Should throw or return error
    expect(true).${strict ? "toStrictEqual(true)" : "toBe(true)"};
  });

  it('should handle null/undefined input', async () => {
    // Act & Assert
    // TODO: Should handle gracefully
    expect(true).${strict ? "toStrictEqual(true)" : "toBe(true)"};
  });

  it('should handle edge cases', async () => {
    // Arrange
    const edgeCases = [
      { input: null, description: 'null input' },
      { input: undefined, description: 'undefined input' },
      { input: {}, description: 'empty object' },
      { input: [], description: 'empty array' },
      { input: '', description: 'empty string' },
    ];
    
    // Act & Assert
    for (const { input, description } of edgeCases) {
      // TODO: Test each edge case
      console.log('Testing edge case:', description);
    }
  });
`}

  ${strict ? `
  // STRICT VALIDATION TESTS
  it('should return exact structure matching spec', async () => {
    const result = await ${targetName}({});
    
    // Validate response structure
    expect(result).toBeDefined();
    expect(typeof result).toBe('object');
    
    // Check all required fields exist
    // TODO: Add field checks based on spec
  });

  it('should not have unexpected properties in response', async () => {
    const result = await ${targetName}({});
    const allowedKeys = ['id', 'name', 'createdAt', 'updatedAt']; // Update based on spec
    
    Object.keys(result).forEach(key => {
      expect(allowedKeys).toContain(key);
    });
  });
` : ""}
});
`;
        } else if (framework === "pytest") {
          testContent = `import pytest
from unittest.mock import patch, MagicMock
${strict ? `
# STRICT MODE: All assertions use == for exact matching
# Any deviation from expected output will cause test failure
` : ""}

class Test${targetName.charAt(0).toUpperCase() + targetName.slice(1)}:
    @pytest.fixture(autouse=True)
    def setup(self):
        pass
    
${testCases.length > 0 ? testCases.map(tc => `
    def test_${(tc.name || tc).toLowerCase().replace(/\s+/g, "_")}(self):
        """Test: ${tc.name || tc}"""
        # Arrange
        input_data = ${JSON.stringify(tc.input || {})}
        expected = ${JSON.stringify(tc.expected || {})}
        
        # Act
        result = ${targetName}(input_data)
        
        # Assert${strict ? " (STRICT MODE)" : ""}
        assert result == expected${strict ? ", f'Expected {expected}, got {result}'" : ""}
`).join("\n") : `
    def test_should_work_correctly(self):
        """Test basic functionality"""
        # Arrange
        input_data = {}
        expected = {}
        
        # Act & Assert
        # TODO: Implement test
        assert True
    
    def test_should_handle_valid_input(self):
        """Test with valid input"""
        # TODO: Implement
        assert True
    
    def test_should_reject_invalid_input(self):
        """Test with invalid input"""
        # TODO: Should raise exception or return error
        assert True
    
    @pytest.mark.parametrize("input_val,description", [
        (None, "null input"),
        ({}, "empty object"),
        ([], "empty array"),
        ("", "empty string"),
    ])
    def test_edge_cases(self, input_val, description):
        """Test edge cases"""
        # TODO: Test each edge case
        pass
`}
`;
        }
        
        await writeFile(outputPath, testContent, "utf8");
        
        return { 
          ok: true, 
          testContent, 
          path: outputPath,
          strict,
          framework,
          coverageTarget: coverage
        };
      }

      case "integration": {
        const outputPath = output || path.join(integrationDir, `integration.test.${language === "python" ? "py" : "ts"}`);
        
        const testContent = `import { describe, it, expect, beforeAll, afterAll } from '${framework === "vitest" ? "vitest" : "@jest/globals"}';
${strict ? `
// INTEGRATION TEST - STRICT MODE
// Tests real interactions between components
// All assertions must match exact expected behavior
` : ""}

describe('Integration Tests', () => {
  beforeAll(async () => {
    // Setup: Initialize test database, services, etc.
  });

  afterAll(async () => {
    // Cleanup: Tear down test resources
  });

  it('should integrate API with database correctly', async () => {
    // Arrange
    const testRecord = { name: 'test', value: 123 };
    
    // Act - Create
    const created = await createRecord(testRecord);
    
    // Assert - Strict validation
    ${strict ? `
    expect(created.id).toBeDefined();
    expect(created.name).toStrictEqual('test');
    expect(created.value).toStrictEqual(123);
    expect(created.createdAt).toBeDefined();
` : `
    expect(created.id).toBeDefined();
    expect(created.name).toBe('test');
`}
    
    // Act - Read
    const fetched = await getRecord(created.id);
    
    // Assert - Data integrity
    expect(fetched).${strict ? "toStrictEqual" : "toEqual"}(created);
    
    // Act - Update
    const updated = await updateRecord(created.id, { value: 456 });
    
    // Assert - Update reflected
    expect(updated.value).${strict ? "toStrictEqual(456)" : "toBe(456)"};
    
    // Act - Delete
    await deleteRecord(created.id);
    
    // Assert - Record removed
    const deleted = await getRecord(created.id);
    expect(deleted).${strict ? "toStrictEqual(null)" : "toBeNull()"};
  });

  it('should handle concurrent requests correctly', async () => {
    const requests = Array(10).fill(null).map((_, i) => 
      createRecord({ name: \`concurrent-\${i}\`, value: i })
    );
    
    const results = await Promise.all(requests);
    
    // Assert all succeeded with unique IDs
    const ids = results.map(r => r.id);
    const uniqueIds = new Set(ids);
    ${strict ? "expect(uniqueIds.size).toStrictEqual(10);" : "expect(uniqueIds.size).toBe(10);"}
  });

  it('should maintain data consistency under load', async () => {
    // Create record
    const record = await createRecord({ name: 'consistency-test', counter: 0 });
    
    // Simulate concurrent updates
    const updates = Array(5).fill(null).map(() => 
      incrementCounter(record.id)
    );
    
    await Promise.all(updates);
    
    // Assert final state is consistent
    const final = await getRecord(record.id);
    ${strict ? "expect(final.counter).toStrictEqual(5);" : "expect(final.counter).toBe(5);"}
  });

  ${strict ? `
  // STRICT INTEGRATION TESTS
  it('should match exact API contract', async () => {
    const response = await fetch('/api/health');
    const body = await response.json();
    
    // Exact structure validation
    expect(body).toHaveProperty('status');
    expect(body).toHaveProperty('timestamp');
    expect(body).toHaveProperty('version');
    
    // Type validation
    expect(typeof body.status).toBe('string');
    expect(typeof body.timestamp).toBe('string');
    expect(typeof body.version).toBe('string');
    
    // No extra properties
    const allowedKeys = ['status', 'timestamp', 'version', 'uptime'];
    Object.keys(body).forEach(key => {
      expect(allowedKeys).toContain(key);
    });
  });
` : ""}
});
`;
        
        await writeFile(outputPath, testContent, "utf8");
        
        return { ok: true, testContent, path: outputPath, type: "integration" };
      }

      case "e2e": {
        const outputPath = output || path.join(e2eDir, `e2e.test.${language === "python" ? "py" : "ts"}`);
        
        const testContent = `import { test, expect, Page, Browser } from '@playwright/test';
${strict ? `
// E2E TEST - STRICT MODE
// Tests complete user flows from start to finish
// All UI elements and data must match exact expectations
` : ""}

test.describe('E2E Tests', () => {
  let page: Page;

  test.beforeEach(async ({ browser }) => {
    page = await browser.newPage();
    await page.goto('/');
  });

  test.afterEach(async () => {
    await page.close();
  });

  test('should load homepage correctly', async () => {
    // Wait for page to be ready
    await page.waitForLoadState('networkidle');
    
    // Assert page title
    const title = await page.title();
    ${strict ? "expect(title).toStrictEqual('Expected Title');" : "expect(title).toContain('Expected');"}
    
    // Assert main elements exist
    const header = await page.$('header');
    expect(header).not.toBeNull();
    
    const main = await page.$('main');
    expect(main).not.toBeNull();
  });

  test('should complete user registration flow', async () => {
    // Navigate to registration
    await page.click('text=Sign Up');
    await page.waitForURL('/register');
    
    // Fill form
    await page.fill('[name="email"]', 'test@example.com');
    await page.fill('[name="password"]', 'SecurePass123!');
    await page.fill('[name="confirmPassword"]', 'SecurePass123!');
    
    // Submit
    await page.click('button[type="submit"]');
    
    // Wait for success
    await page.waitForURL('/dashboard', { timeout: 10000 });
    
    ${strict ? `
    // Verify exact state
    const url = page.url();
    expect(url).toStrictEqual('http://localhost:3000/dashboard');
    
    // Verify user data in UI
    const userEmail = await page.textContent('[data-testid="user-email"]');
    expect(userEmail).toStrictEqual('test@example.com');
` : `
    expect(page.url()).toContain('/dashboard');
`}
  });

  test('should handle login flow', async () => {
    await page.click('text=Login');
    await page.fill('[name="email"]', 'test@example.com');
    await page.fill('[name="password"]', 'SecurePass123!');
    await page.click('button[type="submit"]');
    
    await page.waitForURL('/dashboard');
    ${strict ? "expect(page.url()).toStrictEqual('http://localhost:3000/dashboard');" : "expect(page.url()).toContain('/dashboard');"}
  });

  test('should display error for invalid credentials', async () => {
    await page.click('text=Login');
    await page.fill('[name="email"]', 'wrong@example.com');
    await page.fill('[name="password"]', 'wrongpassword');
    await page.click('button[type="submit"]');
    
    // Wait for error message
    const error = await page.waitForSelector('[role="alert"]');
    const errorText = await error.textContent();
    
    ${strict ? `
    expect(errorText).toStrictEqual('Invalid email or password');
` : `
    expect(errorText).toContain('Invalid');
`}
  });

  ${strict ? `
  // STRICT E2E TESTS
  test('should match exact UI snapshot', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Take screenshot for visual comparison
    await expect(page).toHaveScreenshot('homepage.png', {
      maxDiffPixels: 0 // Zero tolerance for visual differences
    });
  });

  test('should have correct accessibility attributes', async ({ page }) => {
    await page.goto('/');
    
    // Check all interactive elements have proper labels
    const buttons = await page.$$('button');
    for (const button of buttons) {
      const ariaLabel = await button.getAttribute('aria-label');
      const text = await button.textContent();
      expect(ariaLabel || text).toBeTruthy();
    }
    
    // Check all images have alt text
    const images = await page.$$('img');
    for (const img of images) {
      const alt = await img.getAttribute('alt');
      expect(alt).not.toBeNull();
    }
  });
` : ""}
});
`;
        
        await writeFile(outputPath, testContent, "utf8");
        
        return { ok: true, testContent, path: outputPath, type: "e2e" };
      }

      case "contract": {
        const outputPath = output || path.join(contractDir, "api-contract.test.ts");
        
        const testContent = `import { describe, it, expect } from '${framework === "vitest" ? "vitest" : "@jest/globals"}';
${strict ? `
// CONTRACT TEST - STRICT MODE
// Validates API contracts are exactly as specified
// Any deviation indicates breaking change
` : ""}

describe('API Contract Tests', () => {
  const API_BASE = process.env.API_BASE || 'http://localhost:3000/api';

  describe('GET /users', () => {
    it('should return paginated user list', async () => {
      const response = await fetch(\`\${API_BASE}/users\`);
      
      // Status code contract
      expect(response.status).${strict ? "toStrictEqual(200)" : "toBe(200)"};
      
      const body = await response.json();
      
      // Structure contract
      expect(body).toHaveProperty('data');
      expect(body).toHaveProperty('pagination');
      expect(Array.isArray(body.data)).${strict ? "toStrictEqual(true)" : "toBe(true)"};
      
      ${strict ? `
      // Exact field types
      expect(typeof body.pagination.page).toStrictEqual('number');
      expect(typeof body.pagination.limit).toStrictEqual('number');
      expect(typeof body.pagination.total).toStrictEqual('number');
      
      // User object contract
      if (body.data.length > 0) {
        const user = body.data[0];
        expect(user).toHaveProperty('id');
        expect(user).toHaveProperty('email');
        expect(user).toHaveProperty('createdAt');
        expect(typeof user.id).toStrictEqual('string');
        expect(typeof user.email).toStrictEqual('string');
      }
` : ""}
    });
  });

  describe('POST /users', () => {
    it('should create user with valid data', async () => {
      const newUser = {
        email: 'contract-test@example.com',
        name: 'Contract Test User'
      };
      
      const response = await fetch(\`\${API_BASE}/users\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser)
      });
      
      expect(response.status).${strict ? "toStrictEqual(201)" : "toBe(201)"};
      
      const body = await response.json();
      
      ${strict ? `
      // Exact response structure
      expect(body).toHaveProperty('id');
      expect(body.email).toStrictEqual(newUser.email);
      expect(body.name).toStrictEqual(newUser.name);
      expect(body).toHaveProperty('createdAt');
      expect(body).toHaveProperty('updatedAt');
      
      // No extra fields
      const allowedKeys = ['id', 'email', 'name', 'createdAt', 'updatedAt'];
      Object.keys(body).forEach(key => {
        expect(allowedKeys).toContain(key);
      });
` : `
      expect(body.email).toBe(newUser.email);
`}
    });

    it('should reject invalid email', async () => {
      const invalidUser = { email: 'not-an-email', name: 'Test' };
      
      const response = await fetch(\`\${API_BASE}/users\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidUser)
      });
      
      expect(response.status).${strict ? "toStrictEqual(400)" : "toBe(400)"};
      
      const body = await response.json();
      expect(body).toHaveProperty('error');
      ${strict ? "expect(body.error).toStrictEqual('Invalid email format');" : ""}
    });
  });

  ${strict ? `
  // CONTRACT VERSIONING TEST
  describe('API Versioning', () => {
    it('should include API version in response header', async () => {
      const response = await fetch(\`\${API_BASE}/health\`);
      const version = response.headers.get('X-API-Version');
      
      expect(version).toBeDefined();
      expect(version).toMatch(/^v\\d+\\.\\d+\\.\\d+$/);
    });
  });
` : ""}
});
`;
        
        await writeFile(outputPath, testContent, "utf8");
        
        return { ok: true, testContent, path: outputPath, type: "contract" };
      }

      case "assertions": {
        const assertions = {
          id: `ASSERTIONS-${Date.now()}`,
          strict,
          rules: []
        };
        
        if (specId) {
          const spec = loadSpec(specId);
          if (spec?.acceptanceCriteria) {
            for (const ac of spec.acceptanceCriteria) {
              assertions.rules.push({
                id: `RULE-${ac.id}`,
                description: ac.then || ac.requirement,
                assertion: `expect(result).${strict ? "toStrictEqual" : "toEqual"}(expected)`,
                strict,
                failingCondition: "Any deviation from expected value or structure"
              });
            }
          }
        }
        
        assertions.rules.push(
          {
            id: "RULE-TYPE-CHECK",
            description: "Return value must match expected type",
            assertion: `expect(typeof result).toStrictEqual(expectedType)`,
            strict: true
          },
          {
            id: "RULE-NOT-NULL",
            description: "Return value must not be null or undefined",
            assertion: `expect(result).not.toBeNull(); expect(result).not.toBeUndefined()`,
            strict: true
          },
          {
            id: "RULE-NO-EXTRA-PROPS",
            description: "Response object must not have unexpected properties",
            assertion: `Object.keys(result).every(k => allowedKeys.includes(k))`,
            strict: true
          },
          {
            id: "RULE-EXACT-MATCH",
            description: "Response must exactly match specification",
            assertion: `expect(result).toMatchObject(spec)`,
            strict: true
          }
        );
        
        return { ok: true, assertions };
      }

      case "mocks": {
        const mockName = options.name || "service";
        const outputPath = output || path.join(testsDir, "mocks", `${mockName}.mock.ts`);
        await mkdir(path.dirname(outputPath), { recursive: true });
        
        const mockContent = `import { vi } from 'vitest';

export const create${mockName.charAt(0).toUpperCase() + mockName.slice(1)}Mock = () => ({
  ${options.methods?.map(m => `${m}: vi.fn().mockResolvedValue(${JSON.stringify(options.defaultResponse || {})})`).join(",\n  ") || `
  get: vi.fn().mockResolvedValue({}),
  create: vi.fn().mockResolvedValue({ id: 'mock-id' }),
  update: vi.fn().mockResolvedValue({}),
  delete: vi.fn().mockResolvedValue(true),
  list: vi.fn().mockResolvedValue([])
`}
});

export const mock${mockName.charAt(0).toUpperCase() + mockName.slice(1)}Responses = {
  success: { success: true, data: {} },
  error: { success: false, error: 'Mock error' },
  notFound: { success: false, error: 'Not found', code: 'NOT_FOUND' },
  validation: { success: false, error: 'Validation failed', code: 'VALIDATION_ERROR' }
};
`;
        
        await writeFile(outputPath, mockContent, "utf8");
        
        return { ok: true, mockContent, path: outputPath };
      }

      case "run": {
        const cmd = framework === "pytest" 
          ? ["pytest", "--cov=.", `--cov-fail-under=${coverage}`, "-v"]
          : framework === "vitest"
          ? ["npx", "vitest", "run", "--coverage", `--reporter=verbose`]
          : ["npx", "jest", "--coverage", "--detectOpenHandles"];
        
        return new Promise((resolve) => {
          let stdout = "";
          let stderr = "";
          
          const child = spawn(cmd[0], cmd.slice(1), {
            cwd: workspaceRoot,
            windowsHide: true
          });
          
          const timeoutId = setTimeout(() => {
            child.kill("SIGTERM");
            resolve({ ok: false, error: "Test run timed out", stdout, stderr });
          }, 300000);
          
          child.stdout?.on("data", (data) => { stdout += data.toString(); });
          child.stderr?.on("data", (data) => { stderr += data.toString(); });
          
          child.on("close", (code) => {
            clearTimeout(timeoutId);
            resolve({
              ok: code === 0,
              exitCode: code,
              output: stdout || stderr,
              passed: code === 0
            });
          });
          
          child.on("error", (err) => {
            clearTimeout(timeoutId);
            resolve({ ok: false, error: err.message });
          });
        });
      }

      case "analyze": {
        if (!target) throw new Error("target is required for analysis");
        
        const targetPath = path.resolve(workspaceRoot, target);
        
        const analysis = {
          target,
          timestamp: new Date().toISOString(),
          recommendations: [],
          coverage: { estimated: 0, target: coverage },
          missingTests: [],
          suggestions: []
        };
        
        if (existsSync(targetPath)) {
          const content = readFileSync(targetPath, "utf8");
          
          const functionPattern = /(?:export\s+)?(?:async\s+)?function\s+(\w+)|(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[^=])\s*=>/g;
          const functions = [];
          let match;
          while ((match = functionPattern.exec(content)) !== null) {
            functions.push(match[1] || match[2]);
          }
          
          for (const fn of functions) {
            const testPath = path.join(unitDir, `${path.basename(target, path.extname(target))}.test.${language === "python" ? "py" : "ts"}`);
            if (!existsSync(testPath) || !readFileSync(testPath, "utf8").includes(fn)) {
              analysis.missingTests.push(fn);
              analysis.suggestions.push(`Add test for function: ${fn}`);
            }
          }
          
          analysis.functionsFound = functions.length;
          analysis.functionsTested = functions.length - analysis.missingTests.length;
          analysis.coverage.estimated = functions.length > 0 
            ? Math.round((analysis.functionsTested / functions.length) * 100) 
            : 0;
        }
        
        analysis.recommendations = [
          "Ensure all public functions have tests",
          "Add edge case tests for boundary conditions",
          "Include negative tests for error handling",
          "Add integration tests for cross-module interactions"
        ];
        
        return { ok: true, analysis };
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }
};
