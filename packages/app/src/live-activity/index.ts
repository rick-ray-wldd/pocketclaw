import { Platform } from 'react-native';
import type { PermissionRequest, SessionSummary } from '@pocketclaw/shared';
import {
  LiveActivityNative,
  type LiveActivityContentState,
} from '../../modules/live-activity/src/index';
import { parseServerUrl } from '@/net/api';

/**
 * High-level Live Activity controller. Tracks one activity per session,
 * keeps the last pushed ContentState so partial updates compose, and
 * no-ops everywhere the native module is missing (Android / Expo Go).
 */

const lastState = new Map<string, LiveActivityContentState>();

function available(): boolean {
  return Platform.OS === 'ios' && LiveActivityNative !== null;
}

function defaultState(session: SessionSummary): LiveActivityContentState {
  return {
    status: session.status,
    progressText: session.lastMessage,
    todoDone: session.todo?.done ?? 0,
    todoTotal: session.todo?.total ?? 0,
    pendingRequestId: null,
    pendingTool: null,
    riskTier: null,
  };
}

/** Persist host url + token into the App Group for the widget's App Intents. */
export function setSharedConfig(serverUrl: string, token: string): void {
  if (!available() || serverUrl === '') return;
  const { httpBase } = parseServerUrl(serverUrl);
  LiveActivityNative!.setSharedConfig(httpBase, token);
}

export function startActivity(session: SessionSummary): void {
  if (!available()) return;
  const state = defaultState(session);
  lastState.set(session.id, state);
  void LiveActivityNative!.startActivity(
    {
      sessionId: session.id,
      sessionTitle: session.title,
      workspaceAlias: session.workspace.alias,
    },
    state,
  ).catch(() => {});
}

export function updateActivity(
  sessionId: string,
  patch: Partial<LiveActivityContentState>,
): void {
  if (!available()) return;
  const prev = lastState.get(sessionId);
  if (prev === undefined) return; // no activity tracked for this session
  const next: LiveActivityContentState = { ...prev, ...patch };
  lastState.set(sessionId, next);
  void LiveActivityNative!.updateActivity(sessionId, next).catch(() => {});
}

export function endActivity(sessionId: string): void {
  if (!available()) return;
  lastState.delete(sessionId);
  void LiveActivityNative!.endActivity(sessionId).catch(() => {});
}

const TERMINAL = new Set(['done', 'error']);

/**
 * Reconcile activities against the authoritative session list:
 * start activities for new live sessions, refresh tracked ones,
 * and end activities for finished/vanished sessions.
 */
export function syncSessions(sessions: SessionSummary[]): void {
  if (!available()) return;
  const seen = new Set<string>();
  for (const session of sessions) {
    seen.add(session.id);
    const tracked = lastState.has(session.id);
    if (TERMINAL.has(session.status)) {
      if (tracked) {
        updateActivity(session.id, {
          status: session.status,
          progressText: session.lastMessage,
          pendingRequestId: null,
          pendingTool: null,
          riskTier: null,
        });
        endActivity(session.id);
      }
    } else if (tracked) {
      updateActivity(session.id, {
        status: session.status,
        progressText: session.lastMessage,
        todoDone: session.todo?.done ?? 0,
        todoTotal: session.todo?.total ?? 0,
      });
    } else {
      startActivity(session);
    }
  }
  for (const id of [...lastState.keys()]) {
    if (!seen.has(id)) endActivity(id);
  }
}

/**
 * Surface a permission request on the session's activity. Medium tier gets
 * Approve/Deny buttons in the widget; high tier only shows "Open PocketClaw"
 * (the widget renders based on riskTier — high must never be approvable there).
 */
export function showPermission(request: PermissionRequest): void {
  updateActivity(request.sessionId, {
    status: 'waiting_permission',
    pendingRequestId: request.requestId,
    pendingTool: request.tool,
    riskTier: request.riskTier,
  });
}

/** Clear the pending permission from a session's activity once resolved. */
export function clearPermission(sessionId: string): void {
  updateActivity(sessionId, {
    pendingRequestId: null,
    pendingTool: null,
    riskTier: null,
  });
}

export function findSessionIdForRequest(requestId: string): string | null {
  for (const [sessionId, state] of lastState) {
    if (state.pendingRequestId === requestId) return sessionId;
  }
  return null;
}
