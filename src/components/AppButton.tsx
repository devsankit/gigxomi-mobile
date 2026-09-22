import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/src/constants/theme';

type AppButtonProps = {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  icon?: ReactNode;
};

export function AppButton({ title, onPress, variant = 'primary', disabled = false, loading = false, icon }: AppButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        styles[variant],
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? theme.colors.background : theme.colors.text} />
      ) : (
        <View style={styles.content}>
          {icon}
          <Text style={[styles.text, variant === 'primary' && styles.primaryText]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderWidth: 1,
  },
  primary: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  secondary: {
    backgroundColor: theme.colors.surfaceSoft,
    borderColor: theme.colors.border,
  },
  danger: {
    backgroundColor: 'transparent',
    borderColor: theme.colors.danger,
  },
  pressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.9,
  },
  disabled: {
    opacity: 0.55,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
  },
  text: {
    flexShrink: 1,
    textAlign: 'center',
    color: theme.colors.text,
    fontSize: theme.typography.small,
    fontWeight: '800',
  },
  primaryText: {
    color: theme.colors.background,
  },
});
