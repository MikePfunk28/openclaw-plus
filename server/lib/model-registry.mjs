function toOpenAiTool(tool) {
  return {
    type: "function",
    function: {
      name: tool.id,
      description: tool.description,
      parameters: tool.inputSchema
    }
  };
}

function classifyProviderError(error) {
  const message = String(error?.message || "").toLowerCase();
  if (message.includes("401") || message.includes("403") || message.includes("auth")) {
    return "auth";
  }
  if (message.includes("429") || message.includes("rate") || message.includes("quota")) {
    return "rate_limit";
  }
  if (message.includes("timeout") || message.includes("timed out")) {
    return "timeout";
  }
  if (message.includes("5")) {
    return "server";
  }
  return "unknown";
}

function extractTextFromOpenAiMessage(message) {
  if (typeof message?.content === "string") {
    return message.content;
  }

  if (Array.isArray(message?.content)) {
    return message.content
      .filter((part) => part?.type === "text")
      .map((part) => part.text)
      .join("\n");
  }

  return "";
}

async function callOpenAiCompatible(modelConfig, { messages, tools }) {
  const apiKey = modelConfig.apiKeyEnv ? process.env[modelConfig.apiKeyEnv] : undefined;
  const url = `${modelConfig.baseUrl.replace(/\/$/, "")}/chat/completions`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {})
    },
    body: JSON.stringify({
      model: modelConfig.model,
      messages,
      tools: tools.map(toOpenAiTool)
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI-compatible error ${response.status}: ${text}`);
  }

  const body = await response.json();
  const message = body?.choices?.[0]?.message;

  if (Array.isArray(message?.tool_calls) && message.tool_calls.length > 0) {
    return {
      kind: "tool_calls",
      assistantMessage: message,
      toolCalls: message.tool_calls.map((call) => ({
        id: call.id,
        name: call.function?.name,
        arguments: call.function?.arguments
      }))
    };
  }

  return {
    kind: "final",
    assistantMessage: {
      role: "assistant",
      content: extractTextFromOpenAiMessage(message)
    }
  };
}

function toAnthropicMessages(messages) {
  return messages
    .filter((m) => m.role !== "system")
    .map((m) => {
      if (m.role === "tool") {
        return {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: m.tool_call_id,
              content: String(m.content)
            }
          ]
        };
      }

      if (m.role === "assistant" && Array.isArray(m.tool_calls) && m.tool_calls.length > 0) {
        return {
          role: "assistant",
          content: m.tool_calls.map((call) => ({
            type: "tool_use",
            id: call.id,
            name: call.function?.name,
            input: safeJsonParse(call.function?.arguments)
          }))
        };
      }

      return {
        role: m.role,
        content: String(typeof m.content === "string" ? m.content : "")
      };
    });
}

function safeJsonParse(raw) {
  if (!raw) {
    return {};
  }
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function callAnthropic(modelConfig, { messages, tools }) {
  const apiKey = process.env[modelConfig.apiKeyEnv ?? ""]; 
  if (!apiKey) {
    throw new Error(`Missing API key env var: ${modelConfig.apiKeyEnv}`);
  }

  const systemMessages = messages
    .filter((m) => m.role === "system")
    .map((m) => (typeof m.content === "string" ? m.content : ""))
    .join("\n\n");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: modelConfig.model,
      max_tokens: 1200,
      system: systemMessages || undefined,
      messages: toAnthropicMessages(messages),
      tools: tools.map((tool) => ({
        name: tool.id,
        description: tool.description,
        input_schema: tool.inputSchema
      }))
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Anthropic error ${response.status}: ${text}`);
  }

  const body = await response.json();
  const toolUses = (body.content ?? []).filter((item) => item.type === "tool_use");

  if (toolUses.length > 0) {
    return {
      kind: "tool_calls",
      assistantMessage: {
        role: "assistant",
        content: null,
        tool_calls: toolUses.map((toolUse) => ({
          id: toolUse.id,
          type: "function",
          function: {
            name: toolUse.name,
            arguments: JSON.stringify(toolUse.input ?? {})
          }
        }))
      },
      toolCalls: toolUses.map((toolUse) => ({
        id: toolUse.id,
        name: toolUse.name,
        arguments: JSON.stringify(toolUse.input ?? {})
      }))
    };
  }

  const text = (body.content ?? [])
    .filter((item) => item.type === "text")
    .map((item) => item.text)
    .join("\n");

  return {
    kind: "final",
    assistantMessage: {
      role: "assistant",
      content: text
    }
  };
}

export class ModelRegistry {
  constructor(models, options = {}) {
    this.models = new Map((models ?? []).map((m) => [m.id, m]));
    this.failoverOn = Array.isArray(options.failoverOn)
      ? options.failoverOn
      : ["rate_limit", "timeout", "server", "auth"];
  }

  get(modelId) {
    const modelConfig = this.models.get(modelId);
    if (!modelConfig) {
      return null;
    }

    const invokeSingle = async (selectedModelConfig, { messages, tools }) => {
      if (selectedModelConfig.provider === "openai-compatible") {
        return callOpenAiCompatible(selectedModelConfig, { messages, tools });
      }

      if (selectedModelConfig.provider === "anthropic") {
        return callAnthropic(selectedModelConfig, { messages, tools });
      }

      throw new Error(`Unsupported provider: ${selectedModelConfig.provider}`);
    };

    const invoke = async ({ messages, tools, onModelAttempt }) => {
      const fallbackIds = Array.isArray(modelConfig.fallbacks) ? modelConfig.fallbacks : [];
      const candidateIds = [modelConfig.id, ...fallbackIds];
      const errors = [];

      for (let index = 0; index < candidateIds.length; index += 1) {
        const candidateId = candidateIds[index];
        const candidateConfig = this.models.get(candidateId);
        if (!candidateConfig) {
          continue;
        }

        if (onModelAttempt) {
          onModelAttempt({
            type: "model_attempt",
            modelId: candidateConfig.id,
            label: candidateConfig.label,
            attempt: index + 1,
            total: candidateIds.length
          });
        }

        try {
          const result = await invokeSingle(candidateConfig, { messages, tools });
          if (onModelAttempt) {
            onModelAttempt({
              type: "model_selected",
              modelId: candidateConfig.id,
              label: candidateConfig.label
            });
          }
          return result;
        } catch (error) {
          const kind = classifyProviderError(error);
          errors.push(`${candidateConfig.id}:${kind}:${String(error?.message || error)}`);

          if (onModelAttempt) {
            onModelAttempt({
              type: "model_attempt_failed",
              modelId: candidateConfig.id,
              label: candidateConfig.label,
              errorKind: kind,
              error: String(error?.message || error)
            });
          }

          const shouldFailover = index < candidateIds.length - 1 && this.failoverOn.includes(kind);
          if (!shouldFailover) {
            throw error;
          }
        }
      }

      throw new Error(`All model attempts failed: ${errors.join(" | ")}`);
    };

    return {
      id: modelConfig.id,
      label: modelConfig.label,
      invoke
    };
  }

  publicModels() {
    return [...this.models.values()].map((model) => ({
      id: model.id,
      label: model.label,
      provider: model.provider,
      model: model.model
    }));
  }
}
