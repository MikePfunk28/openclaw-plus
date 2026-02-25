export class ArchitecturePlanner {
  constructor() {
    this.plans = new Map();
    this.diagrams = new Map();
    this.templates = this.loadTemplates();
  }

  loadTemplates() {
    return {
      microservices: {
        name: "Microservices Architecture",
        components: ["API Gateway", "Service Mesh", "Services", "Message Queue", "Database", "Cache"],
        patterns: ["Circuit Breaker", "Service Discovery", "Load Balancing", "Observability"]
      },
      monorepo: {
        name: "Monorepo Structure",
        components: ["Packages", "Shared Libs", "Apps", "Config", "CI/CD"],
        patterns: ["Workspace", "Shared Dependencies", "Versioning"]
      },
      serverless: {
        name: "Serverless Architecture",
        components: ["API Gateway", "Lambda/Functions", "DynamoDB", "S3", "SQS/SNS", "CloudFront"],
        patterns: ["Event-Driven", "Cold Start Optimization", "Stateless"]
      },
      eventDriven: {
        name: "Event-Driven Architecture",
        components: ["Event Bus", "Producers", "Consumers", "Event Store", "Saga Orchestrator"],
        patterns: ["CQRS", "Event Sourcing", "Idempotency"]
      },
      layered: {
        name: "Layered Architecture",
        components: ["Presentation", "Business Logic", "Data Access", "Database"],
        patterns: ["Separation of Concerns", "Dependency Inversion"]
      },
      hexagonal: {
        name: "Hexagonal/Clean Architecture",
        components: ["Domain", "Application", "Infrastructure", "Presentation", "Ports", "Adapters"],
        patterns: ["Dependency Rule", "Repository Pattern", "Use Cases"]
      }
    };
  }

  createPlan(config) {
    const planId = `plan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const plan = {
      id: planId,
      name: config.name || "New Architecture Plan",
      description: config.description || "",
      type: config.type || "microservices",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      status: "draft",
      
      requirements: {
        functional: config.requirements?.functional || [],
        nonFunctional: config.requirements?.nonFunctional || [],
        constraints: config.requirements?.constraints || []
      },
      
      components: [],
      connections: [],
      dataFlows: [],
      interfaces: [],
      
      infrastructure: {
        compute: [],
        storage: [],
        networking: [],
        security: []
      },
      
      decisions: [],
      risks: [],
      
      generatedCode: null,
      tests: null,
      diagrams: [],
      
      metadata: {
        version: "1.0.0",
        author: config.author || "system",
        tags: config.tags || []
      }
    };

    this.plans.set(planId, plan);
    return plan;
  }

  addComponent(planId, component) {
    const plan = this.plans.get(planId);
    if (!plan) throw new Error(`Plan not found: ${planId}`);

    const componentId = `comp_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    
    const newComponent = {
      id: componentId,
      name: component.name,
      type: component.type || "service",
      description: component.description || "",
      technology: component.technology || null,
      responsibilities: component.responsibilities || [],
      dependencies: component.dependencies || [],
      interfaces: component.interfaces || [],
      config: component.config || {},
      scaling: component.scaling || { strategy: "horizontal", min: 1, max: 10 },
      healthCheck: component.healthCheck || { enabled: true, path: "/health", interval: 30 },
      position: component.position || { x: 0, y: 0 }
    };

    plan.components.push(newComponent);
    plan.updatedAt = Date.now();
    
    return newComponent;
  }

  addConnection(planId, connection) {
    const plan = this.plans.get(planId);
    if (!plan) throw new Error(`Plan not found: ${planId}`);

    const connectionId = `conn_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    
    const newConnection = {
      id: connectionId,
      from: connection.from,
      to: connection.to,
      type: connection.type || "sync",
      protocol: connection.protocol || "http",
      description: connection.description || "",
      dataContract: connection.dataContract || null,
      reliability: connection.reliability || { retries: 3, timeout: 30000, circuitBreaker: true }
    };

    plan.connections.push(newConnection);
    plan.updatedAt = Date.now();
    
    return newConnection;
  }

  generateMermaidDiagram(planId, options = {}) {
    const plan = this.plans.get(planId);
    if (!plan) throw new Error(`Plan not found: ${planId}`);

    const diagramType = options.type || "flowchart";
    let mermaid = "";

    switch (diagramType) {
      case "flowchart":
        mermaid = this.generateFlowchart(plan);
        break;
      case "sequence":
        mermaid = this.generateSequenceDiagram(plan);
        break;
      case "class":
        mermaid = this.generateClassDiagram(plan);
        break;
      case "er":
        mermaid = this.generateERDiagram(plan);
        break;
      case "c4":
        mermaid = this.generateC4Diagram(plan);
        break;
      default:
        mermaid = this.generateFlowchart(plan);
    }

    const diagramId = `diag_${Date.now()}`;
    plan.diagrams.push({ id: diagramId, type: diagramType, mermaid, createdAt: Date.now() });
    
    return { diagramId, mermaid };
  }

  generateFlowchart(plan) {
    let code = `flowchart TB\n`;
    
    const typeStyles = {
      service: "rect",
      database: "cyl",
      queue: "rrect",
      cache: "stadium",
      gateway: "diamond",
      external: "drect"
    };

    for (const comp of plan.components) {
      const shape = typeStyles[comp.type] || "rect";
      const styleMap = {
        rect: `[${comp.name}]`,
        cyl: `[(${comp.name})]`,
        rrect: `[${comp.name}]`,
        stadium: `([${comp.name}])`,
        diamond: `{${comp.name}}`,
        drect: `[${comp.name}]:::external`
      };
      code += `    ${comp.id}${styleMap[shape]}\n`;
    }

    code += `\n`;
    
    for (const conn of plan.connections) {
      const arrow = conn.type === "async" ? "-.->|" : "-->|";
      const label = conn.description ? `|${conn.description}|` : "";
      code += `    ${conn.from} ${arrow}${label}${conn.to}\n`;
    }

    code += `\n`;
    code += `    classDef external stroke:#f66,stroke-width:2px\n`;
    
    return code;
  }

  generateSequenceDiagram(plan) {
    let code = `sequenceDiagram\n`;
    code += `    autonumber\n`;
    
    const participants = plan.components.filter(c => 
      c.type === "service" || c.type === "gateway" || c.type === "external"
    );
    
    for (const p of participants) {
      code += `    participant ${p.name.replace(/\s+/g, "")} as ${p.name}\n`;
    }

    const syncConnections = plan.connections.filter(c => c.type === "sync");
    for (const conn of syncConnections) {
      const fromComp = plan.components.find(c => c.id === conn.from);
      const toComp = plan.components.find(c => c.id === conn.to);
      if (fromComp && toComp) {
        code += `    ${fromComp.name.replace(/\s+/g, "")}->>+${toComp.name.replace(/\s+/g, "")}: ${conn.description || "Request"}\n`;
        code += `    ${toComp.name.replace(/\s+/g, "")}-->>-${fromComp.name.replace(/\s+/g, "")}: Response\n`;
      }
    }

    return code;
  }

  generateClassDiagram(plan) {
    let code = `classDiagram\n`;
    
    for (const comp of plan.components) {
      code += `    class ${comp.name.replace(/\s+/g, "")} {\n`;
      for (const resp of comp.responsibilities.slice(0, 5)) {
        code += `        +${resp}()\n`;
      }
      code += `    }\n`;
    }

    for (const conn of plan.connections) {
      const fromComp = plan.components.find(c => c.id === conn.from);
      const toComp = plan.components.find(c => c.id === conn.to);
      if (fromComp && toComp) {
        code += `    ${fromComp.name.replace(/\s+/g, "")} --> ${toComp.name.replace(/\s+/g, "")}\n`;
      }
    }

    return code;
  }

  generateERDiagram(plan) {
    let code = `erDiagram\n`;
    
    const dbComponents = plan.components.filter(c => 
      c.type === "database" || c.type === "storage"
    );
    
    for (const db of dbComponents) {
      code += `    ${db.name.replace(/\s+/g, "")} {\n`;
      code += `        string id PK\n`;
      code += `        datetime created_at\n`;
      code += `        datetime updated_at\n`;
      code += `    }\n`;
    }

    return code;
  }

  generateC4Diagram(plan) {
    let code = `C4Context\n`;
    code += `    title ${plan.name}\n\n`;
    
    code += `    Person(user, "User", "End user of the system")\n\n`;
    
    code += `    System_Boundary(system, "${plan.name}") {\n`;
    
    for (const comp of plan.components) {
      if (comp.type === "service") {
        code += `        Container(${comp.id}, "${comp.name}", "${comp.technology || "Service"}", "${comp.description}")\n`;
      }
    }
    
    code += `    }\n\n`;
    
    code += `    Rel(user, system, "Uses")\n`;
    
    return code;
  }

  generateAWSDiagram(plan) {
    return {
      nodes: plan.components.map(comp => ({
        id: comp.id,
        type: this.mapToAWSIcon(comp.type),
        label: comp.name,
        position: comp.position,
        config: comp.config
      })),
      edges: plan.connections.map(conn => ({
        from: conn.from,
        to: conn.to,
        label: conn.description,
        style: conn.type === "async" ? "dashed" : "solid"
      }))
    };
  }

  mapToAWSIcon(type) {
    const mapping = {
      service: "aws-ecs-task",
      database: "aws-rds",
      queue: "aws-sqs",
      cache: "aws-elasticache",
      gateway: "aws-api-gateway",
      storage: "aws-s3",
      lambda: "aws-lambda",
      container: "aws-ecs"
    };
    return mapping[type] || "aws-resource";
  }

  generateInfrastructureCode(planId, format = "terraform") {
    const plan = this.plans.get(planId);
    if (!plan) throw new Error(`Plan not found: ${planId}`);

    switch (format) {
      case "terraform":
        return this.generateTerraform(plan);
      case "kubernetes":
        return this.generateKubernetes(plan);
      case "docker-compose":
        return this.generateDockerCompose(plan);
      case "cloudformation":
        return this.generateCloudFormation(plan);
      default:
        return this.generateTerraform(plan);
    }
  }

  generateTerraform(plan) {
    let code = `# ${plan.name}\n`;
    code += `# Generated by OpenClaw Plus Architecture Planner\n\n`;
    
    code += `terraform {\n`;
    code += `  required_providers {\n`;
    code += `    aws = {\n`;
    code += `      source  = "hashicorp/aws"\n`;
    code += `      version = "~> 5.0"\n`;
    code += `    }\n`;
    code += `  }\n`;
    code += `}\n\n`;
    
    code += `provider "aws" {\n`;
    code += `  region = var.aws_region\n`;
    code += `}\n\n`;

    for (const comp of plan.components) {
      code += this.generateTerraformResource(comp);
    }

    return code;
  }

  generateTerraformResource(comp) {
    const templates = {
      service: `# ${comp.name}
module "${comp.name.toLowerCase().replace(/\s+/g, "_")}" {
  source = "./modules/ecs-service"
  name = "${comp.name}"
  cpu = ${comp.config.cpu || 256}
  memory = ${comp.config.memory || 512}
  desired_count = ${comp.scaling.min || 1}
}

`,
      database: `# ${comp.name}
module "${comp.name.toLowerCase().replace(/\s+/g, "_")}" {
  source = "./modules/rds"
  name = "${comp.name}"
  engine = "${comp.config.engine || "postgres"}"
  instance_class = "${comp.config.instanceClass || "db.t3.micro"}"
}

`,
      cache: `# ${comp.name}
module "${comp.name.toLowerCase().replace(/\s+/g, "_")}" {
  source = "./modules/elasticache"
  name = "${comp.name}"
  node_type = "${comp.config.nodeType || "cache.t3.micro"}"
}

`
    };

    return templates[comp.type] || `# ${comp.name}\n# TODO: Define resource for type: ${comp.type}\n\n`;
  }

  generateKubernetes(plan) {
    let code = `# ${plan.name}\n`;
    code += `# Kubernetes Manifests\n\n`;
    
    code += `---\n`;
    code += `apiVersion: v1\n`;
    code += `kind: Namespace\n`;
    code += `metadata:\n`;
    code += `  name: ${plan.name.toLowerCase().replace(/\s+/g, "-")}\n\n`;

    for (const comp of plan.components) {
      code += this.generateK8sDeployment(comp);
      code += this.generateK8sService(comp);
    }

    return code;
  }

  generateK8sDeployment(comp) {
    return `---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${comp.name.toLowerCase().replace(/\s+/g, "-")}
  namespace: ${comp.name.toLowerCase().replace(/\s+/g, "-")}
spec:
  replicas: ${comp.scaling.min || 1}
  selector:
    matchLabels:
      app: ${comp.name.toLowerCase().replace(/\s+/g, "-")}
  template:
    metadata:
      labels:
        app: ${comp.name.toLowerCase().replace(/\s+/g, "-")}
    spec:
      containers:
        - name: ${comp.name.toLowerCase().replace(/\s+/g, "-")}
          image: ${comp.config.image || "nginx:latest"}
          ports:
            - containerPort: ${comp.config.port || 8080}
          resources:
            requests:
              cpu: "${comp.config.cpu || "100m"}"
              memory: "${comp.config.memory || "128Mi"}"
            limits:
              cpu: "${comp.config.cpuLimit || "500m"}"
              memory: "${comp.config.memoryLimit || "512Mi"}"

`;
  }

  generateK8sService(comp) {
    return `---
apiVersion: v1
kind: Service
metadata:
  name: ${comp.name.toLowerCase().replace(/\s+/g, "-")}
  namespace: ${comp.name.toLowerCase().replace(/\s+/g, "-")}
spec:
  selector:
    app: ${comp.name.toLowerCase().replace(/\s+/g, "-")}
  ports:
    - port: ${comp.config.port || 80}
      targetPort: ${comp.config.targetPort || 8080}
  type: ClusterIP

`;
  }

  generateDockerCompose(plan) {
    let code = `# ${plan.name}\n`;
    code += `version: "3.8"\n\n`;
    code += `services:\n`;

    for (const comp of plan.components) {
      code += `  ${comp.name.toLowerCase().replace(/\s+/g, "-")}:\n`;
      code += `    image: ${comp.config.image || "nginx:latest"}\n`;
      code += `    ports:\n`;
      code += `      - "${comp.config.port || 8080}:${comp.config.targetPort || 8080}"\n`;
      code += `    environment:\n`;
      for (const [key, value] of Object.entries(comp.config.env || {})) {
        code += `      - ${key}=${value}\n`;
      }
      code += `    healthcheck:\n`;
      code += `      test: ["CMD", "curl", "-f", "http://localhost:${comp.config.targetPort || 8080}/health"]\n`;
      code += `      interval: 30s\n`;
      code += `      timeout: 10s\n`;
      code += `      retries: 3\n`;
      code += `\n`;
    }

    return code;
  }

  generateCloudFormation(plan) {
    let code = `AWSTemplateFormatVersion: '2010-09-09'\n`;
    code += `Description: ${plan.name}\n\n`;
    code += `Resources:\n`;

    for (const comp of plan.components) {
      const resourceName = comp.name.replace(/\s+/g, "");
      code += `  ${resourceName}:\n`;
      code += `    Type: AWS::ECS::Service\n`;
      code += `    Properties:\n`;
      code += `      ServiceName: ${comp.name}\n`;
      code += `      DesiredCount: ${comp.scaling.min || 1}\n`;
      code += `\n`;
    }

    return code;
  }

  getPlan(planId) {
    return this.plans.get(planId);
  }

  listPlans() {
    return Array.from(this.plans.values());
  }

  deletePlan(planId) {
    return this.plans.delete(planId);
  }

  exportPlan(planId) {
    const plan = this.plans.get(planId);
    if (!plan) return null;
    return JSON.stringify(plan, null, 2);
  }

  importPlan(json) {
    const plan = JSON.parse(json);
    plan.id = `plan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    plan.updatedAt = Date.now();
    this.plans.set(plan.id, plan);
    return plan;
  }
}

export const architecturePlanner = new ArchitecturePlanner();
