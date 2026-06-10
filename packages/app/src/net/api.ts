import type { SessionSummary } from '@pocketclaw/shared';
import { useStore } from '@/state/store';

/**
 * Normalize whatever the user typed ("192.168.1.5:8787", "ws://mac:8787",
 * "https://tunnel.example.com") into matching http(s) and ws(s) base URLs.
 */
export function parseServerUrl(input: string): { httpBase: string; wsBase: string } {
  let raw = input.trim().replace(/\/+$/, '');
  let secure = false;
  const schemeMatch = raw.match(/^(https?|wss?):\/\//i);
  if (schemeMatch !== null && schemeMatch[1] !== undefined) {
    secure = /^(https|wss)$/i.test(schemeMatch[1]);
    raw = raw.slice(schemeMatch[0].length);
  }
  // Tolerate pairing payloads that include the WS path: strip a trailing /ws.
  raw = raw.replace(/\/ws$/i, '');
  const httpScheme = secure ? 'https' : 'http';
  const wsScheme = secure ? 'wss' : 'ws';
  return { httpBase: `${httpScheme}://${raw}`, wsBase: `${wsScheme}://${raw}` };
}

export function buildWsUrl(serverUrl: string, token: string): string {
  const { wsBase } = parseServerUrl(serverUrl);
  return `${wsBase}/ws?token=${encodeURIComponent(token)}`;
}

async function request<T>(
  path: string,
  options: { method?: 'GET' | 'POST'; body?: unknown; serverUrl?: string; token?: string } = {},
): Promise<T> {
  const state = useStore.getState();
  const serverUrl = options.serverUrl ?? state.serverUrl;
  const token = options.token ?? state.token;
  if (serverUrl === '') throw new Error('No server configured');

  const { httpBase } = parseServerUrl(serverUrl);
  const res = await fetch(`${httpBase}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} on ${path}`);
  }
  return (await res.json()) as T;
}

export function postDecision(requestId: string, behavior: 'allow' | 'deny'): Promise<{ ok: true }> {
  return request<{ ok: true }>('/api/decision', { method: 'POST', body: { requestId, behavior } });
}

export function getSessions(): Promise<{ sessions: SessionSummary[] }> {
  return request<{ sessions: SessionSummary[] }>('/api/sessions');
}

export function getObsidianToday(): Promise<{ path: string; markdown: string }> {
  return request<{ path: string; markdown: string }>('/api/obsidian/today');
}

/** Health check; accepts explicit url/token so Settings can test before saving. */
export function getHealth(serverUrl?: string, token?: string): Promise<{ ok: true; version: string }> {
  const opts: { serverUrl?: string; token?: string } = {};
  if (serverUrl !== undefined) opts.serverUrl = serverUrl;
  if (token !== undefined) opts.token = token;
  return request<{ ok: true; version: string }>('/api/health', opts);
}
