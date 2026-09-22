import { Feather } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { theme } from '@/src/constants/theme';

type EmptyStateProps = {
  icon?: keyof typeof Feather.glyphMap;
  title: string;
  message?: string;
};

export function EmptyState({ icon = 'inbox', message, title }: EmptyStateProps) {
  return (
    <View style={styles.wrap}>
      <View style={styles.iconWrap}>
        <Feather name={icon} size={22} color={theme.colors.accent} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.xxl,
    paddingHorizontal: theme.spacing.lg,
  },
  iconWrap: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: theme.colors.accentBorder,
    backgroundColor: theme.colors.accentSoft,
  },
  title: {
    color: theme.colors.text,
    fontSize: theme.typography.section,
    fontWeight: '900',
    textAlign: 'center',
  },
  message: {
    color: theme.colors.mutedText,
    fontSize: theme.typography.small,
    lineHeight: 20,
    textAlign: 'center',
  },
});
