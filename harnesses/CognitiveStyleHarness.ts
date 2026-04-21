import type { PersonaContext, HarnessResult } from "../src/types/index.ts";
import { generateContent, MODELS } from "../src/llm/index.ts";

/**
 * Tier 2 Hybrid Harness — CognitiveStyleHarness
 *
 * Phase A: LLM extracts structural text features (structured JSON).
 * Phase B: Deterministic code classifies reasoning, verbosity, and formality.
 *
 * The LLM is NEVER asked to classify — only to extract observable features.
 */

// ─── Graph interface (Phase A extraction target) ─────────────────────────────

interface CognitiveStyleGraph {
  avg_sentence_length: number;
  max_sentence_length: number;
  formal_vocabulary: string[];
  informal_vocabulary: string[];
  logical_connectors: string[];
  metaphors_analogies: string[];
  data_references: string[];
  structure_markers: string[];
  slang_count: number;
  contraction_count: number;
  word_count: number;
}

// ─── Phase A: Extraction ─────────────────────────────────────────────────────

function buildExtractionPrompt(response: string, _context: PersonaContext): string {
  return `You are a structural text feature extractor. Extract observable structural features from the following text. Do NOT classify, interpret, or judge — only extract what is present.

Text to analyze:
${response}

Return ONLY a JSON object:
{
  "avg_sentence_length": <average number of words per sentence>,
  "max_sentence_length": <maximum words in any single sentence>,
  "formal_vocabulary": ["<formal words like 'therefore', 'consequently', 'regarding', 'furthermore', 'henceforth'>"],
  "informal_vocabulary": ["<informal words like 'gonna', 'kinda', 'stuff', 'cool', 'yeah', 'nope'>"],
  "logical_connectors": ["<words/phrases like 'because', 'therefore', 'if...then', 'given that', 'consequently', 'thus'>"],
  "metaphors_analogies": ["<figurative language, similes, metaphors, analogies>"],
  "data_references": ["<numbers, statistics, citations, percentages, specific data points>"],
  "structure_markers": ["<bullet points, numbered lists, headers, section dividers>"],
  "slang_count": <number of slang words or expressions>,
  "contraction_count": <number of contractions like 'don't', 'can't', 'it's'>,
  "word_count": <total word count>
}`;
}

function createEmptyGraph(): CognitiveStyleGraph {
  return {
    avg_sentence_length: 0,
    max_sentence_length: 0,
    formal_vocabulary: [],
    informal_vocabulary: [],
    logical_connectors: [],
    metaphors_analogies: [],
    data_references: [],
    structure_markers: [],
    slang_count: 0,
    contraction_count: 0,
    word_count: 0,
  };
}

function parseGraph(raw: string): CognitiveStyleGraph {
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return createEmptyGraph();
    const parsed = JSON.parse(match[0]);
    return {
      avg_sentence_length: typeof parsed.avg_sentence_length === "number" ? parsed.avg_sentence_length : 0,
      max_sentence_length: typeof parsed.max_sentence_length === "number" ? parsed.max_sentence_length : 0,
      formal_vocabulary: Array.isArray(parsed.formal_vocabulary) ? parsed.formal_vocabulary : [],
      informal_vocabulary: Array.isArray(parsed.informal_vocabulary) ? parsed.informal_vocabulary : [],
      logical_connectors: Array.isArray(parsed.logical_connectors) ? parsed.logical_connectors : [],
      metaphors_analogies: Array.isArray(parsed.metaphors_analogies) ? parsed.metaphors_analogies : [],
      data_references: Array.isArray(parsed.data_references) ? parsed.data_references : [],
      structure_markers: Array.isArray(parsed.structure_markers) ? parsed.structure_markers : [],
      slang_count: typeof parsed.slang_count === "number" ? parsed.slang_count : 0,
      contraction_count: typeof parsed.contraction_count === "number" ? parsed.contraction_count : 0,
      word_count: typeof parsed.word_count === "number" ? parsed.word_count : 0,
    };
  } catch {
    return createEmptyGraph();
  }
}

// ─── Phase B: Deterministic checkers ─────────────────────────────────────────

function classifyReasoning(g: CognitiveStyleGraph): "analytical" | "intuitive" | "balanced" {
  const logicalCount = g.logical_connectors.length + g.data_references.length;
  const intuitiveCount = g.metaphors_analogies.length;

  if (logicalCount === 0 && intuitiveCount === 0) return "balanced";
  if (logicalCount > intuitiveCount * 2) return "analytical";
  if (intuitiveCount > logicalCount * 2) return "intuitive";
  return "balanced";
}

function classifyVerbosity(g: CognitiveStyleGraph): "concise" | "moderate" | "verbose" {
  // "Concise" for a domain expert means "no unnecessary filler", not "short".
  // A 350-word technical answer with no redundancy IS concise.
  // Verbose means exhaustive elaboration well beyond what's needed (800+).
  if (g.word_count < 400) return "concise";
  if (g.word_count > 800) return "verbose";
  return "moderate";
}

function classifyFormality(g: CognitiveStyleGraph): "high" | "medium" | "low" {
  const formalCount = g.formal_vocabulary.length;
  const informalCount = g.informal_vocabulary.length + g.slang_count + g.contraction_count;

  // No informality markers at all = formal by default (absence of casual = formal)
  if (informalCount === 0 && formalCount === 0) return "high";
  const total = formalCount + informalCount;
  const formalRatio = formalCount / total;

  if (formalRatio > 0.65) return "high";
  if (formalRatio < 0.35) return "low";
  return "medium";
}

function checkCognitiveStyle(
  graph: CognitiveStyleGraph,
  contract: PersonaContext["contract"]
): { feedback: string[]; scores: Record<string, number> } {
  const feedback: string[] = [];
  const expected = contract.cognitive_style;

  const detectedReasoning = classifyReasoning(graph);
  const detectedVerbosity = classifyVerbosity(graph);
  const detectedFormality = classifyFormality(graph);

  const reasoningMatch = detectedReasoning === expected.reasoning ? 1 : 0;
  // Verbosity is ordinal: concise < moderate < verbose.
  // Allow one step of drift (concise↔moderate is OK, concise↔verbose is a violation).
  const verbosityOrder = { concise: 0, moderate: 1, verbose: 2 } as const;
  const verbosityDrift = Math.abs(
    verbosityOrder[detectedVerbosity] - verbosityOrder[expected.verbosity]
  );
  const verbosityMatch = verbosityDrift <= 1 ? 1 : 0;
  const formalityMatch = detectedFormality === expected.formality ? 1 : 0;

  if (!reasoningMatch) {
    feedback.push(
      `Reasoning style: expected "${expected.reasoning}", detected "${detectedReasoning}" ` +
      `(logical_connectors=${graph.logical_connectors.length}, data_refs=${graph.data_references.length}, ` +
      `metaphors=${graph.metaphors_analogies.length})`
    );
  }
  if (!verbosityMatch) {
    feedback.push(
      `Verbosity: expected "${expected.verbosity}", detected "${detectedVerbosity}" ` +
      `(word_count=${graph.word_count})`
    );
  }
  if (!formalityMatch) {
    feedback.push(
      `Formality: expected "${expected.formality}", detected "${detectedFormality}" ` +
      `(formal=${graph.formal_vocabulary.length}, informal=${graph.informal_vocabulary.length}, ` +
      `slang=${graph.slang_count}, contractions=${graph.contraction_count})`
    );
  }

  return {
    feedback,
    scores: { reasoning_match: reasoningMatch, verbosity_match: verbosityMatch, formality_match: formalityMatch },
  };
}

// ─── Main evaluate ───────────────────────────────────────────────────────────

export async function evaluate(
  response: string,
  context: PersonaContext
): Promise<HarnessResult> {
  // Phase A: LLM extracts structural features
  let graph: CognitiveStyleGraph;
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
      harness: "CognitiveStyleHarness",
      valid: true,
      feedback: [`CognitiveStyleHarness: Evaluator error — ${err.message}`],
    };
  }

  // Phase B: Deterministic code classifies and checks thresholds
  const { feedback, scores } = checkCognitiveStyle(graph, context.contract);

  return {
    harness: "CognitiveStyleHarness",
    valid: feedback.length === 0,
    feedback,
    scores,
  };
}
