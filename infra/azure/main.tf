# Azure Terraform Configuration for AI Applications
# Includes: Azure AI, Functions, Container Apps, AKS, Storage, Cosmos DB, SQL Database

terraform {
  required_version = ">= 1.0"
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.0"
    }
    azuread = {
      source  = "hashicorp/azuread"
      version = "~> 2.0"
    }
  }

  backend "azurerm" {
    resource_group_name  = "terraform-state"
    storage_account_name = "tfstate"
    container_name       = "tfstate"
    key                  = "ai-infra/terraform.tfstate"
  }
}

provider "azurerm" {
  features {
    key_vault {
      purge_soft_delete_on_destroy    = true
      recover_soft_deleted_key_vaults = true
    }
    resource_group {
      prevent_deletion_if_contains_resources = false
    }
  }
}

provider "azuread" {}

# =============================================================================
# Variables
# =============================================================================

variable "location" {
  description = "Azure region"
  default     = "eastus"
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
# Resource Group
# =============================================================================

resource "azurerm_resource_group" "main" {
  name     = "${var.project_name}-${var.environment}-rg"
  location = var.location

  tags = {
    Environment = var.environment
    Project     = var.project_name
  }
}

# =============================================================================
# Virtual Network
# =============================================================================

resource "azurerm_virtual_network" "main" {
  name                = "${var.project_name}-vnet"
  address_space       = ["10.0.0.0/16"]
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
}

resource "azurerm_subnet" "container_apps" {
  name                 = "ContainerAppsSubnet"
  resource_group_name  = azurerm_resource_group.main.name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = ["10.0.1.0/24"]

  delegation {
    name = "Microsoft.App.environments"
    service_delegation {
      name    = "Microsoft.App/environments"
      actions = ["Microsoft.Network/virtualNetworks/subnets/join/action"]
    }
  }
}

resource "azurerm_subnet" "aks" {
  name                 = "AksSubnet"
  resource_group_name  = azurerm_resource_group.main.name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = ["10.0.2.0/24"]
}

resource "azurerm_subnet" "private_endpoints" {
  name                 = "PrivateEndpointsSubnet"
  resource_group_name  = azurerm_resource_group.main.name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = ["10.0.3.0/24"]
}

# =============================================================================
# Storage Account
# =============================================================================

resource "azurerm_storage_account" "main" {
  name                     = "${replace(var.project_name, "-", "")}stg${var.environment}"
  resource_group_name      = azurerm_resource_group.main.name
  location                 = azurerm_resource_group.main.location
  account_tier             = "Standard"
  account_replication_type = "LRS"

  blob_properties {
    versioning_enabled = true
  }

  tags = {
    Environment = var.environment
  }
}

resource "azurerm_storage_container" "data" {
  name                  = "data"
  storage_account_name  = azurerm_storage_account.main.name
  container_access_type = "private"
}

resource "azurerm_storage_container" "models" {
  name                  = "models"
  storage_account_name  = azurerm_storage_account.main.name
  container_access_type = "private"
}

# =============================================================================
# Azure AI Services (OpenAI)
# =============================================================================

resource "azurerm_cognitive_account" "openai" {
  name                = "${var.project_name}-openai-${var.environment}"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  kind                = "OpenAI"
  sku_name            = "S0"

  tags = {
    Environment = var.environment
  }
}

# Note: Deployments are managed via Azure CLI or portal
# az cognitiveservices account deployment create \
#   --name ${azurerm_cognitive_account.openai.name} \
#   --resource-group ${azurerm_resource_group.main.name} \
#   --deployment-name gpt-4 \
#   --model-name gpt-4 \
#   --model-version "0613" \
#   --model-format OpenAI \
#   --scale-settings-scale-type "Standard"

# =============================================================================
# Cosmos DB
# =============================================================================

resource "azurerm_cosmosdb_account" "main" {
  name                = "${var.project_name}-cosmos-${var.environment}"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  offer_type          = "Standard"
  kind                = "GlobalDocumentDB"

  consistency_policy {
    consistency_level       = "Session"
    max_interval_in_seconds = 5
    max_staleness_prefix    = 100
  }

  geo_location {
    location          = azurerm_resource_group.main.location
    failover_priority = 0
  }

  tags = {
    Environment = var.environment
  }
}

resource "azurerm_cosmosdb_sql_database" "main" {
  name                = "${var.project_name}-db"
  resource_group_name = azurerm_resource_group.main.name
  account_name        = azurerm_cosmosdb_account.main.name
  throughput          = 400
}

resource "azurerm_cosmosdb_sql_container" "sessions" {
  name                  = "sessions"
  resource_group_name   = azurerm_resource_group.main.name
  account_name          = azurerm_cosmosdb_account.main.name
  database_name         = azurerm_cosmosdb_sql_database.main.name
  partition_key_path    = "/sessionId"
  partition_key_version = 2
  default_ttl           = 86400
}

resource "azurerm_cosmosdb_sql_container" "conversations" {
  name                  = "conversations"
  resource_group_name   = azurerm_resource_group.main.name
  account_name          = azurerm_cosmosdb_account.main.name
  database_name         = azurerm_cosmosdb_sql_database.main.name
  partition_key_path    = "/conversationId"
  partition_key_version = 2
}

# =============================================================================
# Azure SQL Database (optional for relational data)
# =============================================================================

resource "azurerm_mssql_server" "main" {
  name                         = "${var.project_name}-sql-${var.environment}"
  resource_group_name          = azurerm_resource_group.main.name
  location                     = azurerm_resource_group.main.location
  version                      = "12.0"
  administrator_login          = "sqladmin"
  administrator_login_password = random_password.sql.result

  tags = {
    Environment = var.environment
  }
}

resource "random_password" "sql" {
  length  = 32
  special = true
}

resource "azurerm_mssql_database" "main" {
  name      = "${var.project_name}-db"
  server_id = azurerm_mssql_server.main.id
  sku_name  = "GP_S_Gen5_1"
}

resource "azurerm_mssql_firewall_rule" "allow_azure" {
  name             = "AllowAzureServices"
  server_id        = azurerm_mssql_server.main.id
  start_ip_address = "0.0.0.0"
  end_ip_address   = "0.0.0.0"
}

# =============================================================================
# Container Apps Environment
# =============================================================================

resource "azurerm_container_app_environment" "main" {
  name                           = "${var.project_name}-cae"
  location                       = azurerm_resource_group.main.location
  resource_group_name            = azurerm_resource_group.main.name
  infrastructure_subnet_id       = azurerm_subnet.container_apps.id
  internal_load_balancer_enabled = false

  tags = {
    Environment = var.environment
  }
}

resource "azurerm_container_app" "api" {
  name                         = "${var.project_name}-api"
  container_app_environment_id = azurerm_container_app_environment.main.id
  resource_group_name          = azurerm_resource_group.main.name
  revision_mode                = "Single"

  template {
    container {
      name   = "main"
      image  = "mcr.microsoft.com/azuredocs/containerapps-helloworld:latest"
      cpu    = 0.5
      memory = "1Gi"

      env {
        name  = "COSMOS_ENDPOINT"
        value = azurerm_cosmosdb_account.main.endpoint
      }

      env {
        name  = "STORAGE_CONNECTION"
        value = azurerm_storage_account.main.primary_connection_string
      }
    }

    min_replicas = 0
    max_replicas = 10
  }

  ingress {
    external_enabled = true
    target_port      = 80
    traffic_weight {
      percentage      = 100
      latest_revision = true
    }
  }

  tags = {
    Environment = var.environment
  }
}

# =============================================================================
# Azure Functions
# =============================================================================

resource "azurerm_service_plan" "functions" {
  name                = "${var.project_name}-func-plan"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  os_type             = "Linux"
  sku_name            = "Y1"
}

resource "azurerm_linux_function_app" "main" {
  name                       = "${var.project_name}-func-${var.environment}"
  location                   = azurerm_resource_group.main.location
  resource_group_name        = azurerm_resource_group.main.name
  service_plan_id            = azurerm_service_plan.functions.id
  storage_account_name       = azurerm_storage_account.main.name
  storage_account_access_key = azurerm_storage_account.main.primary_access_key

  site_config {
    application_stack {
      node_version = "20"
    }
  }

  app_settings = {
    "AzureWebJobsStorage"      = azurerm_storage_account.main.primary_connection_string
    "FUNCTIONS_WORKER_RUNTIME" = "node"
    "COSMOS_ENDPOINT"          = azurerm_cosmosdb_account.main.endpoint
    "COSMOS_KEY"               = azurerm_cosmosdb_account.main.primary_key
  }

  tags = {
    Environment = var.environment
  }
}

# =============================================================================
# AKS Cluster
# =============================================================================

resource "azurerm_kubernetes_cluster" "main" {
  name                = "${var.project_name}-aks"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  dns_prefix          = "${var.project_name}-aks"
  kubernetes_version  = "1.28"

  default_node_pool {
    name           = "default"
    node_count     = 1
    vm_size        = "Standard_D2_v2"
    vnet_subnet_id = azurerm_subnet.aks.id
  }

  identity {
    type = "SystemAssigned"
  }

  network_profile {
    network_plugin = "azure"
    network_policy = "calico"
  }

  tags = {
    Environment = var.environment
  }
}

# =============================================================================
# Key Vault
# =============================================================================

data "azurerm_client_config" "current" {}

resource "azurerm_key_vault" "main" {
  name                       = "${replace(var.project_name, "-", "")}kv${var.environment}"
  location                   = azurerm_resource_group.main.location
  resource_group_name        = azurerm_resource_group.main.name
  tenant_id                  = data.azurerm_client_config.current.tenant_id
  soft_delete_retention_days = 7
  purge_protection_enabled   = false

  sku_name = "standard"

  access_policy {
    tenant_id = data.azurerm_client_config.current.tenant_id
    object_id = data.azurerm_client_config.current.object_id

    secret_permissions = [
      "Get", "List", "Set", "Delete", "Purge"
    ]
  }

  tags = {
    Environment = var.environment
  }
}

resource "azurerm_key_vault_secret" "cosmos_key" {
  name         = "CosmosDbKey"
  value        = azurerm_cosmosdb_account.main.primary_key
  key_vault_id = azurerm_key_vault.main.id
}

# =============================================================================
# Application Insights
# =============================================================================

resource "azurerm_application_insights" "main" {
  name                = "${var.project_name}-insights"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  application_type    = "web"

  tags = {
    Environment = var.environment
  }
}

# =============================================================================
# Outputs
# =============================================================================

output "resource_group_name" {
  value = azurerm_resource_group.main.name
}

output "storage_account_name" {
  value = azurerm_storage_account.main.name
}

output "cosmos_endpoint" {
  value = azurerm_cosmosdb_account.main.endpoint
}

output "cosmos_key" {
  value     = azurerm_cosmosdb_account.main.primary_key
  sensitive = true
}

output "container_app_url" {
  value = azurerm_container_app.api.latest_revision_fqdn
}

output "function_app_name" {
  value = azurerm_linux_function_app.main.name
}

output "aks_cluster_name" {
  value = azurerm_kubernetes_cluster.main.name
}

output "key_vault_uri" {
  value = azurerm_key_vault.main.vault_uri
}

output "application_insights_instrumentation_key" {
  value     = azurerm_application_insights.main.instrumentation_key
  sensitive = true
}

output "azure_openai_endpoint" {
  value = azurerm_cognitive_account.openai.endpoint
}
