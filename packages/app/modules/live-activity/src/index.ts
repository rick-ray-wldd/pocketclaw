import { requireOptionalNativeModule } from 'expo';

/** Mirrors PocketClawActivityAttributes.ContentState in Swift. */
export interface LiveActivityContentState {
  status: string;
  progressText: string;
  todoDone: number;
  todoTotal: number;
  pendingRequestId?: string | null;
  pendingTool?: string | null;
  riskTier?: string | null;
}

export interface LiveActivityStartAttributes {
  sessionId: string;
  sessionTitle: string;
  workspaceAlias: string;
}

export interface LiveActivityNativeModule {
  areActivitiesEnabled(): boolean;
  /** Persist host url + token in the App Group so widget intents can call the REST API. */
  setSharedConfig(url: string, token: string): void;
  startActivity(attributes: LiveActivityStartAttributes, state: LiveActivityContentState): Promise<boolean>;
  updateActivity(sessionId: string, state: LiveActivityContentState): Promise<boolean>;
  endActivity(sessionId: string): Promise<boolean>;
}

/**
 * Null when the native module is unavailable (Android, Expo Go, web).
 * All callers must guard.
 */
export const LiveActivityNative: LiveActivityNativeModule | null =
  requireOptionalNativeModule<LiveActivityNativeModule>('LiveActivity');
