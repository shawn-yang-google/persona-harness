import type { PersonaContext, HarnessResult } from "../src/types/index.ts";

/**
 * Tier 1 Code Harness — BoundaryHarness
 * Fast, deterministic checks for taboos and linguistic constraints.
 */

// Common emoji regex (covers most emoji ranges)
const EMOJI_REGEX =
  /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{200D}\u{20E3}]/gu;

export async function evaluate(
  response: string,
  context: PersonaContext
): Promise<HarnessResult> {
  const feedback: string[] = [];
  const { linguistic_constraints, taboos } = context.contract;

  // Check exclamation marks
  const exclamationCount = (response.match(/!/g) || []).length;
  if (exclamationCount > linguistic_constraints.max_exclamation_marks) {
    feedback.push(
      `Exclamation marks: found ${exclamationCount}, max allowed ${linguistic_constraints.max_exclamation_marks}`
    );
  }

  // Check emoji
  const emojiMatches = response.match(EMOJI_REGEX) || [];
  if (emojiMatches.length > linguistic_constraints.max_emoji) {
    feedback.push(
      `Emoji detected: found ${emojiMatches.length} (${emojiMatches.join("")}), max allowed ${linguistic_constraints.max_emoji}`
    );
  }

  // Check forbidden self-references
  for (const ref of linguistic_constraints.forbidden_self_reference) {
    const regex = new RegExp(`\b${ref}\b`, "gi");
    if (regex.test(response)) {
      feedback.push(`Forbidden self-reference detected: "${ref}"`);
    }
  }

  // Check taboos — context-aware: skip matches in refusal/negation sentences
  const refusalPatterns = [
    "do not", "don't", "cannot", "can't", "will not", "won't",
    "must not", "refuse", "decline", "unable", "never", "avoid",
    "not generate", "not use", "not adopt", "not produce", "not provide",
    "outside my", "beyond my", "not within my",
  ];

  // Check if the overall response is a refusal (starts with decline/refuse pattern)
  const responseLower = response.toLowerCase();
  const isOverallRefusal = refusalPatterns.some((p) => responseLower.slice(0, 200).includes(p));

  for (const taboo of taboos) {
    const regex = new RegExp(taboo, "gi");
    const match = regex.exec(response);
    if (match) {
      // If the entire response is a refusal, skip all taboo checks — the persona
      // is mentioning taboo words only to explain what it refuses to do.
      if (isOverallRefusal) continue;

      // Otherwise, check local context around the match
      const matchIdx = match.index;
      const contextStart = Math.max(0, matchIdx - 200);
      const contextEnd = Math.min(response.length, matchIdx + taboo.length + 200);
      const surrounding = response.slice(contextStart, contextEnd).toLowerCase();

      const isLocalRefusal = refusalPatterns.some((p) => surrounding.includes(p));
      if (!isLocalRefusal) {
        feedback.push(`Taboo triggered: "${taboo}"`);
      }
    }
  }

  return {
    harness: "BoundaryHarness",
    valid: feedback.length === 0,
    feedback,
  };
}
