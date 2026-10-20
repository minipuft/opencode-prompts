/**
 * What the plugin tells the model to send when a gate awaits review.
 *
 * claude-prompts 6.0 accepts `gate_verdict` only as a structured object and refuses a
 * string such as `GATE_REVIEW: PASS - reason`. Every reminder, denial and compaction
 * note that names the reply takes it from here so the guidance has one definition.
 * (Code that READS a verdict still accepts the legacy string so a 5.x engine keeps
 * working: see gate-enforcement.ts.)
 */

/** The object shape the engine's `gate_verdict` parameter takes. */
export const GATE_VERDICT_SHAPE = '{"overall":"PASS"|"FAIL","rationale":"<reason>"}';

/** The reply to teach: the parameter name plus the object shape. */
export const GATE_VERDICT_REPLY = `gate_verdict: ${GATE_VERDICT_SHAPE}`;

/** A concrete passing reply, for "retry with ..." and "to clear" messages. */
export const GATE_VERDICT_PASS_EXAMPLE = 'gate_verdict: {"overall":"PASS","rationale":"<reason>"}';
