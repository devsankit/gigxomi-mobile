import type { ComponentProps } from 'react';
import type { StyleProp, TextStyle } from 'react-native';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { theme } from '@/src/constants/theme';

type AppInputProps = ComponentProps<typeof TextInput> & {
  label: string;
  error?: string;
  inputStyle?: StyleProp<TextStyle>;
};

export function AppInput({ label, error, inputStyle, placeholderTextColor = theme.colors.mutedText, ...props }: AppInputProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityHint={error || props.accessibilityHint}
        aria-invalid={Boolean(error)}
        placeholderTextColor={placeholderTextColor}
        style={[styles.input, error ? styles.inputError : null, inputStyle]}
        selectionColor={theme.colors.accent}
        {...props}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: theme.spacing.xs,
  },
  label: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.small,
    fontWeight: '700',
  },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface,
    color: theme.colors.text,
    paddingHorizontal: theme.spacing.md,
    fontSize: theme.typography.body,
  },
  inputError: {
    borderColor: theme.colors.danger,
  },
  error: {
    color: theme.colors.danger,
    fontSize: theme.typography.caption,
    lineHeight: 17,
  },
});
