import { Feather } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/src/constants/theme';

type AppChipProps = {
  label: string;
  active?: boolean;
  disabled?: boolean;
  icon?: keyof typeof Feather.glyphMap;
  onPress?: () => void;
  rightSlot?: ReactNode;
};

export function AppChip({ active = false, disabled = false, icon, label, onPress, rightSlot }: AppChipProps) {
  const content = (
    <View style={styles.content}>
      {icon ? <Feather name={icon} size={14} color={active ? theme.colors.accent : theme.colors.textSecondary} /> : null}
      <Text style={[styles.text, active && styles.textActive]}>{label}</Text>
      {rightSlot}
    </View>
  );

  if (!onPress) {
    return <View style={[styles.chip, active && styles.active, disabled && styles.disabled]}>{content}</View>;
  }

  return (
    <Pressable disabled={disabled} style={[styles.chip, active && styles.active, disabled && styles.disabled]} onPress={onPress}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 38,
    justifyContent: 'center',
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceSoft,
    paddingHorizontal: theme.spacing.md,
  },
  active: {
    borderColor: theme.colors.accentBorder,
    backgroundColor: theme.colors.accentSoft,
  },
  disabled: {
    opacity: 0.5,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  text: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.caption,
    fontWeight: '800',
  },
  textActive: {
    color: theme.colors.text,
  },
});
