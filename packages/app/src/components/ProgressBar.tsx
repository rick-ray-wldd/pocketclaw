import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors } from '@/theme';

export function ProgressBar({ done, total }: { done: number; total: number }): React.JSX.Element {
  const ratio = total > 0 ? Math.min(1, Math.max(0, done / total)) : 0;
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${Math.round(ratio * 100)}%` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: colors.accent,
  },
});
