import type { ReactNode } from 'react';
import type { ReactElement } from 'react';
import { useSegments } from 'expo-router';
import type { RefreshControlProps, StyleProp, ViewStyle } from 'react-native';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { theme } from '@/src/constants/theme';

type ScreenProps = {
  children: ReactNode;
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  refreshControl?: ReactElement<RefreshControlProps>;
};

const FLOATING_TAB_BAR_CLEARANCE = 148;

export function Screen({ children, scroll = true, contentStyle, refreshControl }: ScreenProps) {
  const insets = useSafeAreaInsets();
  const segments = useSegments();
  const isTabScreen = segments[0] === '(tabs)';
  const bottomClearance = isTabScreen ? FLOATING_TAB_BAR_CLEARANCE + insets.bottom : theme.spacing.xxl + insets.bottom;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: bottomClearance }, contentStyle]}
          keyboardShouldPersistTaps="handled"
          refreshControl={refreshControl}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.content, { paddingBottom: bottomClearance }, styles.staticContent, contentStyle]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.xxl,
  },
  staticContent: {
    flex: 1,
  },
});
