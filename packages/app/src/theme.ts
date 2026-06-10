import type { TextStyle } from 'react-native';
import type { RiskTier, SessionStatus } from '@pocketclaw/shared';

/** Dark palette — "claw orange" accent on GitHub-dark surfaces. */
export const colors = {
  bg: '#0d1117',
  card: '#161b22',
  cardPressed: '#1c2330',
  border: '#30363d',
  accent: '#ff6b35',
  accentDim: '#b34a24',
  text: '#e6edf3',
  textDim: '#8b949e',
  textFaint: '#6e7681',
  green: '#3fb950',
  yellow: '#d29922',
  orange: '#ff6b35',
  red: '#f85149',
  blue: '#58a6ff',
  purple: '#bc8cff',
  inputBg: '#0d1117',
} as const;

export function statusColor(status: SessionStatus): string {
  switch (status) {
    case 'starting':
      return colors.blue;
    case 'running':
      return colors.green;
    case 'waiting_input':
      return colors.yellow;
    case 'waiting_permission':
      return colors.orange;
    case 'done':
      return colors.textFaint;
    case 'error':
      return colors.red;
  }
}

export function statusLabel(status: SessionStatus): string {
  switch (status) {
    case 'starting':
      return 'Starting';
    case 'running':
      return 'Running';
    case 'waiting_input':
      return 'Waiting for input';
    case 'waiting_permission':
      return 'Needs approval';
    case 'done':
      return 'Done';
    case 'error':
      return 'Error';
  }
}

export function riskColor(tier: RiskTier): string {
  switch (tier) {
    case 'low':
      return colors.green;
    case 'medium':
      return colors.yellow;
    case 'high':
      return colors.red;
  }
}

/** Typography helpers — compose into StyleSheet entries. */
export const type = {
  title: { fontSize: 17, fontWeight: '600', color: colors.text } as TextStyle,
  body: { fontSize: 15, color: colors.text } as TextStyle,
  caption: { fontSize: 12, color: colors.textDim } as TextStyle,
  mono: {
    fontSize: 13,
    color: colors.text,
    fontFamily: 'Menlo',
  } as TextStyle,
  label: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.textDim,
  } as TextStyle,
} as const;
