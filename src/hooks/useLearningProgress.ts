import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import NetInfo from '@react-native-community/netinfo';
import { apiRequest } from '@/src/lib/api';
import { LearningProgressQueue, type LearningProgress, type QueueStatus, type WatchEvent } from '@/src/lib/learning-progress';

export function useLearningProgress(scope: string, token: string | null | undefined, onConfirmed: (event: WatchEvent, progress: LearningProgress) => void) {
  const [status, setStatus] = useState<QueueStatus>({ pending: 0, saving: false, error: null });
  const queue = useRef<LearningProgressQueue | null>(null);
  const confirmed = useRef(onConfirmed);
  useEffect(() => { confirmed.current = onConfirmed; }, [onConfirmed]);
  useEffect(() => {
    if (!token) return;
    const key = `gigxomi-learning-v1-${scope}`;
    const file = `${FileSystem.documentDirectory}${key}.json`;
    const current = new LearningProgressQueue({
      storage: {
        read: async () => Platform.OS === 'web' ? globalThis.localStorage.getItem(key) : (await FileSystem.getInfoAsync(file)).exists ? FileSystem.readAsStringAsync(file) : null,
        write: async (value) => {
          if (Platform.OS === 'web') { globalThis.localStorage.setItem(key, value); return; }
          const temp = `${file}.tmp`;
          await FileSystem.writeAsStringAsync(temp, value);
          await FileSystem.moveAsync({ from: temp, to: file });
        },
      },
      send: event => apiRequest<{ progress?: LearningProgress }>('/mobile/v2/lms/progress', { token, method: 'POST', body: event }),
      changed: setStatus,
      confirmed: (event, progress) => confirmed.current(event, progress),
    });
    queue.current = current;
    void current.retry();
    const unsubscribe = NetInfo.addEventListener(network => {
      if (network.isConnected && network.isInternetReachable !== false) void current.retry();
    });
    return () => { unsubscribe(); current.dispose(); };
  }, [scope, token]);
  return { status, queue };
}
