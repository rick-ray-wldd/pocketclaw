import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useStore } from '@/state/store';
import { loadSettings } from '@/state/persist';
import { socket } from '@/net/ws';
import * as LiveActivity from '@/live-activity';
import { colors } from '@/theme';
import { ConnectionDot } from '@/components/ConnectionDot';

export default function RootLayout(): React.JSX.Element {
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const settings = await loadSettings();
      if (cancelled) return;
      if (settings !== null && settings.serverUrl !== '') {
        useStore.getState().setServer(settings.serverUrl, settings.token);
        LiveActivity.setSharedConfig(settings.serverUrl, settings.token);
        socket.connect();
      }
    })();
    return () => {
      cancelled = true;
      socket.disconnect();
    };
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.card },
          headerTintColor: colors.text,
          headerTitleStyle: { color: colors.text },
          headerRight: () => <ConnectionDot />,
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="index" options={{ title: 'PocketClaw 🦀' }} />
        <Stack.Screen name="session/[id]" options={{ title: 'Session' }} />
        <Stack.Screen name="approvals" options={{ title: 'Approvals' }} />
        <Stack.Screen name="overseer" options={{ title: 'Overseer' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
      </Stack>
    </GestureHandlerRootView>
  );
}
