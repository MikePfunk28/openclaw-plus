export class DriftPreventionSystem {
  constructor() {
    this.specifications = new Map();
    this.implementations = new Map();
    this.assertions = new Map();
    this.driftReports = new Map();
    this.testSuites = new Map();
  }

  createSpecification(planId, spec) {
    const specId = `spec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const specification = {
      id: specId,
      planId,
      name: spec.name || "Specification",
      version: "1.0.0",
      createdAt: Date.now(),
      
      requirements: {
        functional: this.normalizeRequirements(spec.requirements?.functional || []),
        nonFunctional: this.normalizeRequirements(spec.requirements?.nonFunctional || []),
        constraints: spec.requirements?.constraints || []
      },
      
      interfaces: this.defineInterfaces(spec.interfaces || []),
      dataModels: this.defineDataModels(spec.dataModels || []),
      behaviors: this.defineBehaviors(spec.behaviors || []),
      
      acceptanceCriteria: this.generateAcceptanceCriteria(spec),
      
      tests: [],
      assertions: [],
      
      status: "defined",
      verificationStatus: "pending"
    };

    this.specifications.set(specId, specification);
    this.generateStrictTests(specId);
    
    return specification;
  }

  normalizeRequirements(requirements) {
    return requirements.map((req, index) => ({
      id: `req_${index}`,
      description: typeof req === "string" ? req : req.description,
      priority: req.priority || "must",
      category: req.category || "functional",
      acceptanceCriteria: req.acceptanceCriteria || [],
      verification: req.verification || "automated",
      status: "pending"
    }));
  }

  defineInterfaces(interfaces) {
    return interfaces.map((iface, index) => ({
      id: `iface_${index}`,
      name: iface.name,
      type: iface.type || "api",
      method: iface.method,
      path: iface.path,
      input: this.defineSchema(iface.input),
      output: this.defineSchema(iface.output),
      errors: iface.errors || [],
      authentication: iface.authentication || "none",
      rateLimit: iface.rateLimit || null,
      documentation: iface.documentation || ""
    }));
  }

  defineSchema(schema) {
    if (!schema) return { type: "object", properties: {}, required: [] };
    
    return {
      type: schema.type || "object",
      properties: schema.properties || {},
      required: schema.required || [],
      examples: schema.examples || [],
      validation: this.generateValidationRules(schema)
    };
  }

  generateValidationRules(schema) {
    const rules = [];
    
    for (const [key, prop] of Object.entries(schema.properties || {})) {
      const rule = {
        field: key,
        type: prop.type,
        required: (schema.required || []).includes(key)
      };
      
      if (prop.minLength) rule.minLength = prop.minLength;
      if (prop.maxLength) rule.maxLength = prop.maxLength;
      if (prop.minimum !== undefined) rule.minimum = prop.minimum;
      if (prop.maximum !== undefined) rule.maximum = prop.maximum;
      if (prop.pattern) rule.pattern = prop.pattern;
      if (prop.enum) rule.enum = prop.enum;
      if (prop.format) rule.format = prop.format;
      
      rules.push(rule);
    }
    
    return rules;
  }

  defineDataModels(models) {
    return models.map((model, index) => ({
      id: `model_${index}`,
      name: model.name,
      fields: model.fields || [],
      relationships: model.relationships || [],
      indexes: model.indexes || [],
      constraints: model.constraints || []
    }));
  }

  defineBehaviors(behaviors) {
    return behaviors.map((behavior, index) => ({
      id: `behavior_${index}`,
      name: behavior.name,
      trigger: behavior.trigger,
      preconditions: behavior.preconditions || [],
      steps: behavior.steps || [],
      postconditions: behavior.postconditions || [],
      errorHandling: behavior.errorHandling || []
    }));
  }

  generateAcceptanceCriteria(spec) {
    const criteria = [];
    
    for (const iface of (spec.interfaces || [])) {
      criteria.push({
        id: `ac_${criteria.length}`,
        type: "interface",
        description: `${iface.method} ${iface.path} returns correct response`,
        testId: null,
        status: "pending"
      });
      
      if (iface.authentication !== "none") {
        criteria.push({
          id: `ac_${criteria.length}`,
          type: "security",
          description: `${iface.path} requires ${iface.authentication} authentication`,
          testId: null,
          status: "pending"
        });
      }
    }
    
    for (const req of (spec.requirements?.functional || [])) {
      const reqStr = typeof req === "string" ? req : req.description;
      criteria.push({
        id: `ac_${criteria.length}`,
        type: "functional",
        description: reqStr,
        testId: null,
        status: "pending"
      });
    }
    
    return criteria;
  }

  generateStrictTests(specId) {
    const spec = this.specifications.get(specId);
    if (!spec) return;

    const tests = {
      unit: [],
      integration: [],
      contract: [],
      e2e: [],
      performance: [],
      security: []
    };

    for (const iface of spec.interfaces) {
      tests.contract.push(this.generateContractTest(iface));
      tests.integration.push(this.generateIntegrationTest(iface));
    }

    for (const model of spec.dataModels) {
      tests.unit.push(this.generateModelTest(model));
    }

    for (const behavior of spec.behaviors) {
      tests.e2e.push(this.generateBehaviorTest(behavior));
    }

    for (const req of spec.requirements.nonFunctional) {
      if (req.category === "performance") {
        tests.performance.push(this.generatePerformanceTest(req));
      }
      if (req.category === "security") {
        tests.security.push(this.generateSecurityTest(req));
      }
    }

    const suiteId = `suite_${Date.now()}`;
    this.testSuites.set(suiteId, {
      id: suiteId,
      specId,
      tests,
      createdAt: Date.now(),
      status: "generated"
    });

    spec.tests = Object.keys(tests);
    this.specifications.set(specId, spec);

    return { suiteId, testCount: Object.values(tests).flat().length };
  }

  generateContractTest(iface) {
    return {
      id: `test_contract_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      name: `Contract: ${iface.name}`,
      type: "contract",
      interface: iface.name,
      assertions: [
        {
          id: `assert_1`,
          type: "response_status",
          expected: iface.method === "POST" ? 201 : 200,
          operator: "equals",
          critical: true,
          message: `Expected status ${iface.method === "POST" ? 201 : 200}`
        },
        {
          id: `assert_2`,
          type: "response_schema",
          expected: iface.output,
          operator: "matches_schema",
          critical: true,
          message: `Response must match ${iface.name} output schema`
        },
        {
          id: `assert_3`,
          type: "response_time",
          expected: 500,
          operator: "less_than",
          critical: false,
          message: "Response time should be under 500ms"
        },
        {
          id: `assert_4`,
          type: "content_type",
          expected: "application/json",
          operator: "equals",
          critical: true,
          message: "Content-Type must be application/json"
        }
      ],
      setup: [],
      teardown: []
    };
  }

  generateIntegrationTest(iface) {
    return {
      id: `test_integration_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      name: `Integration: ${iface.name}`,
      type: "integration",
      interface: iface.name,
      assertions: [
        {
          id: `assert_1`,
          type: "database_state",
          operator: "exists",
          critical: true,
          message: "Record must exist in database after operation"
        },
        {
          id: `assert_2`,
          type: "side_effects",
          operator: "no_unexpected",
          critical: true,
          message: "No unexpected side effects in related tables"
        }
      ]
    };
  }

  generateModelTest(model) {
    return {
      id: `test_model_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      name: `Model: ${model.name}`,
      type: "unit",
      model: model.name,
      assertions: [
        {
          id: `assert_1`,
          type: "validation",
          field: "all",
          operator: "passes_all_constraints",
          critical: true,
          message: `All ${model.name} fields must pass validation`
        },
        ...model.fields.filter(f => f.required).map((f, i) => ({
          id: `assert_${i + 2}`,
          type: "required_field",
          field: f.name,
          operator: "not_null",
          critical: true,
          message: `${f.name} is required and cannot be null`
        }))
      ]
    };
  }

  generateBehaviorTest(behavior) {
    return {
      id: `test_behavior_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      name: `Behavior: ${behavior.name}`,
      type: "e2e",
      behavior: behavior.name,
      assertions: [
        ...behavior.preconditions.map((pre, i) => ({
          id: `assert_pre_${i}`,
          type: "precondition",
          description: pre,
          operator: "satisfied",
          critical: true,
          message: `Precondition must be satisfied: ${pre}`
        })),
        ...behavior.postconditions.map((post, i) => ({
          id: `assert_post_${i}`,
          type: "postcondition",
          description: post,
          operator: "satisfied",
          critical: true,
          message: `Postcondition must be satisfied: ${post}`
        }))
      ]
    };
  }

  generatePerformanceTest(req) {
    return {
      id: `test_perf_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      name: `Performance: ${req.description}`,
      type: "performance",
      assertions: [
        {
          id: `assert_1`,
          type: "response_time_p95",
          expected: req.threshold || 1000,
          operator: "less_than",
          critical: true,
          message: `P95 response time must be under ${req.threshold || 1000}ms`
        },
        {
          id: `assert_2`,
          type: "throughput",
          expected: req.throughput || 100,
          operator: "greater_than",
          critical: false,
          message: `Throughput must be at least ${req.throughput || 100} req/s`
        },
        {
          id: `assert_3`,
          type: "error_rate",
          expected: 1,
          operator: "less_than",
          critical: true,
          message: "Error rate must be under 1%"
        }
      ]
    };
  }

  generateSecurityTest(req) {
    return {
      id: `test_sec_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      name: `Security: ${req.description}`,
      type: "security",
      assertions: [
        {
          id: `assert_1`,
          type: "authentication",
          operator: "required",
          critical: true,
          message: "All endpoints must require authentication"
        },
        {
          id: `assert_2`,
          type: "authorization",
          operator: "enforced",
          critical: true,
          message: "Authorization must be enforced for all operations"
        },
        {
          id: `assert_3`,
          type: "input_validation",
          operator: "strict",
          critical: true,
          message: "All inputs must be validated"
        },
        {
          id: `assert_4`,
          type: "sql_injection",
          operator: "protected",
          critical: true,
          message: "Must be protected against SQL injection"
        },
        {
          id: `assert_5`,
          type: "xss",
          operator: "protected",
          critical: true,
          message: "Must be protected against XSS attacks"
        }
      ]
    };
  }

  registerImplementation(specId, implementation) {
    const implId = `impl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const impl = {
      id: implId,
      specId,
      registeredAt: Date.now(),
      files: implementation.files || [],
      components: implementation.components || [],
      apis: implementation.apis || [],
      models: implementation.models || [],
      status: "registered"
    };

    this.implementations.set(implId, impl);
    return impl;
  }

  async detectDrift(specId, implId) {
    const spec = this.specifications.get(specId);
    const impl = this.implementations.get(implId);
    
    if (!spec || !impl) {
      throw new Error("Specification or implementation not found");
    }

    const driftReport = {
      id: `drift_${Date.now()}`,
      specId,
      implId,
      detectedAt: Date.now(),
      drifts: [],
      summary: {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0
      },
      recommendations: []
    };

    driftReport.drifts.push(...this.checkInterfaceDrift(spec, impl));
    driftReport.drifts.push(...this.checkModelDrift(spec, impl));
    driftReport.drifts.push(...this.checkBehaviorDrift(spec, impl));
    driftReport.drifts.push(...this.checkRequirementDrift(spec, impl));

    for (const drift of driftReport.drifts) {
      driftReport.summary[drift.severity]++;
    }

    driftReport.recommendations = this.generateRecommendations(driftReport.drifts);

    this.driftReports.set(driftReport.id, driftReport);
    return driftReport;
  }

  checkInterfaceDrift(spec, impl) {
    const drifts = [];

    for (const specInterface of spec.interfaces) {
      const implApi = impl.apis?.find(a => 
        a.path === specInterface.path && a.method === specInterface.method
      );

      if (!implApi) {
        drifts.push({
          type: "missing_interface",
          severity: "critical",
          category: "interface",
          description: `Missing API endpoint: ${specInterface.method} ${specInterface.path}`,
          expected: specInterface,
          actual: null,
          fix: {
            action: "implement",
            description: `Implement ${specInterface.method} ${specInterface.path} endpoint`,
            code: this.generateEndpointCode(specInterface),
            location: "routes/api.js",
            steps: [
              `Create route handler for ${specInterface.method} ${specInterface.path}`,
              `Implement input validation matching schema`,
              `Implement business logic`,
              `Return response matching output schema`,
              `Add authentication: ${specInterface.authentication}`,
              `Add rate limiting if specified`
            ]
          }
        });
        continue;
      }

      for (const rule of specInterface.input.validation) {
        if (!implApi.validation?.find(v => v.field === rule.field)) {
          drifts.push({
            type: "missing_validation",
            severity: "high",
            category: "interface",
            description: `Missing validation for field '${rule.field}' in ${specInterface.path}`,
            expected: rule,
            actual: implApi.validation?.find(v => v.field === rule.field),
            fix: {
              action: "add_validation",
              description: `Add validation rule for ${rule.field}`,
              code: this.generateValidationCode(rule),
              location: `validators/${specInterface.name}.js`
            }
          });
        }
      }
    }

    return drifts;
  }

  checkModelDrift(spec, impl) {
    const drifts = [];

    for (const specModel of spec.dataModels) {
      const implModel = impl.models?.find(m => 
        m.name.toLowerCase() === specModel.name.toLowerCase()
      );

      if (!implModel) {
        drifts.push({
          type: "missing_model",
          severity: "critical",
          category: "data_model",
          description: `Missing data model: ${specModel.name}`,
          expected: specModel,
          actual: null,
          fix: {
            action: "create_model",
            description: `Create ${specModel.name} model`,
            code: this.generateModelCode(specModel),
            location: `models/${specModel.name.toLowerCase()}.js`
          }
        });
        continue;
      }

      for (const specField of specModel.fields) {
        const implField = implModel.fields?.find(f => 
          f.name === specField.name
        );

        if (!implField) {
          drifts.push({
            type: "missing_field",
            severity: specField.required ? "critical" : "medium",
            category: "data_model",
            description: `Missing field '${specField.name}' in ${specModel.name}`,
            expected: specField,
            actual: null,
            fix: {
              action: "add_field",
              description: `Add ${specField.name} field to ${specModel.name}`,
              migration: this.generateMigrationCode(specModel.name, specField),
              location: `models/${specModel.name.toLowerCase()}.js`
            }
          });
        } else if (specField.type !== implField.type) {
          drifts.push({
            type: "type_mismatch",
            severity: "high",
            category: "data_model",
            description: `Type mismatch for ${specModel.name}.${specField.name}: expected ${specField.type}, got ${implField.type}`,
            expected: specField.type,
            actual: implField.type,
            fix: {
              action: "fix_type",
              description: `Change ${specField.name} type from ${implField.type} to ${specField.type}`,
              migration: this.generateTypeMigrationCode(specModel.name, specField, implField)
            }
          });
        }
      }
    }

    return drifts;
  }

  checkBehaviorDrift(spec, impl) {
    const drifts = [];

    for (const behavior of spec.behaviors) {
      const implBehavior = impl.behaviors?.find(b => 
        b.name === behavior.name
      );

      if (!implBehavior) {
        drifts.push({
          type: "missing_behavior",
          severity: "high",
          category: "behavior",
          description: `Missing behavior: ${behavior.name}`,
          expected: behavior,
          actual: null,
          fix: {
            action: "implement_behavior",
            description: `Implement ${behavior.name} behavior`,
            steps: behavior.steps,
            code: this.generateBehaviorCode(behavior)
          }
        });
      }
    }

    return drifts;
  }

  checkRequirementDrift(spec, impl) {
    const drifts = [];

    for (const req of spec.requirements.functional) {
      const implemented = impl.requirements?.find(r => 
        r.id === req.id || r.description === req.description
      );

      if (!implemented && req.priority === "must") {
        drifts.push({
          type: "missing_requirement",
          severity: "critical",
          category: "requirement",
          description: `Missing required functionality: ${req.description}`,
          expected: req,
          actual: null,
          fix: {
            action: "implement_requirement",
            description: req.description,
            acceptanceCriteria: req.acceptanceCriteria
          }
        });
      }
    }

    return drifts;
  }

  generateRecommendations(drifts) {
    const recommendations = [];
    const grouped = {};

    for (const drift of drifts) {
      const key = `${drift.type}_${drift.category}`;
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(drift);
    }

    for (const [key, items] of Object.entries(grouped)) {
      recommendations.push({
        type: items[0].type,
        category: items[0].category,
        count: items.length,
        severity: Math.max(...items.map(i => 
          ({ critical: 4, high: 3, medium: 2, low: 1 })[i.severity]
        )),
        description: `${items.length} ${items[0].type.replace(/_/g, " ")} issue(s) in ${items[0].category}`,
        priority: items.filter(i => i.severity === "critical").length > 0 ? "immediate" : "scheduled"
      });
    }

    return recommendations.sort((a, b) => b.severity - a.severity);
  }

  generateEndpointCode(iface) {
    return `// ${iface.method} ${iface.path}
router.${iface.method.toLowerCase()}('${iface.path}', async (req, res) => {
  try {
    // Input validation
    const { error, value } = validate${iface.name}(req.body);
    if (error) {
      return res.status(400).json({ error: error.details });
    }

    // TODO: Implement business logic
    const result = await ${iface.name}Handler(value);

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});`;
  }

  generateValidationCode(rule) {
    return `const Joi = require('joi');

const schema = Joi.object({
  ${rule.field}: Joi.${rule.type}()
    ${rule.required ? '.required()' : '.optional()'}
    ${rule.minLength ? `.min(${rule.minLength})` : ''}
    ${rule.maxLength ? `.max(${rule.maxLength})` : ''}
    ${rule.pattern ? `.pattern(/${rule.pattern}/)` : ''}
    ${rule.enum ? `.valid(${rule.enum.map(e => `'${e}'`).join(', ')})` : ''}
});`;
  }

  generateModelCode(model) {
    return `const { Schema } = require('mongoose');

const ${model.name}Schema = new Schema({
  ${model.fields.map(f => `${f.name}: { type: ${this.mapType(f.type)}, required: ${f.required || false} }`).join(',\n  ')}
}, { timestamps: true });

module.exports = model('${model.name}', ${model.name}Schema);`;
  }

  mapType(type) {
    const types = {
      string: 'String',
      number: 'Number',
      boolean: 'Boolean',
      date: 'Date',
      array: 'Array',
      object: 'Schema.Types.Mixed'
    };
    return types[type] || 'Schema.Types.Mixed';
  }

  generateMigrationCode(modelName, field) {
    return `// Migration: Add ${field.name} to ${modelName}
module.exports = {
  up: async (db) => {
    await db.collection('${modelName.toLowerCase()}s').updateMany(
      {},
      { $set: { ${field.name}: ${field.default || 'null'} } }
    );
  },
  down: async (db) => {
    await db.collection('${modelName.toLowerCase()}s').updateMany(
      {},
      { $unset: { ${field.name}: "" } }
    );
  }
};`;
  }

  generateTypeMigrationCode(modelName, specField, implField) {
    return `// Migration: Change ${specField.name} type from ${implField.type} to ${specField.type}
module.exports = {
  up: async (db) => {
    await db.collection('${modelName.toLowerCase()}s').updateMany(
      { ${specField.name}: { $type: "${implField.type}" } },
      [{ $set: { ${specField.name}: { $to${specField.type.charAt(0).toUpperCase() + specField.type.slice(1)}: "$${specField.name}" } } }]
    );
  },
  down: async (db) => {
    // Revert logic
  }
};`;
  }

  generateBehaviorCode(behavior) {
    return `// Behavior: ${behavior.name}
async function ${behavior.name.replace(/\s+/g, '')}Handler(input) {
  // Preconditions:
  ${behavior.preconditions.map(p => `// - ${p}`).join('\n  ')}

  // Steps:
  ${behavior.steps.map((s, i) => `// ${i + 1}. ${s}`).join('\n  ')}

  // Postconditions:
  ${behavior.postconditions.map(p => `// - ${p}`).join('\n  ')}

  throw new Error('Not implemented');
}`;
  }

  runTestAssertions(testId, results) {
    const test = this.findTest(testId);
    if (!test) throw new Error("Test not found");

    const assertionResults = [];

    for (const assertion of test.assertions) {
      const result = this.evaluateAssertion(assertion, results);
      assertionResults.push(result);

      if (!result.passed && assertion.critical) {
        result.blocking = true;
      }
    }

    return {
      testId,
      passed: assertionResults.every(r => r.passed),
      assertions: assertionResults,
      summary: {
        total: assertionResults.length,
        passed: assertionResults.filter(r => r.passed).length,
        failed: assertionResults.filter(r => !r.passed).length,
        critical: assertionResults.filter(r => !r.passed && r.critical).length
      }
    };
  }

  findTest(testId) {
    for (const suite of this.testSuites.values()) {
      for (const tests of Object.values(suite.tests)) {
        const found = tests.find(t => t.id === testId);
        if (found) return found;
      }
    }
    return null;
  }

  evaluateAssertion(assertion, results) {
    const actual = results[assertion.type] || results[assertion.field];
    let passed = false;

    switch (assertion.operator) {
      case "equals":
        passed = actual === assertion.expected;
        break;
      case "not_equals":
        passed = actual !== assertion.expected;
        break;
      case "less_than":
        passed = actual < assertion.expected;
        break;
      case "greater_than":
        passed = actual > assertion.expected;
        break;
      case "exists":
        passed = actual !== undefined && actual !== null;
        break;
      case "not_null":
        passed = actual !== null;
        break;
      case "matches_schema":
        passed = this.validateSchema(actual, assertion.expected);
        break;
      case "satisfied":
        passed = actual === true;
        break;
      default:
        passed = false;
    }

    return {
      id: assertion.id,
      type: assertion.type,
      passed,
      expected: assertion.expected,
      actual,
      message: assertion.message,
      critical: assertion.critical,
      fix: !passed ? this.generateAssertionFix(assertion, actual) : null
    };
  }

  validateSchema(actual, schema) {
    if (!schema || !actual) return false;

    for (const field of (schema.required || [])) {
      if (actual[field] === undefined) return false;
    }

    return true;
  }

  generateAssertionFix(assertion, actual) {
    return {
      description: `Expected ${assertion.expected}, got ${actual}`,
      action: assertion.operator === "equals" ? "update_value" : "fix_logic",
      expected: assertion.expected,
      actual
    };
  }

  getSpecification(specId) {
    return this.specifications.get(specId);
  }

  getTestSuite(suiteId) {
    return this.testSuites.get(suiteId);
  }

  getDriftReport(reportId) {
    return this.driftReports.get(reportId);
  }

  listSpecifications() {
    return Array.from(this.specifications.values());
  }

  listDriftReports() {
    return Array.from(this.driftReports.values());
  }
}

export const driftPrevention = new DriftPreventionSystem();
