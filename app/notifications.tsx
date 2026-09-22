import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { GigxomiHeader } from '@/src/components/GigxomiHeader';
import { BrandedRefreshControl } from '@/src/components/BrandedRefreshControl';
import { Screen } from '@/src/components/Screen';
import { theme } from '@/src/constants/theme';
import { useMarkNotificationRead, useNotifications } from '@/src/hooks/useNotifications';
import { useRefreshOnFocus } from '@/src/hooks/useRefreshOnFocus';
import type { MobileNotificationsResponse } from '@/src/types';

type NotificationItem = MobileNotificationsResponse['notifications'][number];

function formatDate(value?: string) {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

function openEntity(notification: NotificationItem) {
  const entityType = String(notification.entityType ?? '').toLowerCase();
  const entityId = notification.entityId;

  if (!entityId) {
    return;
  }

  if (entityType.includes('conversation') || entityType.includes('chat')) {
    router.push(`/chat/${encodeURIComponent(entityId)}`);
    return;
  }

  if (entityType.includes('assignment') || entityType.includes('delivery')) {
    router.push(`/assignment/${encodeURIComponent(entityId)}`);
  }
}

function NotificationRow({ notification, onPress }: { notification: NotificationItem; onPress: () => void }) {
  const unread = !notification.readAt && notification.status !== 'READ';

  return (
    <Pressable style={({ pressed }) => [styles.row, unread && styles.rowUnread, pressed && styles.rowPressed]} onPress={onPress}>
      <View style={styles.iconWrap}>
        <Feather name={unread ? 'bell' : 'check-circle'} size={17} color={unread ? theme.colors.accent : theme.colors.mutedText} />
      </View>
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <Text numberOfLines={1} style={styles.rowTitle}>
            {notification.title}
          </Text>
          {unread ? <View style={styles.unreadDot} /> : null}
        </View>
        <Text numberOfLines={2} style={styles.rowMessage}>
          {notification.message ?? notification.body ?? 'Gigxomi update'}
        </Text>
        <Text style={styles.rowTime}>{formatDate(notification.createdAt)}</Text>
      </View>
    </Pressable>
  );
}

export default function NotificationsScreen() {
  const notificationsQuery = useNotifications();
  const markRead = useMarkNotificationRead();
  const notifications = notificationsQuery.data?.notifications ?? [];

  useRefreshOnFocus(notificationsQuery.refetch);

  function handlePress(notification: NotificationItem) {
    if (!notification.readAt && notification.status !== 'READ') {
      markRead.mutate(notification.id);
    }

    openEntity(notification);
  }

  return (
    <Screen scroll={false} contentStyle={styles.screen}>
      <GigxomiHeader
        rightSlot={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close notifications"
            style={styles.iconButton}
            onPress={() => {
              if (router.canGoBack()) {
                router.back();
              } else {
                router.replace('/(tabs)');
              }
            }}
          >
            <Feather name="x" size={19} color={theme.colors.textSecondary} />
          </Pressable>
        }
      />

      <View style={styles.header}>
        <Text style={styles.eyebrow}>Menu</Text>
        <Text style={styles.title}>Notifications</Text>
        <Text style={styles.copy}>Synced alerts from the same web notification API.</Text>
      </View>

      {notificationsQuery.error ? <Text style={styles.error}>{notificationsQuery.error.message}</Text> : null}
      {markRead.error ? <Text style={styles.error}>{markRead.error.message}</Text> : null}

      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <NotificationRow notification={item} onPress={() => handlePress(item)} />}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.divider} />}
        refreshControl={
          <BrandedRefreshControl
            tintColor={theme.colors.accent}
            refreshing={notificationsQuery.isFetching}
            onRefresh={() => {
              void notificationsQuery.refetch();
            }}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>{notificationsQuery.isLoading ? 'Loading alerts...' : 'No notifications yet'}</Text>
            <Text style={styles.emptyCopy}>Pull to refresh live backend notifications.</Text>
          </View>
        }
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingTop: theme.spacing.md,
    paddingBottom: 0,
  },
  iconButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  header: {
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.md,
  },
  eyebrow: {
    color: theme.colors.accent,
    fontSize: theme.typography.caption,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  title: {
    color: theme.colors.text,
    fontSize: 28,
    fontWeight: '900',
  },
  copy: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.small,
    lineHeight: 19,
  },
  error: {
    color: theme.colors.danger,
    fontSize: theme.typography.small,
    marginBottom: theme.spacing.sm,
  },
  list: {
    paddingBottom: theme.spacing.xxl,
  },
  row: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
  },
  rowUnread: {
    backgroundColor: 'rgba(185, 247, 25, 0.04)',
  },
  rowPressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  iconWrap: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: theme.colors.surfaceSoft,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  rowTitle: {
    flex: 1,
    color: theme.colors.text,
    fontSize: theme.typography.body,
    fontWeight: '900',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.accent,
  },
  rowMessage: {
    color: theme.colors.mutedText,
    fontSize: theme.typography.small,
    lineHeight: 18,
  },
  rowTime: {
    color: theme.colors.disabledText,
    fontSize: theme.typography.caption,
    fontWeight: '800',
  },
  divider: {
    height: 1,
    marginLeft: 52,
    backgroundColor: theme.colors.borderSubtle,
  },
  empty: {
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.xxl,
  },
  emptyTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.body,
    fontWeight: '900',
  },
  emptyCopy: {
    color: theme.colors.mutedText,
    fontSize: theme.typography.small,
  },
});
