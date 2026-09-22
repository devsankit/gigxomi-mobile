import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/src/components/AppButton';
import { BrandedRefreshControl } from '@/src/components/BrandedRefreshControl';
import { AppCard } from '@/src/components/AppCard';
import { AppInput } from '@/src/components/AppInput';
import { GigxomiHeader } from '@/src/components/GigxomiHeader';
import { Screen } from '@/src/components/Screen';
import { theme } from '@/src/constants/theme';
import { useAuth } from '@/src/hooks/useAuth';
import { useRefreshOnFocus } from '@/src/hooks/useRefreshOnFocus';
import {
  type ServiceCategory,
  type ServiceFormInput,
  useCreateService,
  useServices,
  useSubmitServiceReview,
  useUpdateService,
  useUpdateServiceVisibility,
} from '@/src/hooks/useServices';
import type { FreelancerServiceRecord } from '@/src/types';

type ServiceFormState = {
  basePrice: string;
  category: ServiceCategory;
  deliverables: string;
  deliveryTime: string;
  description: string;
  faq: string;
  revisions: string;
  sampleMediaUrl: string;
  seoDescription: string;
  seoKeywords: string;
  seoTitle: string;
  specialty: string;
  summary: string;
  tags: string;
  targetAudience: string;
  title: string;
};

const EMPTY_FORM: ServiceFormState = {
  basePrice: '',
  category: 'Video Editing',
  deliverables: '',
  deliveryTime: '2 Days',
  description: '',
  faq: 'What is included in the base price? | Core delivery is included as listed above.',
  revisions: '2 revisions included',
  sampleMediaUrl: '',
  seoDescription: '',
  seoKeywords: '',
  seoTitle: '',
  specialty: '',
  summary: '',
  tags: '',
  targetAudience: '',
  title: '',
};

function joinList(items?: string[]) {
  return (items ?? []).join(', ');
}

function joinLines(items?: string[]) {
  return (items ?? []).join('\n');
}

function joinFaq(items?: Array<{ question: string; answer: string }>) {
  return (items ?? []).map((item) => `${item.question} | ${item.answer}`).join('\n');
}

function formatMoney(amount?: number, currency = 'INR') {
  const value = Number(amount ?? 0);
  if (!Number.isFinite(value) || value <= 0) {
    return 'Price pending';
  }

  return `${currency} ${value.toLocaleString('en-IN')}`;
}

function formatDate(value?: string | null) {
  if (!value) {
    return 'Not updated yet';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Not updated yet';
  }

  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function normalizeStatus(status?: string) {
  return status || 'Draft';
}

function isEditableService(service: FreelancerServiceRecord) {
  const status = normalizeStatus(service.status);
  return status === 'Draft' || status === 'Rejected';
}

function getServiceTone(service: FreelancerServiceRecord) {
  const status = normalizeStatus(service.status);
  if (status === 'Approved') return theme.colors.success;
  if (status === 'Pending Review') return theme.colors.warning;
  if (status === 'Rejected') return theme.colors.danger;
  if (status === 'Paused') return theme.colors.mutedText;
  return theme.colors.accent;
}

function resolveSampleEmbedUrl(input: string) {
  const trimmed = input.trim();
  if (!trimmed) {
    return '';
  }

  try {
    const raw = !/^https?:\/\//i.test(trimmed) ? `https://${trimmed}` : trimmed;
    const url = new URL(raw);
    const host = url.hostname.replace(/^www\./i, '').toLowerCase();

    if (host === 'youtu.be') {
      const id = url.pathname.replace('/', '');
      return id ? `https://www.youtube.com/embed/${id}` : '';
    }

    if (host === 'youtube.com' || host === 'm.youtube.com') {
      const id = url.searchParams.get('v');
      return id ? `https://www.youtube.com/embed/${id}` : '';
    }

    if (host === 'drive.google.com' || (host === 'google.com' && url.pathname.startsWith('/drive'))) {
      const fileId = url.pathname.match(/\/file\/d\/([^/]+)/i)?.[1] || url.searchParams.get('id');
      if (fileId) {
        return `https://drive.google.com/file/d/${fileId}/preview`;
      }
      const folderId = url.pathname.match(/\/(?:drive\/)?(?:u\/\d+\/)?folders\/([a-zA-Z0-9_-]+)/i)?.[1];
      if (folderId) {
        return `https://drive.google.com/embeddedfolderview?id=${folderId}#grid`;
      }
      return raw;
    }

    if (host === 'instagram.com' || host === 'm.instagram.com') {
      const [type, id] = url.pathname.split('/').filter(Boolean);
      return (type === 'reel' || type === 'p') && id ? `https://www.instagram.com/${type}/${id}/embed/` : '';
    }
  } catch {
    return '';
  }

  return '';
}

function sampleUrlFromService(service: FreelancerServiceRecord) {
  return (
    service.sampleVideoUrl ||
    service.media?.find((item) => item.sourceUrl)?.sourceUrl ||
    service.media?.find((item) => item.embedUrl)?.embedUrl ||
    ''
  );
}

function formFromService(service: FreelancerServiceRecord): ServiceFormState {
  return {
    basePrice: String(service.basePrice || ''),
    category: 'Video Editing',
    deliverables: joinLines(service.deliverables),
    deliveryTime: service.deliveryTime || '2 Days',
    description: service.description || '',
    faq: joinFaq(service.faq) || EMPTY_FORM.faq,
    revisions: service.revisions || '2 revisions included',
    sampleMediaUrl: sampleUrlFromService(service),
    seoDescription: service.seoDescription || '',
    seoKeywords: joinList(service.seoKeywords),
    seoTitle: service.seoTitle || '',
    specialty: service.specialty || '',
    summary: service.summary || '',
    tags: joinList(service.tags),
    targetAudience: service.targetAudience || '',
    title: service.title || '',
  };
}

function buildSummary(form: ServiceFormState) {
  const explicit = form.summary.trim();
  if (explicit) {
    return explicit;
  }

  const description = form.description.trim();
  return description.length > 140 ? `${description.slice(0, 137)}...` : description;
}

function buildPayload(form: ServiceFormState): ServiceFormInput {
  const sampleVideoUrl = form.sampleMediaUrl.trim();

  return {
    basePrice: Number(form.basePrice.replace(/[^\d.]/g, '') || 0),
    category: form.category,
    deliverables: form.deliverables,
    deliveryTime: form.deliveryTime,
    description: form.description,
    faq: form.faq,
    revisions: form.revisions,
    sampleVideoEmbedUrl: resolveSampleEmbedUrl(sampleVideoUrl),
    sampleVideoUrl,
    seoDescription: form.seoDescription,
    seoKeywords: form.seoKeywords,
    seoTitle: form.seoTitle,
    specialty: form.specialty,
    summary: buildSummary(form),
    tags: form.tags,
    targetAudience: form.targetAudience,
    title: form.title,
  };
}

function validateForm(form: ServiceFormState) {
  const payload = buildPayload(form);

  if (!payload.title.trim()) {
    return 'Service title is required.';
  }

  if (!payload.specialty.trim()) {
    return 'Add a specialty lane so agencies can match your service.';
  }

  if (!payload.summary.trim()) {
    return 'Add a short summary or description.';
  }

  if (!payload.description.trim()) {
    return 'Description is required for review.';
  }

  if (!Number.isFinite(payload.basePrice) || payload.basePrice <= 0) {
    return 'Add a valid base price.';
  }

  return null;
}

function ServiceMetric({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function TagList({ items, limit = 4 }: { items?: string[]; limit?: number }) {
  const visible = (items ?? []).filter(Boolean).slice(0, limit);
  if (!visible.length) {
    return null;
  }

  return (
    <View style={styles.tagRow}>
      {visible.map((item) => (
        <Text key={item} numberOfLines={1} style={styles.tag}>
          {item}
        </Text>
      ))}
    </View>
  );
}

type ServiceCardProps = {
  busyId?: string | null;
  onEdit: (service: FreelancerServiceRecord) => void;
  onSubmit: (service: FreelancerServiceRecord) => void;
  onToggleListing: (service: FreelancerServiceRecord) => void;
  onTogglePause: (service: FreelancerServiceRecord) => void;
  service: FreelancerServiceRecord;
};

function ServiceCard({ busyId, onEdit, onSubmit, onToggleListing, onTogglePause, service }: ServiceCardProps) {
  const status = normalizeStatus(service.status);
  const canSubmit = status === 'Draft' || status === 'Rejected';
  const approvedLike = status === 'Approved' || status === 'Paused';
  const listingEnabled = service.listingEnabled !== false;
  const paused = (service.availability ?? (status === 'Paused' ? 'PAUSED' : 'ACTIVE')) === 'PAUSED';

  return (
    <AppCard style={styles.serviceCard}>
      <View style={styles.serviceTop}>
        <View style={styles.serviceTitleBlock}>
          <Text style={styles.serviceEyebrow}>{service.category || 'Video Editing'}</Text>
          <Text numberOfLines={2} style={styles.serviceTitle}>
            {service.title || 'Untitled service'}
          </Text>
        </View>
        <View style={[styles.statusPill, { borderColor: getServiceTone(service) }]}>
          <Text style={styles.statusText}>{status}</Text>
        </View>
      </View>

      <Text numberOfLines={3} style={styles.serviceCopy}>
        {service.reviewNote || service.summary || service.description || 'Add service details and send it for review.'}
      </Text>

      <View style={styles.metaLine}>
        <Text style={styles.metaText}>{formatMoney(service.basePrice, service.currency)}</Text>
        <Text style={styles.metaDot}>/</Text>
        <Text style={styles.metaText}>{service.deliveryTime || 'Delivery not set'}</Text>
        <Text style={styles.metaDot}>/</Text>
        <Text style={styles.metaText}>Updated {formatDate(service.updatedAt)}</Text>
      </View>

      <TagList items={[service.specialty ?? '', ...(service.tags ?? [])]} />

      <View style={styles.serviceActions}>
        {isEditableService(service) ? (
          <AppButton title="Edit details" variant="secondary" icon={<Feather name="edit-3" size={15} color={theme.colors.text} />} onPress={() => onEdit(service)} />
        ) : null}
        {canSubmit ? (
          <AppButton
            title="Send for review"
            loading={busyId === `${service.id}:submit`}
            icon={<Feather name="send" size={15} color={theme.colors.background} />}
            onPress={() => onSubmit(service)}
          />
        ) : null}
        {approvedLike ? (
          <>
            <AppButton
              title={paused ? 'Resume service' : 'Pause service'}
              variant="secondary"
              loading={busyId === `${service.id}:pause`}
              onPress={() => onTogglePause(service)}
            />
            <AppButton
              title={listingEnabled ? 'Hide listing' : 'Show listing'}
              variant="secondary"
              loading={busyId === `${service.id}:listing`}
              onPress={() => onToggleListing(service)}
            />
          </>
        ) : null}
      </View>
    </AppCard>
  );
}

type ServiceFormProps = {
  editingTitle: string;
  form: ServiceFormState;
  loading: boolean;
  notice?: string | null;
  onCancel: () => void;
  onChange: <K extends keyof ServiceFormState>(key: K, value: ServiceFormState[K]) => void;
  onSaveDraft: () => void;
  onSubmitForReview: () => void;
};

function ServiceForm({ editingTitle, form, loading, notice, onCancel, onChange, onSaveDraft, onSubmitForReview }: ServiceFormProps) {
  const formError = validateForm(form);

  return (
    <AppCard style={styles.formCard}>
      <View style={styles.serviceTop}>
        <View style={styles.serviceTitleBlock}>
          <Text style={styles.serviceEyebrow}>Service publishing</Text>
          <Text style={styles.formTitle}>{editingTitle}</Text>
        </View>
        <Pressable accessibilityRole="button" style={styles.closeButton} onPress={onCancel}>
          <Feather name="x" size={19} color={theme.colors.text} />
        </Pressable>
      </View>

      {notice ? <Text style={styles.notice}>{notice}</Text> : null}

      <View style={styles.videoCategoryCard}>
        <View style={styles.videoCategoryIcon}><Feather name="film" size={18} color={theme.colors.accent} /></View>
        <View style={styles.serviceTitleBlock}><Text style={styles.formLabel}>Video Editing</Text><Text style={styles.helperText}>Gigxomi services are focused on professional video editing and post-production.</Text></View>
      </View>

      <AppInput label="Service title" placeholder="Short-form video editing for coaches" value={form.title} onChangeText={(value) => onChange('title', value)} />
      <AppInput label="Summary" placeholder="One-line buyer summary" value={form.summary} onChangeText={(value) => onChange('summary', value)} />
      <AppInput label="Specialty lane" placeholder="Short-form reels / podcast editing / wedding teaser" value={form.specialty} onChangeText={(value) => onChange('specialty', value)} />
      <AppInput label="Target audience" placeholder="Creators, agencies, brands, coaches" value={form.targetAudience} onChangeText={(value) => onChange('targetAudience', value)} />

      <View style={styles.formGrid}>
        <View style={styles.gridField}>
          <AppInput label="Delivery time" placeholder="2 Days" value={form.deliveryTime} onChangeText={(value) => onChange('deliveryTime', value)} />
        </View>
        <View style={styles.gridField}>
          <AppInput label="Revisions" placeholder="2 revisions included" value={form.revisions} onChangeText={(value) => onChange('revisions', value)} />
        </View>
      </View>

      <AppInput label="Base price" keyboardType="number-pad" placeholder="2200" value={form.basePrice} onChangeText={(value) => onChange('basePrice', value)} />
      <AppInput label="Tags" placeholder="coach, youtube, podcast" value={form.tags} onChangeText={(value) => onChange('tags', value)} />
      <AppInput
        label="Sample link"
        placeholder="YouTube / Instagram / Google Drive public link"
        value={form.sampleMediaUrl}
        onChangeText={(value) => onChange('sampleMediaUrl', value)}
      />
      <AppInput
        label="Description"
        multiline
        numberOfLines={5}
        inputStyle={styles.textArea}
        placeholder="Full buyer-facing description, process, quality, and outcomes."
        value={form.description}
        onChangeText={(value) => onChange('description', value)}
      />
      <AppInput
        label="Deliverables"
        multiline
        numberOfLines={4}
        inputStyle={styles.textAreaSmall}
        placeholder="One item per line"
        value={form.deliverables}
        onChangeText={(value) => onChange('deliverables', value)}
      />

      <AppCard style={styles.seoCard}>
        <Text style={styles.sectionTitle}>SEO and discovery</Text>
        <AppInput label="SEO title" placeholder="SEO title" value={form.seoTitle} onChangeText={(value) => onChange('seoTitle', value)} />
        <AppInput label="SEO keywords" placeholder="keywords separated by commas" value={form.seoKeywords} onChangeText={(value) => onChange('seoKeywords', value)} />
        <AppInput
          label="SEO description"
          multiline
          inputStyle={styles.textAreaSmall}
          placeholder="Meta description for discovery"
          value={form.seoDescription}
          onChangeText={(value) => onChange('seoDescription', value)}
        />
      </AppCard>

      <AppInput
        label="FAQ"
        multiline
        numberOfLines={5}
        inputStyle={styles.textArea}
        placeholder="One per line: Question | Answer"
        value={form.faq}
        onChangeText={(value) => onChange('faq', value)}
      />

      {formError ? <Text style={styles.helperText}>{formError}</Text> : null}

      <View style={styles.serviceActions}>
        <AppButton title="Save draft" variant="secondary" loading={loading} icon={<Feather name="save" size={15} color={theme.colors.text} />} onPress={onSaveDraft} />
        <AppButton
          disabled={Boolean(formError)}
          title="Send for review"
          loading={loading}
          icon={<Feather name="send" size={15} color={theme.colors.background} />}
          onPress={onSubmitForReview}
        />
      </View>
    </AppCard>
  );
}

export function ServiceWorkspace({ initialFormOpen = false }: { initialFormOpen?: boolean }) {
  const auth = useAuth();
  const servicesQuery = useServices();
  const createService = useCreateService();
  const updateService = useUpdateService();
  const submitService = useSubmitServiceReview();
  const updateVisibility = useUpdateServiceVisibility();
  const [formOpen, setFormOpen] = useState(initialFormOpen);
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [form, setForm] = useState<ServiceFormState>(EMPTY_FORM);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useRefreshOnFocus(servicesQuery.refetch);

  const services = useMemo(() => servicesQuery.data?.services ?? [], [servicesQuery.data?.services]);
  const counts = useMemo(
    () => ({
      draft: services.filter((service) => normalizeStatus(service.status) === 'Draft' || normalizeStatus(service.status) === 'Rejected').length,
      live: services.filter((service) => normalizeStatus(service.status) === 'Approved' || normalizeStatus(service.status) === 'Paused').length,
      review: services.filter((service) => normalizeStatus(service.status) === 'Pending Review').length,
    }),
    [services],
  );

  function resetForm(open = false) {
    setForm(EMPTY_FORM);
    setEditingServiceId(null);
    setFormOpen(open);
    setNotice(null);
  }

  function updateField<K extends keyof ServiceFormState>(key: K, value: ServiceFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function startNewService() {
    setForm(EMPTY_FORM);
    setEditingServiceId(null);
    setFormOpen(true);
    setNotice(null);
  }

  function editService(service: FreelancerServiceRecord) {
    setForm(formFromService(service));
    setEditingServiceId(service.id);
    setFormOpen(true);
    setNotice(null);
  }

  async function persistDraft(strict: boolean) {
    if (!auth.token) {
      router.replace('/login');
      throw new Error('Login required before syncing services.');
    }

    const validation = strict ? validateForm(form) : null;
    if (validation) {
      throw new Error(validation);
    }

    const payload = buildPayload(form);
    const result = editingServiceId
      ? await updateService.mutateAsync({ serviceId: editingServiceId, input: payload })
      : await createService.mutateAsync(payload);

    const service = result.service;
    setEditingServiceId(service.id);
    return service;
  }

  async function saveDraft() {
    setNotice(null);
    try {
      const service = await persistDraft(false);
      setNotice(`Draft saved. Status: ${normalizeStatus(service.status)}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to save service draft.');
    }
  }

  async function sendForReview() {
    setNotice(null);
    try {
      const service = await persistDraft(true);
      const submitted = await submitService.mutateAsync(service.id);
      resetForm(false);
      setNotice(submitted.service.reviewNote || `Service ${normalizeStatus(submitted.service.status).toLowerCase()}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to send this service for review.');
    }
  }

  async function submitExisting(service: FreelancerServiceRecord) {
    setBusyId(`${service.id}:submit`);
    setNotice(null);
    try {
      const payload = await submitService.mutateAsync(service.id);
      setNotice(payload.service.reviewNote || 'Service sent for review.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to send this service for review.');
    } finally {
      setBusyId(null);
    }
  }

  async function togglePause(service: FreelancerServiceRecord) {
    const paused = (service.availability ?? (service.status === 'Paused' ? 'PAUSED' : 'ACTIVE')) === 'PAUSED';
    setBusyId(`${service.id}:pause`);
    setNotice(null);
    try {
      await updateVisibility.mutateAsync({ serviceId: service.id, availability: paused ? 'ACTIVE' : 'PAUSED' });
      setNotice(paused ? 'Service resumed for discovery.' : 'Service paused.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to update service availability.');
    } finally {
      setBusyId(null);
    }
  }

  async function toggleListing(service: FreelancerServiceRecord) {
    const enabled = service.listingEnabled !== false;
    setBusyId(`${service.id}:listing`);
    setNotice(null);
    try {
      await updateVisibility.mutateAsync({ serviceId: service.id, listingEnabled: !enabled });
      setNotice(enabled ? 'Service hidden from discovery.' : 'Service visible in discovery.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to update listing visibility.');
    } finally {
      setBusyId(null);
    }
  }

  const saving = createService.isPending || updateService.isPending || submitService.isPending;
  const heading = editingServiceId ? 'Edit service details' : 'List a service';

  return (
    <Screen
      refreshControl={
        <BrandedRefreshControl
          tintColor={theme.colors.accent}
          refreshing={servicesQuery.isFetching}
          onRefresh={() => {
            void servicesQuery.refetch();
          }}
        />
      }
    >
      <GigxomiHeader
        rightSlot={
          !formOpen ? (
            <Pressable accessibilityRole="button" style={styles.headerButton} onPress={startNewService}>
              <Feather name="plus" size={18} color={theme.colors.accent} />
            </Pressable>
          ) : null
        }
      />

      <View style={styles.header}>
        <Text style={styles.eyebrow}>Freelancer services</Text>
        <Text style={styles.title}>{formOpen ? heading : 'Services'}</Text>
        <Text style={styles.copy}>
          Package your video-editing expertise, add a playable portfolio sample, and submit it for Super Admin review before it goes live.
        </Text>
      </View>

      {formOpen ? (
        <ServiceForm
          editingTitle={heading}
          form={form}
          loading={saving}
          notice={notice}
          onCancel={() => resetForm(false)}
          onChange={updateField}
          onSaveDraft={() => {
            void saveDraft();
          }}
          onSubmitForReview={() => {
            void sendForReview();
          }}
        />
      ) : (
        <View style={styles.listStack}>
          <View style={styles.metricStrip}>
            <ServiceMetric label="drafts" value={counts.draft} />
            <ServiceMetric label="review" value={counts.review} />
            <ServiceMetric label="live" value={counts.live} />
          </View>

          {notice ? <Text style={styles.notice}>{notice}</Text> : null}
          {servicesQuery.error ? <Text style={styles.error}>{servicesQuery.error.message}</Text> : null}

          <AppButton
            title="List service"
            icon={<Feather name="plus-square" size={15} color={theme.colors.background} />}
            onPress={startNewService}
          />

          {services.length ? (
            services.map((service) => (
              <ServiceCard
                busyId={busyId}
                key={service.id}
                service={service}
                onEdit={editService}
                onSubmit={(item) => {
                  void submitExisting(item);
                }}
                onToggleListing={(item) => {
                  void toggleListing(item);
                }}
                onTogglePause={(item) => {
                  void togglePause(item);
                }}
              />
            ))
          ) : (
            <AppCard style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>{servicesQuery.isLoading ? 'Loading services...' : 'No services listed yet'}</Text>
              <Text style={styles.emptyCopy}>Create your first service, send it through review, and it will sync with the web marketplace.</Text>
            </AppCard>
          )}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
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
    fontSize: 31,
    fontWeight: '900',
  },
  copy: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.small,
    lineHeight: 20,
  },
  headerButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 21,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    backgroundColor: theme.colors.surfaceSoft,
  },
  listStack: {
    gap: theme.spacing.md,
  },
  metricStrip: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  metric: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.sm,
  },
  metricValue: {
    color: theme.colors.text,
    fontSize: 21,
    fontWeight: '900',
  },
  metricLabel: {
    color: theme.colors.mutedText,
    fontSize: 11,
    fontWeight: '800',
    marginTop: 2,
  },
  serviceCard: {
    gap: theme.spacing.md,
  },
  serviceTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
  },
  serviceTitleBlock: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  serviceEyebrow: {
    color: theme.colors.mutedText,
    fontSize: theme.typography.caption,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  serviceTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.section,
    fontWeight: '900',
    lineHeight: 22,
  },
  serviceCopy: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.small,
    lineHeight: 20,
  },
  statusPill: {
    borderWidth: 1,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surfaceSoft,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 5,
  },
  statusText: {
    color: theme.colors.textSecondary,
    fontSize: 11,
    fontWeight: '900',
  },
  metaLine: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    color: theme.colors.mutedText,
    fontSize: theme.typography.caption,
    fontWeight: '800',
  },
  metaDot: {
    color: theme.colors.disabledText,
    fontSize: theme.typography.caption,
    fontWeight: '900',
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  tag: {
    overflow: 'hidden',
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.accentBorder,
    backgroundColor: theme.colors.accentSoft,
    color: theme.colors.accent,
    fontSize: 11,
    fontWeight: '900',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
  },
  serviceActions: {
    gap: theme.spacing.sm,
  },
  formCard: {
    gap: theme.spacing.md,
  },
  formTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.section,
    fontWeight: '900',
    lineHeight: 22,
  },
  closeButton: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    borderRadius: 19,
    backgroundColor: theme.colors.surfaceSoft,
  },
  optionBlock: {
    gap: theme.spacing.xs,
  },
  videoCategoryCard: {
    alignItems: 'center',
    backgroundColor: theme.colors.accentSoft,
    borderColor: theme.colors.accentBorder,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 13,
  },
  videoCategoryIcon: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  formLabel: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.small,
    fontWeight: '700',
  },
  formGrid: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  gridField: {
    flex: 1,
    minWidth: 0,
  },
  textArea: {
    minHeight: 118,
    paddingTop: theme.spacing.sm,
    textAlignVertical: 'top',
  },
  textAreaSmall: {
    minHeight: 86,
    paddingTop: theme.spacing.sm,
    textAlignVertical: 'top',
  },
  seoCard: {
    gap: theme.spacing.md,
    backgroundColor: theme.colors.surfaceSoft,
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.body,
    fontWeight: '900',
  },
  notice: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.small,
    lineHeight: 20,
  },
  helperText: {
    color: theme.colors.warning,
    fontSize: theme.typography.small,
    lineHeight: 19,
  },
  error: {
    color: theme.colors.danger,
    fontSize: theme.typography.small,
    lineHeight: 19,
  },
  emptyCard: {
    gap: theme.spacing.xs,
  },
  emptyTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.body,
    fontWeight: '900',
  },
  emptyCopy: {
    color: theme.colors.mutedText,
    fontSize: theme.typography.small,
    lineHeight: 20,
  },
});
