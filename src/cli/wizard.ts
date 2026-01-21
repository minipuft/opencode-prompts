/**
 * Interactive wizard components for CLI.
 *
 * Provides reusable prompts for multi-step installation flows.
 * Uses single-keypress selection for fast UX.
 */

import * as readline from "node:readline/promises";

/**
 * A single choice in a wizard step.
 */
export interface WizardChoice {
  key: string;
  label: string;
  value: string;
  recommended?: boolean;
}

/**
 * A wizard step with a question and choices.
 */
export interface WizardStep {
  id: string;
  title: string;
  description: string;
  choices: WizardChoice[];
  allowCustom?: boolean;
  customPrompt?: string;
  condition?: (answers: Record<string, string>) => boolean;
}

/**
 * Display formatting helpers.
 */
const fmt = {
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
};

/**
 * Create a readline interface.
 */
function createRL(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

/**
 * Read a single keypress (no Enter required).
 */
function readSingleKey(): Promise<string> {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;

    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    const onData = (key: string) => {
      stdin.setRawMode(wasRaw);
      stdin.pause();
      stdin.removeListener("data", onData);

      // Handle Ctrl+C
      if (key === "\x03") {
        process.exit(0);
      }

      resolve(key.toLowerCase());
    };

    stdin.once("data", onData);
  });
}

/**
 * Run a single wizard step and return the selected value.
 * Uses single-keypress selection for choices.
 */
export async function runWizardStep(
  step: WizardStep,
  stepNumber?: number,
  totalSteps?: number
): Promise<string> {
  // Header
  console.log();
  if (stepNumber && totalSteps) {
    console.log(fmt.dim(`Step ${stepNumber}/${totalSteps}`));
  }
  console.log(fmt.bold(step.title));
  console.log(fmt.dim(step.description));
  console.log();

  // Choices
  for (const choice of step.choices) {
    const recommended = choice.recommended ? fmt.green(" (recommended)") : "";
    console.log(`  [${fmt.cyan(choice.key)}] ${choice.label}${recommended}`);
  }

  if (step.allowCustom) {
    console.log(`  [${fmt.cyan("c")}] Custom path...`);
  }

  console.log();
  process.stdout.write(`${fmt.dim("Select")}: `);

  // Single-keypress selection
  while (true) {
    const key = await readSingleKey();

    // Check for custom path
    if (step.allowCustom && key === "c") {
      console.log(key); // Echo the key
      const rl = createRL();
      try {
        const customPath = await rl.question(
          `${step.customPrompt ?? "Enter path"}: `
        );
        return `custom:${customPath.trim()}`;
      } finally {
        rl.close();
      }
    }

    // Check for valid choice
    const choice = step.choices.find(
      (c) => c.key.toLowerCase() === key
    );
    if (choice) {
      console.log(key); // Echo the key
      return choice.value;
    }

    // Default to recommended on Enter
    if (key === "\r" || key === "\n") {
      const defaultChoice = step.choices.find((c) => c.recommended) ?? step.choices[0];
      console.log(defaultChoice.key); // Echo the default
      return defaultChoice.value;
    }

    // Invalid key - no feedback, just wait for valid input
  }
}

/**
 * Run a multi-step wizard and return all answers.
 */
export async function runWizard(
  steps: WizardStep[]
): Promise<Record<string, string>> {
  const answers: Record<string, string> = {};
  let currentStep = 0;

  while (currentStep < steps.length) {
    const step = steps[currentStep];

    // Check condition
    if (step.condition && !step.condition(answers)) {
      currentStep++;
      continue;
    }

    const value = await runWizardStep(
      step,
      currentStep + 1,
      steps.filter((s) => !s.condition || s.condition(answers)).length
    );
    answers[step.id] = value;
    currentStep++;
  }

  return answers;
}

/**
 * Show a summary and ask for confirmation.
 * Uses single-keypress selection.
 */
export async function confirmWizard(
  summary: { label: string; value: string }[]
): Promise<"confirm" | "change" | "quit"> {
  console.log();
  console.log(fmt.bold("Ready to install:"));
  console.log();

  for (const item of summary) {
    console.log(`  ${fmt.dim("•")} ${item.label}: ${fmt.cyan(item.value)}`);
  }

  console.log();
  console.log(
    `  [${fmt.green("Enter")}] Confirm  |  [${fmt.yellow("c")}] Change  |  [${fmt.dim("q")}] Quit`
  );
  console.log();
  process.stdout.write(`${fmt.dim("Action")}: `);

  while (true) {
    const key = await readSingleKey();

    if (key === "q") {
      console.log(key);
      return "quit";
    }
    if (key === "c") {
      console.log(key);
      return "change";
    }
    if (key === "\r" || key === "\n") {
      console.log(); // New line for Enter
      return "confirm";
    }
    // Invalid key - wait for valid input
  }
}

/**
 * Ask a simple yes/no question.
 * Uses single-keypress selection.
 */
export async function askYesNo(
  question: string,
  defaultYes = true
): Promise<boolean> {
  const prompt = defaultYes ? "[Y/n]" : "[y/N]";
  process.stdout.write(`${question} ${prompt}: `);

  while (true) {
    const key = await readSingleKey();

    if (key === "y") {
      console.log(key);
      return true;
    }
    if (key === "n") {
      console.log(key);
      return false;
    }
    if (key === "\r" || key === "\n") {
      console.log(defaultYes ? "y" : "n");
      return defaultYes;
    }
    // Invalid key - wait for valid input
  }
}

/**
 * Ask for a text input (requires Enter).
 */
export async function askText(
  question: string,
  defaultValue?: string
): Promise<string> {
  const rl = createRL();

  try {
    const prompt = defaultValue ? `${question} [${defaultValue}]` : question;
    const answer = await rl.question(`${prompt}: `);
    const trimmed = answer.trim();

    return trimmed || defaultValue || "";
  } finally {
    rl.close();
  }
}
