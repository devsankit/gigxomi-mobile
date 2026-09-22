import { Feather } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

import { MobileBottomNav } from '@/src/components/MobileBottomNav';
import { theme } from '@/src/constants/theme';

type FeatherName = keyof typeof Feather.glyphMap;

function tabIcon(name: FeatherName) {
  function TabBarIcon({ color, size }: { color: string; size: number }) {
    return <Feather name={name} color={color} size={size} />;
  }

  TabBarIcon.displayName = `TabBarIcon(${name})`;
  return TabBarIcon;
}

export default function MobileTabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <MobileBottomNav {...props} />}
      screenOptions={{
        animation: 'shift',
        headerShown: false,
        tabBarActiveTintColor: theme.colors.accent,
        tabBarInactiveTintColor: theme.colors.mutedText,
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: 'transparent',
          borderTopWidth: 0,
          elevation: 0,
        },
        tabBarLabelStyle: {
          fontSize: theme.typography.caption,
          fontWeight: '800',
        },
        tabBarItemStyle: {
          gap: 2,
        },
      }}
    >
      <Tabs.Screen name="dashboard" options={{ title: 'Dashboard', tabBarIcon: tabIcon('home') }} />
      <Tabs.Screen name="chats" options={{ title: 'Chats', tabBarIcon: tabIcon('message-circle') }} />
      <Tabs.Screen name="projects" options={{ title: 'Work', tabBarIcon: tabIcon('briefcase') }} />
      <Tabs.Screen name="service" options={{ title: 'Service', tabBarIcon: tabIcon('plus-square') }} />
      <Tabs.Screen name="earnings" options={{ title: 'Earnings', tabBarIcon: tabIcon('trending-up') }} />
      <Tabs.Screen name="team" options={{ title: 'Team', tabBarIcon: tabIcon('users') }} />
      <Tabs.Screen name="money" options={{ title: 'Wallet', href: null, tabBarIcon: tabIcon('credit-card') }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: tabIcon('settings') }} />
    </Tabs>
  );
}
