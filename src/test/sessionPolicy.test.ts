import test from "node:test";
import assert from "node:assert/strict";
import {
  applyPromptUsage,
  applyResponseUsage,
  decideNextSessionAction,
  estimateTokens
} from "../session/policy";

test("estimateTokens uses a conservative character approximation", () => {
  assert.equal(estimateTokens(""), 0);
  assert.equal(estimateTokens("abcd"), 1);
  assert.equal(estimateTokens("abcde"), 2);
});

test("decideNextSessionAction asks for compaction every fifth prompt", () => {
  assert.equal(
    decideNextSessionAction({
      promptCount: 5,
      inputTokensUsed: 10,
      outputTokensUsed: 10
    }),
    "compact"
  );
});

test("decideNextSessionAction rotates before compacting when budget is low", () => {
  assert.equal(
    decideNextSessionAction({
      promptCount: 5,
      inputTokensUsed: 119000,
      outputTokensUsed: 10
    }),
    "rotate"
  );
});

test("decideNextSessionAction rotates when total context budget is low", () => {
  assert.equal(
    decideNextSessionAction(
      {
        promptCount: 2,
        inputTokensUsed: 80,
        outputTokensUsed: 15
      },
      {
        compactEveryPrompts: 5,
        budget: {
          maxContextTokens: 100,
          maxInputTokens: 1000,
          maxOutputTokens: 1000,
          rotateWhenBudgetRemainingBelow: 0.1
        }
      }
    ),
    "rotate"
  );
});

test("usage helpers increment prompt and response budgets", () => {
  const afterPrompt = applyPromptUsage(
    { promptCount: 0, inputTokensUsed: 0, outputTokensUsed: 0 },
    "12345678"
  );
  const afterResponse = applyResponseUsage(afterPrompt, "1234");

  assert.deepEqual(afterResponse, {
    promptCount: 1,
    inputTokensUsed: 2,
    outputTokensUsed: 1
  });
});
