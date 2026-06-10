import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useStore } from '@/state/store';
import { socket } from '@/net/ws';
import { getObsidianToday } from '@/net/api';
import { colors, type } from '@/theme';

export default function OverseerScreen(): React.JSX.Element {
  const overseerQA = useStore((s) => s.overseerQA);
  const serverUrl = useStore((s) => s.serverUrl);
  const [question, setQuestion] = useState('');
  const [note, setNote] = useState<{ path: string; markdown: string } | null>(null);
  const [noteLoading, setNoteLoading] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);

  const loadNote = useCallback(async (): Promise<void> => {
    if (serverUrl === '') return;
    setNoteLoading(true);
    setNoteError(null);
    try {
      setNote(await getObsidianToday());
    } catch (e) {
      setNoteError(e instanceof Error ? e.message : 'Failed to load note');
    } finally {
      setNoteLoading(false);
    }
  }, [serverUrl]);

  useEffect(() => {
    void loadNote();
  }, [loadNote]);

  const ask = (): void => {
    const q = question.trim();
    if (q === '') return;
    if (socket.send({ type: 'overseer_ask', question: q })) {
      useStore.getState().addOverseerQuestion(q);
      setQuestion('');
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Ask box */}
        <Text style={type.label}>Ask the overseer</Text>
        <TextInput
          style={styles.askInput}
          value={question}
          onChangeText={setQuestion}
          placeholder="What's the state of all my sessions? What should I unblock first?"
          placeholderTextColor={colors.textFaint}
          multiline
        />
        <Pressable
          style={[styles.askButton, question.trim() === '' && styles.askButtonDisabled]}
          disabled={question.trim() === ''}
          onPress={ask}
        >
          <Text style={styles.askButtonText}>Ask 🦀</Text>
        </Pressable>

        {/* QA history (newest first) */}
        {[...overseerQA].reverse().map((qa, i) => (
          <View key={`${qa.askedAt}-${i}`} style={styles.qaCard}>
            <Text style={styles.qaQuestion}>{qa.question}</Text>
            {qa.answer !== undefined ? (
              <Text style={styles.qaAnswer}>{qa.answer}</Text>
            ) : (
              <View style={styles.qaPendingRow}>
                <ActivityIndicator size="small" color={colors.accent} />
                <Text style={type.caption}>thinking…</Text>
              </View>
            )}
          </View>
        ))}

        {/* Today's Obsidian note */}
        <View style={styles.noteHeader}>
          <Text style={type.label}>Today's Obsidian note</Text>
          <Pressable onPress={() => void loadNote()}>
            <Text style={styles.reload}>↻ reload</Text>
          </Pressable>
        </View>
        {noteLoading && <ActivityIndicator color={colors.accent} style={styles.noteSpinner} />}
        {noteError !== null && <Text style={styles.noteError}>{noteError}</Text>}
        {note !== null && (
          <View style={styles.noteCard}>
            <Text style={styles.notePath}>{note.path}</Text>
            <Text style={styles.noteBody}>{note.markdown}</Text>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 48, gap: 10 },
  askInput: {
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 12,
    color: colors.text,
    padding: 14,
    minHeight: 90,
    fontSize: 16,
    textAlignVertical: 'top',
  },
  askButton: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    alignItems: 'center',
    paddingVertical: 12,
  },
  askButtonDisabled: { backgroundColor: colors.accentDim },
  askButtonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  qaCard: {
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  qaQuestion: { color: colors.accent, fontSize: 14, fontWeight: '600' },
  qaAnswer: { color: colors.text, fontSize: 14, lineHeight: 20 },
  qaPendingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  noteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
  },
  reload: { color: colors.blue, fontSize: 12, fontWeight: '600' },
  noteSpinner: { marginVertical: 8 },
  noteError: { color: colors.red, fontSize: 12 },
  noteCard: {
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  notePath: { color: colors.textFaint, fontSize: 11, fontFamily: 'Menlo' },
  noteBody: { color: colors.textDim, fontSize: 13, lineHeight: 19, fontFamily: 'Menlo' },
});
