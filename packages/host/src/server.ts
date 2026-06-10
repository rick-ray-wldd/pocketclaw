/**
 * HTTP + WebSocket server implementing PocketClaw Wire Protocol v0, plus the
 * composition root (startHost) that wires registry, broker, session manager,
 * Obsidian logger, and overseer together.
 *
 * Binds 0.0.0.0 — intended to be reached over a Tailscale tailnet only.
 */
import { timingSafeEqual } from "node:crypto";
import { existsSync, statSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { WebSocket, WebSocketServer, type RawData } from "ws";
import { parseClientMessage } from "@pocketclaw/shared";
import type { Workspace } from "@pocketclaw/shared";
import { auditPath, ensureDirs, sessionsDir, VERSION, type HostConfig } from "./config.js";
import { errorMessage, log } from "./log.js";
import { ObsidianLogger } from "./obsidian.js";
import { Overseer } from "./overseer.js";
import { PermissionBroker } from "./permissionBroker.js";
import { SessionManager } from "./sessionManager.js";
import { WorkspaceRegistry } from "./workspaces.js";

export interface RunningHost {
  server: http.Server;
  sessions: SessionManager;
  broker: PermissionBroker;
  workspaces: WorkspaceRegistry;
  overseer: Overseer;
  obsidian: ObsidianLogger;
  close(): Promise<void>;
}

/** Constant-time bearer-token comparison. */
export function tokenEquals(candidate: string, expected: string): boolean {
  const a = Buffer.from(candidate, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) {
    // Equalize timing for the common (wrong-length) case before rejecting.
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}

function readBody(req: http.IncomingMessage, limit = 64 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk.toString();
      if (body.length > limit) {
        reject(new Error("body too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function sendJson(res: http.ServerResponse, status: number, payload: unknown): void {
  const data = JSON.stringify(payload);
  res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) });
  res.end(data);
}

export async function startHost(config: HostConfig): Promise<RunningHost> {
  ensureDirs();

  // --- Composition -------------------------------------------------------
  const clients = new Set<WebSocket>();
  const broadcast = (message: unknown): void => {
    const data = JSON.stringify(message);
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) client.send(data);
    }
  };

  const registry = new WorkspaceRegistry();
  const obsidian = new ObsidianLogger(config.vaultPath);

  // The broker needs the manager for titles/status; bind lazily.
  let manager: SessionManager | undefined;
  const broker = new PermissionBroker({
    auditPath: auditPath(),
    getSessionTitle: (sessionId) => manager?.titleOf(sessionId) ?? "unknown session",
    onRequest: (request) => {
      manager?.setExternalStatus(request.sessionId, "waiting_permission");
      broadcast({ type: "permission_request", request });
    },
    onResolve: (requestId, behavior, request) => {
      manager?.setExternalStatus(request.sessionId, "running");
      broadcast({ type: "permission_resolved", requestId, behavior });
    },
  });

  manager = new SessionManager({
    broker,
    dir: sessionsDir(),
    hooks: {
      onChange: (sessions) => broadcast({ type: "sessions", sessions }),
      onEvent: (sessionId, event) => broadcast({ type: "event", sessionId, event }),
      onEnd: (summary, events, filesTouched) => obsidian.logSessionEnd(summary, events, filesTouched),
    },
  });
  const sessions = manager;

  const overseer = new Overseer({
    getSummaries: () => sessions.list(),
    getEvents: (sessionId) => sessions.getEvents(sessionId),
    obsidian,
  });
  overseer.startDailyRollup();

  // --- REST --------------------------------------------------------------
  const server = http.createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? "/", "http://localhost");
      if (!url.pathname.startsWith("/api/")) {
        sendJson(res, 404, { ok: false, error: "not found" });
        return;
      }
      const auth = req.headers.authorization ?? "";
      const bearer = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
      if (!tokenEquals(bearer, config.token)) {
        sendJson(res, 401, { ok: false, error: "unauthorized" });
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/health") {
        sendJson(res, 200, { ok: true, version: VERSION });
        return;
      }
      if (req.method === "GET" && url.pathname === "/api/sessions") {
        sendJson(res, 200, { sessions: sessions.list() });
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/decision") {
        const body = JSON.parse((await readBody(req)) || "{}") as { requestId?: unknown; behavior?: unknown };
        if (typeof body.requestId !== "string" || (body.behavior !== "allow" && body.behavior !== "deny")) {
          sendJson(res, 400, { ok: false, error: "expected { requestId, behavior: allow|deny }" });
          return;
        }
        const resolved = broker.resolveDecision(body.requestId, body.behavior, "rest");
        if (resolved === "resolved") sendJson(res, 200, { ok: true });
        else if (resolved === "forbidden")
          sendJson(res, 403, { ok: false, error: "high-risk requests cannot be approved via REST — open the app" });
        else sendJson(res, 404, { ok: false, error: "unknown or expired requestId" });
        return;
      }
      if (req.method === "GET" && url.pathname === "/api/obsidian/today") {
        const today = obsidian.readToday();
        if (today) sendJson(res, 200, today);
        else sendJson(res, 503, { ok: false, error: "vaultPath not configured" });
        return;
      }
      sendJson(res, 404, { ok: false, error: "not found" });
    })().catch((err) => {
      log.warn("HTTP handler error:", errorMessage(err));
      if (!res.headersSent) sendJson(res, 500, { ok: false, error: errorMessage(err) });
    });
  });

  // --- WebSocket ---------------------------------------------------------
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    try {
      const url = new URL(req.url ?? "", "http://localhost");
      const token = url.searchParams.get("token") ?? "";
      if (url.pathname !== "/ws" || !tokenEquals(token, config.token)) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (client) => wss.emit("connection", client, req));
    } catch {
      socket.destroy();
    }
  });

  const send = (client: WebSocket, message: unknown): void => {
    if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(message));
  };
  const sendError = (client: WebSocket, message: string): void => send(client, { type: "error", message });

  const handleMessage = (client: WebSocket, raw: RawData): void => {
    let msg: { type?: unknown; [key: string]: unknown };
    try {
      msg = JSON.parse(raw.toString()) as typeof msg;
    } catch {
      sendError(client, "invalid JSON");
      return;
    }
    // The shared zod schemas are the protocol's source of truth; the typeof
    // guards in the switch below stay as defense in depth.
    const parsed = parseClientMessage(msg);
    if (!parsed.ok) {
      sendError(client, `invalid message: ${parsed.error}`);
      return;
    }

    switch (msg.type) {
      case "hello": {
        send(client, { type: "sessions", sessions: sessions.list() });
        send(client, { type: "workspaces", workspaces: registry.list() });
        // Replay pending permission requests so a reconnecting app can decide.
        for (const request of broker.pending()) send(client, { type: "permission_request", request });
        break;
      }
      case "spawn": {
        let workspace: Workspace | undefined;
        if (typeof msg.workspace === "string") {
          workspace = registry.get(msg.workspace);
          if (!workspace) {
            sendError(client, `unknown workspace alias: ${msg.workspace}`);
            return;
          }
          registry.touch(workspace.alias);
        } else if (
          typeof msg.workspace === "object" &&
          msg.workspace !== null &&
          typeof (msg.workspace as { path?: unknown }).path === "string"
        ) {
          const resolved = path.resolve((msg.workspace as { path: string }).path);
          if (!existsSync(resolved) || !statSync(resolved).isDirectory()) {
            sendError(client, `not a directory: ${resolved}`);
            return;
          }
          workspace = { alias: path.basename(resolved), path: resolved, lastUsedAt: Date.now() };
        } else {
          sendError(client, "spawn requires a workspace alias or { path }");
          return;
        }
        const prompt = typeof msg.prompt === "string" && msg.prompt.trim() ? msg.prompt : undefined;
        sessions.spawn(workspace, prompt).catch((err) => sendError(client, `spawn failed: ${errorMessage(err)}`));
        break;
      }
      case "input": {
        if (typeof msg.sessionId !== "string" || typeof msg.text !== "string") {
          sendError(client, "input requires sessionId and text");
          return;
        }
        if (!sessions.input(msg.sessionId, msg.text)) sendError(client, `unknown or ended session: ${msg.sessionId}`);
        break;
      }
      case "decision": {
        if (typeof msg.requestId !== "string" || (msg.behavior !== "allow" && msg.behavior !== "deny")) {
          sendError(client, "decision requires requestId and behavior allow|deny");
          return;
        }
        const note = typeof msg.note === "string" ? msg.note : undefined;
        const outcome = broker.resolveDecision(msg.requestId, msg.behavior, "ws", note);
        if (outcome === "unknown") sendError(client, `unknown or expired requestId: ${msg.requestId}`);
        break;
      }
      case "kill": {
        if (typeof msg.sessionId !== "string") {
          sendError(client, "kill requires sessionId");
          return;
        }
        void sessions.kill(msg.sessionId).then((ok) => {
          if (!ok) sendError(client, `unknown session: ${msg.sessionId}`);
        });
        break;
      }
      case "list_workspaces": {
        send(client, { type: "workspaces", workspaces: registry.list() });
        break;
      }
      case "add_workspace": {
        if (typeof msg.alias !== "string" || typeof msg.path !== "string") {
          sendError(client, "add_workspace requires alias and path");
          return;
        }
        try {
          registry.add(msg.alias, msg.path);
          broadcast({ type: "workspaces", workspaces: registry.list() });
        } catch (err) {
          sendError(client, errorMessage(err));
        }
        break;
      }
      case "remove_workspace": {
        if (typeof msg.alias !== "string") {
          sendError(client, "remove_workspace requires alias");
          return;
        }
        if (registry.remove(msg.alias)) broadcast({ type: "workspaces", workspaces: registry.list() });
        else sendError(client, `unknown workspace alias: ${msg.alias}`);
        break;
      }
      case "overseer_ask": {
        if (typeof msg.question !== "string" || !msg.question.trim()) {
          sendError(client, "overseer_ask requires question");
          return;
        }
        const question = msg.question;
        void overseer
          .ask(question)
          .then((answer) => send(client, { type: "overseer_answer", question, answer }))
          .catch((err) => sendError(client, `overseer failed: ${errorMessage(err)}`));
        break;
      }
      default:
        sendError(client, `unknown message type: ${msg.type}`);
    }
  };

  wss.on("connection", (client: WebSocket) => {
    clients.add(client);
    log.info(`WS client connected (${clients.size} total)`);
    send(client, { type: "sessions", sessions: sessions.list() });
    send(client, { type: "workspaces", workspaces: registry.list() });
    client.on("message", (raw: RawData) => {
      try {
        handleMessage(client, raw);
      } catch (err) {
        sendError(client, errorMessage(err));
      }
    });
    client.on("close", () => {
      clients.delete(client);
      log.info(`WS client disconnected (${clients.size} total)`);
    });
    client.on("error", (err) => log.warn("WS client error:", errorMessage(err)));
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.port, "0.0.0.0", () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
  log.info(`PocketClaw host v${VERSION} listening on 0.0.0.0:${config.port} (tailnet use intended)`);

  return {
    server,
    sessions,
    broker,
    workspaces: registry,
    overseer,
    obsidian,
    async close(): Promise<void> {
      overseer.stop();
      for (const client of clients) client.close();
      wss.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
