export const id = "ai_runtime";
export const name = "AI Runtime";
export const description = "Local AI inference - Ollama, vLLM, LM Studio, LocalAI, LlamaStack, Text Generation WebUI";
export const version = "1.0.0";

export const inputs = {
  type: "object",
  properties: {
    runtime: {
      type: "string",
      enum: ["ollama", "vllm", "lmstudio", "localai", "llamastack", "textgenwebui", "infinity"],
      description: "AI runtime to use"
    },
    operation: { type: "string", description: "Operation to perform" },
    params: { type: "object", description: "Operation parameters" }
  },
  required: ["runtime", "operation"]
};

async function ollamaRequest(endpoint, body = null) {
  const host = process.env.OLLAMA_HOST || "http://localhost:11434";
  const url = `${host}${endpoint}`;
  
  const options = {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json" }
  };
  
  if (body) {
    options.body = JSON.stringify(body);
  }
  
  const response = await fetch(url, options);
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Ollama error: ${response.status} - ${error}`);
  }
  
  return response.json();
}

async function ollamaOperation(operation, params) {
  switch (operation) {
    case "listModels": {
      const result = await ollamaRequest("/api/tags");
      return { models: result.models?.map(m => ({ name: m.name, size: m.size, modified: m.modified_at })) || [] };
    }
    case "pullModel": {
      const result = await ollamaRequest("/api/pull", { name: params.model, stream: false });
      return { ok: true, status: result.status };
    }
    case "generate": {
      const result = await ollamaRequest("/api/generate", {
        model: params.model,
        prompt: params.prompt,
        stream: false,
        options: {
          temperature: params.temperature,
          num_predict: params.max_tokens
        }
      });
      return { response: result.response, model: result.model, totalDuration: result.total_duration };
    }
    case "chat": {
      const result = await ollamaRequest("/api/chat", {
        model: params.model,
        messages: params.messages,
        stream: false
      });
      return { message: result.message, model: result.model };
    }
    case "embeddings": {
      const result = await ollamaRequest("/api/embeddings", {
        model: params.model,
        prompt: params.prompt
      });
      return { embedding: result.embedding };
    }
    case "deleteModel": {
      await ollamaRequest("/api/delete", { name: params.model });
      return { ok: true };
    }
    case "showModel": {
      const result = await ollamaRequest("/api/show", { name: params.model });
      return { model: result };
    }
    case "ps": {
      const result = await ollamaRequest("/api/ps");
      return { models: result.models || [] };
    }
    default:
      throw new Error(`Unknown operation: ${operation}`);
  }
}

async function openaiCompatibleRequest(baseUrl, endpoint, body = null, apiKey = null) {
  const url = `${baseUrl}${endpoint}`;
  
  const headers = { "Content-Type": "application/json" };
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }
  
  const options = { method: body ? "POST" : "GET", headers };
  if (body) {
    options.body = JSON.stringify(body);
  }
  
  const response = await fetch(url, options);
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API error: ${response.status} - ${error}`);
  }
  
  return response.json();
}

async function lmstudioOperation(operation, params) {
  const baseUrl = process.env.LMSTUDIO_URL || "http://localhost:1234/v1";
  
  switch (operation) {
    case "listModels": {
      const result = await openaiCompatibleRequest(baseUrl, "/models");
      return { models: result.data?.map(m => ({ id: m.id, owned_by: m.owned_by })) || [] };
    }
    case "chat": {
      const result = await openaiCompatibleRequest(baseUrl, "/chat/completions", {
        model: params.model || "local-model",
        messages: params.messages,
        max_tokens: params.max_tokens,
        temperature: params.temperature
      });
      return { message: result.choices?.[0]?.message, usage: result.usage };
    }
    case "generate": {
      const result = await openaiCompatibleRequest(baseUrl, "/completions", {
        model: params.model || "local-model",
        prompt: params.prompt,
        max_tokens: params.max_tokens
      });
      return { text: result.choices?.[0]?.text, usage: result.usage };
    }
    case "embeddings": {
      const result = await openaiCompatibleRequest(baseUrl, "/embeddings", {
        model: params.model || "local-model",
        input: params.input
      });
      return { embeddings: result.data?.map(d => d.embedding) };
    }
    default:
      throw new Error(`Unknown operation: ${operation}`);
  }
}

async function vllmOperation(operation, params) {
  const baseUrl = process.env.VLLM_API_URL || "http://localhost:8000/v1";
  const apiKey = process.env.VLLM_API_KEY;
  
  switch (operation) {
    case "listModels": {
      const result = await openaiCompatibleRequest(baseUrl, "/models", null, apiKey);
      return { models: result.data?.map(m => ({ id: m.id })) || [] };
    }
    case "chat": {
      const result = await openaiCompatibleRequest(baseUrl, "/chat/completions", {
        model: params.model,
        messages: params.messages,
        max_tokens: params.max_tokens || 512,
        temperature: params.temperature || 0.7
      }, apiKey);
      return { message: result.choices?.[0]?.message, usage: result.usage };
    }
    case "generate": {
      const result = await openaiCompatibleRequest(baseUrl, "/completions", {
        model: params.model,
        prompt: params.prompt,
        max_tokens: params.max_tokens || 512
      }, apiKey);
      return { text: result.choices?.[0]?.text, usage: result.usage };
    }
    case "embeddings": {
      const result = await openaiCompatibleRequest(baseUrl, "/embeddings", {
        model: params.model,
        input: params.input
      }, apiKey);
      return { embeddings: result.data?.map(d => d.embedding) };
    }
    default:
      throw new Error(`Unknown operation: ${operation}`);
  }
}

async function localaiOperation(operation, params) {
  const baseUrl = process.env.LOCALAI_URL || "http://localhost:8080/v1";
  const apiKey = process.env.LOCALAI_API_KEY;
  
  switch (operation) {
    case "listModels": {
      const result = await openaiCompatibleRequest(baseUrl, "/models", null, apiKey);
      return { models: result.data || [] };
    }
    case "chat": {
      const result = await openaiCompatibleRequest(baseUrl, "/chat/completions", {
        model: params.model,
        messages: params.messages
      }, apiKey);
      return { message: result.choices?.[0]?.message };
    }
    case "generate": {
      const result = await openaiCompatibleRequest(baseUrl, "/completions", {
        model: params.model,
        prompt: params.prompt
      }, apiKey);
      return { text: result.choices?.[0]?.text };
    }
    case "embeddings": {
      const result = await openaiCompatibleRequest(baseUrl, "/embeddings", {
        model: params.model,
        input: params.input
      }, apiKey);
      return { embeddings: result.data?.map(d => d.embedding) };
    }
    default:
      throw new Error(`Unknown operation: ${operation}`);
  }
}

export async function run({ input }) {
  const { runtime, operation, params = {} } = input;

  try {
    let result;
    
    switch (runtime) {
      case "ollama":
        result = await ollamaOperation(operation, params);
        break;
      case "lmstudio":
        result = await lmstudioOperation(operation, params);
        break;
      case "vllm":
        result = await vllmOperation(operation, params);
        break;
      case "localai":
        result = await localaiOperation(operation, params);
        break;
      case "llamastack":
        throw new Error("LlamaStack requires specific configuration");
      case "textgenwebui":
        throw new Error("Text Generation WebUI requires specific configuration");
      case "infinity":
        throw new Error("Infinity embeddings server requires specific configuration");
      default:
        throw new Error(`Unknown runtime: ${runtime}`);
    }

    return { ok: true, ...result };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

export function checkRuntime(runtime) {
  const hosts = {
    ollama: process.env.OLLAMA_HOST || "http://localhost:11434",
    lmstudio: process.env.LMSTUDIO_URL || "http://localhost:1234",
    vllm: process.env.VLLM_API_URL || "http://localhost:8000",
    localai: process.env.LOCALAI_URL || "http://localhost:8080"
  };
  
  return { host: hosts[runtime] };
}

export const supportedRuntimes = [
  { id: "ollama", name: "Ollama", icon: "🦙", defaultPort: 11434 },
  { id: "vllm", name: "vLLM", icon: "⚡", defaultPort: 8000 },
  { id: "lmstudio", name: "LM Studio", icon: "🎬", defaultPort: 1234 },
  { id: "localai", name: "LocalAI", icon: "🤖", defaultPort: 8080 },
  { id: "llamastack", name: "Llama Stack", icon: "🦙", defaultPort: 8321 },
  { id: "textgenwebui", name: "TextGen WebUI", icon: "💬", defaultPort: 7860 },
  { id: "infinity", name: "Infinity", icon: "♾️", defaultPort: 7997 }
];
