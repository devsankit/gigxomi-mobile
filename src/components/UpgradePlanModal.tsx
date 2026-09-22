import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton } from './AppButton';
import { theme } from '@/src/constants/theme';
import { useAuth } from '@/src/hooks/useAuth';
import { usePackages, useSubscribePackage } from '@/src/hooks/usePackages';
import { useSubscriptionStatus } from '@/src/hooks/useSubscriptionStatus';

export type UpgradePlanModalProps = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  reason?: string;
};

export function UpgradePlanModal({
  visible,
  onClose,
  title = 'Upgrade to Agency Premium',
  reason = 'Your Freemium workspace has reached its limit. Upgrade to Agency Premium for unlimited editor assignments, manager accounts, and priority dispatch.',
}: UpgradePlanModalProps) {
  const auth = useAuth();
  const [billingCycle, setBillingCycle] = useState<'MONTHLY' | 'YEARLY'>('YEARLY');
  const [error, setError] = useState('');
  const packagesQuery = usePackages(auth.session?.userId, 'AGENCY');
  const subscriptionQuery = useSubscriptionStatus(auth.session?.userId, 'AGENCY');
  const subscribeMutation = useSubscribePackage();

  const packages = packagesQuery.data?.packages ?? [];
  const premiumPackage = packages.find((p) => !p.isFree && (p.slug?.includes('premium') || p.audience === 'AGENCY')) ?? packages.find((p) => !p.isFree);

  const monthlyPrice = premiumPackage?.priceMonthly ?? 2000;
  const yearlyPrice = premiumPackage?.priceYearly ?? 17700;
  const saving = Math.max(0, monthlyPrice * 12 - yearlyPrice);

  const isCurrentlyPremium = Boolean(
    (auth.session?.role === 'ADMIN' || auth.session?.role === 'MANAGER') &&
    auth.session?.packageStatus === 'ACTIVE' &&
    (auth.session?.packageId?.toLowerCase().includes('premium') ||
     subscriptionQuery.data?.packageName?.toLowerCase().includes('premium'))
  );

  async function handleUpgrade() {
    if (isCurrentlyPremium) {
      onClose();
      return;
    }

    const message = encodeURIComponent(
      `Hi Gigxomi Team, I would like to upgrade my agency workspace to Agency Premium (${billingCycle === 'YEARLY' ? 'Yearly' : 'Monthly'}). Please share the payment and activation link.`
    );
    const whatsappUrl = `https://wa.me/919993328124?text=${message}`;

    try {
      onClose();
      await Linking.openURL(whatsappUrl);
    } catch {
      // Fallback to web package screen if WhatsApp app is not installed
      onClose();
      router.push('/package');
    }
  }

  return (
    <Modal visible={visible && !isCurrentlyPremium} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={s.card}>
          {/* Top Header Badge */}
          <View style={s.topHeader}>
            <View style={s.iconWrapper}>
              <Feather name="zap" size={24} color={theme.colors.accent} />
            </View>
            <View style={s.limitBadge}>
              <Text style={s.limitBadgeText}>PREMIUM UPGRADE</Text>
            </View>
          </View>

          {/* Title & Reason */}
          <Text style={s.title}>{title}</Text>
          <Text style={s.reason}>{reason}</Text>

          {/* Billing Cycle Selector */}
          <View style={s.toggleContainer}>
            <Pressable
              onPress={() => setBillingCycle('MONTHLY')}
              style={[s.toggleTab, billingCycle === 'MONTHLY' && s.toggleTabActive]}
            >
              <Text style={[s.toggleTabText, billingCycle === 'MONTHLY' && s.toggleTabTextActive]}>
                Monthly · ₹{monthlyPrice.toLocaleString('en-IN')}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setBillingCycle('YEARLY')}
              style={[s.toggleTab, billingCycle === 'YEARLY' && s.toggleTabActive]}
            >
              <Text style={[s.toggleTabText, billingCycle === 'YEARLY' && s.toggleTabTextActive]}>
                Yearly · ₹{yearlyPrice.toLocaleString('en-IN')}
              </Text>
            </Pressable>
          </View>

          {billingCycle === 'YEARLY' && saving > 0 ? (
            <View style={s.savingTag}>
              <Feather name="check-circle" size={13} color={theme.colors.accent} />
              <Text style={s.savingTagText}>Save ₹{saving.toLocaleString('en-IN')} with annual billing</Text>
            </View>
          ) : null}

          {/* Feature Bullets */}
          <View style={s.featuresList}>
            <View style={s.featureRow}>
              <Feather name="check" size={15} color={theme.colors.accent} />
              <Text style={s.featureText}>Unlimited active editor assignments (vs 2 in Launch)</Text>
            </View>
            <View style={s.featureRow}>
              <Feather name="shield" size={15} color={theme.colors.accent} />
              <Text style={[s.featureText, { color: theme.colors.accent, fontWeight: '800' }]}>
                Assign up to 3 Operations & Dispatch Managers (0 in Launch)
              </Text>
            </View>
            <View style={s.featureRow}>
              <Feather name="check" size={15} color={theme.colors.accent} />
              <Text style={s.featureText}>Multi-editor WhatsApp & Instagram routing</Text>
            </View>
            <View style={s.featureRow}>
              <Feather name="check" size={15} color={theme.colors.accent} />
              <Text style={s.featureText}>Priority editor matching & dedicated support</Text>
            </View>
          </View>

          {error ? <Text style={s.errorText}>{error}</Text> : null}

          {/* Action Buttons */}
          <View style={s.actions}>
            <AppButton
              title={`Upgrade & Pay ${billingCycle === 'YEARLY' ? `₹${yearlyPrice.toLocaleString('en-IN')}/yr` : `₹${monthlyPrice.toLocaleString('en-IN')}/mo`} →`}
              variant="primary"
              loading={subscribeMutation.isPending}
              onPress={handleUpgrade}
            />
            <AppButton
              title="Keep Current Work"
              variant="secondary"
              onPress={onClose}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: theme.colors.surfaceRaised,
    borderColor: theme.colors.accentBorder,
    borderWidth: 1.5,
    borderRadius: 24,
    padding: 22,
    gap: 12,
  },
  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  iconWrapper: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: theme.colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.accentBorder,
  },
  limitBadge: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderColor: 'rgba(239, 68, 68, 0.4)',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  limitBadgeText: {
    color: '#ff6b6b',
    fontWeight: '900',
    fontSize: 11,
    letterSpacing: 0.5,
  },
  title: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: '900',
    marginTop: 4,
  },
  reason: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  toggleContainer: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surface,
    padding: 4,
    borderRadius: 12,
    marginTop: 4,
  },
  toggleTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 9,
  },
  toggleTabActive: {
    backgroundColor: theme.colors.accentSoft,
    borderColor: theme.colors.accentBorder,
    borderWidth: 1,
  },
  toggleTabText: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  toggleTabTextActive: {
    color: theme.colors.accent,
    fontWeight: '800',
  },
  savingTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(185, 247, 25, 0.08)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  savingTagText: {
    color: theme.colors.accent,
    fontSize: 12,
    fontWeight: '700',
  },
  featuresList: {
    gap: 7,
    marginVertical: 4,
    backgroundColor: theme.colors.surface,
    padding: 12,
    borderRadius: 12,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  featureText: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  errorText: {
    color: theme.colors.danger,
    fontSize: 12,
    textAlign: 'center',
  },
  actions: {
    gap: 10,
    marginTop: 6,
  },
});
