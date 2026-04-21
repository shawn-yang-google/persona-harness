import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.warn("Warning: GEMINI_API_KEY is not set in the environment.");
}

export const ai = new GoogleGenAI({
  apiKey,
  vertexai: false,
  httpOptions: {
    baseUrl: "https://generativelanguage.googleapis.com",
  },
});

export const MODELS = {
  REFINER: "gemini-2.5-flash",
  CRITIC: "gemini-2.5-pro",
  GENERATOR: "gemini-2.5-flash-lite",  // Weak model — susceptible to persona attacks
  EVALUATOR: "gemini-3.1-flash-lite-preview",
} as const;

const MAX_API_RETRIES = 5;
const BASE_DELAY_MS = 5000;

/**
 * Generate a completion with retry logic for transient API errors.
 */
export async function generateContent(
  model: typeof MODELS[keyof typeof MODELS],
  prompt: string,
  systemInstruction?: string,
  temperature = 0.1
): Promise<string> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_API_RETRIES; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction: systemInstruction ?? undefined,
          temperature,
        },
      });

      if (!response.text) {
        throw new Error("LLM response missing text content");
      }

      return response.text;
    } catch (err: any) {
      lastError = err;
      const status = err?.status ?? err?.code;
      const isRetryable = status === 503 || status === 429;

      if (isRetryable && attempt < MAX_API_RETRIES) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        console.warn(
          `API returned ${status}, retrying in ${delay / 1000}s (${attempt + 1}/${MAX_API_RETRIES})...`
        );
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      throw err;
    }
  }

  throw lastError;
}
