import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export class TerraformExecutor {
  constructor(workspaceRoot) {
    this.workspaceRoot = workspaceRoot;
    this.tfPath = process.env.TERRAFORM_PATH || "terraform";
  }

  async init(config) {
    const { provider, credentials, resources } = config;
    
    const tfContent = this.generateMainTf(provider, credentials, resources);
    const varsContent = this.generateVariablesTf(provider, credentials, resources);
    const tfvarsContent = this.generateTfvars(provider, credentials, resources);
    
    return {
      files: {
        "main.tf": tfContent,
        "variables.tf": varsContent,
        "terraform.tfvars": tfvarsContent
      }
    };
  }

  generateMainTf(provider, credentials, resources) {
    let content = "";
    
    switch (provider) {
      case "aws":
        content = `terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}
`;
        break;
      case "gcp":
        content = `terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 4.0"
    }
  }
}

provider "google" {
  project = var.gcp_project
  region  = var.gcp_region
}
`;
        break;
      case "azure":
        content = `terraform {
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.0"
    }
  }
}

provider "azurerm" {
  features {}
  subscription_id = var.azure_subscription_id
}
`;
        break;
      case "kubernetes":
        content = `terraform {
  required_providers {
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.0"
    }
  }
}

provider "kubernetes" {
  config_path = var.kube_config_path
}
`;
        break;
    }

    for (const resource of resources || []) {
      content += "\n" + this.generateResource(provider, resource);
    }

    return content;
  }

  generateResource(provider, resource) {
    const { type, name, config } = resource;
    
    const resourceTemplates = {
      aws: {
        ec2: `resource "aws_instance" "${name}" {
  ami           = var.ami_id
  instance_type = var.instance_type
  
  tags = {
    Name = "${name}"
  }
}`,
        s3_bucket: `resource "aws_s3_bucket" "${name}" {
  bucket = var.bucket_name
  
  tags = {
    Name = "${name}"
  }
}`,
        lambda: `resource "aws_lambda_function" "${name}" {
  filename      = var.lambda_zip
  function_name = "${name}"
  role          = var.lambda_role_arn
  handler       = var.lambda_handler
  runtime       = var.lambda_runtime
}`,
        rds: `resource "aws_db_instance" "${name}" {
  allocated_storage    = 20
  storage_type         = "gp2"
  engine               = "mysql"
  engine_version       = "8.0"
  instance_class       = var.db_instance_class
  name                 = var.db_name
  username             = var.db_username
  password             = var.db_password
}`,
        vpc: `resource "aws_vpc" "${name}" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true
  
  tags = {
    Name = "${name}"
  }
}`,
        ecs_cluster: `resource "aws_ecs_cluster" "${name}" {
  name = "${name}"
}`,
        ecr_repo: `resource "aws_ecr_repository" "${name}" {
  name = "${name}"
}`
      },
      gcp: {
        compute_instance: `resource "google_compute_instance" "${name}" {
  name         = "${name}"
  machine_type = var.machine_type
  zone         = var.gcp_zone

  boot_disk {
    initialize_params {
      image = var.gcp_image
    }
  }

  network_interface {
    network = "default"
  }
}`,
        cloud_function: `resource "google_cloudfunctions_function" "${name}" {
  name        = "${name}"
  runtime     = var.function_runtime
  entry_point = var.function_entry_point
  
  source_archive_bucket = var.source_bucket
  source_archive_object = var.source_object
}`,
        gke_cluster: `resource "google_container_cluster" "${name}" {
  name     = "${name}"
  location = var.gcp_zone

  initial_node_count = var.node_count
}`,
        bigquery_dataset: `resource "google_bigquery_dataset" "${name}" {
  dataset_id = "${name}"
  location   = var.gcp_region
}`,
        pubsub_topic: `resource "google_pubsub_topic" "${name}" {
  name = "${name}"
}`
      },
      azure: {
        resource_group: `resource "azurerm_resource_group" "${name}" {
  name     = "${name}"
  location = var.azure_location
}`,
        vm: `resource "azurerm_linux_virtual_machine" "${name}" {
  name                = "${name}"
  resource_group_name = var.resource_group_name
  location            = var.azure_location
  size                = var.vm_size
  
  network_interface_ids = [var.network_interface_id]
  
  os_disk {
    caching              = "ReadWrite"
    storage_account_type = "Standard_LRS"
  }
  
  source_image_reference {
    publisher = "Canonical"
    offer     = "UbuntuServer"
    sku       = "18.04-LTS"
    version   = "latest"
  }
}`,
        function_app: `resource "azurerm_linux_function_app" "${name}" {
  name                = "${name}"
  resource_group_name = var.resource_group_name
  location            = var.azure_location
  
  storage_account_name       = var.storage_account_name
  storage_account_access_key = var.storage_account_key
  service_plan_id            = var.service_plan_id
}`,
        aks_cluster: `resource "azurerm_kubernetes_cluster" "${name}" {
  name                = "${name}"
  resource_group_name = var.resource_group_name
  location            = var.azure_location
  dns_prefix          = "${name}"
  
  default_node_pool {
    name       = "default"
    node_count = var.node_count
    vm_size    = var.vm_size
  }
}`,
        sql_server: `resource "azurerm_mssql_server" "${name}" {
  name                         = "${name}"
  resource_group_name          = var.resource_group_name
  location                     = var.azure_location
  version                      = "12.0"
  administrator_login          = var.sql_admin
  administrator_login_password = var.sql_password
}`
      },
      kubernetes: {
        deployment: `resource "kubernetes_deployment" "${name}" {
  metadata {
    name = "${name}"
  }

  spec {
    replicas = var.replicas

    selector {
      match_labels = {
        app = "${name}"
      }
    }

    template {
      metadata {
        labels = {
          app = "${name}"
        }
      }

      spec {
        container {
          image = var.container_image
          name  = "${name}"

          port {
            container_port = var.container_port
          }
        }
      }
    }
  }
}`,
        service: `resource "kubernetes_service" "${name}" {
  metadata {
    name = "${name}"
  }

  spec {
    selector = {
      app = var.app_name
    }

    port {
      port        = var.service_port
      target_port = var.target_port
    }

    type = "LoadBalancer"
  }
}`,
        namespace: `resource "kubernetes_namespace" "${name}" {
  metadata {
    name = "${name}"
  }
}`,
        configmap: `resource "kubernetes_config_map" "${name}" {
  metadata {
    name = "${name}"
  }

  data = var.config_data
}`,
        secret: `resource "kubernetes_secret" "${name}" {
  metadata {
    name = "${name}"
  }

  data = var.secret_data
}`,
        ingress: `resource "kubernetes_ingress_v1" "${name}" {
  metadata {
    name = "${name}"
  }

  spec {
    ingress_class_name = "nginx"

    rule {
      http {
        path {
          backend {
            service {
              name = var.service_name
              port {
                number = var.service_port
              }
            }
          }
        }
      }
    }
  }
}`
      }
    };

    return resourceTemplates[provider]?.[type] || `# Resource type '${type}' for provider '${provider}' - add custom config`;
  }

  generateVariablesTf(provider, credentials, resources) {
    const baseVars = {
      aws: `
variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}`,
      gcp: `
variable "gcp_project" {
  description = "GCP project ID"
  type        = string
}

variable "gcp_region" {
  description = "GCP region"
  type        = string
  default     = "us-central1"
}

variable "gcp_zone" {
  description = "GCP zone"
  type        = string
  default     = "us-central1-a"
}`,
      azure: `
variable "azure_subscription_id" {
  description = "Azure subscription ID"
  type        = string
}

variable "azure_location" {
  description = "Azure location"
  type        = string
  default     = "East US"
}`,
      kubernetes: `
variable "kube_config_path" {
  description = "Path to kubeconfig"
  type        = string
  default     = "~/.kube/config"
}`
    };

    let content = baseVars[provider] || "";

    for (const resource of resources || []) {
      content += this.generateResourceVariables(provider, resource);
    }

    return content;
  }

  generateResourceVariables(provider, resource) {
    const { type, name } = resource;
    
    const varTemplates = {
      aws: {
        ec2: `
variable "ami_id" { type = string }
variable "instance_type" { type = string; default = "t3.micro" }`,
        s3_bucket: `
variable "bucket_name" { type = string }`,
        lambda: `
variable "lambda_zip" { type = string }
variable "lambda_role_arn" { type = string }
variable "lambda_handler" { type = string }
variable "lambda_runtime" { type = string; default = "python3.11" }`,
        rds: `
variable "db_instance_class" { type = string; default = "db.t3.micro" }
variable "db_name" { type = string }
variable "db_username" { type = string }
variable "db_password" { type = string; sensitive = true }`,
        vpc: `
variable "vpc_cidr" { type = string; default = "10.0.0.0/16" }`
      },
      gcp: {
        compute_instance: `
variable "machine_type" { type = string; default = "e2-medium" }
variable "gcp_image" { type = string; default = "debian-cloud/debian-11" }`,
        gke_cluster: `
variable "node_count" { type = number; default = 3 }`
      },
      azure: {
        vm: `
variable "vm_size" { type = string; default = "Standard_DS1_v2" }
variable "resource_group_name" { type = string }
variable "network_interface_id" { type = string }`,
        aks_cluster: `
variable "node_count" { type = number; default = 3 }`
      },
      kubernetes: {
        deployment: `
variable "replicas" { type = number; default = 2 }
variable "container_image" { type = string }
variable "container_port" { type = number }`,
        service: `
variable "service_port" { type = number }
variable "target_port" { type = number }
variable "app_name" { type = string }`,
        configmap: `
variable "config_data" { type = map(string) }`,
        secret: `
variable "secret_data" { type = map(string); sensitive = true }`,
        ingress: `
variable "service_name" { type = string }
variable "service_port" { type = number }`
      }
    };

    return varTemplates[provider]?.[type] || "";
  }

  generateTfvars(provider, credentials, resources) {
    let content = "";
    
    if (credentials) {
      for (const [key, value] of Object.entries(credentials)) {
        content += `${key} = "${value}"\n`;
      }
    }

    for (const resource of resources || []) {
      if (resource.config) {
        for (const [key, value] of Object.entries(resource.config)) {
          if (typeof value === "string") {
            content += `${key} = "${value}"\n`;
          } else if (typeof value === "object") {
            content += `${key} = ${JSON.stringify(value)}\n`;
          } else {
            content += `${key} = ${value}\n`;
          }
        }
      }
    }

    return content;
  }

  async plan(config) {
    const { files } = await this.init(config);
    return {
      action: "plan",
      files,
      message: "Terraform configuration generated. Run 'terraform init && terraform plan' to preview changes."
    };
  }

  async apply(config) {
    const { files } = await this.init(config);
    return {
      action: "apply",
      files,
      message: "Terraform configuration generated. Run 'terraform init && terraform apply' to create resources."
    };
  }

  async destroy(resourceIdentifiers) {
    return {
      action: "destroy",
      targets: resourceIdentifiers,
      message: "Run 'terraform destroy' to remove resources."
    };
  }
}

export const terraformExecutor = new TerraformExecutor(".");
