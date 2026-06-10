import { create } from 'zustand';
import type {
  PermissionRequest,
  SessionEvent,
  SessionSummary,
  Workspace,
} from '@pocketclaw/shared';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

export interface OverseerQA {
  question: string;
  answer?: string;
  askedAt: number;
}

const MAX_EVENTS_PER_SESSION = 500;

export interface AppState {
  // settings
  serverUrl: string;
  token: string;
  // live data mirrored from the host
  connection: ConnectionStatus;
  sessions: SessionSummary[];
  workspaces: Workspace[];
  pendingRequests: PermissionRequest[];
  /** Per-session event log, capped at 500 entries each. */
  events: Map<string, SessionEvent[]>;
  overseerQA: OverseerQA[];
  lastError: string | null;

  // actions (mirror the wire protocol)
  setServer: (serverUrl: string, token: string) => void;
  setConnection: (connection: ConnectionStatus) => void;
  setSessions: (sessions: SessionSummary[]) => void;
  setWorkspaces: (workspaces: Workspace[]) => void;
  addEvent: (sessionId: string, event: SessionEvent) => void;
  addPermissionRequest: (request: PermissionRequest) => void;
  resolvePermissionRequest: (requestId: string) => void;
  addOverseerQuestion: (question: string) => void;
  resolveOverseerAnswer: (question: string, answer: string) => void;
  setLastError: (message: string | null) => void;
}

export const useStore = create<AppState>()((set) => ({
  serverUrl: '',
  token: '',
  connection: 'disconnected',
  sessions: [],
  workspaces: [],
  pendingRequests: [],
  events: new Map(),
  overseerQA: [],
  lastError: null,

  setServer: (serverUrl, token) => set({ serverUrl, token }),

  setConnection: (connection) => set({ connection }),

  setSessions: (sessions) =>
    set((state) => {
      // Drop pending requests whose session disappeared.
      const liveIds = new Set(sessions.map((s) => s.id));
      const pendingRequests = state.pendingRequests.filter((r) => liveIds.has(r.sessionId));
      return { sessions, pendingRequests };
    }),

  setWorkspaces: (workspaces) => set({ workspaces }),

  addEvent: (sessionId, event) =>
    set((state) => {
      const events = new Map(state.events);
      const list = [...(events.get(sessionId) ?? []), event];
      events.set(sessionId, list.length > MAX_EVENTS_PER_SESSION ? list.slice(-MAX_EVENTS_PER_SESSION) : list);
      return { events };
    }),

  addPermissionRequest: (request) =>
    set((state) => {
      if (state.pendingRequests.some((r) => r.requestId === request.requestId)) return state;
      return { pendingRequests: [...state.pendingRequests, request] };
    }),

  resolvePermissionRequest: (requestId) =>
    set((state) => ({
      pendingRequests: state.pendingRequests.filter((r) => r.requestId !== requestId),
    })),

  addOverseerQuestion: (question) =>
    set((state) => ({
      overseerQA: [...state.overseerQA, { question, askedAt: Date.now() }],
    })),

  resolveOverseerAnswer: (question, answer) =>
    set((state) => {
      // Answer the most recent unanswered entry with a matching question.
      const overseerQA = [...state.overseerQA];
      for (let i = overseerQA.length - 1; i >= 0; i--) {
        const qa = overseerQA[i];
        if (qa !== undefined && qa.question === question && qa.answer === undefined) {
          overseerQA[i] = { ...qa, answer };
          return { overseerQA };
        }
      }
      // No match (e.g. asked from another client) — append.
      overseerQA.push({ question, answer, askedAt: Date.now() });
      return { overseerQA };
    }),

  setLastError: (lastError) => set({ lastError }),
}));

/** Selector helper: events for one session (stable empty array fallback). */
const EMPTY_EVENTS: SessionEvent[] = [];
export function selectSessionEvents(state: AppState, sessionId: string): SessionEvent[] {
  return state.events.get(sessionId) ?? EMPTY_EVENTS;
}
