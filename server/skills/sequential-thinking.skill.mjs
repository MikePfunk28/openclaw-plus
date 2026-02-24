export const skill = {
  id: "sequential_thinking",
  name: "Sequential Thinking",
  description: "Step-by-step reasoning for complex problems. Breaks down problems into sequential thoughts with backtracking capability.",
  inputSchema: {
    type: "object",
    properties: {
      thought: {
        type: "string",
        description: "Current thinking step"
      },
      thoughtNumber: {
        type: "number",
        description: "Current thought number",
        minimum: 1
      },
      totalThoughts: {
        type: "number",
        description: "Estimated total thoughts needed",
        minimum: 1
      },
      nextThoughtNeeded: {
        type: "boolean",
        description: "Whether another thought step is needed"
      },
      isRevision: {
        type: "boolean",
        description: "Whether this revises previous thinking"
      },
      revisesThought: {
        type: "number",
        description: "Which thought is being reconsidered"
      },
      branchFromThought: {
        type: "number",
        description: "Branching from thought number"
      },
      branchId: {
        type: "string",
        description: "Identifier for the branch"
      },
      needsMoreThoughts: {
        type: "boolean",
        description: "If more thoughts are needed than estimated"
      }
    },
    required: ["thought", "thoughtNumber", "totalThoughts", "nextThoughtNeeded"],
    additionalProperties: false
  },
  async run({ input }) {
    const thought = input?.thought;
    const thoughtNumber = input?.thoughtNumber;
    const totalThoughts = input?.totalThoughts;
    const nextThoughtNeeded = input?.nextThoughtNeeded;

    if (!thought || thoughtNumber === undefined || totalThoughts === undefined) {
      throw new Error("thought, thoughtNumber, and totalThoughts are required");
    }

    const result = {
      thoughtNumber,
      totalThoughts,
      thought,
      nextThoughtNeeded: Boolean(nextThoughtNeeded),
      progress: `${thoughtNumber}/${totalThoughts}`,
      isComplete: thoughtNumber >= totalThoughts && !nextThoughtNeeded
    };

    if (input?.isRevision) {
      result.isRevision = true;
      result.revisesThought = input.revisesThought;
    }

    if (input?.branchFromThought) {
      result.branchFromThought = input.branchFromThought;
      result.branchId = input.branchId || `branch-${Date.now()}`;
    }

    if (input?.needsMoreThoughts) {
      result.needsMoreThoughts = true;
    }

    return {
      ok: true,
      ...result,
      suggestion: nextThoughtNeeded
        ? `Continue with thought ${thoughtNumber + 1} of ${totalThoughts}`
        : "Analysis complete"
    };
  }
};
