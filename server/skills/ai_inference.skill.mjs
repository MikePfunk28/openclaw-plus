export const id = "ai_inference";
export const name = "AI Inference";
export const description = "Multi-provider AI inference - OpenAI, Anthropic, Groq, Together, Mistral, Cohere, DeepSeek, Fireworks";
export const version = "1.0.0";

export const inputs = {
  type: "object",
  properties: {
    provider: {
      type: "string",
      enum: ["openai", "anthropic", "groq", "together", "mistral", "cohere", "deepseek", "fireworks", "perplexity"]
    },
    operation: { type: "string", enum: ["chat", "generate", "embed", "listModels"] },
    model: { type: "string" },
    messages: { type: "array", description: "Chat messages array" },
    prompt: { type: "string", description: "Text prompt" },
    text: { type: "string", description: "Text for embeddings" },
    options: { type: "object", description: "Additional options (temperature, max_tokens, etc.)" }
  },
  required: ["provider", "operation"]
};

import { telemetry } from "../lib/ai-telemetry.mjs";

async function openaiRequest(operation, params) {
  const { OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  
  const startTime = Date.now();
  let result;
  
  switch (operation) {
    case "chat":
      result = await client.chat.completions.create({
        model: params.model || "gpt-4o-mini",
        messages: params.messages,
        ...params.options
      });
      break;
    case "generate":
      result = await client.completions.create({
        model: params.model || "gpt-3.5-turbo-instruct",
        prompt: params.prompt,
        ...params.options
      });
      break;
    case "embed":
      result = await client.embeddings.create({
        model: params.model || "text-embedding-3-small",
        input: params.text
      });
      break;
    case "listModels":
      result = await client.models.list();
      break;
  }
  
  return { result, provider: "openai", model: params.model, startTime };
}

async function anthropicRequest(operation, params) {
  const Anthropic = await import("@anthropic-ai/sdk");
  const client = new Anthropic.default({ apiKey: process.env.ANTHROPIC_API_KEY });
  
  const startTime = Date.now();
  let result;
  
  switch (operation) {
    case "chat":
      result = await client.messages.create({
        model: params.model || "claude-sonnet-4-20250514",
        max_tokens: params.options?.max_tokens || 4096,
        messages: params.messages
      });
      break;
    case "listModels":
      result = { models: ["claude-sonnet-4-20250514", "claude-opus-4-20250514", "claude-3-5-haiku-20241022"] };
      break;
  }
  
  return { result, provider: "anthropic", model: params.model, startTime };
}

async function groqRequest(operation, params) {
  const Groq = await import("groq-sdk");
  const client = new Groq.default({ apiKey: process.env.GROQ_API_KEY });
  
  const startTime = Date.now();
  let result;
  
  switch (operation) {
    case "chat":
      result = await client.chat.completions.create({
        model: params.model || "llama-3.1-70b-versatile",
        messages: params.messages,
        ...params.options
      });
      break;
    case "listModels":
      const models = await client.models.list();
      result = { models: models.data.map(m => m.id) };
      break;
  }
  
  return { result, provider: "groq", model: params.model, startTime };
}

async function togetherRequest(operation, params) {
  const startTime = Date.now();
  const response = await fetch("https://api.together.xyz/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.TOGETHER_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: params.model || "meta-llama/Llama-3-70b-chat-hf",
      messages: params.messages,
      ...params.options
    })
  });
  
  const result = await response.json();
  return { result, provider: "together", model: params.model, startTime };
}

async function mistralRequest(operation, params) {
  const startTime = Date.now();
  const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.MISTRAL_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: params.model || "mistral-large-latest",
      messages: params.messages,
      ...params.options
    })
  });
  
  const result = await response.json();
  return { result, provider: "mistral", model: params.model, startTime };
}

async function cohereRequest(operation, params) {
  const startTime = Date.now();
  let response;
  
  switch (operation) {
    case "chat":
      response = await fetch("https://api.cohere.ai/v2/chat", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.COHERE_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: params.model || "command-r-plus",
          messages: params.messages,
          ...params.options
        })
      });
      break;
    case "embed":
      response = await fetch("https://api.cohere.ai/v1/embed", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.COHERE_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: params.model || "embed-english-v3.0",
          texts: Array.isArray(params.text) ? params.text : [params.text],
          input_type: "search_document"
        })
      });
      break;
  }
  
  const result = await response.json();
  return { result, provider: "cohere", model: params.model, startTime };
}

async function deepseekRequest(operation, params) {
  const startTime = Date.now();
  const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: params.model || "deepseek-chat",
      messages: params.messages,
      ...params.options
    })
  });
  
  const result = await response.json();
  return { result, provider: "deepseek", model: params.model, startTime };
}

export async function run({ input }) {
  const { provider, operation, model, messages, prompt, text, options = {} } = input;

  try {
    let response;
    const params = { model, messages, prompt, text, options };
    
    switch (provider) {
      case "openai":
        response = await openaiRequest(operation, params);
        break;
      case "anthropic":
        response = await anthropicRequest(operation, params);
        break;
      case "groq":
        response = await groqRequest(operation, params);
        break;
      case "together":
        response = await togetherRequest(operation, params);
        break;
      case "mistral":
        response = await mistralRequest(operation, params);
        break;
      case "cohere":
        response = await cohereRequest(operation, params);
        break;
      case "deepseek":
        response = await deepseekRequest(operation, params);
        break;
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
    
    const endTime = Date.now();
    
    telemetry.logGeneration({
      provider: response.provider,
      model: response.model,
      messages,
      prompt,
      output: response.result.choices?.[0]?.message?.content || response.result.content?.[0]?.text || response.result,
      promptTokens: response.result.usage?.prompt_tokens,
      completionTokens: response.result.usage?.completion_tokens,
      totalTokens: response.result.usage?.total_tokens,
      latency: endTime - response.startTime,
      ...options
    });
    
    return { ok: true, result: response.result, latency: endTime - response.startTime };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

export const supportedProviders = [
  { id: "openai", name: "OpenAI", models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"] },
  { id: "anthropic", name: "Anthropic", models: ["claude-sonnet-4-20250514", "claude-opus-4-20250514", "claude-3-5-haiku-20241022"] },
  { id: "groq", name: "Groq", models: ["llama-3.1-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768"] },
  { id: "together", name: "Together AI", models: ["meta-llama/Llama-3-70b-chat-hf", "mistralai/Mixtral-8x7B-Instruct-v0.1"] },
  { id: "mistral", name: "Mistral", models: ["mistral-large-latest", "mistral-medium", "codestral-latest"] },
  { id: "cohere", name: "Cohere", models: ["command-r-plus", "command-r", "embed-english-v3.0"] },
  { id: "deepseek", name: "DeepSeek", models: ["deepseek-chat", "deepseek-reasoner"] }
];
