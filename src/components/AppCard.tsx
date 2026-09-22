import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, View } from 'react-native';

import { theme } from '@/src/constants/theme';

type AppCardProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function AppCard({ children, style }: AppCardProps) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.md,
  },
});
