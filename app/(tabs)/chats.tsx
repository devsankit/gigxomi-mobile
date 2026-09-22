import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { useEffect, useMemo, useState } from 'react';
import { Animated, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { GigxomiHeader } from '@/src/components/GigxomiHeader';
import { BrandedRefreshControl } from '@/src/components/BrandedRefreshControl';
import { Screen } from '@/src/components/Screen';
import { StableAvatar } from '@/src/components/StableAvatar';
import { theme } from '@/src/constants/theme';
import { resolveAudienceForRole, useChats } from '@/src/hooks/useChats';
import { useAuth } from '@/src/hooks/useAuth';
import type { MobileConversation, MobileInboxAudience, MobileRole } from '@/src/types';

type InboxFilter = 'all' | 'unread' | 'assigned' | 'payment' | 'whatsapp' | 'instagram';

const baseFilters: Array<{ id: InboxFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
];

function formatTime(value?: string) {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function getLatestMessage(conversation: MobileConversation) {
  return conversation.messages.at(-1) ?? null;
}

function getCustomerDisplayNameForAudience(conversation: MobileConversation, audience: MobileInboxAudience) {
  if (audience === 'freelancer') {
    return conversation.clientAlias || conversation.customerDisplayName || 'Client';
  }

  return conversation.customerDisplayName || 'Conversation';
}

function getPreview(conversation: MobileConversation) {
  const latest = getLatestMessage(conversation);
  if (latest?.body.trim()) {
    return latest.senderRole === 'customer' ? latest.body : `${latest.senderLabel}: ${latest.body}`;
  }

  return conversation.summary || 'No messages yet.';
}

function getChannelLabel(conversation: MobileConversation) {
  const base =
    conversation.sourceChannel === 'instagram'
      ? 'Instagram'
      : conversation.sourceChannel === 'in-app' || conversation.isInAppCustomerThread
        ? 'App'
        : 'WhatsApp';

  if (conversation.channelConnectionName) {
    return `${base} · ${conversation.channelConnectionName}`;
  }

  return base;
}

function getStateLabel(conversation: MobileConversation) {
  return conversation.leadStatusLabel || conversation.status;
}

function getRoleInboxTitle(role?: MobileRole | null) {
  if (role === 'FREELANCER') return 'Freelancer inbox';
  if (role === 'MANAGER') return 'Manager queue';
  if (role === 'SUPER_ADMIN') return 'Platform inbox';
  return 'Agency inbox';
}

function getRoleInboxMeta(role?: MobileRole | null) {
  if (role === 'FREELANCER') return 'Clients, agencies, tasks';
  if (role === 'MANAGER') return 'Assigned chats, reviews';
  if (role === 'SUPER_ADMIN') return 'All workspaces';
  return 'Leads, team, payments';
}

function getRoleFilters(role?: MobileRole | null): Array<{ id: InboxFilter; label: string }> {
  if (role === 'FREELANCER') {
    return [...baseFilters, { id: 'assigned', label: 'My work' }, { id: 'payment', label: 'Pay' }];
  }

  if (role === 'MANAGER') {
    return [...baseFilters, { id: 'assigned', label: 'Assigned' }, { id: 'payment', label: 'Pay' }];
  }

  return [...baseFilters, { id: 'assigned', label: 'Assigned' }, { id: 'payment', label: 'Pay' }, { id: 'whatsapp', label: 'WhatsApp' }, { id: 'instagram', label: 'Instagram' }];
}

function matchesFilter(conversation: MobileConversation, filter: InboxFilter) {
  if (filter === 'all') {
    return true;
  }

  if (filter === 'unread') {
    return conversation.unreadCount > 0;
  }

  if (filter === 'assigned') {
    return Boolean(conversation.assignedFreelancerId || conversation.assignedFreelancerName || conversation.assignmentSummary?.assignedFreelancerId);
  }

  if (filter === 'payment') {
    return Boolean(conversation.latestPaymentRequest || conversation.paymentRequests?.length);
  }

  if (filter === 'whatsapp') {
    return conversation.sourceChannel === 'whatsapp' || (!conversation.sourceChannel && !conversation.isInAppCustomerThread);
  }

  if (filter === 'instagram') {
    return conversation.sourceChannel === 'instagram';
  }

  return true;
}

function ConversationRow({
  audience,
  conversation,
  onPress,
}: {
  audience: MobileInboxAudience;
  conversation: MobileConversation;
  onPress: () => void;
}) {
  const latest = getLatestMessage(conversation);
  const platform = getChannelLabel(conversation);
  const stateLabel = getStateLabel(conversation);
  const customerDisplayName = getCustomerDisplayNameForAudience(conversation, audience);
  const customerUnread = conversation.unreadCountByLane?.customer ?? 0;
  const internalUnread = conversation.unreadCountByLane?.internal ?? 0;
  const internalLabel = audience === 'freelancer' ? 'A' : 'F';
  const offer = conversation.myAssignmentOffer ?? conversation.assignmentSummary?.myOffer ?? null;
  const [now, setNow] = useState(Date.now);
  const hasActiveOffer =
    audience === 'freelancer' &&
    offer?.status === 'PENDING' &&
    (!offer.expiresAt || new Date(offer.expiresAt).getTime() > now);
  const [offerPulse] = useState(() => new Animated.Value(1));

  useEffect(() => {
    if (!offer?.expiresAt) return;
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, [offer?.expiresAt]);

  useEffect(() => {
    if (!hasActiveOffer) {
      offerPulse.setValue(1);
      return;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(offerPulse, { toValue: 0.25, duration: 550, useNativeDriver: true }),
        Animated.timing(offerPulse, { toValue: 1, duration: 550, useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [hasActiveOffer, offerPulse]);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, hasActiveOffer && styles.rowProjectOffer, pressed && styles.rowPressed]}
    >
      <StableAvatar imageUrl={conversation.customerProfileImageUrl} label={customerDisplayName} size={50} />

      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <Text numberOfLines={1} style={styles.customerName}>
            {customerDisplayName}
          </Text>
          {hasActiveOffer ? (
            <View style={styles.projectOfferMarker}>
              <Animated.View style={[styles.projectOfferPulse, { opacity: offerPulse, transform: [{ scale: offerPulse }] }]} />
              <Text style={styles.projectOfferMarkerText}>NEW PROJECT OFFER</Text>
            </View>
          ) : null}
        </View>
        <Text numberOfLines={1} style={styles.serviceTitle}>
          {conversation.serviceTitle || `${platform} inbox`}
        </Text>
        <Text numberOfLines={1} style={styles.preview}>
          {getPreview(conversation)}
        </Text>
        <View style={styles.metaRow}>
          <View style={styles.channelChip}>
            <Text style={styles.channelText}>{platform}</Text>
          </View>
          {stateLabel ? (
            <View style={styles.stateChip}>
              <Text style={styles.stateText}>{stateLabel}</Text>
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.rowAside}>
        <Text style={styles.time}>{formatTime(latest?.createdAt)}</Text>
        {conversation.unreadCount > 0 ? (
          <View style={styles.unreadBadge}>
            <Text style={styles.unreadText}>{conversation.unreadCount}</Text>
          </View>
        ) : null}
        {customerUnread > 0 || internalUnread > 0 ? (
          <View style={styles.laneUnreadStack}>
            {customerUnread > 0 ? (
              <View style={styles.laneUnreadDot}>
                <Text style={styles.laneUnreadText}>C{customerUnread > 9 ? '9+' : customerUnread}</Text>
              </View>
            ) : null}
            {internalUnread > 0 ? (
              <View style={[styles.laneUnreadDot, styles.laneUnreadDotInternal]}>
                <Text style={styles.laneUnreadText}>{internalLabel}{internalUnread > 9 ? '9+' : internalUnread}</Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

export default function ChatsTab() {
  const auth = useAuth();
  const audience = resolveAudienceForRole(auth.session?.role);
  const role = auth.session?.role;
  const isFocused = useIsFocused();
  const [activeFilter, setActiveFilter] = useState<InboxFilter>('all');
  const [search, setSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  const chatsQuery = useChats(audience, { isFocused, includeSupportData: false, liveSync: true });
  const filters = useMemo(() => getRoleFilters(role), [role]);
  const conversations = useMemo(() => chatsQuery.data?.conversations ?? [], [chatsQuery.data?.conversations]);
  const inboxStats = useMemo(
    () => ({
      total: conversations.length,
      unread: conversations.reduce((total, conversation) => total + conversation.unreadCount, 0),
      payments: conversations.filter((conversation) => conversation.latestPaymentRequest || conversation.paymentRequests?.length).length,
    }),
    [conversations],
  );
  const filteredConversations = useMemo(() => {
    const term = search.trim().toLowerCase();
    return conversations.filter((conversation) => {
      const searchable = [
        conversation.clientAlias,
        conversation.customerDisplayName,
        conversation.customerPhoneDisplay,
        conversation.serviceTitle,
        conversation.summary,
        conversation.agencyContext?.agencyName,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return matchesFilter(conversation, activeFilter) && (!term || searchable.includes(term));
    });
  }, [activeFilter, conversations, search]);
  async function openConversation(conversation: MobileConversation) {
    const params = new URLSearchParams({
      audience,
      lane: conversation.preferredLane ?? conversation.latestMessageLane ?? 'customer',
    });
    router.push(`/chat/${encodeURIComponent(conversation.id)}?${params.toString()}`);
  }

  async function handleManualRefresh() {
    setIsManualRefreshing(true);
    try {
      await chatsQuery.refetch();
    } finally {
      setIsManualRefreshing(false);
    }
  }

  return (
    <Screen scroll={false} contentStyle={styles.screen}>
      <GigxomiHeader
        rightSlot={
          <Pressable style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]} onPress={() => router.push('/settings')}>
            <Feather name="more-vertical" size={21} color={theme.colors.textSecondary} />
          </Pressable>
        }
      />

      <View style={styles.inboxHero}>
        <View style={styles.inboxHeroCopy}>
          <Text style={styles.inboxEyebrow}>{getRoleInboxTitle(role)}</Text>
          <Text numberOfLines={1} style={styles.inboxMeta}>
            {getRoleInboxMeta(role)}
          </Text>
        </View>
        <View style={styles.inboxStats}>
          <View style={styles.statPill}>
            <Text style={styles.statValue}>{inboxStats.total}</Text>
            <Text style={styles.statLabel}>Chats</Text>
          </View>
          <View style={[styles.statPill, inboxStats.unread > 0 && styles.statPillHot]}>
            <Text style={styles.statValue}>{inboxStats.unread}</Text>
            <Text style={styles.statLabel}>Unread</Text>
          </View>
          <View style={styles.statPill}>
            <Text style={styles.statValue}>{inboxStats.payments}</Text>
            <Text style={styles.statLabel}>Pay</Text>
          </View>
        </View>
      </View>

      <View style={styles.quickActions}>
        <Pressable style={({ pressed }) => [styles.quickAction, pressed && styles.quickActionPressed]} onPress={() => router.push('/projects')}>
          <Feather name={role === 'FREELANCER' ? 'send' : 'briefcase'} size={15} color={theme.colors.text} />
          <Text style={styles.quickActionText}>{role === 'FREELANCER' ? 'Apply' : role === 'MANAGER' ? 'Tasks' : 'Work'}</Text>
        </Pressable>
        <Pressable style={({ pressed }) => [styles.quickAction, pressed && styles.quickActionPressed]} onPress={() => router.push(role === 'FREELANCER' ? '/profile' : '/team')}>
          <Feather name={role === 'FREELANCER' ? 'user' : 'users'} size={15} color={theme.colors.text} />
          <Text style={styles.quickActionText}>{role === 'FREELANCER' ? 'Profile' : 'Team'}</Text>
        </Pressable>
        <Pressable style={({ pressed }) => [styles.quickAction, pressed && styles.quickActionPressed]} onPress={() => router.push(role === 'FREELANCER' ? '/money' : '/settings')}>
          <Feather name={role === 'FREELANCER' ? 'credit-card' : 'sliders'} size={15} color={theme.colors.text} />
          <Text style={styles.quickActionText}>{role === 'FREELANCER' ? 'Money' : 'Ops'}</Text>
        </Pressable>
      </View>

      <View style={[styles.searchBar, searchFocused && styles.searchBarFocused]}>
        <Feather name="search" size={17} color={theme.colors.mutedText} />
        <TextInput
          placeholder="Search chats"
          placeholderTextColor={theme.colors.mutedText}
          value={search}
          onChangeText={setSearch}
          style={styles.searchInput}
          selectionColor={theme.colors.accent}
          onBlur={() => setSearchFocused(false)}
          onFocus={() => setSearchFocused(true)}
        />
      </View>

      <View style={styles.controlPanel}>
        {filters.map((filter) => (
          <Pressable
            key={filter.id}
            style={[styles.controlTab, activeFilter === filter.id && styles.controlTabActive]}
            onPress={() => setActiveFilter(filter.id)}
          >
            <Text style={[styles.controlText, activeFilter === filter.id && styles.controlTextActive]}>{filter.label}</Text>
          </Pressable>
        ))}
      </View>

      {chatsQuery.error ? <Text style={styles.error}>{chatsQuery.error.message}</Text> : null}

      <FlatList
        data={filteredConversations}
        style={styles.list}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <ConversationRow audience={audience} conversation={item} onPress={() => openConversation(item)} />}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        refreshControl={
          <BrandedRefreshControl
            tintColor={theme.colors.accent}
            refreshing={isManualRefreshing}
            onRefresh={() => {
              void handleManualRefresh();
            }}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>{chatsQuery.isLoading ? 'Loading chats...' : 'No conversations found'}</Text>
            <Text style={styles.emptyCopy}>
              {auth.token ? 'Pull to refresh the same inbox used by the web app.' : 'Login to load your Gigxomi inbox.'}
            </Text>
          </View>
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: theme.colors.backgroundSoft,
    paddingTop: theme.spacing.md,
    paddingBottom: 0,
  },
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
  iconButtonPressed: {
    transform: [{ scale: 0.97 }],
    backgroundColor: theme.colors.surfaceSoft,
  },
  inboxHero: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  inboxHeroCopy: {
    flex: 1,
    minWidth: 0,
  },
  inboxEyebrow: {
    color: theme.colors.text,
    fontSize: 23,
    fontWeight: '900',
    lineHeight: 28,
  },
  inboxMeta: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },
  inboxStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statPill: {
    minWidth: 46,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 7,
  },
  statPillHot: {
    borderColor: theme.colors.accentBorder,
    backgroundColor: theme.colors.accentSoft,
  },
  statValue: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '900',
    lineHeight: 18,
  },
  statLabel: {
    color: theme.colors.mutedText,
    fontSize: 10,
    fontWeight: '800',
  },
  quickActions: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: theme.spacing.sm,
  },
  quickAction: {
    flex: 1,
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 10,
  },
  quickActionPressed: {
    transform: [{ scale: 0.98 }],
    backgroundColor: theme.colors.surfaceSoft,
  },
  quickActionText: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '900',
  },
  searchBar: {
    height: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    borderRadius: 23,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    backgroundColor: theme.colors.surfaceRaised,
    paddingHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  searchBarFocused: {
    borderColor: theme.colors.accentBorder,
    backgroundColor: theme.colors.surfaceSoft,
  },
  searchInput: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 14,
  },
  controlPanel: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 7,
    marginBottom: theme.spacing.sm,
  },
  controlTab: {
    minHeight: 30,
    justifyContent: 'center',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'transparent',
    paddingHorizontal: 10,
    backgroundColor: 'transparent',
  },
  controlTabActive: {
    backgroundColor: theme.colors.accentSoft,
    borderColor: theme.colors.accentBorder,
  },
  controlText: {
    color: theme.colors.mutedText,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'capitalize',
  },
  controlTextActive: {
    color: theme.colors.text,
  },
  error: {
    color: theme.colors.danger,
    fontSize: theme.typography.small,
    marginBottom: theme.spacing.sm,
  },
  listContent: {
    paddingTop: 2,
    paddingBottom: 148,
  },
  list: {
    flex: 1,
  },
  separator: {
    height: 1,
    backgroundColor: theme.colors.borderSubtle,
    marginLeft: 70,
  },
  row: {
    minHeight: 86,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    borderRadius: theme.radius.md,
    paddingVertical: 12,
    paddingHorizontal: 2,
  },
  rowPressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  rowProjectOffer: {
    borderWidth: 1,
    borderColor: theme.colors.accentBorder,
    backgroundColor: theme.colors.accentSoft,
    paddingHorizontal: 10,
  },
  rowBody: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  projectOfferMarker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.accentBorder,
    backgroundColor: theme.colors.background,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  projectOfferPulse: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: theme.colors.accent,
  },
  projectOfferMarkerText: {
    color: theme.colors.accentStrong,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  customerName: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 17,
    fontWeight: '800',
    lineHeight: 21,
  },
  serviceTitle: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    fontWeight: '700',
  },
  preview: {
    color: theme.colors.mutedText,
    fontSize: 15,
    lineHeight: 19,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  channelChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.accentBorder,
    backgroundColor: theme.colors.accentSoft,
    paddingHorizontal: 9,
    paddingVertical: 2,
  },
  channelText: {
    color: theme.colors.accentStrong,
    fontSize: 11,
    fontWeight: '800',
  },
  stateChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    paddingHorizontal: 9,
    paddingVertical: 2,
  },
  stateText: {
    color: theme.colors.textSecondary,
    fontSize: 11,
    fontWeight: '800',
  },
  rowAside: {
    minWidth: 42,
    alignItems: 'flex-end',
    gap: theme.spacing.sm,
    paddingTop: 3,
  },
  time: {
    color: theme.colors.mutedText,
    fontSize: 12,
  },
  unreadBadge: {
    minWidth: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
    backgroundColor: theme.colors.accent,
    paddingHorizontal: 6,
  },
  unreadText: {
    color: theme.colors.background,
    fontSize: 11,
    fontWeight: '900',
  },
  laneUnreadStack: {
    alignItems: 'flex-end',
    gap: 4,
  },
  laneUnreadDot: {
    minWidth: 24,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
    borderWidth: 1,
    borderColor: theme.colors.accentBorder,
    backgroundColor: theme.colors.accentSoft,
    paddingHorizontal: 5,
  },
  laneUnreadDotInternal: {
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceRaised,
  },
  laneUnreadText: {
    color: theme.colors.text,
    fontSize: 9,
    fontWeight: '900',
  },
  emptyState: {
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.xxl,
  },
  emptyTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.body,
    fontWeight: '900',
  },
  emptyCopy: {
    color: theme.colors.mutedText,
    fontSize: theme.typography.small,
    textAlign: 'center',
    lineHeight: 18,
  },
});
