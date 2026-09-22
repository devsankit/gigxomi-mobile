import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { theme } from '@/src/constants/theme';

type GigxomiHeaderProps = {
  rightSlot?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function GigxomiHeader({ rightSlot, style }: GigxomiHeaderProps) {
  return (
    <View style={[styles.header, style]}>
      <View style={styles.logo}>
        <Text style={styles.logoText}>GIGXOMI</Text>
      </View>
      {rightSlot ? <View style={styles.rightSlot}>{rightSlot}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  logo: {
    minHeight: 36,
    justifyContent: 'center',
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.accentBorder,
    backgroundColor: 'rgba(185, 247, 25, 0.08)',
    paddingHorizontal: theme.spacing.md,
  },
  logoText: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0,
  },
  rightSlot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
});
