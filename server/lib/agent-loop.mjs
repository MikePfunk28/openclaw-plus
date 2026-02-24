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

export async function runAgentLoop({
  model,
  messages,
  tools,
  maxSteps = 8,
  onEvent,
  canRunTool
}) {
  const transcript = [...messages];
  const trace = [];
  const emit = async (event) => {
    if (onEvent) {
      await onEvent(event);
    }
  };

  for (let step = 0; step < maxSteps; step += 1) {
    await emit({ type: "step_start", step: step + 1 });

    const result = await model.invoke({
      messages: transcript,
      tools,
      onModelAttempt(event) {
        return emit(event);
      }
    });
    transcript.push(result.assistantMessage);

    if (result.kind === "final") {
      await emit({ type: "final", step: step + 1, content: result.assistantMessage?.content ?? "" });
      return {
        answer: String(result.assistantMessage?.content ?? ""),
        trace,
        steps: step + 1,
        transcript
      };
    }

    if (result.kind !== "tool_calls") {
      throw new Error(`Unexpected model result kind: ${result.kind}`);
    }

    for (const call of result.toolCalls) {
      const tool = tools.find((candidate) => candidate.id === call.name);

      if (!tool) {
        const missing = `Tool not found: ${call.name}`;
        transcript.push({
          role: "tool",
          tool_call_id: call.id,
          content: missing
        });
        trace.push({ type: "tool", tool: call.name, ok: false, result: missing });
        await emit({ type: "tool", tool: call.name, ok: false, result: missing });
        continue;
      }

      try {
        const input = safeJsonParse(call.arguments);
        if (typeof canRunTool === "function") {
          const policyResult = canRunTool(tool.id, input);
          if (!policyResult?.ok) {
            const blocked = policyResult?.reason || `Tool blocked: ${tool.id}`;
            transcript.push({
              role: "tool",
              tool_call_id: call.id,
              content: blocked
            });
            trace.push({ type: "tool", tool: call.name, ok: false, result: blocked });
            await emit({ type: "tool", tool: call.name, ok: false, result: blocked });
            continue;
          }
        }

        await emit({ type: "tool_start", tool: call.name, input });
        const output = await tool.run({ input, trace });

        transcript.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(output)
        });
        trace.push({ type: "tool", tool: call.name, ok: true, input, output });
        await emit({ type: "tool", tool: call.name, ok: true, input, output });
      } catch (error) {
        const toolError = `Tool execution error: ${String(error?.message ?? error)}`;
        transcript.push({
          role: "tool",
          tool_call_id: call.id,
          content: toolError
        });
        trace.push({ type: "tool", tool: call.name, ok: false, result: toolError });
        await emit({ type: "tool", tool: call.name, ok: false, result: toolError });
      }
    }
  }

  await emit({ type: "truncated", steps: maxSteps });

  return {
    answer: "I hit the max reasoning steps before reaching a final answer.",
    trace,
    steps: maxSteps,
    truncated: true,
    transcript
  };
}
