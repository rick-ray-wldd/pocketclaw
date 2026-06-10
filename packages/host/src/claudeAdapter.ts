/**
 * Thin adapter isolating the Claude Agent SDK surface from the rest of the host.
 *
 * Everything outside this file only deals with AdapterSession/AdapterEvent, so
 * reviewers can validate the daemon without SDK knowledge. The SDK is loaded
 * via a dynamic import so the host degrades gracefully (a "fatal" event) when
 * the package is not installed or fails to load.
 *
 * Mapping (SDK message -> AdapterEvent):
 *   assistant text blocks       -> { kind: "assistant_text" }
 *   assistant tool_use blocks   -> { kind: "tool_use", inputPreview (120 chars) }
 *   user tool_result blocks     -> { kind: "tool_result" }
 *   result message              -> { kind: "turn_end", costUsd } (session stays
 *                                  alive for multi-turn streaming input)
 */
import { errorMessage, log, preview } from "./log.js";

const SDK_MODULE = "@anthropic-ai/claude-agent-sdk";

export type PermissionDecision =
  | { behavior: "allow"; updatedInput: Record<string, unknown> }
  | { behavior: "deny"; message: string };

export type CanUseToolFn = (tool: string, input: Record<string, unknown>) => Promise<PermissionDecision>;

export type AdapterEvent =
  | { kind: "assistant_text"; text: string }
  | { kind: "tool_use"; tool: string; inputPreview: string }
  | { kind: "tool_result"; tool: string; ok: boolean; preview: string }
  | { kind: "turn_end"; costUsd?: number; isError: boolean }
  | { kind: "fatal"; message: string };

export interface AdapterSession {
  /** Queue another user turn into the live session. */
  send(text: string): void;
  /** Interrupt the current turn (if any) and end the session. */
  kill(): Promise<void>;
  /** Ends when the underlying SDK session ends. */
  events: AsyncIterable<AdapterEvent>;
}

export interface SpawnOptions {
  cwd: string;
  initialPrompt?: string;
  canUseTool: CanUseToolFn;
}

/** Unbounded push queue exposed as an async iterable. */
class AsyncQueue<T> implements AsyncIterable<T> {
  private items: T[] = [];
  private resolvers: Array<(result: IteratorResult<T>) => void> = [];
  private closed = false;

  push(item: T): void {
    if (this.closed) return;
    const resolver = this.resolvers.shift();
    if (resolver) resolver({ value: item, done: false });
    else this.items.push(item);
  }

  end(): void {
    if (this.closed) return;
    this.closed = true;
    for (const resolver of this.resolvers.splice(0)) {
      resolver({ value: undefined as never, done: true });
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: (): Promise<IteratorResult<T>> => {
        const item = this.items.shift();
        if (item !== undefined) return Promise.resolve({ value: item, done: false });
        if (this.closed) return Promise.resolve({ value: undefined as never, done: true });
        return new Promise((resolve) => this.resolvers.push(resolve));
      },
    };
  }
}

/** SDK streaming-input user message (typed loosely; the SDK is imported dynamically). */
function userMessage(text: string): Record<string, unknown> {
  return {
    type: "user",
    message: { role: "user", content: text },
    parent_tool_use_id: null,
    session_id: "",
  };
}

interface SdkQueryLike extends AsyncIterable<Record<string, unknown>> {
  interrupt?: () => Promise<void>;
}

/**
 * Spawn a Claude Code session in `cwd` using streaming input mode so the
 * session stays alive across multiple user turns.
 */
export async function spawnSession(opts: SpawnOptions): Promise<AdapterSession> {
  const events = new AsyncQueue<AdapterEvent>();
  const input = new AsyncQueue<Record<string, unknown>>();

  let sdk: { query: (args: Record<string, unknown>) => SdkQueryLike };
  try {
    // Dynamic specifier keeps typechecking independent of the SDK install.
    sdk = (await import(SDK_MODULE)) as typeof sdk;
    if (typeof sdk.query !== "function") throw new Error("query() export not found");
  } catch (err) {
    const message = `Claude Agent SDK unavailable (${errorMessage(err)}). Install ${SDK_MODULE} on the host.`;
    log.error(message);
    events.push({ kind: "fatal", message });
    events.end();
    return { send: () => undefined, kill: async () => undefined, events };
  }

  if (opts.initialPrompt) input.push(userMessage(opts.initialPrompt));

  const queryStream = sdk.query({
    prompt: (async function* () {
      for await (const message of input) yield message;
    })(),
    options: {
      cwd: opts.cwd,
      permissionMode: "default",
      includePartialMessages: false,
      canUseTool: async (tool: string, toolInput: Record<string, unknown>) =>
        opts.canUseTool(tool, toolInput ?? {}),
    },
  });

  // tool_use_id -> tool name, so tool_result events carry the tool name.
  const toolNames = new Map<string, string>();

  void (async () => {
    try {
      for await (const message of queryStream) {
        const m = message as { type?: string; [key: string]: unknown };
        if (m.type === "assistant") {
          const content = (m.message as { content?: unknown } | undefined)?.content;
          if (!Array.isArray(content)) continue;
          for (const block of content as Array<Record<string, unknown>>) {
            if (block.type === "text" && typeof block.text === "string" && block.text.trim()) {
              events.push({ kind: "assistant_text", text: block.text });
            } else if (block.type === "tool_use") {
              const tool = String(block.name ?? "unknown");
              if (typeof block.id === "string") toolNames.set(block.id, tool);
              events.push({ kind: "tool_use", tool, inputPreview: preview(block.input, 120) });
            }
          }
        } else if (m.type === "user") {
          const content = (m.message as { content?: unknown } | undefined)?.content;
          if (!Array.isArray(content)) continue;
          for (const block of content as Array<Record<string, unknown>>) {
            if (block.type === "tool_result") {
              const tool = toolNames.get(String(block.tool_use_id)) ?? "unknown";
              events.push({
                kind: "tool_result",
                tool,
                ok: block.is_error !== true,
                preview: preview(block.content ?? "", 200),
              });
            }
          }
        } else if (m.type === "result") {
          events.push({
            kind: "turn_end",
            costUsd: typeof m.total_cost_usd === "number" ? m.total_cost_usd : undefined,
            isError: m.subtype !== "success",
          });
        }
      }
    } catch (err) {
      events.push({ kind: "fatal", message: errorMessage(err) });
    } finally {
      events.end();
    }
  })();

  return {
    send(text: string): void {
      input.push(userMessage(text));
    },
    async kill(): Promise<void> {
      try {
        if (typeof queryStream.interrupt === "function") await queryStream.interrupt();
      } catch (err) {
        log.debug("interrupt() failed:", err);
      }
      // Closing the input generator ends the streaming session.
      input.end();
    },
    events,
  };
}
