import React, { useRef, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useStore } from '@/state/store';
import { saveSettings } from '@/state/persist';
import { socket } from '@/net/ws';
import { getHealth } from '@/net/api';
import * as LiveActivity from '@/live-activity';
import { colors, type } from '@/theme';

interface PairingPayload {
  url: string;
  token: string;
}

function parsePairingQr(data: string): PairingPayload | null {
  try {
    const parsed: unknown = JSON.parse(data);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as PairingPayload).url === 'string' &&
      typeof (parsed as PairingPayload).token === 'string'
    ) {
      return parsed as PairingPayload;
    }
  } catch {
    // not JSON
  }
  return null;
}

export default function SettingsScreen(): React.JSX.Element {
  const storedUrl = useStore((s) => s.serverUrl);
  const storedToken = useStore((s) => s.token);

  const [url, setUrl] = useState(storedUrl);
  const [token, setToken] = useState(storedToken);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [testing, setTesting] = useState(false);
  const scannedOnce = useRef(false);

  const [permission, requestPermission] = useCameraPermissions();

  const openScanner = async (): Promise<void> => {
    if (permission === null || !permission.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert('Camera needed', 'Allow camera access to scan the pairing QR code.');
        return;
      }
    }
    scannedOnce.current = false;
    setScannerOpen(true);
  };

  const onQrScanned = (data: string): void => {
    if (scannedOnce.current) return;
    const payload = parsePairingQr(data);
    if (payload === null) return; // keep scanning until a valid pairing QR
    scannedOnce.current = true;
    setScannerOpen(false);
    setUrl(payload.url);
    setToken(payload.token);
    Alert.alert('Paired', `Host: ${payload.url}\nRemember to Save.`);
  };

  const testConnection = async (): Promise<void> => {
    setTesting(true);
    try {
      const health = await getHealth(url.trim(), token.trim());
      Alert.alert('Connected ✓', `Host version ${health.version}`);
    } catch (e) {
      Alert.alert('Connection failed', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setTesting(false);
    }
  };

  const save = async (): Promise<void> => {
    const cleanUrl = url.trim();
    const cleanToken = token.trim();
    await saveSettings({ serverUrl: cleanUrl, token: cleanToken });
    useStore.getState().setServer(cleanUrl, cleanToken);
    // Keep the App Group in sync so widget intents can reach the host.
    LiveActivity.setSharedConfig(cleanUrl, cleanToken);
    socket.connect();
    Alert.alert('Saved', 'Settings stored, reconnecting…');
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={type.label}>Server URL</Text>
      <TextInput
        style={styles.input}
        value={url}
        onChangeText={setUrl}
        placeholder="ws://192.168.1.10:8787"
        placeholderTextColor={colors.textFaint}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
      />

      <Text style={[type.label, styles.fieldLabel]}>Token</Text>
      <TextInput
        style={styles.input}
        value={token}
        onChangeText={setToken}
        placeholder="bearer token from ~/.pocketclaw/config.json"
        placeholderTextColor={colors.textFaint}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
      />

      <Pressable style={styles.secondaryButton} onPress={() => void openScanner()}>
        <Text style={styles.secondaryButtonText}>📷 Scan pairing QR</Text>
      </Pressable>

      <Pressable
        style={[styles.secondaryButton, testing && styles.buttonDisabled]}
        disabled={testing}
        onPress={() => void testConnection()}
      >
        <Text style={styles.secondaryButtonText}>{testing ? 'Testing…' : '🔌 Test connection'}</Text>
      </Pressable>

      <Pressable style={styles.saveButton} onPress={() => void save()}>
        <Text style={styles.saveButtonText}>Save & reconnect</Text>
      </Pressable>

      <Text style={styles.hint}>
        Pair by running `pocketclaw init` on your host — it prints a QR encoding {`{"url","token"}`}.
        Live Activities require iOS 16.2+ (Dynamic Island buttons need iOS 17).
      </Text>

      {/* QR scanner modal */}
      <Modal visible={scannerOpen} animationType="slide" onRequestClose={() => setScannerOpen(false)}>
        <View style={styles.scannerScreen}>
          <CameraView
            style={styles.camera}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={({ data }) => onQrScanned(data)}
          />
          <Pressable style={styles.scannerClose} onPress={() => setScannerOpen(false)}>
            <Text style={styles.scannerCloseText}>Cancel</Text>
          </Pressable>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 10 },
  fieldLabel: { marginTop: 8 },
  input: {
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 10,
    color: colors.text,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  secondaryButton: {
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 10,
    alignItems: 'center',
    paddingVertical: 12,
  },
  secondaryButtonText: { color: colors.text, fontWeight: '600', fontSize: 14 },
  buttonDisabled: { opacity: 0.5 },
  saveButton: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    alignItems: 'center',
    paddingVertical: 13,
    marginTop: 8,
  },
  saveButtonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  hint: { color: colors.textFaint, fontSize: 12, lineHeight: 17, marginTop: 12 },
  scannerScreen: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  scannerClose: {
    position: 'absolute',
    bottom: 48,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 22,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  scannerCloseText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
