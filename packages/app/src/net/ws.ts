import { HostMessageSchema, type ClientMessage, type HostMessage } from '@pocketclaw/shared';
import { useStore } from '@/state/store';
import { buildWsUrl } from '@/net/api';
import * as LiveActivity from '@/live-activity';

const BASE_DELAY_MS = 1_000;
const MAX_DELAY_MS = 30_000;

/**
 * Reconnecting WebSocket client for the PocketClaw host.
 * Exponential backoff 1s -> 30s with +-20% jitter; parses every inbound
 * frame through the shared zod schema before touching the store.
 */
class PocketClawSocket {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private attempt = 0;
  private enabled = false;
  private readonly clientId = `app-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  /** (Re)connect using the credentials currently in the store. */
  connect(): void {
    const { serverUrl, token } = useStore.getState();
    this.enabled = serverUrl !== '' && token !== '';
    this.attempt = 0;
    this.teardown();
    if (this.enabled) this.open();
    else useStore.getState().setConnection('disconnected');
  }

  disconnect(): void {
    this.enabled = false;
    this.teardown();
    useStore.getState().setConnection('disconnected');
  }

  send(message: ClientMessage): boolean {
    if (this.ws !== null && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
      return true;
    }
    return false;
  }

  private teardown(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws !== null) {
      const ws = this.ws;
      this.ws = null;
      ws.onopen = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;
      try {
        ws.close();
      } catch {
        // already closed
      }
    }
  }

  private open(): void {
    const { serverUrl, token, setConnection } = useStore.getState();
    setConnection('connecting');
    let ws: WebSocket;
    try {
      ws = new WebSocket(buildWsUrl(serverUrl, token));
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      this.attempt = 0;
      useStore.getState().setConnection('connected');
      useStore.getState().setLastError(null);
      this.send({ type: 'hello', clientId: this.clientId });
      this.send({ type: 'list_workspaces' });
    };

    ws.onmessage = (event: { data?: unknown }) => {
      if (typeof event.data !== 'string') return;
      let raw: unknown;
      try {
        raw = JSON.parse(event.data);
      } catch {
        return;
      }
      const parsed = HostMessageSchema.safeParse(raw);
      if (!parsed.success) {
        console.warn('[ws] dropped unparseable host message', parsed.error.message);
        return;
      }
      this.dispatch(parsed.data);
    };

    ws.onerror = () => {
      // onclose always follows; reconnect is handled there.
    };

    ws.onclose = () => {
      this.ws = null;
      useStore.getState().setConnection('disconnected');
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    if (!this.enabled || this.reconnectTimer !== null) return;
    const exp = Math.min(BASE_DELAY_MS * 2 ** this.attempt, MAX_DELAY_MS);
    const jittered = exp * (0.8 + Math.random() * 0.4);
    this.attempt = Math.min(this.attempt + 1, 10);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.enabled) this.open();
    }, jittered);
  }

  private dispatch(message: HostMessage): void {
    const store = useStore.getState();
    switch (message.type) {
      case 'sessions':
        store.setSessions(message.sessions);
        LiveActivity.syncSessions(message.sessions);
        break;
      case 'workspaces':
        store.setWorkspaces(message.workspaces);
        break;
      case 'event':
        store.addEvent(message.sessionId, message.event);
        break;
      case 'permission_request':
        store.addPermissionRequest(message.request);
        // Medium-risk requests become approvable from the Live Activity;
        // high-risk only shows an "open app" link (enforced in the widget).
        if (message.request.riskTier !== 'low') {
          LiveActivity.showPermission(message.request);
        }
        break;
      case 'permission_resolved': {
        store.resolvePermissionRequest(message.requestId);
        const sessionId = LiveActivity.findSessionIdForRequest(message.requestId);
        if (sessionId !== null) LiveActivity.clearPermission(sessionId);
        break;
      }
      case 'overseer_answer':
        store.resolveOverseerAnswer(message.question, message.answer);
        break;
      case 'error':
        store.setLastError(message.message);
        break;
    }
  }
}

export const socket = new PocketClawSocket();
