export const DATABASE_ADAPTERS = {
  postgresql: {
    id: "postgresql",
    name: "PostgreSQL",
    description: "PostgreSQL database - queries, schema, migrations",
    icon: "🐘",
    category: "database",
    authType: "connection_string",
    envVars: ["PG_CONNECTION_STRING", "PG_HOST", "PG_PORT", "PG_DATABASE", "PG_USER", "PG_PASSWORD"],
    operations: {
      query: {
        name: "Run Query",
        description: "Execute SQL query",
        inputs: { sql: { type: "textarea", label: "SQL Query", required: true } }
      },
      listTables: {
        name: "List Tables",
        description: "Get all tables in database",
        inputs: {}
      },
      describeTable: {
        name: "Describe Table",
        description: "Get table schema",
        inputs: { table: { type: "text", label: "Table Name", required: true } }
      },
      insert: {
        name: "Insert Row",
        description: "Insert data into table",
        inputs: { table: { type: "text", label: "Table", required: true }, data: { type: "json", label: "Data (JSON)", required: true } }
      },
      update: {
        name: "Update Rows",
        description: "Update data in table",
        inputs: { table: { type: "text", label: "Table", required: true }, data: { type: "json", label: "Data (JSON)" }, where: { type: "json", label: "Where (JSON)" } }
      },
      delete: {
        name: "Delete Rows",
        description: "Delete data from table",
        inputs: { table: { type: "text", label: "Table", required: true }, where: { type: "json", label: "Where (JSON)" } }
      },
      exportCsv: {
        name: "Export to CSV",
        description: "Export query results as CSV",
        inputs: { sql: { type: "textarea", label: "SQL Query" } }
      }
    },
    async connect() {
      const { Pool } = await import("pg");
      const pool = new Pool({ connectionString: process.env.PG_CONNECTION_STRING });
      return pool;
    },
    async query(sql) {
      const pool = await this.connect();
      const result = await pool.query(sql);
      return { rows: result.rows, rowCount: result.rowCount };
    }
  },

  mysql: {
    id: "mysql",
    name: "MySQL",
    description: "MySQL/MariaDB database operations",
    icon: "🐬",
    category: "database",
    authType: "connection_string",
    envVars: ["MYSQL_CONNECTION_STRING", "MYSQL_HOST", "MYSQL_PORT", "MYSQL_DATABASE", "MYSQL_USER", "MYSQL_PASSWORD"],
    operations: {
      query: { name: "Run Query", inputs: { sql: { type: "textarea", required: true } } },
      listTables: { name: "List Tables", inputs: {} },
      describeTable: { name: "Describe Table", inputs: { table: { type: "text", required: true } } },
      insert: { name: "Insert Row", inputs: { table: { type: "text" }, data: { type: "json" } } },
      update: { name: "Update Rows", inputs: { table: { type: "text" }, data: { type: "json" }, where: { type: "json" } } },
      delete: { name: "Delete Rows", inputs: { table: { type: "text" }, where: { type: "json" } } }
    }
  },

  mongodb: {
    id: "mongodb",
    name: "MongoDB",
    description: "MongoDB document database - collections, documents, aggregations",
    icon: "🍃",
    category: "database",
    authType: "connection_string",
    envVars: ["MONGODB_URI", "MONGODB_HOST", "MONGODB_PORT", "MONGODB_DATABASE", "MONGODB_USER", "MONGODB_PASSWORD"],
    operations: {
      find: {
        name: "Find Documents",
        description: "Query documents in collection",
        inputs: { collection: { type: "text", label: "Collection", required: true }, filter: { type: "json", label: "Filter (JSON)" }, limit: { type: "number", label: "Limit" } }
      },
      findOne: {
        name: "Find One",
        description: "Find single document",
        inputs: { collection: { type: "text", required: true }, filter: { type: "json" } }
      },
      insertOne: {
        name: "Insert Document",
        description: "Insert single document",
        inputs: { collection: { type: "text", required: true }, document: { type: "json", required: true } }
      },
      insertMany: {
        name: "Insert Many",
        description: "Insert multiple documents",
        inputs: { collection: { type: "text", required: true }, documents: { type: "json", required: true } }
      },
      updateOne: {
        name: "Update One",
        description: "Update single document",
        inputs: { collection: { type: "text", required: true }, filter: { type: "json" }, update: { type: "json", required: true } }
      },
      updateMany: {
        name: "Update Many",
        description: "Update multiple documents",
        inputs: { collection: { type: "text", required: true }, filter: { type: "json" }, update: { type: "json", required: true } }
      },
      deleteOne: {
        name: "Delete One",
        description: "Delete single document",
        inputs: { collection: { type: "text", required: true }, filter: { type: "json", required: true } }
      },
      deleteMany: {
        name: "Delete Many",
        description: "Delete multiple documents",
        inputs: { collection: { type: "text", required: true }, filter: { type: "json", required: true } }
      },
      aggregate: {
        name: "Aggregate",
        description: "Run aggregation pipeline",
        inputs: { collection: { type: "text", required: true }, pipeline: { type: "json", required: true } }
      },
      listCollections: {
        name: "List Collections",
        description: "Get all collections",
        inputs: {}
      },
      createIndex: {
        name: "Create Index",
        description: "Create database index",
        inputs: { collection: { type: "text", required: true }, keys: { type: "json", required: true }, options: { type: "json" } }
      }
    }
  },

  dynamodb: {
    id: "dynamodb",
    name: "AWS DynamoDB",
    description: "Amazon DynamoDB NoSQL database",
    icon: "📊",
    category: "database",
    authType: "aws",
    envVars: ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION"],
    operations: {
      getItem: {
        name: "Get Item",
        description: "Retrieve item by key",
        inputs: { table: { type: "text", required: true }, key: { type: "json", required: true } }
      },
      putItem: {
        name: "Put Item",
        description: "Create or replace item",
        inputs: { table: { type: "text", required: true }, item: { type: "json", required: true } }
      },
      updateItem: {
        name: "Update Item",
        description: "Update item attributes",
        inputs: { table: { type: "text", required: true }, key: { type: "json", required: true }, updates: { type: "json", required: true } }
      },
      deleteItem: {
        name: "Delete Item",
        description: "Delete item by key",
        inputs: { table: { type: "text", required: true }, key: { type: "json", required: true } }
      },
      query: {
        name: "Query",
        description: "Query items by partition key",
        inputs: { table: { type: "text", required: true }, keyCondition: { type: "json", required: true }, filter: { type: "json" } }
      },
      scan: {
        name: "Scan",
        description: "Scan all items in table",
        inputs: { table: { type: "text", required: true }, filter: { type: "json" }, limit: { type: "number" } }
      },
      batchWrite: {
        name: "Batch Write",
        description: "Write multiple items",
        inputs: { table: { type: "text", required: true }, items: { type: "json", required: true } }
      },
      listTables: {
        name: "List Tables",
        description: "Get all tables",
        inputs: {}
      },
      describeTable: {
        name: "Describe Table",
        description: "Get table schema",
        inputs: { table: { type: "text", required: true } }
      }
    }
  },

  redis: {
    id: "redis",
    name: "Redis",
    description: "Redis in-memory data store, cache, pub/sub",
    icon: "🔴",
    category: "database",
    authType: "connection_string",
    envVars: ["REDIS_URL", "REDIS_HOST", "REDIS_PORT", "REDIS_PASSWORD"],
    operations: {
      get: { name: "Get Value", inputs: { key: { type: "text", required: true } } },
      set: { name: "Set Value", inputs: { key: { type: "text", required: true }, value: { type: "text", required: true }, ttl: { type: "number" } } },
      del: { name: "Delete Key", inputs: { key: { type: "text", required: true } } },
      incr: { name: "Increment", inputs: { key: { type: "text", required: true } } },
      decr: { name: "Decrement", inputs: { key: { type: "text", required: true } } },
      hget: { name: "Hash Get", inputs: { key: { type: "text", required: true }, field: { type: "text", required: true } } },
      hset: { name: "Hash Set", inputs: { key: { type: "text", required: true }, field: { type: "text", required: true }, value: { type: "text", required: true } } },
      lpush: { name: "List Push Left", inputs: { key: { type: "text", required: true }, value: { type: "text", required: true } } },
      rpush: { name: "List Push Right", inputs: { key: { type: "text", required: true }, value: { type: "text", required: true } } },
      lrange: { name: "List Range", inputs: { key: { type: "text", required: true }, start: { type: "number" }, stop: { type: "number" } } },
      keys: { name: "List Keys", inputs: { pattern: { type: "text" } } },
      publish: { name: "Publish Message", inputs: { channel: { type: "text", required: true }, message: { type: "text", required: true } } }
    }
  },

  elasticsearch: {
    id: "elasticsearch",
    name: "Elasticsearch",
    description: "Elasticsearch search and analytics engine",
    icon: "🔍",
    category: "database",
    authType: "basic",
    envVars: ["ELASTICSEARCH_URL", "ELASTICSEARCH_USER", "ELASTICSEARCH_PASSWORD"],
    operations: {
      search: { name: "Search", inputs: { index: { type: "text", required: true }, query: { type: "json", required: true } } },
      index: { name: "Index Document", inputs: { index: { type: "text", required: true }, id: { type: "text" }, document: { type: "json", required: true } } },
      get: { name: "Get Document", inputs: { index: { type: "text", required: true }, id: { type: "text", required: true } } },
      update: { name: "Update Document", inputs: { index: { type: "text", required: true }, id: { type: "text", required: true }, doc: { type: "json", required: true } } },
      delete: { name: "Delete Document", inputs: { index: { type: "text", required: true }, id: { type: "text", required: true } } },
      bulk: { name: "Bulk Operations", inputs: { operations: { type: "json", required: true } } },
      createIndex: { name: "Create Index", inputs: { index: { type: "text", required: true }, mappings: { type: "json" } } },
      deleteIndex: { name: "Delete Index", inputs: { index: { type: "text", required: true } } },
      listIndices: { name: "List Indices", inputs: {} }
    }
  },

  sqlite: {
    id: "sqlite",
    name: "SQLite",
    description: "SQLite file-based database",
    icon: "📁",
    category: "database",
    authType: "file",
    envVars: ["SQLITE_PATH"],
    operations: {
      query: { name: "Run Query", inputs: { sql: { type: "textarea", required: true } } },
      listTables: { name: "List Tables", inputs: {} },
      describeTable: { name: "Describe Table", inputs: { table: { type: "text", required: true } } }
    }
  },

  cassandra: {
    id: "cassandra",
    name: "Apache Cassandra",
    description: "Cassandra distributed database",
    icon: "👁️",
    category: "database",
    authType: "connection",
    envVars: ["CASSANDRA_HOSTS", "CASSANDRA_KEYSPACE", "CASSANDRA_USER", "CASSANDRA_PASSWORD"],
    operations: {
      query: { name: "Run CQL Query", inputs: { cql: { type: "textarea", required: true } } },
      listTables: { name: "List Tables", inputs: {} },
      insert: { name: "Insert Row", inputs: { table: { type: "text" }, data: { type: "json" } } }
    }
  },

  neo4j: {
    id: "neo4j",
    name: "Neo4j",
    description: "Neo4j graph database",
    icon: "🕸️",
    category: "database",
    authType: "basic",
    envVars: ["NEO4J_URI", "NEO4J_USER", "NEO4J_PASSWORD"],
    operations: {
      runCypher: { name: "Run Cypher", inputs: { query: { type: "textarea", required: true }, params: { type: "json" } } },
      createNode: { name: "Create Node", inputs: { label: { type: "text", required: true }, properties: { type: "json" } } },
      createRelationship: { name: "Create Relationship", inputs: { from: { type: "number" }, to: { type: "number" }, type: { type: "text" }, properties: { type: "json" } } },
      findNodes: { name: "Find Nodes", inputs: { label: { type: "text" }, where: { type: "text" } } }
    }
  }
};

export const STORAGE_ADAPTERS = {
  s3: {
    id: "s3",
    name: "AWS S3",
    description: "Amazon Simple Storage Service - files, buckets, objects",
    icon: "🪣",
    category: "storage",
    authType: "aws",
    envVars: ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION"],
    operations: {
      listBuckets: {
        name: "List Buckets",
        description: "Get all S3 buckets",
        inputs: {}
      },
      createBucket: {
        name: "Create Bucket",
        description: "Create new S3 bucket",
        inputs: { bucket: { type: "text", label: "Bucket Name", required: true }, region: { type: "text", label: "Region" } }
      },
      deleteBucket: {
        name: "Delete Bucket",
        description: "Delete S3 bucket",
        inputs: { bucket: { type: "text", required: true } }
      },
      listObjects: {
        name: "List Objects",
        description: "List files in bucket",
        inputs: { bucket: { type: "text", required: true }, prefix: { type: "text", label: "Folder Prefix" }, limit: { type: "number" } }
      },
      upload: {
        name: "Upload File",
        description: "Upload file to S3",
        inputs: { bucket: { type: "text", required: true }, key: { type: "text", label: "File Path", required: true }, body: { type: "file", required: true }, contentType: { type: "text" } }
      },
      download: {
        name: "Download File",
        description: "Download file from S3",
        inputs: { bucket: { type: "text", required: true }, key: { type: "text", label: "File Path", required: true } }
      },
      delete: {
        name: "Delete File",
        description: "Delete file from S3",
        inputs: { bucket: { type: "text", required: true }, key: { type: "text", required: true } }
      },
      copy: {
        name: "Copy File",
        description: "Copy file between locations",
        inputs: { sourceBucket: { type: "text", required: true }, sourceKey: { type: "text", required: true }, destBucket: { type: "text", required: true }, destKey: { type: "text", required: true } }
      },
      getSignedUrl: {
        name: "Get Signed URL",
        description: "Generate presigned URL for file",
        inputs: { bucket: { type: "text", required: true }, key: { type: "text", required: true }, expiresIn: { type: "number", label: "Expires (seconds)" } }
      },
      setBucketPolicy: {
        name: "Set Bucket Policy",
        description: "Configure bucket access policy",
        inputs: { bucket: { type: "text", required: true }, policy: { type: "json", required: true } }
      },
      enableStaticHosting: {
        name: "Enable Static Hosting",
        description: "Configure bucket for static website",
        inputs: { bucket: { type: "text", required: true }, indexDocument: { type: "text", label: "Index File" }, errorDocument: { type: "text", label: "Error File" } }
      }
    }
  },

  gcs: {
    id: "gcs",
    name: "Google Cloud Storage",
    description: "GCP object storage",
    icon: "☁️",
    category: "storage",
    authType: "gcp",
    envVars: ["GOOGLE_APPLICATION_CREDENTIALS", "GCP_PROJECT_ID"],
    operations: {
      listBuckets: { name: "List Buckets", inputs: {} },
      createBucket: { name: "Create Bucket", inputs: { bucket: { type: "text", required: true }, location: { type: "text" } } },
      listObjects: { name: "List Objects", inputs: { bucket: { type: "text", required: true }, prefix: { type: "text" } } },
      upload: { name: "Upload File", inputs: { bucket: { type: "text", required: true }, name: { type: "text", required: true }, data: { type: "file", required: true } } },
      download: { name: "Download File", inputs: { bucket: { type: "text", required: true }, name: { type: "text", required: true } } },
      delete: { name: "Delete File", inputs: { bucket: { type: "text", required: true }, name: { type: "text", required: true } } },
      getSignedUrl: { name: "Get Signed URL", inputs: { bucket: { type: "text", required: true }, name: { type: "text", required: true } } }
    }
  },

  azure_blob: {
    id: "azure_blob",
    name: "Azure Blob Storage",
    description: "Microsoft Azure object storage",
    icon: "📦",
    category: "storage",
    authType: "azure",
    envVars: ["AZURE_STORAGE_CONNECTION_STRING", "AZURE_STORAGE_ACCOUNT", "AZURE_STORAGE_KEY"],
    operations: {
      listContainers: { name: "List Containers", inputs: {} },
      createContainer: { name: "Create Container", inputs: { container: { type: "text", required: true } } },
      listBlobs: { name: "List Blobs", inputs: { container: { type: "text", required: true } } },
      upload: { name: "Upload Blob", inputs: { container: { type: "text", required: true }, name: { type: "text", required: true }, data: { type: "file", required: true } } },
      download: { name: "Download Blob", inputs: { container: { type: "text", required: true }, name: { type: "text", required: true } } },
      delete: { name: "Delete Blob", inputs: { container: { type: "text", required: true }, name: { type: "text", required: true } } }
    }
  },

  minio: {
    id: "minio",
    name: "MinIO",
    description: "Self-hosted S3-compatible object storage",
    icon: "🗄️",
    category: "storage",
    authType: "s3-compatible",
    envVars: ["MINIO_ENDPOINT", "MINIO_ACCESS_KEY", "MINIO_SECRET_KEY", "MINIO_USE_SSL"],
    operations: {
      listBuckets: { name: "List Buckets", inputs: {} },
      makeBucket: { name: "Create Bucket", inputs: { bucket: { type: "text", required: true } } },
      listObjects: { name: "List Objects", inputs: { bucket: { type: "text", required: true }, prefix: { type: "text" } } },
      putObject: { name: "Upload Object", inputs: { bucket: { type: "text", required: true }, name: { type: "text", required: true }, data: { type: "file", required: true } } },
      getObject: { name: "Download Object", inputs: { bucket: { type: "text", required: true }, name: { type: "text", required: true } } },
      removeObject: { name: "Delete Object", inputs: { bucket: { type: "text", required: true }, name: { type: "text", required: true } } },
      presignedUrl: { name: "Get Presigned URL", inputs: { bucket: { type: "text", required: true }, name: { type: "text", required: true }, expiry: { type: "number" } } }
    }
  },

  backblaze: {
    id: "backblaze",
    name: "Backblaze B2",
    description: "Backblaze B2 cloud storage",
    icon: "💾",
    category: "storage",
    authType: "apikey",
    envVars: ["BACKBLAZE_KEY_ID", "BACKBLAZE_KEY", "BACKBLAZE_BUCKET_ID"],
    operations: {
      listBuckets: { name: "List Buckets", inputs: {} },
      listFiles: { name: "List Files", inputs: { bucketId: { type: "text", required: true } } },
      upload: { name: "Upload File", inputs: { bucketId: { type: "text", required: true }, fileName: { type: "text", required: true }, data: { type: "file", required: true } } },
      download: { name: "Download File", inputs: { bucketName: { type: "text", required: true }, fileName: { type: "text", required: true } } },
      delete: { name: "Delete File", inputs: { fileName: { type: "text", required: true }, fileId: { type: "text", required: true } } }
    }
  },

  cloudflare_r2: {
    id: "cloudflare_r2",
    name: "Cloudflare R2",
    description: "Cloudflare R2 S3-compatible storage (no egress fees)",
    icon: "🍊",
    category: "storage",
    authType: "s3-compatible",
    envVars: ["R2_ACCOUNT_ID", "R2_ACCESS_KEY", "R2_SECRET_KEY"],
    operations: {
      listBuckets: { name: "List Buckets", inputs: {} },
      listObjects: { name: "List Objects", inputs: { bucket: { type: "text", required: true } } },
      upload: { name: "Upload Object", inputs: { bucket: { type: "text", required: true }, key: { type: "text", required: true }, data: { type: "file", required: true } } },
      download: { name: "Download Object", inputs: { bucket: { type: "text", required: true }, key: { type: "text", required: true } } },
      delete: { name: "Delete Object", inputs: { bucket: { type: "text", required: true }, key: { type: "text", required: true } } }
    }
  }
};

export const CLOUD_PROVIDER_ADAPTERS = {
  aws: {
    id: "aws",
    name: "AWS",
    description: "Amazon Web Services - EC2, Lambda, RDS, ECS, and more",
    icon: "☁️",
    category: "cloud",
    authType: "aws",
    envVars: ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION"],
    services: {
      ec2: {
        name: "EC2",
        operations: ["listInstances", "startInstance", "stopInstance", "rebootInstance", "createInstance", "terminateInstance", "getInstanceDetails"]
      },
      lambda: {
        name: "Lambda",
        operations: ["listFunctions", "invokeFunction", "createFunction", "updateFunction", "deleteFunction", "getFunctionLogs"]
      },
      rds: {
        name: "RDS",
        operations: ["listInstances", "createInstance", "deleteInstance", "createSnapshot", "restoreSnapshot"]
      },
      ecs: {
        name: "ECS/Fargate",
        operations: ["listClusters", "listServices", "listTasks", "runTask", "updateService", "listContainerInstances"]
      },
      eks: {
        name: "EKS",
        operations: ["listClusters", "createCluster", "deleteCluster", "listNodegroups"]
      },
      cloudformation: {
        name: "CloudFormation",
        operations: ["listStacks", "createStack", "deleteStack", "describeStack", "listStackResources"]
      },
      iam: {
        name: "IAM",
        operations: ["listUsers", "listRoles", "listPolicies", "createUser", "createRole", "attachPolicy"]
      },
      cloudwatch: {
        name: "CloudWatch",
        operations: ["listMetrics", "getMetricData", "listAlarms", "putMetric", "createAlarm"]
      },
      sqs: {
        name: "SQS",
        operations: ["listQueues", "sendMessage", "receiveMessage", "deleteMessage", "createQueue"]
      },
      sns: {
        name: "SNS",
        operations: ["listTopics", "publish", "createTopic", "subscribe", "listSubscriptions"]
      },
      eventbridge: {
        name: "EventBridge",
        operations: ["listRules", "putRule", "putTargets", "deleteRule"]
      },
      secretsmanager: {
        name: "Secrets Manager",
        operations: ["listSecrets", "getSecret", "createSecret", "updateSecret", "deleteSecret"]
      },
      parameter_store: {
        name: "Parameter Store",
        operations: ["getParameter", "putParameter", "deleteParameter", "listParameters"]
      },
      apigateway: {
        name: "API Gateway",
        operations: ["listApis", "createApi", "deleteApi", "getRoutes", "createDeployment"]
      }
    }
  },

  gcp: {
    id: "gcp",
    name: "Google Cloud",
    description: "Google Cloud Platform - Compute, Cloud Functions, GKE, BigQuery",
    icon: "🌐",
    category: "cloud",
    authType: "gcp",
    envVars: ["GOOGLE_APPLICATION_CREDENTIALS", "GCP_PROJECT_ID"],
    services: {
      compute: {
        name: "Compute Engine",
        operations: ["listInstances", "startInstance", "stopInstance", "createInstance", "deleteInstance"]
      },
      cloudfunctions: {
        name: "Cloud Functions",
        operations: ["listFunctions", "invokeFunction", "createFunction", "deleteFunction"]
      },
      run: {
        name: "Cloud Run",
        operations: ["listServices", "deployService", "deleteService", "getServiceUrl"]
      },
      gke: {
        name: "GKE",
        operations: ["listClusters", "createCluster", "deleteCluster", "getNodePools"]
      },
      bigquery: {
        name: "BigQuery",
        operations: ["listDatasets", "listTables", "query", "createTable", "loadData"]
      },
      pubsub: {
        name: "Pub/Sub",
        operations: ["listTopics", "publish", "createSubscription", "pull"]
      },
      cloudsql: {
        name: "Cloud SQL",
        operations: ["listInstances", "createInstance", "deleteInstance"]
      },
      firestore: {
        name: "Firestore",
        operations: ["getDocument", "setDocument", "deleteDocument", "query"]
      }
    }
  },

  azure: {
    id: "azure",
    name: "Microsoft Azure",
    description: "Azure cloud services - VMs, Functions, AKS, SQL Database",
    icon: "🔵",
    category: "cloud",
    authType: "azure",
    envVars: ["AZURE_CLIENT_ID", "AZURE_CLIENT_SECRET", "AZURE_TENANT_ID", "AZURE_SUBSCRIPTION_ID"],
    services: {
      vm: {
        name: "Virtual Machines",
        operations: ["listVMs", "startVM", "stopVM", "restartVM", "createVM", "deleteVM"]
      },
      functions: {
        name: "Azure Functions",
        operations: ["listFunctions", "invokeFunction", "createFunction", "deleteFunction"]
      },
      aks: {
        name: "AKS",
        operations: ["listClusters", "createCluster", "deleteCluster", "getCredentials"]
      },
      sqldb: {
        name: "SQL Database",
        operations: ["listServers", "listDatabases", "createDatabase", "executeQuery"]
      },
      cosmosdb: {
        name: "Cosmos DB",
        operations: ["listAccounts", "listDatabases", "listContainers", "queryItems"]
      },
      appservice: {
        name: "App Service",
        operations: ["listApps", "createApp", "deploy", "restart", "getLogs"]
      },
      storage: {
        name: "Storage",
        operations: ["listAccounts", "createContainer", "uploadBlob", "downloadBlob"]
      }
    }
  },

  alibaba: {
    id: "alibaba",
    name: "Alibaba Cloud",
    description: "Alibaba Cloud / Aliyun - ECS, OSS, RDS",
    icon: "🟠",
    category: "cloud",
    authType: "apikey",
    envVars: ["ALIBABA_ACCESS_KEY", "ALIBABA_SECRET_KEY", "ALIBABA_REGION"],
    services: {
      ecs: { name: "ECS", operations: ["listInstances", "startInstance", "stopInstance", "createInstance"] },
      oss: { name: "OSS", operations: ["listBuckets", "listObjects", "upload", "download"] },
      rds: { name: "RDS", operations: ["listInstances", "createInstance"] },
      slb: { name: "SLB", operations: ["listLoadBalancers", "createLoadBalancer"] }
    }
  },

  hetzner: {
    id: "hetzner",
    name: "Hetzner Cloud",
    description: "Hetzner Cloud - affordable VPS and dedicated servers",
    icon: "🇩🇪",
    category: "cloud",
    authType: "apikey",
    envVars: ["HETZNER_API_TOKEN"],
    services: {
      server: {
        name: "Servers",
        operations: ["listServers", "createServer", "deleteServer", "powerOn", "powerOff", "reboot", "rebuild"]
      },
      floating_ip: {
        name: "Floating IPs",
        operations: ["listFloatingIPs", "createFloatingIP", "assignFloatingIP"]
      },
      volume: {
        name: "Volumes",
        operations: ["listVolumes", "createVolume", "attachVolume", "deleteVolume"]
      },
      network: {
        name: "Networks",
        operations: ["listNetworks", "createNetwork", "deleteNetwork"]
      },
      load_balancer: {
        name: "Load Balancers",
        operations: ["listLoadBalancers", "createLoadBalancer", "deleteLoadBalancer"]
      }
    }
  },

  digitalocean: {
    id: "digitalocean",
    name: "DigitalOcean",
    description: "DigitalOcean - Droplets, Spaces, Kubernetes",
    icon: "🌊",
    category: "cloud",
    authType: "apikey",
    envVars: ["DIGITALOCEAN_TOKEN"],
    services: {
      droplet: { name: "Droplets", operations: ["list", "create", "delete", "powerOn", "powerOff", "reboot", "resize"] },
      spaces: { name: "Spaces", operations: ["listBuckets", "upload", "download", "delete"] },
      kubernetes: { name: "Kubernetes", operations: ["listClusters", "createCluster", "deleteCluster"] },
      database: { name: "Databases", operations: ["list", "create", "delete"] },
      loadbalancer: { name: "Load Balancers", operations: ["list", "create", "delete"] }
    }
  },

  vultr: {
    id: "vultr",
    name: "Vultr",
    description: "Vultr cloud compute and storage",
    icon: "🔷",
    category: "cloud",
    authType: "apikey",
    envVars: ["VULTR_API_KEY"],
    services: {
      instance: { name: "Instances", operations: ["list", "create", "delete", "start", "stop", "reboot"] },
      block_storage: { name: "Block Storage", operations: ["list", "create", "delete", "attach"] },
      object_storage: { name: "Object Storage", operations: ["list", "create", "delete"] }
    }
  },

  linode: {
    id: "linode",
    name: "Linode/Akamai",
    description: "Linode cloud computing",
    icon: "🟢",
    category: "cloud",
    authType: "apikey",
    envVars: ["LINODE_TOKEN"],
    services: {
      linode: { name: "Linodes", operations: ["list", "create", "delete", "boot", "shutdown", "reboot"] },
      volume: { name: "Volumes", operations: ["list", "create", "delete", "attach"] },
      nodebalancer: { name: "NodeBalancers", operations: ["list", "create", "delete"] }
    }
  },

  oracle: {
    id: "oracle",
    name: "Oracle Cloud",
    description: "Oracle Cloud Infrastructure",
    icon: "🔴",
    category: "cloud",
    authType: "oracle",
    envVars: ["OCI_TENANCY", "OCI_USER", "OCI_FINGERPRINT", "OCI_PRIVATE_KEY", "OCI_REGION"],
    services: {
      compute: { name: "Compute", operations: ["listInstances", "launchInstance", "terminateInstance"] },
      object_storage: { name: "Object Storage", operations: ["listBuckets", "upload", "download"] }
    }
  }
};

export const AI_RUNTIME_ADAPTERS = {
  ollama: {
    id: "ollama",
    name: "Ollama",
    description: "Local LLM inference with Ollama",
    icon: "🦙",
    category: "ai_runtime",
    authType: "none",
    envVars: ["OLLAMA_HOST"],
    defaultHost: "http://localhost:11434",
    operations: {
      listModels: {
        name: "List Models",
        description: "Get all downloaded models",
        inputs: {}
      },
      pullModel: {
        name: "Pull Model",
        description: "Download a model",
        inputs: { model: { type: "text", label: "Model Name", required: true, placeholder: "llama3.2, mistral, codellama" } }
      },
      generate: {
        name: "Generate",
        description: "Generate text completion",
        inputs: { 
          model: { type: "text", required: true, label: "Model" }, 
          prompt: { type: "textarea", required: true, label: "Prompt" },
          stream: { type: "boolean", label: "Stream Response" }
        }
      },
      chat: {
        name: "Chat",
        description: "Chat with model",
        inputs: { 
          model: { type: "text", required: true }, 
          messages: { type: "json", required: true, label: "Messages Array" },
          stream: { type: "boolean" }
        }
      },
      embeddings: {
        name: "Embeddings",
        description: "Generate embeddings",
        inputs: { model: { type: "text", required: true }, prompt: { type: "text", required: true } }
      },
      deleteModel: {
        name: "Delete Model",
        description: "Remove a model",
        inputs: { model: { type: "text", required: true } }
      },
      showModel: {
        name: "Model Info",
        description: "Get model details",
        inputs: { model: { type: "text", required: true } }
      },
      ps: {
        name: "Running Models",
        description: "List currently loaded models",
        inputs: {}
      }
    }
  },

  vllm: {
    id: "vllm",
    name: "vLLM",
    description: "High-performance LLM inference server",
    icon: "⚡",
    category: "ai_runtime",
    authType: "apikey",
    envVars: ["VLLM_API_URL", "VLLM_API_KEY"],
    operations: {
      generate: { name: "Generate", inputs: { prompt: { type: "textarea", required: true }, max_tokens: { type: "number" }, temperature: { type: "number" } } },
      chat: { name: "Chat", inputs: { messages: { type: "json", required: true }, max_tokens: { type: "number" } } },
      embeddings: { name: "Embeddings", inputs: { input: { type: "text", required: true } } },
      listModels: { name: "List Models", inputs: {} }
    }
  },

  llamastack: {
    id: "llamastack",
    name: "Llama Stack",
    description: "Meta's Llama Stack for Llama models",
    icon: "🦙",
    category: "ai_runtime",
    authType: "apikey",
    envVars: ["LLAMASTACK_URL", "LLAMASTACK_API_KEY"],
    operations: {
      inference: { name: "Run Inference", inputs: { model: { type: "text", required: true }, messages: { type: "json", required: true } } },
      embeddings: { name: "Embeddings", inputs: { model: { type: "text", required: true }, text: { type: "text", required: true } } },
      listModels: { name: "List Models", inputs: {} }
    }
  },

  lmstudio: {
    id: "lmstudio",
    name: "LM Studio",
    description: "LM Studio local server (OpenAI-compatible)",
    icon: "🎬",
    category: "ai_runtime",
    authType: "none",
    envVars: ["LMSTUDIO_URL"],
    defaultHost: "http://localhost:1234",
    operations: {
      chat: { name: "Chat", inputs: { messages: { type: "json", required: true }, model: { type: "text" } } },
      generate: { name: "Generate", inputs: { prompt: { type: "textarea", required: true }, max_tokens: { type: "number" } } },
      embeddings: { name: "Embeddings", inputs: { input: { type: "text", required: true } } },
      listModels: { name: "List Models", inputs: {} }
    }
  },

  localai: {
    id: "localai",
    name: "LocalAI",
    description: "Self-hosted OpenAI-compatible API",
    icon: "🤖",
    category: "ai_runtime",
    authType: "apikey",
    envVars: ["LOCALAI_URL", "LOCALAI_API_KEY"],
    defaultHost: "http://localhost:8080",
    operations: {
      chat: { name: "Chat", inputs: { model: { type: "text", required: true }, messages: { type: "json", required: true } } },
      generate: { name: "Generate", inputs: { model: { type: "text", required: true }, prompt: { type: "textarea", required: true } } },
      embeddings: { name: "Embeddings", inputs: { model: { type: "text", required: true }, input: { type: "text", required: true } } },
      transcribe: { name: "Transcribe Audio", inputs: { model: { type: "text" }, file: { type: "file", required: true } } },
      generateImage: { name: "Generate Image", inputs: { prompt: { type: "text", required: true }, size: { type: "text" } } },
      listModels: { name: "List Models", inputs: {} }
    }
  },

  textgenwebui: {
    id: "textgenwebui",
    name: "Text Generation WebUI",
    description: "Oobabooga Text Generation WebUI API",
    icon: "💬",
    category: "ai_runtime",
    authType: "none",
    envVars: ["TEXTGEN_URL"],
    defaultHost: "http://localhost:7860",
    operations: {
      generate: { name: "Generate", inputs: { prompt: { type: "textarea", required: true }, max_new_tokens: { type: "number" }, temperature: { type: "number" } } },
      chat: { name: "Chat", inputs: { text: { type: "textarea", required: true }, history: { type: "json" } } },
      listModels: { name: "List Models", inputs: {} },
      loadModel: { name: "Load Model", inputs: { model: { type: "text", required: true } } }
    }
  },

  infinity: {
    id: "infinity",
    name: "Infinity",
    description: "Embeddings inference server",
    icon: "♾️",
    category: "ai_runtime",
    authType: "none",
    envVars: ["INFINITY_URL"],
    defaultHost: "http://localhost:7997",
    operations: {
      embed: { name: "Embed Text", inputs: { sentences: { type: "json", required: true }, model: { type: "text" } } },
      rerank: { name: "Rerank", inputs: { query: { type: "text", required: true }, documents: { type: "json", required: true } } },
      listModels: { name: "List Models", inputs: {} }
    }
  },

  tensorrtllm: {
    id: "tensorrtllm",
    name: "TensorRT-LLM",
    description: "NVIDIA TensorRT-LLM inference",
    icon: "🟢",
    category: "ai_runtime",
    authType: "none",
    envVars: ["TENSORRT_LLM_URL"],
    operations: {
      generate: { name: "Generate", inputs: { prompt: { type: "textarea", required: true }, max_tokens: { type: "number" } } },
      streamGenerate: { name: "Stream Generate", inputs: { prompt: { type: "textarea", required: true } } }
    }
  }
};

export const GPU_ADAPTERS = {
  nvidia_cuda: {
    id: "nvidia_cuda",
    name: "NVIDIA CUDA",
    description: "NVIDIA GPU monitoring and management",
    icon: "🟢",
    category: "gpu",
    envVars: [],
    operations: {
      info: { name: "GPU Info", description: "Get GPU information", inputs: {} },
      utilization: { name: "Utilization", description: "GPU utilization stats", inputs: {} },
      memory: { name: "Memory Usage", description: "GPU memory usage", inputs: {} },
      temperature: { name: "Temperature", description: "GPU temperature", inputs: {} },
      power: { name: "Power Usage", description: "Power consumption", inputs: {} },
      processes: { name: "Processes", description: "GPU processes", inputs: {} },
      setPowerLimit: { name: "Set Power Limit", inputs: { limit: { type: "number", required: true } } },
      setClocks: { name: "Set Clock Speeds", inputs: { gpuClock: { type: "number" }, memClock: { type: "number" } } }
    }
  },

  amd_rocm: {
    id: "amd_rocm",
    name: "AMD ROCm",
    description: "AMD ROCm GPU platform",
    icon: "🔴",
    category: "gpu",
    envVars: [],
    operations: {
      info: { name: "GPU Info", inputs: {} },
      list: { name: "List GPUs", inputs: {} },
      utilization: { name: "Utilization", inputs: {} },
      memory: { name: "Memory Usage", inputs: {} },
      temperature: { name: "Temperature", inputs: {} },
      power: { name: "Power", inputs: {} }
    }
  },

  intel_arc: {
    id: "intel_arc",
    name: "Intel Arc/oneAPI",
    description: "Intel Arc GPU and oneAPI",
    icon: "🔵",
    category: "gpu",
    envVars: [],
    operations: {
      info: { name: "GPU Info", inputs: {} },
      devices: { name: "List Devices", inputs: {} },
      memory: { name: "Memory Stats", inputs: {} }
    }
  },

  apple_metal: {
    id: "apple_metal",
    name: "Apple Metal",
    description: "Apple Metal GPU framework (M-series)",
    icon: "🍎",
    category: "gpu",
    envVars: [],
    operations: {
      info: { name: "GPU Info", inputs: {} },
      devices: { name: "List Devices", inputs: {} }
    }
  },

  directml: {
    id: "directml",
    name: "DirectML",
    description: "Microsoft DirectML for Windows GPUs",
    icon: "🪟",
    category: "gpu",
    envVars: [],
    operations: {
      info: { name: "GPU Info", inputs: {} },
      devices: { name: "List Devices", inputs: {} }
    }
  }
};

export const ML_FRAMEWORK_ADAPTERS = {
  pytorch: {
    id: "pytorch",
    name: "PyTorch",
    description: "PyTorch deep learning framework",
    icon: "🔥",
    category: "ml_framework",
    operations: {
      loadModel: { name: "Load Model", inputs: { path: { type: "text", required: true }, device: { type: "text" } } },
      saveModel: { name: "Save Model", inputs: { model: { type: "text", required: true }, path: { type: "text", required: true } } },
      train: { name: "Train Model", inputs: { config: { type: "json", required: true } } },
      evaluate: { name: "Evaluate Model", inputs: { model: { type: "text" }, data: { type: "text" } } },
      exportOnnx: { name: "Export to ONNX", inputs: { model: { type: "text", required: true }, path: { type: "text", required: true } } }
    }
  },

  tensorflow: {
    id: "tensorflow",
    name: "TensorFlow/Keras",
    description: "TensorFlow and Keras deep learning",
    icon: "🧠",
    category: "ml_framework",
    operations: {
      loadModel: { name: "Load Model", inputs: { path: { type: "text", required: true } } },
      saveModel: { name: "Save Model", inputs: { model: { type: "text" }, path: { type: "text", required: true } } },
      train: { name: "Train Model", inputs: { config: { type: "json", required: true } } },
      evaluate: { name: "Evaluate", inputs: { model: { type: "text" }, data: { type: "text" } } },
      exportSavedModel: { name: "Export SavedModel", inputs: { model: { type: "text" }, path: { type: "text" } } }
    }
  },

  huggingface: {
    id: "huggingface",
    name: "Hugging Face",
    description: "Hugging Face transformers, datasets, models",
    icon: "🤗",
    category: "ml_framework",
    envVars: ["HUGGINGFACE_TOKEN"],
    operations: {
      loadModel: { name: "Load Model", inputs: { modelId: { type: "text", label: "Model ID", required: true, placeholder: "meta-llama/Llama-3-8b" } } },
      downloadModel: { name: "Download Model", inputs: { modelId: { type: "text", required: true } } },
      uploadModel: { name: "Upload Model", inputs: { modelPath: { type: "text", required: true }, repoId: { type: "text", required: true } } },
      inference: { name: "Run Inference", inputs: { modelId: { type: "text", required: true }, inputs: { type: "json", required: true } } },
      listModels: { name: "List Models", inputs: { search: { type: "text" }, limit: { type: "number" } } },
      listDatasets: { name: "List Datasets", inputs: { search: { type: "text" } } },
      loadDataset: { name: "Load Dataset", inputs: { datasetId: { type: "text", required: true } } },
      createSpace: { name: "Create Space", inputs: { name: { type: "text", required: true }, sdk: { type: "select", options: ["gradio", "streamlit", "docker"] } } }
    }
  },

  weights_biases: {
    id: "wandb",
    name: "Weights & Biases",
    description: "ML experiment tracking and visualization",
    icon: "📊",
    category: "ml_framework",
    envVars: ["WANDB_API_KEY"],
    operations: {
      initProject: { name: "Init Project", inputs: { project: { type: "text", required: true } } },
      logMetrics: { name: "Log Metrics", inputs: { run: { type: "text" }, metrics: { type: "json", required: true } } },
      listRuns: { name: "List Runs", inputs: { project: { type: "text", required: true } } },
      getRun: { name: "Get Run", inputs: { project: { type: "text", required: true }, run: { type: "text", required: true } } },
      createReport: { name: "Create Report", inputs: { project: { type: "text" }, title: { type: "text" } } }
    }
  },

  mlflow: {
    id: "mlflow",
    name: "MLflow",
    description: "ML lifecycle management",
    icon: "📈",
    category: "ml_framework",
    envVars: ["MLFLOW_TRACKING_URI"],
    operations: {
      createExperiment: { name: "Create Experiment", inputs: { name: { type: "text", required: true } } },
      logRun: { name: "Log Run", inputs: { experiment: { type: "text" }, metrics: { type: "json" }, params: { type: "json" } } },
      listRuns: { name: "List Runs", inputs: { experiment: { type: "text" } } },
      registerModel: { name: "Register Model", inputs: { name: { type: "text", required: true }, path: { type: "text", required: true } } },
      loadModel: { name: "Load Model", inputs: { name: { type: "text" }, version: { type: "text" } } }
    }
  },

  ray: {
    id: "ray",
    name: "Ray",
    description: "Distributed computing for ML",
    icon: "⚡",
    category: "ml_framework",
    envVars: ["RAY_ADDRESS"],
    operations: {
      status: { name: "Cluster Status", inputs: {} },
      listJobs: { name: "List Jobs", inputs: {} },
      submitJob: { name: "Submit Job", inputs: { entrypoint: { type: "text", required: true }, runtime: { type: "json" } } },
      cancelJob: { name: "Cancel Job", inputs: { jobId: { type: "text", required: true } } }
    }
  }
};

export const FINETUNING_ADAPTERS = {
  unsloth: {
    id: "unsloth",
    name: "Unsloth",
    description: "Fast LLM fine-tuning",
    icon: "🦥",
    category: "finetuning",
    operations: {
      finetune: { name: "Fine-tune Model", inputs: { 
        model: { type: "text", label: "Base Model", required: true, placeholder: "llama-3-8b" },
        dataset: { type: "text", label: "Dataset Path", required: true },
        outputDir: { type: "text", label: "Output Directory", required: true },
        epochs: { type: "number", label: "Epochs" },
        learningRate: { type: "number", label: "Learning Rate" },
        batchSize: { type: "number", label: "Batch Size" }
      }},
      exportGGUF: { name: "Export to GGUF", inputs: { model: { type: "text", required: true }, output: { type: "text", required: true } } }
    }
  },

  axolotl: {
    id: "axolotl",
    name: "Axolotl",
    description: "LLM fine-tuning framework",
    icon: "🦎",
    category: "finetuning",
    operations: {
      train: { name: "Train", inputs: { config: { type: "json", required: true } } },
      validate: { name: "Validate Config", inputs: { config: { type: "json", required: true } } }
    }
  },

  peft: {
    id: "peft",
    name: "PEFT/LoRA",
    description: "Parameter-efficient fine-tuning",
    icon: "🎯",
    category: "finetuning",
    operations: {
      createLora: { name: "Create LoRA", inputs: { 
        model: { type: "text", required: true },
        rank: { type: "number", label: "LoRA Rank" },
        alpha: { type: "number", label: "LoRA Alpha" },
        targetModules: { type: "json", label: "Target Modules" }
      }},
      mergeLora: { name: "Merge LoRA", inputs: { model: { type: "text", required: true }, loraPath: { type: "text", required: true } } },
      exportLora: { name: "Export LoRA", inputs: { outputDir: { type: "text", required: true } } }
    }
  },

  qlora: {
    id: "qlora",
    name: "QLoRA",
    description: "Quantized LoRA for efficient fine-tuning",
    icon: "💎",
    category: "finetuning",
    operations: {
      train: { name: "Train QLoRA", inputs: {
        model: { type: "text", required: true },
        dataset: { type: "text", required: true },
        bits: { type: "select", options: ["4bit", "8bit"], label: "Quantization" },
        epochs: { type: "number" }
      }}
    }
  }
};

export function getAllAdapters() {
  return {
    databases: DATABASE_ADAPTERS,
    storage: STORAGE_ADAPTERS,
    cloud: CLOUD_PROVIDER_ADAPTERS,
    ai_runtimes: AI_RUNTIME_ADAPTERS,
    gpu: GPU_ADAPTERS,
    ml_frameworks: ML_FRAMEWORK_ADAPTERS,
    finetuning: FINETUNING_ADAPTERS
  };
}

export function getAdapterById(category, id) {
  const adapters = {
    ...DATABASE_ADAPTERS,
    ...STORAGE_ADAPTERS,
    ...CLOUD_PROVIDER_ADAPTERS,
    ...AI_RUNTIME_ADAPTERS,
    ...GPU_ADAPTERS,
    ...ML_FRAMEWORK_ADAPTERS,
    ...FINETUNING_ADAPTERS
  };
  return adapters[id];
}

export function listAllAdapters() {
  const result = [];
  
  for (const [category, adapters] of Object.entries(getAllAdapters())) {
    for (const [id, adapter] of Object.entries(adapters)) {
      result.push({
        id,
        name: adapter.name,
        description: adapter.description,
        icon: adapter.icon,
        category,
        operationsCount: Object.keys(adapter.operations || {}).length
      });
    }
  }
  
  return result;
}
