/**
 * PocketClaw Wire Protocol v0 — single source of truth.
 *
 * Every message exchanged over the WebSocket (ws://<host>:8787/ws?token=...)
 * is a JSON object with a "type" field. The zod schemas below are authoritative;
 * host and app must validate with parseClientMessage / parseHostMessage.
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Core entities
// ---------------------------------------------------------------------------

export const WorkspaceSchema = z.object({
  alias: z.string(),
  path: z.string(),
  lastUsedAt: z.number().optional(),
});
export type Workspace = z.infer<typeof WorkspaceSchema>;

export const SessionStatusSchema = z.enum([
  'starting',
  'running',
  'waiting_input',
  'waiting_permission',
  'done',
  'error',
]);
export type SessionStatus = z.infer<typeof SessionStatusSchema>;

export const SessionSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  workspace: WorkspaceSchema,
  status: SessionStatusSchema,
  lastMessage: z.string(),
  startedAt: z.number(),
  updatedAt: z.number(),
  todo: z
    .object({
      done: z.number(),
      total: z.number(),
    })
    .optional(),
  costUsd: z.number().optional(),
});
export type SessionSummary = z.infer<typeof SessionSummarySchema>;

export const RiskTierSchema = z.enum(['low', 'medium', 'high']);
export type RiskTier = z.infer<typeof RiskTierSchema>;

export const PermissionRequestSchema = z.object({
  requestId: z.string(),
  sessionId: z.string(),
  sessionTitle: z.string(),
  tool: z.string(),
  inputPreview: z.string(),
  riskTier: RiskTierSchema,
  createdAt: z.number(),
});
export type PermissionRequest = z.infer<typeof PermissionRequestSchema>;

export const DecisionBehaviorSchema = z.enum(['allow', 'deny']);
export type DecisionBehavior = z.infer<typeof DecisionBehaviorSchema>;

// ---------------------------------------------------------------------------
// Session events (discriminated on "kind")
// ---------------------------------------------------------------------------

export const SessionEventSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('assistant_text'),
    text: z.string(),
  }),
  z.object({
    kind: z.literal('tool_use'),
    tool: z.string(),
    inputPreview: z.string(),
  }),
  z.object({
    kind: z.literal('tool_result'),
    tool: z.string(),
    ok: z.boolean(),
    preview: z.string(),
  }),
  z.object({
    kind: z.literal('status'),
    status: SessionStatusSchema,
  }),
]);
export type SessionEvent = z.infer<typeof SessionEventSchema>;

// ---------------------------------------------------------------------------
// Client -> Host messages (discriminated on "type")
// ---------------------------------------------------------------------------

export const HelloMessageSchema = z.object({
  type: z.literal('hello'),
  clientId: z.string(),
});
export type HelloMessage = z.infer<typeof HelloMessageSchema>;

/** Workspace target: either a registered alias or an explicit path. */
export const SpawnWorkspaceSchema = z.union([
  z.string(),
  z.object({ path: z.string() }),
]);
export type SpawnWorkspace = z.infer<typeof SpawnWorkspaceSchema>;

export const SpawnMessageSchema = z.object({
  type: z.literal('spawn'),
  workspace: SpawnWorkspaceSchema,
  prompt: z.string().optional(),
});
export type SpawnMessage = z.infer<typeof SpawnMessageSchema>;

export const InputMessageSchema = z.object({
  type: z.literal('input'),
  sessionId: z.string(),
  text: z.string(),
});
export type InputMessage = z.infer<typeof InputMessageSchema>;

export const DecisionMessageSchema = z.object({
  type: z.literal('decision'),
  requestId: z.string(),
  behavior: DecisionBehaviorSchema,
  note: z.string().optional(),
});
export type DecisionMessage = z.infer<typeof DecisionMessageSchema>;

export const KillMessageSchema = z.object({
  type: z.literal('kill'),
  sessionId: z.string(),
});
export type KillMessage = z.infer<typeof KillMessageSchema>;

export const ListWorkspacesMessageSchema = z.object({
  type: z.literal('list_workspaces'),
});
export type ListWorkspacesMessage = z.infer<typeof ListWorkspacesMessageSchema>;

export const AddWorkspaceMessageSchema = z.object({
  type: z.literal('add_workspace'),
  alias: z.string(),
  path: z.string(),
});
export type AddWorkspaceMessage = z.infer<typeof AddWorkspaceMessageSchema>;

export const RemoveWorkspaceMessageSchema = z.object({
  type: z.literal('remove_workspace'),
  alias: z.string(),
});
export type RemoveWorkspaceMessage = z.infer<typeof RemoveWorkspaceMessageSchema>;

export const OverseerAskMessageSchema = z.object({
  type: z.literal('overseer_ask'),
  question: z.string(),
});
export type OverseerAskMessage = z.infer<typeof OverseerAskMessageSchema>;

export const ClientMessageSchema = z.discriminatedUnion('type', [
  HelloMessageSchema,
  SpawnMessageSchema,
  InputMessageSchema,
  DecisionMessageSchema,
  KillMessageSchema,
  ListWorkspacesMessageSchema,
  AddWorkspaceMessageSchema,
  RemoveWorkspaceMessageSchema,
  OverseerAskMessageSchema,
]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

// ---------------------------------------------------------------------------
// Host -> Client messages (discriminated on "type")
// ---------------------------------------------------------------------------

export const SessionsMessageSchema = z.object({
  type: z.literal('sessions'),
  sessions: z.array(SessionSummarySchema),
});
export type SessionsMessage = z.infer<typeof SessionsMessageSchema>;

export const WorkspacesMessageSchema = z.object({
  type: z.literal('workspaces'),
  workspaces: z.array(WorkspaceSchema),
});
export type WorkspacesMessage = z.infer<typeof WorkspacesMessageSchema>;

export const EventMessageSchema = z.object({
  type: z.literal('event'),
  sessionId: z.string(),
  event: SessionEventSchema,
});
export type EventMessage = z.infer<typeof EventMessageSchema>;

export const PermissionRequestMessageSchema = z.object({
  type: z.literal('permission_request'),
  request: PermissionRequestSchema,
});
export type PermissionRequestMessage = z.infer<typeof PermissionRequestMessageSchema>;

export const PermissionResolvedMessageSchema = z.object({
  type: z.literal('permission_resolved'),
  requestId: z.string(),
  behavior: DecisionBehaviorSchema,
});
export type PermissionResolvedMessage = z.infer<typeof PermissionResolvedMessageSchema>;

export const OverseerAnswerMessageSchema = z.object({
  type: z.literal('overseer_answer'),
  question: z.string(),
  answer: z.string(),
});
export type OverseerAnswerMessage = z.infer<typeof OverseerAnswerMessageSchema>;

export const ErrorMessageSchema = z.object({
  type: z.literal('error'),
  message: z.string(),
});
export type ErrorMessage = z.infer<typeof ErrorMessageSchema>;

export const HostMessageSchema = z.discriminatedUnion('type', [
  SessionsMessageSchema,
  WorkspacesMessageSchema,
  EventMessageSchema,
  PermissionRequestMessageSchema,
  PermissionResolvedMessageSchema,
  OverseerAnswerMessageSchema,
  ErrorMessageSchema,
]);
export type HostMessage = z.infer<typeof HostMessageSchema>;

// ---------------------------------------------------------------------------
// Parse helpers (safeParse wrappers with a uniform result shape)
// ---------------------------------------------------------------------------

export type ParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function toParseResult<T>(result: z.SafeParseReturnType<unknown, T>): ParseResult<T> {
  if (result.success) {
    return { ok: true, data: result.data };
  }
  return { ok: false, error: result.error.message };
}

/** Validate an incoming Client -> Host message (e.g. parsed WS JSON). */
export function parseClientMessage(value: unknown): ParseResult<ClientMessage> {
  return toParseResult(ClientMessageSchema.safeParse(value));
}

/** Validate an incoming Host -> Client message (e.g. parsed WS JSON). */
export function parseHostMessage(value: unknown): ParseResult<HostMessage> {
  return toParseResult(HostMessageSchema.safeParse(value));
}
