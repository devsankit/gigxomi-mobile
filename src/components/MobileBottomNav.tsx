import { Feather } from '@expo/vector-icons';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { BlurView } from 'expo-blur';
import { useEffect, useMemo, useState } from 'react';
import { Keyboard, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DEFAULT_MOBILE_CONFIG, getMobileNavDestinations, resolveMobileNavRole } from '@/src/constants/mobileConfig';
import { theme } from '@/src/constants/theme';
import { useAuth } from '@/src/hooks/useAuth';
import { resolveAudienceForRole, useChats } from '@/src/hooks/useChats';
import { useMobileConfig } from '@/src/hooks/useMobileConfig';

export function MobileBottomNav({ descriptors, navigation, state }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const auth = useAuth();
  const mobileConfigQuery = useMobileConfig(auth.token);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const role = resolveMobileNavRole(auth.session?.role, auth.session?.workspaceMode);
  const chatAudience = resolveAudienceForRole(auth.session?.role);
  const chatsQuery = useChats(chatAudience, { liveSync: false });
  const availableRoutes = useMemo(() => new Set(state.routes.map((route) => route.name)), [state.routes]);
  const config = mobileConfigQuery.data ?? DEFAULT_MOBILE_CONFIG;
  const items = useMemo(() => getMobileNavDestinations(config, role, availableRoutes), [availableRoutes, config, role]);
  const unreadChatCount = useMemo(
    () => (chatsQuery.data?.conversations ?? []).reduce((total, conversation) => {
      const laneTotal = (conversation.unreadCountByLane?.customer ?? 0) + (conversation.unreadCountByLane?.internal ?? 0);
      return total + Math.max(0, conversation.unreadCount ?? laneTotal, laneTotal);
    }, 0),
    [chatsQuery.data?.conversations],
  );
  const webBlurStyle = Platform.OS === 'web' ? ({ backdropFilter: 'blur(30px) saturate(145%)' } as unknown as ViewStyle) : null;

  if (keyboardVisible || !items.length) {
    return null;
  }

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { paddingBottom: Math.max(insets.bottom + 10, 14) }]}>
      <BlurView intensity={Platform.OS === 'android' ? 34 : 46} tint="dark" style={[styles.bar, webBlurStyle]}>
        <View pointerEvents="none" style={styles.barFill} />
        {items.map((item) => {
          const routeIndex = state.routes.findIndex((route) => route.name === item.route);
          const route = state.routes[routeIndex];

          if (!route) {
            return null;
          }

          const active = state.index === routeIndex;
          const descriptor = descriptors[route.key];
          const label = item.label;
          const showUnreadBadge = item.route === 'chats' && unreadChatCount > 0;

          function handlePress() {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!active && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          }

          return (
            <Pressable
              key={item.key}
              accessibilityLabel={descriptor.options.tabBarAccessibilityLabel}
              accessibilityRole="button"
              accessibilityState={active ? { selected: true } : undefined}
              onPress={handlePress}
              style={({ pressed }) => [styles.item, active && styles.itemActive, pressed && styles.itemPressed]}
            >
              <View style={styles.iconWrap}>
                <Feather name={item.icon} size={21} color={active ? theme.colors.accent : theme.colors.mutedText} />
                {showUnreadBadge ? (
                  <View style={styles.unreadBadge}>
                    <Text style={styles.unreadBadgeText}>{unreadChatCount > 9 ? '9+' : unreadChatCount}</Text>
                  </View>
                ) : null}
              </View>
              <Text numberOfLines={1} style={[styles.label, active && styles.labelActive]}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    backgroundColor: 'transparent',
    paddingTop: 4,
    paddingHorizontal: theme.spacing.sm,
  },
  bar: {
    width: '78%',
    minWidth: 316,
    maxWidth: 560,
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.xs,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    backgroundColor: 'rgba(14, 16, 21, 0.95)',
    paddingHorizontal: 8,
    paddingVertical: 7,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.45,
    shadowRadius: 24,
    elevation: 14,
  },
  barFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(14, 16, 21, 0.88)',
  },
  item: {
    minWidth: 48,
    minHeight: 44,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'transparent',
    paddingHorizontal: theme.spacing.xs,
  },
  itemActive: {
    borderColor: theme.colors.accentBorder,
    backgroundColor: theme.colors.accentSoft,
  },
  itemPressed: {
    transform: [{ scale: 0.97 }],
  },
  label: {
    color: theme.colors.mutedText,
    fontSize: 10.5,
    fontWeight: '800',
  },
  labelActive: {
    color: theme.colors.text,
  },
  iconWrap: {
    minWidth: 28,
    minHeight: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadBadge: {
    position: 'absolute',
    top: -5,
    right: -9,
    minWidth: 17,
    height: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
    borderWidth: 1,
    borderColor: theme.colors.background,
    backgroundColor: theme.colors.accentStrong,
    paddingHorizontal: 4,
  },
  unreadBadgeText: {
    color: theme.colors.background,
    fontSize: 9,
    fontWeight: '900',
  },
});
