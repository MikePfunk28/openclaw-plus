import { runAgentLoop } from "./agent-loop.mjs";

function safeJsonParse(raw) {
  if (!raw || typeof raw !== "string") {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function evaluateCompletion({ model, objective, latestAnswer }) {
  const evaluatorPrompt = [
    "You are a strict task completion judge.",
    "Return compact JSON only: {\"done\":boolean,\"reason\":string}.",
    "Mark done=true only when the objective is fully complete."
  ].join(" ");

  const result = await model.invoke({
    tools: [],
    messages: [
      { role: "system", content: evaluatorPrompt },
      {
        role: "user",
        content: `Objective:\n${objective}\n\nLatest output:\n${latestAnswer}`
      }
    ]
  });

  const parsed = safeJsonParse(result?.assistantMessage?.content);
  if (parsed && typeof parsed.done === "boolean") {
    return {
      done: parsed.done,
      reason: String(parsed.reason || "")
    };
  }

  return {
    done: false,
    reason: "Completion evaluator returned non-JSON output."
  };
}

function buildMemory(session) {
  const recent = session.messages.slice(-8).map((message) => ({
    role: message.role,
    content: String(message.content ?? "").slice(0, 600)
  }));

  const summary = recent
    .map((item) => `${item.role}: ${item.content}`)
    .join("\n")
    .slice(0, 2400);

  const facts = [];
  for (const message of session.messages) {
    if (message.role !== "user" || typeof message.content !== "string") {
      continue;
    }
    if (message.content.toLowerCase().startsWith("remember:")) {
      facts.push(message.content.slice("remember:".length).trim());
    }
  }

  return {
    summary,
    facts: facts.slice(-20)
  };
}

function buildSystemContext(session) {
  const memoryFacts = session.memory?.facts?.length
    ? `Persistent facts:\n- ${session.memory.facts.join("\n- ")}`
    : "Persistent facts: none";

  const memorySummary = session.memory?.summary || "No prior summary.";

  return [
    "You are an autonomous engineering agent.",
    "Work continuously until the objective is complete or budgets are exhausted.",
    "Do not ask user follow-up questions unless blocked by missing credentials.",
    memoryFacts,
    `Prior session summary:\n${memorySummary}`
  ].join("\n\n");
}

export async function runAutonomousTask({
  model,
  tools,
  session,
  objective,
  maxSteps,
  maxCycles,
  canRunTool,
  onEvent
}) {
  const emit = async (event) => {
    if (onEvent) {
      await onEvent(event);
    }
  };

  const startMessages = [
    { role: "system", content: buildSystemContext(session) },
    ...session.messages,
    { role: "user", content: objective }
  ];

  let allTrace = [];
  let latestAnswer = "";
  let transcript = startMessages;
  let cyclesUsed = 0;
  let done = false;
  let doneReason = "";

  for (let cycle = 0; cycle < maxCycles; cycle += 1) {
    cyclesUsed = cycle + 1;
    await emit({ type: "cycle_start", cycle: cycle + 1, maxCycles });

    const loopResult = await runAgentLoop({
      model,
      tools,
      maxSteps,
      messages: transcript,
      canRunTool,
      onEvent: emit
    });

    latestAnswer = loopResult.answer;
    transcript = loopResult.transcript;
    allTrace = [...allTrace, ...loopResult.trace];

    const completion = await evaluateCompletion({ model, objective, latestAnswer });
    done = completion.done;
    doneReason = completion.reason;

    await emit({
      type: "cycle_evaluation",
      cycle: cycle + 1,
      done,
      reason: doneReason
    });

    if (done) {
      break;
    }

    transcript.push({
      role: "user",
      content:
        "Continue executing the task. You are not finished yet. Use tools and complete any remaining work."
    });
  }

  const newMessages = transcript.slice(startMessages.length - 1);
  const sessionSnapshot = {
    ...session,
    messages: [...session.messages, ...newMessages],
    trace: allTrace
  };

  return {
    answer: latestAnswer,
    trace: allTrace,
    done,
    doneReason,
    cycles: cyclesUsed,
    memory: buildMemory(sessionSnapshot),
    messagesToPersist: newMessages
  };
}
