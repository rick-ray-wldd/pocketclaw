import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useStore } from '@/state/store';
import { colors } from '@/theme';

/** Small connection indicator for the navigation header. */
export function ConnectionDot(): React.JSX.Element {
  const connection = useStore((s) => s.connection);
  const color =
    connection === 'connected'
      ? colors.green
      : connection === 'connecting'
        ? colors.yellow
        : colors.red;
  return (
    <View style={styles.row}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={styles.label}>{connection}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  label: { color: colors.textDim, fontSize: 11 },
});
