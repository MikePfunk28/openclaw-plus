export const id = "storage";
export const name = "Cloud Storage";
export const description = "Universal cloud storage - AWS S3, GCS, Azure Blob, MinIO, Backblaze B2, Cloudflare R2";
export const version = "1.0.0";

export const inputs = {
  type: "object",
  properties: {
    provider: {
      type: "string",
      enum: ["s3", "gcs", "azure_blob", "minio", "backblaze", "cloudflare_r2"],
      description: "Storage provider"
    },
    operation: { type: "string", description: "Operation to perform" },
    params: { type: "object", description: "Operation parameters" }
  },
  required: ["provider", "operation"]
};

let s3Client = null;

async function getS3Client() {
  if (!s3Client) {
    const { S3Client } = await import("@aws-sdk/client-s3");
    s3Client = new S3Client({
      region: process.env.AWS_REGION || "us-east-1",
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      }
    });
  }
  return s3Client;
}

async function getMinioClient() {
  const { S3Client } = await import("@aws-sdk/client-s3");
  return new S3Client({
    endpoint: process.env.MINIO_ENDPOINT || "http://localhost:9000",
    region: "us-east-1",
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.MINIO_ACCESS_KEY,
      secretAccessKey: process.env.MINIO_SECRET_KEY
    }
  });
}

async function s3Operation(operation, params) {
  const client = await getS3Client();
  
  switch (operation) {
    case "listBuckets": {
      const { ListBucketsCommand } = await import("@aws-sdk/client-s3");
      const result = await client.send(new ListBucketsCommand({}));
      return { buckets: result.Buckets.map(b => ({ name: b.Name, created: b.CreationDate })) };
    }
    case "createBucket": {
      const { CreateBucketCommand } = await import("@aws-sdk/client-s3");
      await client.send(new CreateBucketCommand({ Bucket: params.bucket }));
      return { ok: true };
    }
    case "deleteBucket": {
      const { DeleteBucketCommand } = await import("@aws-sdk/client-s3");
      await client.send(new DeleteBucketCommand({ Bucket: params.bucket }));
      return { ok: true };
    }
    case "listObjects": {
      const { ListObjectsV2Command } = await import("@aws-sdk/client-s3");
      const result = await client.send(new ListObjectsV2Command({
        Bucket: params.bucket,
        Prefix: params.prefix,
        MaxKeys: params.limit || 1000
      }));
      return { objects: result.Contents?.map(o => ({ key: o.Key, size: o.Size, lastModified: o.LastModified })) || [] };
    }
    case "upload": {
      const { PutObjectCommand } = await import("@aws-sdk/client-s3");
      const body = typeof params.body === "string" ? params.body : JSON.stringify(params.body);
      await client.send(new PutObjectCommand({
        Bucket: params.bucket,
        Key: params.key,
        Body: body,
        ContentType: params.contentType
      }));
      return { ok: true };
    }
    case "download": {
      const { GetObjectCommand } = await import("@aws-sdk/client-s3");
      const result = await client.send(new GetObjectCommand({ Bucket: params.bucket, Key: params.key }));
      const body = await result.Body.transformToString();
      return { content: body };
    }
    case "delete": {
      const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
      await client.send(new DeleteObjectCommand({ Bucket: params.bucket, Key: params.key }));
      return { ok: true };
    }
    case "copy": {
      const { CopyObjectCommand } = await import("@aws-sdk/client-s3");
      await client.send(new CopyObjectCommand({
        Bucket: params.destBucket,
        Key: params.destKey,
        CopySource: `${params.sourceBucket}/${params.sourceKey}`
      }));
      return { ok: true };
    }
    case "getSignedUrl": {
      const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
      const { GetObjectCommand } = await import("@aws-sdk/client-s3");
      const command = new GetObjectCommand({ Bucket: params.bucket, Key: params.key });
      const url = await getSignedUrl(client, command, { expiresIn: params.expiresIn || 3600 });
      return { url };
    }
    default:
      throw new Error(`Unknown operation: ${operation}`);
  }
}

async function minioOperation(operation, params) {
  const client = await getMinioClient();
  return s3Operation(operation, { ...params, client });
}

export async function run({ input }) {
  const { provider, operation, params = {} } = input;

  try {
    let result;
    
    switch (provider) {
      case "s3":
        result = await s3Operation(operation, params);
        break;
      case "minio":
        result = await minioOperation(operation, params);
        break;
      case "gcs":
        throw new Error("GCS requires @google-cloud/storage package");
      case "azure_blob":
        throw new Error("Azure Blob requires @azure/storage-blob package");
      case "backblaze":
        throw new Error("Backblaze B2 requires backblaze-b2 package");
      case "cloudflare_r2":
        result = await s3Operation(operation, { ...params, endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` });
        break;
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }

    return { ok: true, ...result };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

export const supportedProviders = [
  { id: "s3", name: "AWS S3", icon: "🪣" },
  { id: "gcs", name: "Google Cloud Storage", icon: "☁️" },
  { id: "azure_blob", name: "Azure Blob Storage", icon: "📦" },
  { id: "minio", name: "MinIO", icon: "🗄️" },
  { id: "backblaze", name: "Backblaze B2", icon: "💾" },
  { id: "cloudflare_r2", name: "Cloudflare R2", icon: "🍊" }
];
