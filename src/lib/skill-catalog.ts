/**
 * Skill catalog scanner for OpenCode prompts plugin.
 *
 * Scans ~/.claude/skills/ for SKILL.md files, categorizes by keyword matching,
 * and returns a compact skill-first context string for system prompt injection.
 *
 * Port of gemini-prompts/hooks/session-start.py skill scanning logic.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

/** Category keywords matched against skill description frontmatter. */
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  Process: [
    "debug", "diagnosis", "root cause", "fix validation",
    "planning", "task breakdown", "implementation design",
    "exploration", "file discovery", "code search",
    "refactor", "migration", "lifecycle", "pre-flight",
    "validation suite", "compliance",
    "assessment", "tradeoff", "quality review",
    "context window", "compaction", "doom loop",
    "clarification", "ambiguous", "underspecified",
  ],
  Architecture: [
    "layer", "OOP", "FP", "dependency injection", "module organization",
    "test type", "integration-first", "Jest", "coverage", "mock",
    "dead code", "consolidation", "lint ratchet", "architecture enforcement",
    "release", "version bump", "publish", "changelog finalization",
    "rule lifecycle", "knowledge placement", "glob design",
    "directive style", "consumption context",
  ],
  Languages: [
    "JavaScript", "async pattern", "module system", "runtime quirk",
    "TypeScript", "strict typing", "generics", "type inference",
    "Python", "PEP", "pytest", "type annotation",
    "SQL", "query pattern", "join", "schema design",
    "SQLite", "WAL", "sql.js", "WASM", "embedded database",
  ],
  Tools: [
    "Claude Code", "tool selection", "agent routing", "skill system", "hook",
    "MCP server", "protocol compliance", "tool design", "transport",
    "commit convention", "branching", "safety protocol", "git",
    "Playwright", "browser automation", "screenshot",
    "OpenCode plugin", "opencode",
    "Gemini", "gemini-extension",
    "Spicetify", "Player API", "Platform API", "theming system", "marketplace",
  ],
  Knowledge: [
    "context7", "library documentation", "API freshness", "drift",
    "pattern capture", "growth declaration", "knowledge feedback",
    "memory file", "MEMORY.md", "topic file",
    "changelog entry", "Keep a Changelog", "Release Please",
    "skill creation", "format standard", "ecosystem map",
  ],
  Quality: [
    "code review", "standards compliance", "consolidation opportunit",
    "diagnose", "codebase issue", "tech debt",
    "typecheck", "lint", "test status", "coverage delta",
  ],
};

/** Category display order. */
const CATEGORY_ORDER = ["Process", "Architecture", "Languages", "Tools", "Knowledge", "Quality", "Other"];

/**
 * Extract description from SKILL.md YAML frontmatter.
 */
function readSkillDescription(skillDir: string): string | null {
  const skillMd = join(skillDir, "SKILL.md");
  if (!existsSync(skillMd)) return null;

  let content: string;
  try {
    content = readFileSync(skillMd, "utf-8");
  } catch {
    return null;
  }

  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return null;

  const frontmatter = match[1];

  // Try multi-line >- syntax first
  const multiLineMatch = frontmatter.match(/description:\s*>-?\s*\n((?:\s+.*\n)*)/);
  if (multiLineMatch) {
    const raw = multiLineMatch[1].trim();
    if (raw) return raw.replace(/\s+/g, " ").trim();
  }

  // Fall back to single-line description
  const singleLineMatch = frontmatter.match(/description:\s*(.+)/);
  if (singleLineMatch) {
    const raw = singleLineMatch[1].trim();
    if (raw && !raw.startsWith(">")) return raw;
  }

  return null;
}

/**
 * Match skill to category by keyword overlap.
 */
function categorizeSkill(description: string): string {
  const descLower = description.toLowerCase();
  let bestCategory = "Other";
  let bestScore = 0;

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    const score = keywords.filter(kw => descLower.includes(kw.toLowerCase())).length;
    if (score > bestScore) {
      bestScore = score;
      bestCategory = category;
    }
  }

  return bestCategory;
}

/**
 * Scan skills directory and return categorized skill names.
 */
function scanSkills(skillsDir: string): Record<string, string[]> {
  const categories: Record<string, string[]> = {};

  if (!existsSync(skillsDir)) return categories;

  let entries: string[];
  try {
    entries = readdirSync(skillsDir).sort();
  } catch {
    return categories;
  }

  for (const entry of entries) {
    if (entry.startsWith(".") || entry.startsWith("_")) continue;

    const entryPath = join(skillsDir, entry);
    const description = readSkillDescription(entryPath);
    if (!description) continue;

    const category = categorizeSkill(description);
    if (!categories[category]) categories[category] = [];
    categories[category].push(entry);
  }

  return categories;
}

/**
 * Build compact skill-first context string for system prompt injection.
 */
function buildContext(categories: Record<string, string[]>): string {
  const lines = [
    "Skills-first: invoke /skill BEFORE reasoning from memory. " +
    "Check → invoke → announce → follow.",
    "",
  ];

  for (const cat of CATEGORY_ORDER) {
    const skills = categories[cat];
    if (!skills?.length) continue;
    const skillList = skills.map(s => `/${s}`).join(" ");
    lines.push(`${cat}: ${skillList}`);
  }

  lines.push(
    "",
    "Priority: process → architecture → language → tool → knowledge",
    "Stacking: /search → route → design → implement → validate → capture",
    'Red flag: "I know this" / "skill is overkill" → STOP, invoke skill',
  );

  return lines.join("\n");
}

/**
 * Scan ~/.claude/skills/ and return a formatted skill catalog string.
 * Returns null if no skills are found.
 */
export function scanSkillCatalog(): string | null {
  const skillsDir = join(homedir(), ".claude", "skills");
  const categories = scanSkills(skillsDir);

  if (Object.keys(categories).length === 0) return null;

  return buildContext(categories);
}
