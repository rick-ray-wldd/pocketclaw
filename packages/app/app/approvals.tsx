import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import type { PermissionRequest } from '@pocketclaw/shared';
import { useStore } from '@/state/store';
import { socket } from '@/net/ws';
import { colors, riskColor, type } from '@/theme';
import { formatRelative } from '@/util/time';

export default function ApprovalsScreen(): React.JSX.Element {
  const pendingRequests = useStore((s) => s.pendingRequests);

  return (
    <View style={styles.screen}>
      <FlatList
        data={pendingRequests}
        keyExtractor={(r) => r.requestId}
        renderItem={({ item }) => <ApprovalRow request={item} />}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>✅</Text>
            <Text style={type.body}>Nothing waiting for approval.</Text>
          </View>
        }
      />
    </View>
  );
}

function decide(request: PermissionRequest, behavior: 'allow' | 'deny'): void {
  socket.send({ type: 'decision', requestId: request.requestId, behavior });
  useStore.getState().resolvePermissionRequest(request.requestId);
}

function ApprovalRow({ request }: { request: PermissionRequest }): React.JSX.Element {
  // Swipe right (left action) = allow, swipe left (right action) = deny.
  return (
    <Swipeable
      renderLeftActions={() => (
        <SwipeAction label="Allow" color={colors.green} onPress={() => decide(request, 'allow')} />
      )}
      renderRightActions={() => (
        <SwipeAction label="Deny" color={colors.red} onPress={() => decide(request, 'deny')} />
      )}
      onSwipeableOpen={(direction) => decide(request, direction === 'left' ? 'allow' : 'deny')}
    >
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={[styles.tier, { color: riskColor(request.riskTier) }]}>
            {request.riskTier.toUpperCase()}
          </Text>
          <Text style={styles.tool}>{request.tool}</Text>
          <Text style={type.caption}>{formatRelative(request.createdAt)}</Text>
        </View>
        <Text style={styles.sessionTitle} numberOfLines={1}>
          {request.sessionTitle}
        </Text>
        <Text style={styles.preview} numberOfLines={3}>
          {request.inputPreview}
        </Text>
        <View style={styles.buttonRow}>
          <Pressable style={[styles.button, { backgroundColor: colors.red }]} onPress={() => decide(request, 'deny')}>
            <Text style={styles.buttonText}>Deny</Text>
          </Pressable>
          <Pressable style={[styles.button, { backgroundColor: colors.green }]} onPress={() => decide(request, 'allow')}>
            <Text style={styles.buttonText}>Allow</Text>
          </Pressable>
        </View>
      </View>
    </Swipeable>
  );
}

function SwipeAction({
  label,
  color,
  onPress,
}: {
  label: string;
  color: string;
  onPress: () => void;
}): React.JSX.Element {
  return (
    <Pressable style={[styles.swipeAction, { backgroundColor: color }]} onPress={onPress}>
      <Text style={styles.swipeActionText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  listContent: { paddingVertical: 8, flexGrow: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyEmoji: { fontSize: 40 },
  card: {
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 12,
    marginHorizontal: 16,
    marginVertical: 6,
    padding: 14,
    gap: 6,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tier: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  tool: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '600' },
  sessionTitle: { color: colors.accent, fontSize: 12, fontWeight: '600' },
  preview: { color: colors.textDim, fontSize: 12, fontFamily: 'Menlo' },
  buttonRow: { flexDirection: 'row', gap: 10, marginTop: 6 },
  button: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 8 },
  buttonText: { color: '#fff', fontWeight: '700' },
  swipeAction: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 96,
    marginVertical: 6,
    borderRadius: 12,
    marginHorizontal: 4,
  },
  swipeActionText: { color: '#fff', fontWeight: '800' },
});
