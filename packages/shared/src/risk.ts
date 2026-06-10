/**
 * Risk-tier computation for tool permission requests.
 *
 * Computed host-side before broadcasting a PermissionRequest:
 *   low    -> auto-allow silently (but log)
 *   medium -> requires decision; approvable from the iOS Live Activity
 *   high   -> requires decision; Live Activity must NOT offer Approve
 *             (only "Open app")
 */
import type { RiskTier } from './protocol.js';

/** Tools that are read-only / side-effect-free: auto-allowed. */
export const LOW_RISK_TOOLS: ReadonlySet<string> = new Set([
  'Read',
  'Grep',
  'Glob',
  'WebSearch',
  'TodoWrite',
  'Task',
  'NotebookRead',
]);

/** Bash commands matching this pattern are escalated to "high". */
export const DANGEROUS_BASH_REGEX =
  /(rm\s+-rf|sudo|git\s+push\s+--force|--force|mkfs|shutdown|reboot|deploy|publish|>(\s*)\/dev)/i;

/** Tool names matching this pattern (e.g. mcp delete tools) are "high". */
const DESTRUCTIVE_TOOL_NAME_REGEX = /delete|remove/i;

/** Safely extract input.command when input is an object with a string command. */
function extractCommand(input: unknown): string | undefined {
  if (typeof input === 'object' && input !== null && 'command' in input) {
    const command = (input as Record<string, unknown>).command;
    if (typeof command === 'string') {
      return command;
    }
  }
  return undefined;
}

/**
 * Compute the risk tier for a tool invocation.
 *
 * @param tool  Tool name as reported by the Claude Code SDK (e.g. "Bash", "Edit").
 * @param input Raw tool input; for Bash the "command" field is inspected.
 */
export function computeRiskTier(tool: string, input: unknown): RiskTier {
  // Destructive-sounding tool names are always high.
  if (DESTRUCTIVE_TOOL_NAME_REGEX.test(tool)) {
    return 'high';
  }

  if (tool === 'Bash') {
    const command = extractCommand(input);
    if (command !== undefined && DANGEROUS_BASH_REGEX.test(command)) {
      return 'high';
    }
    // Non-dangerous (or unparseable) Bash still requires a decision.
    return 'medium';
  }

  if (LOW_RISK_TOOLS.has(tool)) {
    return 'low';
  }

  // Everything else: Edit, Write, WebFetch, mcp__*, unknown tools.
  return 'medium';
}
