import AsyncStorage from '@react-native-async-storage/async-storage';

const SETTINGS_KEY = 'pocketclaw.settings.v1';

export interface PersistedSettings {
  serverUrl: string;
  token: string;
}

export async function loadSettings(): Promise<PersistedSettings | null> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as PersistedSettings).serverUrl === 'string' &&
      typeof (parsed as PersistedSettings).token === 'string'
    ) {
      return parsed as PersistedSettings;
    }
    return null;
  } catch {
    return null;
  }
}

export async function saveSettings(settings: PersistedSettings): Promise<void> {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
