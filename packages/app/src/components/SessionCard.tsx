import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { SessionSummary } from '@pocketclaw/shared';
import { colors, statusColor, type } from '@/theme';
import { formatRelative } from '@/util/time';
import { ProgressBar } from '@/components/ProgressBar';

interface Props {
  session: SessionSummary;
  onPress: () => void;
  onLongPress: () => void;
}

export function SessionCard({ session, onPress, onLongPress }: Props): React.JSX.Element {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <View style={styles.topRow}>
        <View style={[styles.dot, { backgroundColor: statusColor(session.status) }]} />
        <Text style={[type.title, styles.title]} numberOfLines={1}>
          {session.title}
        </Text>
        <Text style={type.caption}>{formatRelative(session.updatedAt)}</Text>
      </View>
      <View style={styles.metaRow}>
        <Text style={styles.workspace}>{session.workspace.alias}</Text>
        {session.costUsd !== undefined && (
          <Text style={type.caption}>${session.costUsd.toFixed(2)}</Text>
        )}
      </View>
      <Text style={styles.lastMessage} numberOfLines={2}>
        {session.lastMessage || '…'}
      </Text>
      {session.todo !== undefined && session.todo.total > 0 && (
        <View style={styles.todoRow}>
          <View style={styles.todoBar}>
            <ProgressBar done={session.todo.done} total={session.todo.total} />
          </View>
          <Text style={type.caption}>
            {session.todo.done}/{session.todo.total}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 14,
    marginHorizontal: 16,
    marginVertical: 6,
    gap: 6,
  },
  cardPressed: { backgroundColor: colors.cardPressed },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  title: { flex: 1 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between' },
  workspace: { color: colors.accent, fontSize: 12, fontWeight: '600' },
  lastMessage: { color: colors.textDim, fontSize: 13, lineHeight: 18 },
  todoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  todoBar: { flex: 1 },
});
