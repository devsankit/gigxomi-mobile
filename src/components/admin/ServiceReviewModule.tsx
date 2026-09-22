import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AppButton } from '@/src/components/AppButton';
import { AppCard } from '@/src/components/AppCard';
import { AppInput } from '@/src/components/AppInput';
import { StableAvatar } from '@/src/components/StableAvatar';
import { PortfolioMediaPlayer } from '@/src/components/team/PortfolioMediaPlayer';
import { theme } from '@/src/constants/theme';
import { apiRequest } from '@/src/lib/api';
import { useAuth } from '@/src/hooks/useAuth';
import type { FreelancerServiceRecord } from '@/src/types';

export type ServiceReviewModuleProps = {
  services?: FreelancerServiceRecord[];
  isLoading?: boolean;
  onRefresh?: () => void;
  onApprove?: (serviceId: string) => Promise<void>;
  onReject?: (serviceId: string, reason: string) => Promise<void>;
  title?: string;
  subtitle?: string;
  emptyMessage?: string;
};

export function ServiceReviewModule({
  services: controlledServices,
  isLoading: controlledLoading,
  onRefresh: controlledRefresh,
  onApprove,
  onReject,
  title = 'Service Submissions Review',
  subtitle = 'Evaluate and approve incoming video editing service packages.',
  emptyMessage = 'No services awaiting review right now.',
}: ServiceReviewModuleProps) {
  const auth = useAuth();
  const [internalServices, setInternalServices] = useState<FreelancerServiceRecord[]>([]);
  const [internalLoading, setInternalLoading] = useState(false);
  const [activeMediaUrl, setActiveMediaUrl] = useState<string | null>(null);
  const [rejectModalService, setRejectModalService] = useState<FreelancerServiceRecord | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [actionPendingId, setActionPendingId] = useState<string | null>(null);

  // Use controlled props or fallback to internal state
  const isControlled = controlledServices !== undefined;
  const list = isControlled ? controlledServices : internalServices;
  const loading = isControlled ? controlledLoading : internalLoading;

  async function fetchPendingServices() {
    if (isControlled) {
      controlledRefresh?.();
      return;
    }
    if (!auth.token) return;
    try {
      setInternalLoading(true);
      const res = await apiRequest<{ ok: boolean; services: FreelancerServiceRecord[] }>(
        '/freelancer/services',
        { token: auth.token }
      );
      if (res.ok && Array.isArray(res.services)) {
        setInternalServices(res.services);
      }
    } catch {
      // silent or handled by UI
    } finally {
      setInternalLoading(false);
    }
  }

  async function handleApprove(service: FreelancerServiceRecord) {
    Alert.alert(
      'Approve Service?',
      `Are you sure you want to approve "${service.title}"? It will be published to the public marketplace.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve',
          onPress: async () => {
            setActionPendingId(`${service.id}:approve`);
            try {
              if (onApprove) {
                await onApprove(service.id);
              } else if (auth.token) {
                await apiRequest(`/admin/service-reviews/${encodeURIComponent(service.id)}/decision`, {
                  method: 'POST',
                  token: auth.token,
                  body: { decision: 'APPROVE' },
                });
                await fetchPendingServices();
              }
            } catch (err) {
              Alert.alert('Error', err instanceof Error ? err.message : 'Approval failed');
            } finally {
              setActionPendingId(null);
            }
          },
        },
      ]
    );
  }

  async function confirmReject() {
    if (!rejectModalService) return;
    const service = rejectModalService;
    setActionPendingId(`${service.id}:reject`);
    try {
      if (onReject) {
        await onReject(service.id, rejectionReason.trim());
      } else if (auth.token) {
        await apiRequest(`/admin/service-reviews/${encodeURIComponent(service.id)}/decision`, {
          method: 'POST',
          token: auth.token,
          body: { decision: 'REJECT', note: rejectionReason.trim() },
        });
        await fetchPendingServices();
      }
      setRejectModalService(null);
      setRejectionReason('');
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Rejection failed');
    } finally {
      setActionPendingId(null);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.eyebrow}>SUPER ADMIN REVIEW</Text>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Refresh reviews"
          style={styles.refreshBtn}
          onPress={() => void fetchPendingServices()}
        >
          <Feather name="refresh-cw" size={16} color={theme.colors.text} />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator color={theme.colors.accent} />
          <Text style={styles.mutedText}>Loading service submissions...</Text>
        </View>
      ) : list.length === 0 ? (
        <AppCard style={styles.emptyCard}>
          <Feather name="check-circle" size={32} color={theme.colors.success} />
          <Text style={styles.emptyTitle}>All Caught Up!</Text>
          <Text style={styles.emptyText}>{emptyMessage}</Text>
        </AppCard>
      ) : (
        <View style={styles.list}>
          {list.map((service) => {
            const status = String(service.status || 'PENDING').toUpperCase();
            const sampleUrl =
              service.sampleVideoUrl ||
              service.sampleVideoEmbedUrl ||
              service.media?.find((m) => m.sourceUrl)?.sourceUrl ||
              '';
            const isApproving = actionPendingId === `${service.id}:approve`;
            const isRejecting = actionPendingId === `${service.id}:reject`;

            return (
              <AppCard key={service.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={styles.avatarRow}>
                    <StableAvatar size={40} label={service.ownerName || 'Editor'} />
                    <View style={styles.titleCol}>
                      <Text style={styles.serviceTitle}>{service.title}</Text>
                      <Text style={styles.creatorText}>
                        By {service.ownerName || 'Freelancer'} · ₹
                        {Number(service.basePrice || 0).toLocaleString('en-IN')}
                      </Text>
                    </View>
                  </View>
                  <View
                    style={[
                      styles.statusPill,
                      status === 'APPROVED' || status === 'PUBLISHED'
                        ? styles.statusPillApproved
                        : status === 'REJECTED'
                        ? styles.statusPillRejected
                        : styles.statusPillPending,
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusText,
                        status === 'APPROVED' || status === 'PUBLISHED'
                          ? styles.statusTextApproved
                          : status === 'REJECTED'
                          ? styles.statusTextRejected
                          : styles.statusTextPending,
                      ]}
                    >
                      {status}
                    </Text>
                  </View>
                </View>

                <Text style={styles.categoryBadge}>{service.category || 'Video Editing'}</Text>

                {service.summary ? (
                  <Text numberOfLines={3} style={styles.description}>
                    {service.summary}
                  </Text>
                ) : service.description ? (
                  <Text numberOfLines={3} style={styles.description}>
                    {service.description}
                  </Text>
                ) : null}

                {sampleUrl ? (
                  <Pressable
                    style={styles.sampleMediaBtn}
                    onPress={() => setActiveMediaUrl(sampleUrl)}
                  >
                    <Feather name="play-circle" size={18} color={theme.colors.accent} />
                    <Text style={styles.sampleMediaText}>Preview Sample Video / Reel</Text>
                  </Pressable>
                ) : null}

                <View style={styles.actionRow}>
                  <View style={styles.actionBtn}>
                    <AppButton
                      title="Approve"
                      variant="primary"
                      loading={isApproving}
                      disabled={Boolean(actionPendingId) || status === 'APPROVED'}
                      onPress={() => void handleApprove(service)}
                    />
                  </View>
                  <View style={styles.actionBtn}>
                    <AppButton
                      title="Reject"
                      variant="danger"
                      loading={isRejecting}
                      disabled={Boolean(actionPendingId) || status === 'REJECTED'}
                      onPress={() => {
                        setRejectModalService(service);
                        setRejectionReason('');
                      }}
                    />
                  </View>
                </View>
              </AppCard>
            );
          })}
        </View>
      )}

      {/* Media Player Modal */}
      <Modal visible={Boolean(activeMediaUrl)} transparent animationType="slide" onRequestClose={() => setActiveMediaUrl(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center' }}>
          <Pressable onPress={() => setActiveMediaUrl(null)} style={{ alignSelf: 'flex-end', padding: 16 }}>
            <Feather name="x" size={24} color="#fff" />
          </Pressable>
          {activeMediaUrl ? <PortfolioMediaPlayer url={activeMediaUrl} /> : null}
        </View>
      </Modal>

      {/* Rejection Modal */}
      <Modal
        visible={Boolean(rejectModalService)}
        transparent
        animationType="fade"
        onRequestClose={() => setRejectModalService(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Reject Service Submission</Text>
            <Text style={styles.modalSubtitle}>
              Provide constructive feedback to {rejectModalService?.ownerName || 'the editor'} explaining why this package was rejected.
            </Text>
            <AppInput
              label="Rejection Note / Feedback"
              placeholder="e.g. Please include high-resolution preview reels and clear deliverables."
              multiline
              value={rejectionReason}
              onChangeText={setRejectionReason}
            />
            <View style={styles.modalButtons}>
              <View style={styles.actionBtn}>
                <AppButton
                  title="Cancel"
                  variant="secondary"
                  onPress={() => setRejectModalService(null)}
                />
              </View>
              <View style={styles.actionBtn}>
                <AppButton
                  title="Submit Rejection"
                  variant="danger"
                  loading={Boolean(actionPendingId)}
                  disabled={!rejectionReason.trim()}
                  onPress={() => void confirmReject()}
                />
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerLeft: {
    flex: 1,
    marginRight: 12,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.5,
    color: theme.colors.accent,
    marginBottom: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
    color: theme.colors.text,
  },
  subtitle: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  refreshBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: theme.colors.surfaceRaised,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  centerBox: {
    padding: 32,
    alignItems: 'center',
    gap: 12,
  },
  mutedText: {
    color: theme.colors.mutedText,
    fontSize: 13,
  },
  emptyCard: {
    alignItems: 'center',
    padding: 24,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: theme.colors.text,
    marginTop: 6,
  },
  emptyText: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  list: {
    gap: 14,
  },
  card: {
    gap: 12,
    borderColor: theme.colors.borderSubtle,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  titleCol: {
    flex: 1,
  },
  serviceTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: theme.colors.text,
  },
  creatorText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  statusPillPending: {
    backgroundColor: 'rgba(234, 179, 8, 0.12)',
    borderColor: 'rgba(234, 179, 8, 0.4)',
  },
  statusPillApproved: {
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
    borderColor: 'rgba(34, 197, 94, 0.4)',
  },
  statusPillRejected: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderColor: 'rgba(239, 68, 68, 0.4)',
  },
  statusText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  statusTextPending: {
    color: '#EAB308',
  },
  statusTextApproved: {
    color: '#22C55E',
  },
  statusTextRejected: {
    color: '#EF4444',
  },
  categoryBadge: {
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.surfaceRaised,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.accent,
    borderWidth: 1,
    borderColor: theme.colors.accentBorder,
  },
  description: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    lineHeight: 18,
  },
  sampleMediaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.colors.surfaceRaised,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  sampleMediaText: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.accent,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  actionBtn: {
    flex: 1,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    gap: 14,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: theme.colors.text,
  },
  modalSubtitle: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    lineHeight: 18,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
});
