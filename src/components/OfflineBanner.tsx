import NetInfo from '@react-native-community/netinfo';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { theme } from '@/src/constants/theme';
import { queryClient } from '@/src/lib/queryClient';

export function OfflineBanner() {
  const insets = useSafeAreaInsets();
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    return NetInfo.addEventListener((state) => {
      setOffline(state.isConnected === false);
    });
  }, []);

  if (!offline) {
    return null;
  }

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { paddingTop: Math.max(insets.top, 10) }]}>
      <View style={styles.panel}>
        <View style={styles.copy}>
          <Text style={styles.title}>No Internet Connection</Text>
          <Text style={styles.message}>Saved chats and account data stay available.</Text>
        </View>
        <Pressable
          style={({ pressed }) => [styles.retry, pressed && styles.retryPressed]}
          onPress={() => {
            void queryClient.invalidateQueries();
          }}
        >
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1200,
    paddingHorizontal: theme.spacing.md,
  },
  panel: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: 'rgba(250, 204, 21, 0.34)',
    backgroundColor: 'rgba(23, 18, 8, 0.96)',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: theme.colors.warning,
    fontSize: theme.typography.small,
    fontWeight: '900',
  },
  message: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.caption,
    marginTop: 2,
  },
  retry: {
    minHeight: 34,
    justifyContent: 'center',
    borderRadius: 17,
    backgroundColor: theme.colors.warning,
    paddingHorizontal: theme.spacing.md,
  },
  retryPressed: {
    opacity: 0.8,
  },
  retryText: {
    color: theme.colors.background,
    fontSize: theme.typography.caption,
    fontWeight: '900',
  },
});
