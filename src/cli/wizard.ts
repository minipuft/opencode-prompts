/**
 * Interactive wizard components for CLI.
 *
 * Provides reusable prompts for multi-step installation flows.
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
 * Run a single wizard step and return the selected value.
 */
export async function runWizardStep(
  step: WizardStep,
  stepNumber?: number,
  totalSteps?: number
): Promise<string> {
  const rl = createRL();

  try {
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

    // Get input
    while (true) {
      const answer = await rl.question(`${fmt.dim("Select")}: `);
      const normalized = answer.toLowerCase().trim();

      // Check for custom path
      if (step.allowCustom && normalized === "c") {
        const customPath = await rl.question(
          `${step.customPrompt ?? "Enter path"}: `
        );
        return `custom:${customPath.trim()}`;
      }

      // Check for valid choice
      const choice = step.choices.find(
        (c) => c.key.toLowerCase() === normalized
      );
      if (choice) {
        return choice.value;
      }

      // Default to first choice on empty input
      if (normalized === "" && step.choices.length > 0) {
        const defaultChoice = step.choices.find((c) => c.recommended) ?? step.choices[0];
        return defaultChoice.value;
      }

      console.log(fmt.yellow("Invalid choice. Please try again."));
    }
  } finally {
    rl.close();
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
 */
export async function confirmWizard(
  summary: { label: string; value: string }[]
): Promise<"confirm" | "change" | "quit"> {
  const rl = createRL();

  try {
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

    const answer = await rl.question(`${fmt.dim("Action")}: `);
    const normalized = answer.toLowerCase().trim();

    if (normalized === "q" || normalized === "quit") {
      return "quit";
    }
    if (normalized === "c" || normalized === "change") {
      return "change";
    }
    return "confirm";
  } finally {
    rl.close();
  }
}

/**
 * Ask a simple yes/no question.
 */
export async function askYesNo(
  question: string,
  defaultYes = true
): Promise<boolean> {
  const rl = createRL();

  try {
    const prompt = defaultYes ? "[Y/n]" : "[y/N]";
    const answer = await rl.question(`${question} ${prompt}: `);
    const normalized = answer.toLowerCase().trim();

    if (normalized === "") {
      return defaultYes;
    }
    return normalized === "y" || normalized === "yes";
  } finally {
    rl.close();
  }
}

/**
 * Ask for a text input.
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
