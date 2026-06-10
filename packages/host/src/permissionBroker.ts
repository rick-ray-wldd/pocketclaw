/**
 * PermissionBroker — turns SDK canUseTool callbacks into PocketClaw decisions.
 *
 * low tier    -> auto-allow immediately (still audited).
 * medium/high -> create a PermissionRequest, notify clients, await a decision
 *                from WS ("decision" message) or REST (POST /api/decision).
 *                After 180s: default-deny.
 *
 * Every decision is appended to ~/.pocketclaw/audit.jsonl.
 */
import { randomUUID } from "node:crypto";
import { appendFile } from "node:fs/promises";
import { computeRiskTier } from "@pocketclaw/shared";
import type { PermissionRequest, RiskTier } from "@pocketclaw/shared";
import type { CanUseToolFn, PermissionDecision } from "./claudeAdapter.js";
import { log, preview } from "./log.js";

export type DecisionSource = "auto" | "ws" | "rest" | "timeout";

const DEFAULT_TIMEOUT_MS = 180_000;

interface PendingEntry {
  request: PermissionRequest;
  input: Record<string, unknown>;
  timer: NodeJS.Timeout;
  settle: (decision: PermissionDecision) => void;
}

export interface PermissionBrokerOptions {
  auditPath: string;
  timeoutMs?: number;
  getSessionTitle(sessionId: string): string;
  /** Called when a medium/high request is created (broadcast + status update). */
  onRequest(request: PermissionRequest): void;
  /** Called when a request is resolved by user, REST, or timeout. */
  onResolve(requestId: string, behavior: "allow" | "deny", request: PermissionRequest): void;
}

interface AuditRecord {
  ts: number;
  requestId?: string;
  sessionId: string;
  tool: string;
  input: unknown;
  tier: RiskTier;
  behavior: "allow" | "deny";
  source: DecisionSource;
  note?: string;
}

export class PermissionBroker {
  private readonly pendingMap = new Map<string, PendingEntry>();
  private readonly timeoutMs: number;

  constructor(private readonly opts: PermissionBrokerOptions) {
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /** Returns the canUseTool callback for one session. */
  handle(sessionId: string): CanUseToolFn {
    return async (tool, input) => {
      const tier = computeRiskTier(tool, input);
      if (tier === "low") {
        this.audit({ ts: Date.now(), sessionId, tool, input, tier, behavior: "allow", source: "auto" });
        return { behavior: "allow", updatedInput: input };
      }

      const request: PermissionRequest = {
        requestId: randomUUID(),
        sessionId,
        sessionTitle: this.opts.getSessionTitle(sessionId),
        tool,
        inputPreview: preview(input, 120),
        riskTier: tier,
        createdAt: Date.now(),
      };

      return new Promise<PermissionDecision>((settle) => {
        const timer = setTimeout(() => {
          this.pendingMap.delete(request.requestId);
          this.audit({
            ts: Date.now(),
            requestId: request.requestId,
            sessionId,
            tool,
            input,
            tier,
            behavior: "deny",
            source: "timeout",
          });
          this.opts.onResolve(request.requestId, "deny", request);
          settle({ behavior: "deny", message: "PocketClaw: timed out (default-deny)" });
        }, this.timeoutMs);
        // Deliberately not unref'd: the default-deny must settle the SDK
        // callback even when this timer is the only pending work.
        this.pendingMap.set(request.requestId, { request, input, timer, settle });
        log.info(`Permission request ${request.requestId} [${tier}] ${tool} for session ${sessionId}`);
        this.opts.onRequest(request);
      });
    };
  }

  /**
   * Resolve a pending request. Returns:
   *  - "resolved"   decision applied
   *  - "unknown"    requestId unknown or already settled
   *  - "forbidden"  high-tier allow attempted from an untrusted source (REST).
   *
   * High-tier requests can only be APPROVED over the authenticated WS channel
   * (the app foreground). REST — the Live Activity App Intent path — may deny
   * anything but never allow a high-tier request, so the host stays the final
   * authority even if a widget or third-party client misbehaves.
   */
  resolveDecision(
    requestId: string,
    behavior: "allow" | "deny",
    source: DecisionSource,
    note?: string,
  ): "resolved" | "unknown" | "forbidden" {
    const entry = this.pendingMap.get(requestId);
    if (!entry) return "unknown";
    if (entry.request.riskTier === "high" && behavior === "allow" && source !== "ws") {
      log.warn(`Refused high-tier allow for ${requestId} from source=${source}`);
      return "forbidden";
    }
    clearTimeout(entry.timer);
    this.pendingMap.delete(requestId);
    this.audit({
      ts: Date.now(),
      requestId,
      sessionId: entry.request.sessionId,
      tool: entry.request.tool,
      input: entry.input,
      tier: entry.request.riskTier,
      behavior,
      source,
      ...(note ? { note } : {}),
    });
    this.opts.onResolve(requestId, behavior, entry.request);
    if (behavior === "allow") {
      entry.settle({ behavior: "allow", updatedInput: entry.input });
    } else {
      entry.settle({
        behavior: "deny",
        message: note ? `PocketClaw: denied by user — ${note}` : "PocketClaw: denied by user",
      });
    }
    log.info(`Permission ${requestId} resolved: ${behavior} (${source})`);
    return "resolved";
  }

  pending(): PermissionRequest[] {
    return [...this.pendingMap.values()].map((entry) => entry.request);
  }

  private audit(record: AuditRecord): void {
    appendFile(this.opts.auditPath, `${JSON.stringify(record)}\n`).catch((err) =>
      log.warn("audit write failed:", err)
    );
  }
}
