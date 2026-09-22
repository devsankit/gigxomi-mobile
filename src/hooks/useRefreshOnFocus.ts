import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useRef } from 'react';

export function useRefreshOnFocus(refetch: () => void | Promise<unknown>, enabled = true) {
  const latest = useRef(refetch);
  useEffect(() => { latest.current = refetch; }, [refetch]);
  useFocusEffect(
    useCallback(() => {
      if (enabled) {
        void Promise.resolve().then(() => latest.current()).catch(() => undefined);
      }
    }, [enabled]),
  );
}
