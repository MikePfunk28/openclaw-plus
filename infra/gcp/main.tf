# GCP Terraform Configuration for AI Applications
# Includes: Vertex AI, Cloud Functions, Cloud Run, GKE, Cloud Storage, BigQuery

terraform {
  required_version = ">= 1.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 5.0"
    }
  }

  backend "gcs" {
    bucket = "your-terraform-state-bucket"
    prefix = "ai-infra/terraform.tfstate"
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

provider "google-beta" {
  project = var.project_id
  region  = var.region
}

# =============================================================================
# Variables
# =============================================================================

variable "project_id" {
  description = "GCP Project ID"
  type        = string
}

variable "region" {
  description = "GCP region"
  default     = "us-central1"
}

variable "environment" {
  description = "Environment name"
  default     = "development"
}

variable "project_name" {
  description = "Project name"
  default     = "openclaw-ai"
}

# =============================================================================
# Enable APIs
# =============================================================================

resource "google_project_service" "required_apis" {
  for_each = toset([
    "compute.googleapis.com",
    "container.googleapis.com",
    "cloudfunctions.googleapis.com",
    "run.googleapis.com",
    "aiplatform.googleapis.com",
    "storage.googleapis.com",
    "bigquery.googleapis.com",
    "pubsub.googleapis.com",
    "secretmanager.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "iam.googleapis.com",
    "artifactregistry.googleapis.com",
    "cloudbuild.googleapis.com"
  ])

  service            = each.value
  disable_on_destroy = false
}

# =============================================================================
# VPC Network
# =============================================================================

resource "google_compute_network" "main" {
  name                    = "${var.project_name}-network"
  auto_create_subnetworks = false

  depends_on = [google_project_service.required_apis]
}

resource "google_compute_subnetwork" "main" {
  name          = "${var.project_name}-subnet"
  ip_cidr_range = "10.0.0.0/16"
  region        = var.region
  network       = google_compute_network.main.id

  secondary_ip_range {
    range_name    = "pods"
    ip_cidr_range = "10.1.0.0/16"
  }

  secondary_ip_range {
    range_name    = "services"
    ip_cidr_range = "10.2.0.0/16"
  }
}

# =============================================================================
# Cloud Storage
# =============================================================================

resource "google_storage_bucket" "data" {
  name          = "${var.project_name}-data-${var.environment}"
  location      = var.region
  force_destroy = var.environment == "development"

  uniform_bucket_level_access = true

  versioning {
    enabled = true
  }

  lifecycle_rule {
    action {
      type = "Delete"
    }
    condition {
      age = 365
    }
  }
}

resource "google_storage_bucket" "models" {
  name          = "${var.project_name}-models-${var.environment}"
  location      = var.region
  force_destroy = var.environment == "development"

  uniform_bucket_level_access = true

  versioning {
    enabled = true
  }
}

# =============================================================================
# Vertex AI
# =============================================================================

resource "google_artifact_registry_repository" "ai_models" {
  location      = var.region
  repository_id = "${var.project_name}-models"
  description   = "AI/ML Model artifacts"
  format        = "DOCKER"

  depends_on = [google_project_service.required_apis]
}

resource "google_ai_platform_endpoint" "main" {
  name         = "${var.project_name}-endpoint"
  region       = var.region
  display_name = "${var.project_name} AI Endpoint"

  depends_on = [google_project_service.required_apis]
}

# =============================================================================
# Cloud Functions (Gen 2)
# =============================================================================

resource "google_pubsub_topic" "ai_tasks" {
  name = "${var.project_name}-ai-tasks"

  depends_on = [google_project_service.required_apis]
}

resource "google_storage_bucket" "function_source" {
  name          = "${var.project_name}-function-src-${var.environment}"
  location      = var.region
  force_destroy = var.environment == "development"
}

resource "google_service_account" "cloud_function" {
  account_id   = "${var.project_name}-function"
  display_name = "${var.project_name} Cloud Function"
}

resource "google_project_iam_member" "function_invoker" {
  project = var.project_id
  role    = "roles/run.invoker"
  member  = "serviceAccount:${google_service_account.cloud_function.email}"
}

# =============================================================================
# Cloud Run
# =============================================================================

resource "google_cloud_run_v2_service" "ai_api" {
  name     = "${var.project_name}-api"
  location = var.region

  template {
    containers {
      image = "us-docker.pkg.dev/cloudrun/container/hello"

      resources {
        limits = {
          cpu    = "2"
          memory = "2Gi"
        }
      }

      env {
        name  = "PROJECT_ID"
        value = var.project_id
      }

      env {
        name  = "BUCKET_NAME"
        value = google_storage_bucket.data.name
      }
    }

    scaling {
      min_instance_count = 0
      max_instance_count = 10
    }
  }

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }

  depends_on = [google_project_service.required_apis]
}

resource "google_cloud_run_service_iam_member" "public" {
  location = google_cloud_run_v2_service.ai_api.location
  service  = google_cloud_run_v2_service.ai_api.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# =============================================================================
# GKE Cluster
# =============================================================================

resource "google_container_cluster" "main" {
  name     = "${var.project_name}-cluster"
  location = var.region

  initial_node_count       = 1
  remove_default_node_pool = true

  network    = google_compute_network.main.id
  subnetwork = google_compute_subnetwork.main.id

  depends_on = [google_project_service.required_apis]
}

resource "google_container_node_pool" "main" {
  name       = "default-pool"
  cluster    = google_container_cluster.main.name
  location   = var.region
  node_count = 1

  node_config {
    machine_type = "e2-standard-4"

    oauth_scopes = [
      "https://www.googleapis.com/auth/cloud-platform"
    ]

    labels = {
      environment = var.environment
    }
  }
}

# =============================================================================
# BigQuery
# =============================================================================

resource "google_bigquery_dataset" "analytics" {
  dataset_id  = "${replace(var.project_name, "-", "_")}_analytics"
  location    = var.region
  description = "Analytics data for ${var.project_name}"

  depends_on = [google_project_service.required_apis]
}

resource "google_bigquery_table" "conversations" {
  dataset_id = google_bigquery_dataset.analytics.dataset_id
  table_id   = "conversations"

  time_partitioning {
    type  = "DAY"
    field = "timestamp"
  }

  schema = <<EOF
[
  {"name": "conversation_id", "type": "STRING", "mode": "REQUIRED"},
  {"name": "user_id", "type": "STRING", "mode": "NULLABLE"},
  {"name": "model", "type": "STRING", "mode": "NULLABLE"},
  {"name": "prompt_tokens", "type": "INTEGER", "mode": "NULLABLE"},
  {"name": "completion_tokens", "type": "INTEGER", "mode": "NULLABLE"},
  {"name": "timestamp", "type": "TIMESTAMP", "mode": "REQUIRED"}
]
EOF
}

# =============================================================================
# Secret Manager
# =============================================================================

resource "google_secret_manager_secret" "api_keys" {
  secret_id = "${var.project_name}-api-keys"

  replication {
    auto {}
  }

  depends_on = [google_project_service.required_apis]
}

# =============================================================================
# Pub/Sub
# =============================================================================

resource "google_pubsub_topic" "events" {
  name = "${var.project_name}-events"

  message_retention_duration = "604800s"

  depends_on = [google_project_service.required_apis]
}

resource "google_pubsub_subscription" "events" {
  name  = "${var.project_name}-events-sub"
  topic = google_pubsub_topic.events.name

  ack_deadline_seconds = 60

  retry_policy {
    minimum_backoff = "10s"
    maximum_backoff = "600s"
  }
}

# =============================================================================
# Outputs
# =============================================================================

output "network_name" {
  value = google_compute_network.main.name
}

output "data_bucket_name" {
  value = google_storage_bucket.data.name
}

output "model_bucket_name" {
  value = google_storage_bucket.models.name
}

output "cloud_run_url" {
  value = google_cloud_run_v2_service.ai_api.uri
}

output "gke_cluster_name" {
  value = google_container_cluster.main.name
}

output "vertex_ai_endpoint" {
  value = google_ai_platform_endpoint.main.id
}

output "bigquery_dataset" {
  value = google_bigquery_dataset.analytics.dataset_id
}
