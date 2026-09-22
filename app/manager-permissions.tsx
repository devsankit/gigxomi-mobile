import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/src/components/AppButton';
import { BrandedRefreshControl } from '@/src/components/BrandedRefreshControl';
import { AppCard } from '@/src/components/AppCard';
import { GigxomiHeader } from '@/src/components/GigxomiHeader';
import { Screen } from '@/src/components/Screen';
import { theme } from '@/src/constants/theme';
import { useAuth } from '@/src/hooks/useAuth';
import { useContacts, useManagers, useTeamRequests } from '@/src/hooks/useTeam';

function readString(record: Record<string, unknown>, keys: string[], fallback = 'Not set') {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value;
    if (typeof value === 'number') return String(value);
  }
  return fallback;
}

function MiniRow({ item, titleKeys, subtitleKeys }: { item: Record<string, unknown>; titleKeys: string[]; subtitleKeys: string[] }) {
  return (
    <View style={styles.miniRow}>
      <Text numberOfLines={1} style={styles.miniTitle}>
        {readString(item, titleKeys)}
      </Text>
      <Text numberOfLines={2} style={styles.miniSubtitle}>
        {readString(item, subtitleKeys, 'Synced from backend')}
      </Text>
    </View>
  );
}

export default function ManagerPermissionsScreen() {
  const auth = useAuth();
  const role = auth.session?.role;
  const isFreelancer = role === 'FREELANCER';
  const managersQuery = useManagers(!isFreelancer);
  const contactsQuery = useContacts(!isFreelancer);
  const teamRequestsQuery = useTeamRequests(isFreelancer);
  const managers = managersQuery.data?.managers ?? [];
  const contacts = contactsQuery.data?.contacts ?? [];
  const memberships = teamRequestsQuery.data?.memberships ?? [];
  const requests = teamRequestsQuery.data?.requests ?? [];

  return (
    <Screen
      refreshControl={
        <BrandedRefreshControl
          tintColor={theme.colors.accent}
          refreshing={managersQuery.isFetching || contactsQuery.isFetching || teamRequestsQuery.isFetching}
          onRefresh={() => {
            void managersQuery.refetch();
            void contactsQuery.refetch();
            void teamRequestsQuery.refetch();
          }}
        />
      }
    >
      <GigxomiHeader
        rightSlot={
          <Pressable style={styles.iconButton} onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}>
            <Feather name="x" size={19} color={theme.colors.textSecondary} />
          </Pressable>
        }
      />

      <View style={styles.header}>
        <Text style={styles.eyebrow}>Permissions</Text>
        <Text style={styles.title}>{isFreelancer ? 'Agency access' : 'Manager access'}</Text>
        <Text style={styles.copy}>
          {isFreelancer
            ? 'Freelancer memberships and agency requests are synced from backend team APIs.'
            : 'Managers, contacts, and workspace visibility are role-scoped by the admin APIs.'}
        </Text>
      </View>

      {managersQuery.error ? <Text style={styles.error}>Managers: {managersQuery.error.message}</Text> : null}
      {contactsQuery.error ? <Text style={styles.error}>Contacts: {contactsQuery.error.message}</Text> : null}
      {teamRequestsQuery.error ? <Text style={styles.error}>Team: {teamRequestsQuery.error.message}</Text> : null}

      <View style={styles.metrics}>
        <AppCard style={styles.metric}>
          <Text style={styles.metricValue}>{isFreelancer ? memberships.length : managers.length}</Text>
          <Text style={styles.metricLabel}>{isFreelancer ? 'Memberships' : 'Managers'}</Text>
        </AppCard>
        <AppCard style={styles.metric}>
          <Text style={styles.metricValue}>{isFreelancer ? requests.length : contacts.length}</Text>
          <Text style={styles.metricLabel}>{isFreelancer ? 'Requests' : 'Contacts'}</Text>
        </AppCard>
      </View>

      <AppCard style={styles.card}>
        <Text style={styles.cardTitle}>{isFreelancer ? 'Agency memberships' : 'Managers'}</Text>
        {(isFreelancer ? memberships : managers).slice(0, 6).map((item, index) => (
          <MiniRow
            key={readString(item, ['id', 'email', 'phone'], `row-${index}`)}
            item={item}
            titleKeys={isFreelancer ? ['agencyName', 'tenantName', 'name'] : ['name', 'displayName', 'email']}
            subtitleKeys={isFreelancer ? ['role', 'membershipRole', 'status'] : ['queue', 'email', 'role']}
          />
        ))}
        {(isFreelancer ? memberships : managers).length ? null : <Text style={styles.empty}>No records found.</Text>}
      </AppCard>

      <AppCard style={styles.card}>
        <Text style={styles.cardTitle}>{isFreelancer ? 'Team requests' : 'Contacts'}</Text>
        {(isFreelancer ? requests : contacts).slice(0, 6).map((item, index) => (
          <MiniRow
            key={readString(item, ['id', 'phone', 'email'], `secondary-${index}`)}
            item={item}
            titleKeys={isFreelancer ? ['agencyName', 'tenantName', 'name'] : ['name', 'displayName', 'customerName', 'phone']}
            subtitleKeys={isFreelancer ? ['message', 'note', 'status'] : ['latestMessage', 'sourceChannel', 'status']}
          />
        ))}
        {(isFreelancer ? requests : contacts).length ? null : <Text style={styles.empty}>No records found.</Text>}
      </AppCard>

      <View style={styles.actions}>
        <AppButton title="Open team page" onPress={() => router.push('/team')} />
        <AppButton title="Open chats" variant="secondary" onPress={() => router.push('/chats')} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  iconButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  header: {
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.lg,
  },
  eyebrow: {
    color: theme.colors.accent,
    fontSize: theme.typography.caption,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  title: {
    color: theme.colors.text,
    fontSize: 28,
    fontWeight: '900',
  },
  copy: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.small,
    lineHeight: 19,
  },
  error: {
    color: theme.colors.danger,
    fontSize: theme.typography.small,
    marginBottom: theme.spacing.sm,
  },
  metrics: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  metric: {
    flex: 1,
    gap: 2,
  },
  metricValue: {
    color: theme.colors.text,
    fontSize: 28,
    fontWeight: '900',
  },
  metricLabel: {
    color: theme.colors.mutedText,
    fontSize: theme.typography.caption,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  card: {
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  cardTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.section,
    fontWeight: '900',
  },
  miniRow: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderSubtle,
    paddingTop: theme.spacing.sm,
    gap: 2,
  },
  miniTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.body,
    fontWeight: '900',
  },
  miniSubtitle: {
    color: theme.colors.mutedText,
    fontSize: theme.typography.caption,
    lineHeight: 17,
  },
  empty: {
    color: theme.colors.mutedText,
    fontSize: theme.typography.small,
  },
  actions: {
    gap: theme.spacing.sm,
  },
});
