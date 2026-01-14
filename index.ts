/**
 * OpenCode Prompts Plugin - Entry Point
 *
 * Re-exports the plugin from the nested .opencode/plugin/ structure.
 * This file is needed for global plugin installation at ~/.config/opencode/plugin/
 */

export { OpenCodePromptsPlugin, default } from "./.opencode/plugin/index.js";
