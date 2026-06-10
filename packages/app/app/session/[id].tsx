import React, { useMemo, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import type { SessionEvent } from '@pocketclaw/shared';
import { selectSessionEvents, useStore } from '@/state/store';
import { socket } from '@/net/ws';
import { colors, riskColor, statusColor, statusLabel, type } from '@/theme';

interface Row {
  key: string;
  event: SessionEvent;
}

export default function SessionScreen(): React.JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();
  const sessionId = typeof id === 'string' ? id : '';

  const session = useStore((s) => s.sessions.find((x) => x.id === sessionId));
  const events = useStore((s) => selectSessionEvents(s, sessionId));
  const pending = useStore((s) => s.pendingRequests.find((r) => r.sessionId === sessionId));

  const [draft, setDraft] = useState('');

  // Newest first for an inverted chat list.
  const rows: Row[] = useMemo(
    () => events.map((event, i) => ({ key: `${i}`, event })).reverse(),
    [events],
  );

  const sendInput = (): void => {
    const text = draft.trim();
    if (text === '' || sessionId === '') return;
    socket.send({ type: 'input', sessionId, text });
    setDraft('');
  };

  const decide = (behavior: 'allow' | 'deny'): void => {
    if (pending === undefined) return;
    socket.send({ type: 'decision', requestId: pending.requestId, behavior });
    useStore.getState().resolvePermissionRequest(pending.requestId);
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <Stack.Screen
        options={{
          title: session?.title ?? 'Session',
          headerRight: () =>
            session !== undefined ? (
              <Text style={{ color: statusColor(session.status), fontSize: 12, fontWeight: '600' }}>
                {statusLabel(session.status)}
              </Text>
            ) : null,
        }}
      />

      <FlatList
        inverted
        data={rows}
        keyExtractor={(r) => r.key}
        renderItem={({ item }) => <EventRow event={item.event} />}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={[type.caption, styles.emptyText]}>No events yet</Text>
          </View>
        }
      />

      {/* Permission banner pinned above the input bar */}
      {pending !== undefined && session?.status === 'waiting_permission' && (
        <View style={[styles.permBanner, { borderColor: riskColor(pending.riskTier) }]}>
          <View style={styles.permHeader}>
            <Text style={[styles.permTier, { color: riskColor(pending.riskTier) }]}>
              {pending.riskTier.toUpperCase()} RISK
            </Text>
            <Text style={styles.permTool}>{pending.tool}</Text>
          </View>
          <Text style={styles.permPreview} numberOfLines={3}>
            {pending.inputPreview}
          </Text>
          <View style={styles.permActions}>
            <Pressable style={[styles.permButton, styles.denyButton]} onPress={() => decide('deny')}>
              <Text style={styles.permButtonText}>Deny</Text>
            </Pressable>
            <Pressable style={[styles.permButton, styles.allowButton]} onPress={() => decide('allow')}>
              <Text style={styles.permButtonText}>Allow</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Input bar */}
      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder="Message the session…"
          placeholderTextColor={colors.textFaint}
          multiline
        />
        <Pressable
          style={[styles.sendButton, draft.trim() === '' && styles.sendButtonDisabled]}
          disabled={draft.trim() === ''}
          onPress={sendInput}
        >
          <Text style={styles.sendButtonText}>↑</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function EventRow({ event }: { event: SessionEvent }): React.JSX.Element {
  switch (event.kind) {
    case 'assistant_text':
      return (
        <View style={styles.bubble}>
          <Text style={styles.bubbleText}>{event.text}</Text>
        </View>
      );
    case 'tool_use':
      return (
        <View style={styles.toolChip}>
          <Text style={styles.toolChipTitle}>🔧 {event.tool}</Text>
          <Text style={styles.toolChipPreview} numberOfLines={2}>
            {event.inputPreview}
          </Text>
        </View>
      );
    case 'tool_result':
      return (
        <View style={styles.toolChip}>
          <Text style={[styles.toolChipTitle, { color: event.ok ? colors.green : colors.red }]}>
            {event.ok ? '✓' : '✗'} {event.tool}
          </Text>
          <Text style={styles.toolChipPreview} numberOfLines={2}>
            {event.preview}
          </Text>
        </View>
      );
    case 'status':
      return (
        <View style={styles.statusRow}>
          <Text style={[styles.statusText, { color: statusColor(event.status) }]}>
            ── {statusLabel(event.status)} ──
          </Text>
        </View>
      );
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  listContent: { paddingVertical: 12, flexGrow: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', transform: [{ scaleY: -1 }] },
  emptyText: { textAlign: 'center' },
  bubble: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderBottomLeftRadius: 4,
    padding: 12,
    marginHorizontal: 16,
    marginVertical: 4,
    maxWidth: '88%',
    alignSelf: 'flex-start',
  },
  bubbleText: { color: colors.text, fontSize: 15, lineHeight: 21 },
  toolChip: {
    backgroundColor: 'transparent',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginHorizontal: 16,
    marginVertical: 3,
    maxWidth: '88%',
    alignSelf: 'flex-start',
  },
  toolChipTitle: { color: colors.blue, fontSize: 12, fontWeight: '600' },
  toolChipPreview: { color: colors.textFaint, fontSize: 12, fontFamily: 'Menlo', marginTop: 2 },
  statusRow: { alignItems: 'center', marginVertical: 6 },
  statusText: { fontSize: 11, fontWeight: '600' },
  permBanner: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderRadius: 12,
    margin: 12,
    marginBottom: 4,
    padding: 12,
    gap: 6,
  },
  permHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  permTier: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  permTool: { color: colors.text, fontSize: 14, fontWeight: '600' },
  permPreview: { color: colors.textDim, fontSize: 12, fontFamily: 'Menlo' },
  permActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  permButton: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 8 },
  denyButton: { backgroundColor: colors.red },
  allowButton: { backgroundColor: colors.green },
  permButtonText: { color: '#fff', fontWeight: '700' },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    padding: 10,
    paddingBottom: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
  },
  input: {
    flex: 1,
    backgroundColor: colors.inputBg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 18,
    color: colors.text,
    paddingHorizontal: 14,
    paddingTop: 9,
    paddingBottom: 9,
    maxHeight: 120,
    fontSize: 15,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: { backgroundColor: colors.accentDim },
  sendButtonText: { color: '#fff', fontSize: 18, fontWeight: '700' },
});
