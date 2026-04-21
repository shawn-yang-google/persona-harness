/** Persona Contract — the structured JSON schema defining a persona */
export interface PersonaContract {
  persona_id: string;

  /** Big Five (OCEAN) trait profile, each 0.0–1.0 */
  trait_profile: {
    openness: number;
    conscientiousness: number;
    extraversion: number;
    agreeableness: number;
    neuroticism: number;
  };

  /** Core beliefs that must not be violated */
  beliefs: string[];

  /** Cognitive/communication style */
  cognitive_style: {
    reasoning: "analytical" | "intuitive" | "balanced";
    verbosity: "concise" | "moderate" | "verbose";
    formality: "high" | "medium" | "low";
  };

  /** Key self-story statements to track narrative continuity */
  narrative_anchors: string[];

  /** DISC behavioral type */
  disc_type: "D" | "I" | "S" | "C";

  /** Jungian archetype */
  archetype: string;

  /** Forbidden behaviors / tokens */
  taboos: string[];

  /** Deterministic linguistic constraints */
  linguistic_constraints: {
    max_exclamation_marks: number;
    max_emoji: number;
    min_avg_sentence_length: number;
    allowed_self_reference: string[];
    forbidden_self_reference: string[];
  };

  /** Gating thresholds */
  thresholds: {
    trait_match_min: number;
    embedding_anchor_similarity_min: number;
    judge_compliance_min: number;
  };
}

/** Runtime context passed to each harness during evaluation */
export interface PersonaContext {
  contract: PersonaContract;
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>;
  narrativeSummary: string;
}

/** Result returned by each sub-harness */
export interface HarnessResult {
  /** Name of the harness that produced this result */
  harness: string;
  valid: boolean;
  feedback: string[];
  scores?: Record<string, number>;
}

/** Combined result from the full ensemble */
export interface EnsembleResult {
  valid: boolean;
  results: HarnessResult[];
}

/** A single sub-harness function signature */
export type PersonaHarness = (
  response: string,
  context: PersonaContext
) => Promise<HarnessResult>;

/** Training trajectory for harness synthesis */
export interface Trajectory {
  conversation: Array<{ role: "user" | "assistant"; content: string }>;
  label: "compliant" | "drifted";
  score?: number;
  violations?: string[];
}
