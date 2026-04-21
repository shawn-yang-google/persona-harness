import { parseArgs } from "util";
import { readFile } from "fs/promises";
import { startChat } from "../chat/index.ts";
import type { PersonaContract } from "../types/index.ts";

const { values, positionals } = parseArgs({
  args: Bun.argv,
  options: {
    help: {
      type: "boolean",
      short: "h",
    },
    persona: {
      type: "string",
      short: "p",
    },
    "max-retries": {
      type: "string",
      default: "3",
    },
  },
  strict: true,
  allowPositionals: true,
});

const command = positionals[2];

async function loadPersona(path: string): Promise<PersonaContract> {
  const raw = await readFile(path, "utf-8");
  const contract = JSON.parse(raw) as PersonaContract;

  // Basic validation
  if (!contract.persona_id) throw new Error("Missing persona_id in contract");
  if (!contract.trait_profile) throw new Error("Missing trait_profile in contract");
  if (!contract.beliefs) throw new Error("Missing beliefs in contract");
  if (!contract.cognitive_style) throw new Error("Missing cognitive_style in contract");
  if (!contract.linguistic_constraints) throw new Error("Missing linguistic_constraints in contract");
  if (!contract.thresholds) throw new Error("Missing thresholds in contract");

  return contract;
}

async function main() {
  if (values.help || !command) {
    console.log(`
Usage: personaharness <command> [options]

Commands:
  chat                     Start an interactive chat with a persona-constrained agent
  train <harness_name>     Train a specific sub-harness (future)
  evaluate <trajectory>    Batch-evaluate trajectories against harness ensemble (future)

Options (chat):
  --persona, -p <file>     Path to persona contract JSON file (required)
  --max-retries <number>   Max rephrase attempts on violation (default: 3)
  --help, -h               Show this help message

Example:
  personaharness chat --persona personas/rigorous-architect.json
    `);
    process.exit(0);
  }

  switch (command) {
    case "chat": {
      const personaPath = values.persona;
      if (!personaPath) {
        console.error("Error: --persona <file> is required for chat mode.");
        console.error("Example: personaharness chat --persona personas/rigorous-architect.json");
        process.exit(1);
      }

      let contract: PersonaContract;
      try {
        contract = await loadPersona(personaPath);
      } catch (err: any) {
        console.error(`Error loading persona: ${err.message}`);
        process.exit(1);
      }

      const maxRetries = parseInt(values["max-retries"] as string) || 3;

      await startChat({
        contract,
        maxRetries,
        logDirectory: "logs",
      });
      break;
    }

    case "train": {
      console.log("Training mode is not yet implemented. See prd.md Phase 4.");
      process.exit(0);
      break;
    }

    case "evaluate": {
      console.log("Evaluate mode is not yet implemented. See prd.md Phase 2.");
      process.exit(0);
      break;
    }

    default: {
      console.error(`Unknown command: ${command}`);
      console.error("Run 'personaharness --help' for usage.");
      process.exit(1);
    }
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
