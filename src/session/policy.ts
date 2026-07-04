export interface SessionBudget {
  readonly maxContextTokens: number;
  readonly maxInputTokens: number;
  readonly maxOutputTokens: number;
  readonly rotateWhenBudgetRemainingBelow: number;
}

export interface SessionPolicy {
  readonly compactEveryPrompts: number;
  readonly budget: SessionBudget;
}

export interface SessionUsage {
  readonly promptCount: number;
  readonly inputTokensUsed: number;
  readonly outputTokensUsed: number;
}

export type SessionAction = "continue" | "compact" | "rotate";

export const defaultSessionPolicy: SessionPolicy = {
  compactEveryPrompts: 5,
  budget: {
    maxContextTokens: 150000,
    maxInputTokens: 120000,
    maxOutputTokens: 30000,
    rotateWhenBudgetRemainingBelow: 0.15
  }
};

export function estimateTokens(text: string): number {
  if (text.trim().length === 0) {
    return 0;
  }

  return Math.ceil(text.length / 4);
}

export function decideNextSessionAction(
  usage: SessionUsage,
  policy: SessionPolicy = defaultSessionPolicy
): SessionAction {
  if (isBudgetLow(usage, policy)) {
    return "rotate";
  }

  if (usage.promptCount > 0 && usage.promptCount % policy.compactEveryPrompts === 0) {
    return "compact";
  }

  return "continue";
}

export function applyPromptUsage(usage: SessionUsage, prompt: string): SessionUsage {
  return {
    ...usage,
    promptCount: usage.promptCount + 1,
    inputTokensUsed: usage.inputTokensUsed + estimateTokens(prompt)
  };
}

export function applyResponseUsage(usage: SessionUsage, response: string): SessionUsage {
  return {
    ...usage,
    outputTokensUsed: usage.outputTokensUsed + estimateTokens(response)
  };
}

function isBudgetLow(usage: SessionUsage, policy: SessionPolicy): boolean {
  const inputRemaining = remainingRatio(usage.inputTokensUsed, policy.budget.maxInputTokens);
  const outputRemaining = remainingRatio(usage.outputTokensUsed, policy.budget.maxOutputTokens);
  const contextRemaining = remainingRatio(
    usage.inputTokensUsed + usage.outputTokensUsed,
    policy.budget.maxContextTokens
  );
  const threshold = policy.budget.rotateWhenBudgetRemainingBelow;

  return inputRemaining <= threshold || outputRemaining <= threshold || contextRemaining <= threshold;
}

function remainingRatio(used: number, max: number): number {
  if (max <= 0) {
    return 0;
  }

  return Math.max(0, (max - used) / max);
}
