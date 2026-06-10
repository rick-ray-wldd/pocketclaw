import React, { useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import type { SessionSummary } from '@pocketclaw/shared';
import { useStore } from '@/state/store';
import { socket } from '@/net/ws';
import { colors, type } from '@/theme';
import { SessionCard } from '@/components/SessionCard';

export default function SessionsWall(): React.JSX.Element {
  const router = useRouter();
  const sessions = useStore((s) => s.sessions);
  const workspaces = useStore((s) => s.workspaces);
  const pendingCount = useStore((s) => s.pendingRequests.length);
  const connection = useStore((s) => s.connection);

  const [filter, setFilter] = useState<string | null>(null);
  const [spawnOpen, setSpawnOpen] = useState(false);
  const [spawnWorkspace, setSpawnWorkspace] = useState<string | null>(null);
  const [spawnPrompt, setSpawnPrompt] = useState('');

  const filtered = useMemo(
    () => (filter === null ? sessions : sessions.filter((s) => s.workspace.alias === filter)),
    [sessions, filter],
  );

  const confirmKill = (session: SessionSummary): void => {
    Alert.alert('Kill session?', `"${session.title}" in ${session.workspace.alias}`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Kill',
        style: 'destructive',
        onPress: () => socket.send({ type: 'kill', sessionId: session.id }),
      },
    ]);
  };

  const doSpawn = (): void => {
    if (spawnWorkspace === null) return;
    const prompt = spawnPrompt.trim();
    socket.send(
      prompt !== ''
        ? { type: 'spawn', workspace: spawnWorkspace, prompt }
        : { type: 'spawn', workspace: spawnWorkspace },
    );
    setSpawnOpen(false);
    setSpawnPrompt('');
  };

  return (
    <View style={styles.screen}>
      {/* Workspace chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll} contentContainerStyle={styles.chipsRow}>
        <Chip label="All" active={filter === null} onPress={() => setFilter(null)} />
        {workspaces.map((w) => (
          <Chip key={w.alias} label={w.alias} active={filter === w.alias} onPress={() => setFilter(w.alias)} />
        ))}
        <Chip
          label="＋"
          active={false}
          accent
          onPress={() => {
            const first = workspaces[0];
            setSpawnWorkspace(filter ?? first?.alias ?? null);
            setSpawnOpen(true);
          }}
        />
      </ScrollView>

      {/* Quick navigation */}
      <View style={styles.navRow}>
        <NavButton label={pendingCount > 0 ? `Approvals (${pendingCount})` : 'Approvals'} highlight={pendingCount > 0} onPress={() => router.push('/approvals')} />
        <NavButton label="Overseer" onPress={() => router.push('/overseer')} />
        <NavButton label="Settings" onPress={() => router.push('/settings')} />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(s) => s.id}
        renderItem={({ item }) => (
          <SessionCard
            session={item}
            onPress={() => router.push({ pathname: '/session/[id]', params: { id: item.id } })}
            onLongPress={() => confirmKill(item)}
          />
        )}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>🦀</Text>
            <Text style={type.body}>
              {connection === 'connected' ? 'No sessions yet. Tap ＋ to spawn one.' : 'Not connected — check Settings.'}
            </Text>
          </View>
        }
      />

      {/* Spawn sheet */}
      <Modal visible={spawnOpen} transparent animationType="slide" onRequestClose={() => setSpawnOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setSpawnOpen(false)} />
        <View style={styles.sheet}>
          <Text style={type.label}>Spawn in workspace</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
            {workspaces.map((w) => (
              <Chip key={w.alias} label={w.alias} active={spawnWorkspace === w.alias} onPress={() => setSpawnWorkspace(w.alias)} />
            ))}
          </ScrollView>
          <Text style={[type.label, styles.sheetLabel]}>First prompt (optional)</Text>
          <TextInput
            style={styles.promptInput}
            value={spawnPrompt}
            onChangeText={setSpawnPrompt}
            placeholder="e.g. fix the failing tests"
            placeholderTextColor={colors.textFaint}
            multiline
          />
          <Pressable
            style={[styles.spawnButton, spawnWorkspace === null && styles.spawnButtonDisabled]}
            disabled={spawnWorkspace === null}
            onPress={doSpawn}
          >
            <Text style={styles.spawnButtonText}>Spawn session</Text>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

function Chip({
  label,
  active,
  accent = false,
  onPress,
}: {
  label: string;
  active: boolean;
  accent?: boolean;
  onPress: () => void;
}): React.JSX.Element {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive, accent && styles.chipAccent]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function NavButton({
  label,
  onPress,
  highlight = false,
}: {
  label: string;
  onPress: () => void;
  highlight?: boolean;
}): React.JSX.Element {
  return (
    <Pressable onPress={onPress} style={[styles.navButton, highlight && styles.navButtonHighlight]}>
      <Text style={[styles.navButtonText, highlight && styles.navButtonTextHighlight]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  chipsScroll: { flexGrow: 0 },
  chipsRow: { paddingHorizontal: 16, paddingVertical: 10, gap: 8, flexDirection: 'row' },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipAccent: { borderColor: colors.accent },
  chipText: { color: colors.textDim, fontSize: 14, fontWeight: '600' },
  chipTextActive: { color: '#fff' },
  navRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
  navButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  navButtonHighlight: { borderColor: colors.accent },
  navButtonText: { color: colors.textDim, fontSize: 13, fontWeight: '600' },
  navButtonTextHighlight: { color: colors.accent },
  listContent: { paddingBottom: 32, flexGrow: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  emptyEmoji: { fontSize: 48 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 40,
    gap: 10,
  },
  sheetLabel: { marginTop: 8 },
  promptInput: {
    backgroundColor: colors.inputBg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 8,
    color: colors.text,
    padding: 12,
    minHeight: 70,
    textAlignVertical: 'top',
  },
  spawnButton: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    alignItems: 'center',
    paddingVertical: 13,
    marginTop: 8,
  },
  spawnButtonDisabled: { backgroundColor: colors.accentDim },
  spawnButtonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
