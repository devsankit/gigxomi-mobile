import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '@/src/components/AppButton';
import { GigxomiHeader } from '@/src/components/GigxomiHeader';
import { usePushNotifications } from '@/src/components/PushNotificationProvider';
import { theme } from '@/src/constants/theme';
import { saveIntroCompleted } from '@/src/lib/introStorage';

type IntroSlide = {
  eyebrow: string;
  title: string;
  copy: string;
  graphic: 'workspace' | 'sync' | 'push';
};

const SLIDES: IntroSlide[] = [
  {
    eyebrow: 'Premium workspace',
    title: 'Run your creative business from one workspace',
    copy: 'Gigxomi brings chats, services, work delivery, packages, and payments into one mobile command center.',
    graphic: 'workspace',
  },
  {
    eyebrow: 'Always synced',
    title: 'Chats, work, services, and payments stay synced',
    copy: 'Use the same Gigxomi account as the website. Mobile actions reflect back on the live backend.',
    graphic: 'sync',
  },
  {
    eyebrow: 'Stay responsive',
    title: 'Turn on important alerts',
    copy: 'Get notified when clients reply, assignments move, payments update, or your team needs action.',
    graphic: 'push',
  },
];

function WorkspaceGraphic() {
  return (
    <View style={styles.graphicStage}>
      <View style={[styles.orbitCard, styles.orbitCardLeft]}>
        <Feather name="message-circle" size={16} color={theme.colors.accent} />
        <Text style={styles.orbitTitle}>Inbox</Text>
        <Text style={styles.orbitMeta}>WhatsApp ready</Text>
      </View>
      <View style={[styles.orbitCard, styles.orbitCardRight]}>
        <Feather name="briefcase" size={16} color={theme.colors.textSecondary} />
        <Text style={styles.orbitTitle}>Work</Text>
        <Text style={styles.orbitMeta}>3 active</Text>
      </View>
      <View style={styles.phoneFrame}>
        <View style={styles.phoneTop}>
          <View style={styles.phoneAvatar}>
            <Text style={styles.phoneAvatarText}>GX</Text>
          </View>
          <View style={styles.phoneLines}>
            <View style={styles.phoneLineWide} />
            <View style={styles.phoneLineShort} />
          </View>
        </View>
        <View style={styles.metricRow}>
          <MiniMetric label="Orders" value="12" />
          <MiniMetric label="Payout" value="OK" />
        </View>
        <View style={styles.timelineCard}>
          <View style={styles.timelineDot} />
          <View style={styles.timelineCopy}>
            <Text style={styles.timelineTitle}>Delivery review</Text>
            <Text style={styles.timelineMeta}>Synced with web</Text>
          </View>
        </View>
      </View>
      <View style={styles.brandRing}>
        <Text style={styles.brandRingText}>G</Text>
      </View>
    </View>
  );
}

function SyncGraphic() {
  return (
    <View style={styles.graphicStage}>
      <View style={styles.syncPanel}>
        <View style={styles.syncColumn}>
          <Text style={styles.syncLabel}>Mobile</Text>
          <CompactRow icon="message-circle" title="Client chat" value="Live" />
          <CompactRow icon="plus-square" title="Service" value="Draft" />
          <CompactRow icon="credit-card" title="Payment" value="Ready" />
        </View>
        <View style={styles.syncBridge}>
          <Feather name="repeat" size={24} color={theme.colors.accent} />
          <View style={styles.bridgeLine} />
        </View>
        <View style={styles.syncColumn}>
          <Text style={styles.syncLabel}>Website</Text>
          <CompactRow icon="users" title="Team" value="Admin" />
          <CompactRow icon="briefcase" title="Work" value="Review" />
          <CompactRow icon="database" title="Backend" value="Same" />
        </View>
      </View>
    </View>
  );
}

function PushGraphic() {
  return (
    <View style={styles.graphicStage}>
      <View style={styles.pushPhone}>
        <View style={styles.pushHeader}>
          <View style={styles.pushAvatar}>
            <Text style={styles.pushAvatarText}>A</Text>
          </View>
          <View style={styles.phoneLines}>
            <View style={styles.phoneLineWide} />
            <View style={styles.phoneLineShort} />
          </View>
        </View>
        <View style={styles.messageIncoming}>
          <Text style={styles.messageMeta}>Client</Text>
          <Text style={styles.messageText}>Need an update?</Text>
        </View>
        <View style={styles.messageOutgoing}>
          <Text style={styles.messageMetaDark}>Gigxomi</Text>
          <Text style={styles.messageText}>On it.</Text>
        </View>
      </View>
      <View style={styles.notificationBubble}>
        <View style={styles.notificationIcon}>
          <Feather name="bell" size={18} color={theme.colors.background} />
        </View>
        <View style={styles.notificationCopy}>
          <Text style={styles.notificationTitle}>Gigxomi alert</Text>
          <Text style={styles.notificationMeta}>New client reply</Text>
        </View>
      </View>
      <View style={styles.shieldBadge}>
        <Feather name="shield" size={18} color={theme.colors.accent} />
      </View>
    </View>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.miniMetric}>
      <Text style={styles.miniMetricValue}>{value}</Text>
      <Text style={styles.miniMetricLabel}>{label}</Text>
    </View>
  );
}

function CompactRow({ icon, title, value }: { icon: keyof typeof Feather.glyphMap; title: string; value: string }) {
  return (
    <View style={styles.compactRow}>
      <Feather name={icon} size={14} color={theme.colors.accent} />
      <Text style={styles.compactTitle}>{title}</Text>
      <Text style={styles.compactValue}>{value}</Text>
    </View>
  );
}

function Graphic({ type }: { type: IntroSlide['graphic'] }) {
  if (type === 'sync') return <SyncGraphic />;
  if (type === 'push') return <PushGraphic />;
  return <WorkspaceGraphic />;
}

export default function IntroScreen() {
  const [index, setIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const insets = useSafeAreaInsets();
  const push = usePushNotifications();
  const { width } = useWindowDimensions();
  const slide = SLIDES[index];
  const isLast = index === SLIDES.length - 1;
  const progress = useMemo(() => ((index + 1) / SLIDES.length) * 100, [index]);
  const compact = width < 380;

  async function finish(enablePush: boolean) {
    setSaving(true);
    try {
      if (enablePush) {
        await push.enable();
      }
      await saveIntroCompleted(true);
      router.replace('/register');
    } finally {
      setSaving(false);
    }
  }

  function handlePrimary() {
    if (!isLast) {
      setIndex((current) => Math.min(current + 1, SLIDES.length - 1));
      return;
    }
    void finish(true);
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <View style={[styles.screen, { paddingBottom: Math.max(insets.bottom, theme.spacing.md) }]}>
        <GigxomiHeader
          rightSlot={
            <Pressable disabled={saving} style={styles.skipButton} onPress={() => void finish(false)}>
              <Text style={styles.skipText}>Skip</Text>
            </Pressable>
          }
        />

        <View style={[styles.hero, compact && styles.heroCompact]}>
          <Graphic type={slide.graphic} />
        </View>

        <View style={styles.copyBlock}>
          <Text style={styles.eyebrow}>{slide.eyebrow}</Text>
          <Text style={[styles.title, compact && styles.titleCompact]}>{slide.title}</Text>
          <Text style={styles.copy}>{slide.copy}</Text>
          {isLast ? (
            <View style={styles.pushNote}>
              <Feather name="info" size={15} color={theme.colors.accent} />
              <Text style={styles.pushNoteText}>
                Firebase push registration completes in the installed Gigxomi Android/iOS app.
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.footer}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress}%` }]} />
          </View>
          <View style={styles.dots}>
            {SLIDES.map((item, itemIndex) => (
              <View key={item.title} style={[styles.dot, itemIndex === index && styles.dotActive]} />
            ))}
          </View>
          <AppButton
            title={isLast ? 'Enable notifications' : 'Continue'}
            loading={saving}
            icon={<Feather name={isLast ? 'bell' : 'arrow-right'} size={17} color={theme.colors.background} />}
            onPress={handlePrimary}
          />
          {isLast ? <AppButton title="Not now" variant="secondary" disabled={saving} onPress={() => void finish(false)} /> : null}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  screen: {
    flex: 1,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.lg,
  },
  skipButton: {
    minHeight: 36,
    justifyContent: 'center',
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    paddingHorizontal: theme.spacing.md,
  },
  skipText: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.caption,
    fontWeight: '900',
  },
  hero: {
    flex: 1,
    minHeight: 300,
    justifyContent: 'center',
  },
  heroCompact: {
    minHeight: 250,
  },
  graphicStage: {
    minHeight: 292,
    justifyContent: 'center',
    borderRadius: 34,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    backgroundColor: 'rgba(13, 19, 24, 0.68)',
    overflow: 'hidden',
    padding: theme.spacing.lg,
  },
  phoneFrame: {
    alignSelf: 'center',
    width: 190,
    minHeight: 248,
    gap: theme.spacing.md,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.backgroundSoft,
    padding: theme.spacing.md,
  },
  phoneTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  phoneAvatar: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 21,
    borderWidth: 1,
    borderColor: theme.colors.accentBorder,
    backgroundColor: theme.colors.accentSoft,
  },
  phoneAvatarText: {
    color: theme.colors.accent,
    fontSize: theme.typography.caption,
    fontWeight: '900',
  },
  phoneLines: {
    flex: 1,
    gap: 7,
  },
  phoneLineWide: {
    width: '82%',
    height: 8,
    borderRadius: 99,
    backgroundColor: theme.colors.surfaceRaised,
  },
  phoneLineShort: {
    width: '54%',
    height: 8,
    borderRadius: 99,
    backgroundColor: theme.colors.surfaceSoft,
  },
  metricRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  miniMetric: {
    flex: 1,
    minHeight: 70,
    justifyContent: 'center',
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.sm,
  },
  miniMetricValue: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: '900',
  },
  miniMetricLabel: {
    color: theme.colors.mutedText,
    fontSize: 11,
    fontWeight: '800',
  },
  timelineCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.accentBorder,
    backgroundColor: theme.colors.accentSoft,
    padding: theme.spacing.sm,
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.colors.accent,
  },
  timelineCopy: {
    flex: 1,
  },
  timelineTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.caption,
    fontWeight: '900',
  },
  timelineMeta: {
    color: theme.colors.mutedText,
    fontSize: 11,
  },
  orbitCard: {
    position: 'absolute',
    zIndex: 2,
    minWidth: 118,
    gap: 3,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    backgroundColor: 'rgba(17, 25, 32, 0.94)',
    padding: theme.spacing.sm,
  },
  orbitCardLeft: {
    left: 16,
    top: 34,
  },
  orbitCardRight: {
    right: 16,
    bottom: 34,
  },
  orbitTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.caption,
    fontWeight: '900',
  },
  orbitMeta: {
    color: theme.colors.mutedText,
    fontSize: 10,
    fontWeight: '700',
  },
  brandRing: {
    position: 'absolute',
    right: -28,
    top: -28,
    width: 116,
    height: 116,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 58,
    borderWidth: 1,
    borderColor: theme.colors.accentBorder,
    backgroundColor: 'rgba(185, 247, 25, 0.05)',
  },
  brandRingText: {
    color: theme.colors.accent,
    fontSize: 30,
    fontWeight: '900',
  },
  syncPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  syncColumn: {
    flex: 1,
    gap: theme.spacing.sm,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    backgroundColor: theme.colors.backgroundSoft,
    padding: theme.spacing.sm,
  },
  syncLabel: {
    color: theme.colors.accent,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  compactRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: 16,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 9,
  },
  compactTitle: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 11,
    fontWeight: '900',
  },
  compactValue: {
    color: theme.colors.mutedText,
    fontSize: 10,
    fontWeight: '900',
  },
  syncBridge: {
    width: 38,
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  bridgeLine: {
    width: 1,
    height: 92,
    backgroundColor: theme.colors.accentBorder,
  },
  pushPhone: {
    alignSelf: 'center',
    width: 210,
    minHeight: 238,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    backgroundColor: theme.colors.backgroundSoft,
    padding: theme.spacing.md,
  },
  pushHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.lg,
  },
  pushAvatar: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: theme.colors.surfaceRaised,
  },
  pushAvatarText: {
    color: theme.colors.accent,
    fontSize: theme.typography.small,
    fontWeight: '900',
  },
  messageIncoming: {
    alignSelf: 'flex-start',
    maxWidth: '82%',
    gap: 3,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.chatIncomingBorder,
    backgroundColor: theme.colors.chatIncomingBg,
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  messageOutgoing: {
    alignSelf: 'flex-end',
    maxWidth: '78%',
    gap: 3,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.chatOutgoingBorder,
    backgroundColor: theme.colors.chatOutgoingBg,
    padding: theme.spacing.sm,
  },
  messageMeta: {
    color: theme.colors.accent,
    fontSize: 10,
    fontWeight: '900',
  },
  messageMetaDark: {
    color: theme.colors.textSecondary,
    fontSize: 10,
    fontWeight: '900',
  },
  messageText: {
    color: theme.colors.text,
    fontSize: theme.typography.small,
    fontWeight: '800',
  },
  notificationBubble: {
    position: 'absolute',
    left: 26,
    top: 42,
    zIndex: 3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: theme.colors.accentBorder,
    backgroundColor: 'rgba(13, 19, 24, 0.96)',
    padding: theme.spacing.sm,
  },
  notificationIcon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: theme.colors.accent,
  },
  notificationCopy: {
    minWidth: 128,
  },
  notificationTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.caption,
    fontWeight: '900',
  },
  notificationMeta: {
    color: theme.colors.mutedText,
    fontSize: 11,
    fontWeight: '700',
  },
  shieldBadge: {
    position: 'absolute',
    right: 34,
    bottom: 38,
    width: 50,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 25,
    borderWidth: 1,
    borderColor: theme.colors.accentBorder,
    backgroundColor: theme.colors.accentSoft,
  },
  copyBlock: {
    gap: theme.spacing.sm,
  },
  eyebrow: {
    color: theme.colors.accent,
    fontSize: theme.typography.caption,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  title: {
    color: theme.colors.text,
    fontSize: 31,
    fontWeight: '900',
    lineHeight: 36,
  },
  titleCompact: {
    fontSize: 28,
    lineHeight: 33,
  },
  copy: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.body,
    lineHeight: 22,
  },
  pushNote: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    padding: theme.spacing.sm,
    marginTop: theme.spacing.xs,
  },
  pushNoteText: {
    flex: 1,
    color: theme.colors.mutedText,
    fontSize: theme.typography.caption,
    lineHeight: 16,
  },
  footer: {
    gap: theme.spacing.sm,
    paddingTop: theme.spacing.lg,
  },
  progressTrack: {
    height: 5,
    overflow: 'hidden',
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surfaceRaised,
  },
  progressFill: {
    height: '100%',
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.accent,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: theme.spacing.xs,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: theme.colors.surfaceRaised,
  },
  dotActive: {
    width: 18,
    backgroundColor: theme.colors.accent,
  },
});
