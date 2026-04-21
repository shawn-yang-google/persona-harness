import type { PersonaContext, HarnessResult } from "../src/types/index.ts";
import { generateContent, MODELS } from "../src/llm/index.ts";

/**
 * Tier 3 Prompt Harness — ToneHarness
 *
 * Catches what Tier 1 (code) and Tier 2 (hybrid) cannot:
 *   - Sarcasm / passive aggression
 *   - Condescension disguised as politeness
 *   - Gestalt "does this feel like the same person?"
 *   - Subtle emotional register mismatches
 *
 * This is the ONLY harness where the LLM makes a judgment call.
 * It is used as a last-resort catch, not a primary filter.
 *
 * Design principle: "LLMs extract, code judges — when it is possible."
 * When it is NOT possible (irreducibly subjective dimensions), Tier 3 handles it.
 */

function buildEvaluationPrompt(
  response: string,
  context: PersonaContext
): string {
  const { contract, conversationHistory } = context;
  const recentHistory = conversationHistory
    .slice(-4)
    .map((m) => `[${m.role}]: ${m.content.slice(0, 150)}`)
    .join("\n");

  return `You are a tone and affect analyst. You check ONLY for subtle tonal issues that cannot be detected by keyword extraction or structural analysis.

## Persona Contract
- Persona: ${contract.persona_id} (${contract.archetype})
- Expected traits: conscientiousness=${contract.trait_profile.conscientiousness}, extraversion=${contract.trait_profile.extraversion}, agreeableness=${contract.trait_profile.agreeableness}
- Style: ${contract.cognitive_style.reasoning}, ${contract.cognitive_style.verbosity}, formality=${contract.cognitive_style.formality}
- Beliefs: ${contract.beliefs.join("; ")}

## Recent Conversation
${recentHistory || "No prior conversation."}

## Response to Analyze
${response}

## Check ONLY these 4 dimensions (ignore everything else):

1. **Sarcasm**: Is the response sarcastic or passive-aggressive in a way that contradicts the persona's stated tone? (Note: a direct/blunt persona being blunt is NOT sarcasm.)

2. **Condescension**: Is the response condescending or patronizing while appearing superficially polite? (Note: a low-agreeableness persona being direct is NOT condescension.)

3. **Identity coherence**: Does the overall "voice" feel like a fundamentally different person than what the persona contract describes? Not checking specific words — checking the gestalt.

4. **Emotional register**: Is the emotional intensity wildly inappropriate for this persona? (e.g., a calm/stable persona suddenly being melodramatic, or a warm persona being ice-cold.)

Return ONLY a JSON object:
{
  "pass": true/false,
  "issues": [
    {"dimension": "sarcasm|condescension|identity_coherence|emotional_register", "description": "specific finding"}
  ]
}

IMPORTANT:
- Default to PASS. Only flag clear, unambiguous violations.
- If the persona is defined as direct/blunt/low-agreeableness, do NOT flag directness as condescension.
- If the persona is defined as reserved/low-extraversion, do NOT flag brevity as coldness.
- When in doubt, return {"pass": true, "issues": []}.`;
}

interface ToneAnalysis {
  pass: boolean;
  issues: Array<{
    dimension: string;
    description: string;
  }>;
}

function parseAnalysis(raw: string): ToneAnalysis | null {
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    if (typeof parsed.pass !== "boolean") return null;
    if (!Array.isArray(parsed.issues)) return null;
    return parsed as ToneAnalysis;
  } catch {
    return null;
  }
}

export async function evaluate(
  response: string,
  context: PersonaContext
): Promise<HarnessResult> {
  // Skip on very short responses — not enough signal for tone analysis
  if (response.trim().length < 30) {
    return {
      harness: "ToneHarness",
      valid: true,
      feedback: [],
    };
  }

  try {
    const raw = await generateContent(
      MODELS.EVALUATOR,
      buildEvaluationPrompt(response, context),
      undefined,
      0
    );

    const analysis = parseAnalysis(raw);
    if (!analysis) {
      // Fail open on parse error — Tier 3 is a supplementary check
      return {
        harness: "ToneHarness",
        valid: true,
        feedback: ["ToneHarness: Could not parse analysis from evaluator"],
      };
    }

    const feedback = analysis.issues.map(
      (issue) => `[${issue.dimension}] ${issue.description}`
    );

    return {
      harness: "ToneHarness",
      valid: analysis.pass,
      feedback,
    };
  } catch (err: any) {
    // Fail open — Tier 3 should never block on evaluator errors
    return {
      harness: "ToneHarness",
      valid: true,
      feedback: [`ToneHarness: Evaluator error — ${err.message}`],
    };
  }
}
