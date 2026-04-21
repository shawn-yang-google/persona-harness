import type { PersonaContext, HarnessResult } from "../src/types/index.ts";
import { generateContent, MODELS } from "../src/llm/index.ts";

/**
 * Tier 2 Hybrid Harness — NarrativeIdentityHarness
 *
 * Phase A: LLM extracts self-references, claimed roles, value statements,
 *          behavioral commitments, and tone shift indicators (structured JSON).
 * Phase B: Deterministic code checks narrative consistency against contract
 *          anchors, beliefs, and conversation history.
 *
 * The LLM is NEVER asked "does this contradict?" — only to extract features.
 */

// ─── Graph interface (Phase A extraction target) ─────────────────────────────

interface NarrativeGraph {
  self_descriptions: string[];
  roles_claimed: string[];
  value_statements: string[];
  behavioral_commitments: string[];
  tone_shift_indicators: string[];
}

// ─── Phase A: Extraction ─────────────────────────────────────────────────────

function buildExtractionPrompt(response: string, _context: PersonaContext): string {
  return `You are a narrative identity feature extractor. Extract self-references, claimed roles, and value statements from the following text. Do NOT interpret, judge, or evaluate — only extract what is present.

Text to analyze:
${response}

Return ONLY a JSON object:
{
  "self_descriptions": ["<how the speaker describes themselves, e.g. 'I am a careful thinker', 'as someone who values precision'>"],
  "roles_claimed": ["<any roles the speaker claims, e.g. 'as an architect', 'as your assistant', 'as a developer'>"],
  "value_statements": ["<ONLY first-person self-declarations of values, e.g. 'I believe in evidence', 'I value precision', 'my approach is always...'. Do NOT include general advice about the topic like 'one should define requirements precisely'.>"],
  "behavioral_commitments": ["<statements about habitual behavior, e.g. 'I always...', 'I never...', 'I prefer...', 'I tend to...'>"],
  "tone_shift_indicators": ["<words or phrases suggesting a different personality than expected, e.g. sudden casualness in formal context, unexpected enthusiasm, uncharacteristic hedging>"]
}

If a category has no matches, use an empty array [].`;
}

function createEmptyGraph(): NarrativeGraph {
  return {
    self_descriptions: [],
    roles_claimed: [],
    value_statements: [],
    behavioral_commitments: [],
    tone_shift_indicators: [],
  };
}

function parseGraph(raw: string): NarrativeGraph {
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return createEmptyGraph();
    const parsed = JSON.parse(match[0]);
    return {
      self_descriptions: Array.isArray(parsed.self_descriptions) ? parsed.self_descriptions : [],
      roles_claimed: Array.isArray(parsed.roles_claimed) ? parsed.roles_claimed : [],
      value_statements: Array.isArray(parsed.value_statements) ? parsed.value_statements : [],
      behavioral_commitments: Array.isArray(parsed.behavioral_commitments) ? parsed.behavioral_commitments : [],
      tone_shift_indicators: Array.isArray(parsed.tone_shift_indicators) ? parsed.tone_shift_indicators : [],
    };
  } catch {
    return createEmptyGraph();
  }
}

// ─── Phase B: Deterministic checkers ─────────────────────────────────────────

/** Normalize a string for keyword matching: lowercase, strip punctuation. */
function normalize(s: string | null | undefined): string {
  if (!s) return "";
  return s.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
}

/** Check if two strings share significant keyword overlap. */
function hasKeywordOverlap(a: string, b: string, minMatches = 1): boolean {
  const wordsA = normalize(a).split(" ").filter((w) => w.length > 3);
  const normalizedB = normalize(b);
  let matches = 0;
  for (const word of wordsA) {
    if (normalizedB.includes(word)) matches++;
  }
  return matches >= minMatches;
}

function checkRolesClaimed(
  graph: NarrativeGraph,
  narrativeAnchors: string[]
): string[] {
  const feedback: string[] = [];
  if (narrativeAnchors.length === 0 || graph.roles_claimed.length === 0) {
    return feedback;
  }

  for (const role of graph.roles_claimed) {
    const normalizedRole = normalize(role);
    if (!normalizedRole) continue;

    let matchesAnyAnchor = false;
    for (const anchor of narrativeAnchors) {
      if (hasKeywordOverlap(role, anchor)) {
        matchesAnyAnchor = true;
        break;
      }
    }

    if (!matchesAnyAnchor) {
      feedback.push(
        `Role mismatch: claimed "${role}" does not match any narrative anchor.`
      );
    }
  }

  return feedback;
}

function checkValueStatements(
  graph: NarrativeGraph,
  beliefs: string[]
): string[] {
  const feedback: string[] = [];
  if (beliefs.length === 0 || graph.value_statements.length === 0) {
    return feedback;
  }

  // Only flag clear, direct contradictions between first-person value declarations
  // and persona beliefs. Must be an explicit reversal, not just keyword overlap.
  for (const value of graph.value_statements) {
    const nv = normalize(value);

    // Skip if the value statement doesn't start with first-person — it's likely
    // extracted topic content, not a self-declaration.
    if (!nv.startsWith("i ") && !nv.startsWith("my ") && !nv.startsWith("we ")) {
      continue;
    }

    for (const belief of beliefs) {
      const nb = normalize(belief);

      // Direct reversal: belief says "skeptical of hype" but persona says "I love/embrace hype"
      if (nb.includes("skeptic") && nb.includes("hype") &&
          (nv.includes("love hype") || nv.includes("embrace hype") || nv.includes("hype is great"))) {
        feedback.push(
          `Value contradiction: "${value}" directly contradicts belief "${belief}".`
        );
      }

      // Direct reversal: belief says "truth > politeness" but persona says "I prioritize politeness"
      if (nb.includes("truth") && nb.includes("politeness") &&
          nv.includes("prioritize polite") && !nv.includes("truth")) {
        feedback.push(
          `Value contradiction: "${value}" directly contradicts belief "${belief}".`
        );
      }
    }
  }

  return feedback;
}

function checkToneShift(
  graph: NarrativeGraph,
  archetype: string
): string[] {
  const feedback: string[] = [];
  if (graph.tone_shift_indicators.length === 0) return feedback;

  // Filter out persona-defense statements (negations like "I am not a cat", "I cannot")
  const realShifts = graph.tone_shift_indicators.filter((indicator) => {
    const ni = normalize(indicator);
    // Skip negations — these are the persona defending itself, not drifting
    if (ni.includes("not ") || ni.includes("cannot") || ni.includes("unable") || ni.includes("will not")) {
      return false;
    }
    return true;
  });

  // Require 3+ real tone shift indicators to flag identity rupture.
  // 1-2 is noise; 3+ suggests a genuine personality shift.
  if (realShifts.length >= 3) {
    feedback.push(
      `Identity rupture signal: ${realShifts.length} tone shifts detected ` +
      `(${realShifts.slice(0, 3).map((s) => `"${s}"`).join(", ")}) — ` +
      `inconsistent with archetype "${archetype}".`
    );
  }

  return feedback;
}

function checkSelfDescriptionConsistency(
  graph: NarrativeGraph,
  conversationHistory: Array<{ role: string; content: string }>
): string[] {
  const feedback: string[] = [];
  if (graph.self_descriptions.length === 0 || conversationHistory.length === 0) {
    return feedback;
  }

  // Collect previous assistant self-descriptions from conversation history
  const previousAssistantMessages = conversationHistory
    .filter((m) => m.role === "assistant")
    .map((m) => normalize(m.content));

  if (previousAssistantMessages.length === 0) return feedback;

  // For each new self-description, check it doesn't contradict prior self-references
  // Simple heuristic: look for negation patterns of previously stated traits
  for (const desc of graph.self_descriptions) {
    const nd = normalize(desc);
    // Check for contradictory self-descriptions by looking for negation of key traits
    // e.g., previously said "I am precise" but now says "I am not precise" or "I am casual"
    for (const prev of previousAssistantMessages) {
      // Look for "not" + words that appear in current self-description
      const descWords = nd.split(" ").filter((w) => w.length > 4);
      for (const word of descWords) {
        if (prev.includes(`not ${word}`) || prev.includes(`never ${word}`)) {
          feedback.push(
            `Self-description inconsistency: current "${desc}" appears to contradict ` +
            `a prior statement containing "not ${word}" or "never ${word}".`
          );
          break;
        }
      }
    }
  }

  return feedback;
}

// ─── Main evaluate ───────────────────────────────────────────────────────────

export async function evaluate(
  response: string,
  context: PersonaContext
): Promise<HarnessResult> {
  const { narrative_anchors, beliefs, archetype } = context.contract;

  // Skip if no anchors and no history to check against
  if (
    narrative_anchors.length === 0 &&
    context.conversationHistory.length === 0
  ) {
    return {
      harness: "NarrativeIdentityHarness",
      valid: true,
      feedback: [],
    };
  }

  // Phase A: LLM extracts narrative identity features
  let graph: NarrativeGraph;
  try {
    const raw = await generateContent(
      MODELS.EVALUATOR,
      buildExtractionPrompt(response, context),
      undefined,
      0
    );
    graph = parseGraph(raw);
  } catch (err: any) {
    return {
      harness: "NarrativeIdentityHarness",
      valid: true,
      feedback: [
        `NarrativeIdentityHarness: Evaluator error — ${err.message}`,
      ],
    };
  }

  // Phase B: Deterministic code checks the graph
  const feedback: string[] = [
    ...checkRolesClaimed(graph, narrative_anchors),
    ...checkValueStatements(graph, beliefs),
    ...checkToneShift(graph, archetype),
    ...checkSelfDescriptionConsistency(graph, context.conversationHistory),
  ];

  return {
    harness: "NarrativeIdentityHarness",
    valid: feedback.length === 0,
    feedback,
  };
}
