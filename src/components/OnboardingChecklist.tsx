import { Feather } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { theme } from '@/src/constants/theme';

type ChecklistItem = {
  id: string;
  label: string;
  completed?: boolean;
};

type OnboardingChecklistProps = {
  title: string;
  items: ChecklistItem[];
};

export function OnboardingChecklist({ items, title }: OnboardingChecklistProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.list}>
        {items.map((item) => (
          <View key={item.id} style={styles.row}>
            <View style={[styles.check, item.completed && styles.checkDone]}>
              {item.completed ? <Feather name="check" size={12} color={theme.colors.background} /> : null}
            </View>
            <Text style={[styles.label, item.completed && styles.labelDone]}>{item.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  title: {
    color: theme.colors.text,
    fontSize: theme.typography.section,
    fontWeight: '900',
  },
  list: {
    gap: theme.spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  check: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceSoft,
  },
  checkDone: {
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.accent,
  },
  label: {
    flex: 1,
    color: theme.colors.textSecondary,
    fontSize: theme.typography.small,
  },
  labelDone: {
    color: theme.colors.text,
  },
});
