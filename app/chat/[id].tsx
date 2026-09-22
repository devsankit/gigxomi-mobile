import { Feather } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { BlurView } from 'expo-blur';
import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { router, useLocalSearchParams } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import type { ReactNode } from 'react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import emojiData from 'emoji-datasource/emoji.json';
import type { NativeScrollEvent, NativeSyntheticEvent, TextStyle } from 'react-native';
import {
  Alert,
  Image,
  AppState,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppCard } from '@/src/components/AppCard';
import { BrandedRefreshControl } from '@/src/components/BrandedRefreshControl';
import { StableAvatar } from '@/src/components/StableAvatar';
import { UpgradePlanModal } from '@/src/components/UpgradePlanModal';
import { theme } from '@/src/constants/theme';
import {
  resolveAudienceForRole,
  useAssignConversation,
  useChatThread,
  useCreatePaymentRequest,
  useDeleteMessage,
  useMarkConversationRead,
  useMarkPaymentStatus,
  useRespondConversationAssignment,
  useSendMessage,
  useSetConversationLeadStatus,
  useToggleFreelancerCustomerLaneAccess,
  useUpdateClientAlias,
  useUpdateTypingState,
} from '@/src/hooks/useChats';
import { useAuth } from '@/src/hooks/useAuth';
import { AssignEditorSheet } from '@/src/components/team/AssignEditorSheet';
import { ApiError, getSiteBaseUrl } from '@/src/lib/api';
import { clearActiveMobileView, registerActiveMobileView } from '@/src/lib/activeView';
import { useCachedMediaUri } from '@/src/lib/media';
import type {
  MobileConversation,
  MobileConversationAttachment,
  MobileConversationLane,
  MobileConversationMessage,
  MobileConversationRole,
  MobileInboxAudience,
  MobileLeadStatus,
} from '@/src/types';

const CHAT_TYPING_STOP_DEBOUNCE_MS = 2400;
const CHAT_TYPING_FRESH_WINDOW_MS = 15000;
const CHAT_ONLINE_WINDOW_MS = 120000;
const CHAT_PRESENCE_TICK_MS = 30000;
const CHAT_TYPING_HEARTBEAT_MS = 20000;
const PROJECT_OFFER_TICK_MS = 1000;
const EMOJI_PANEL_HEIGHT = 274;
const MAX_CHAT_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const MAX_PENDING_ATTACHMENTS = 5;
const WEB_TEXTAREA_RESET =
  Platform.OS === 'web'
    ? ({
        outlineStyle: 'none',
        outlineWidth: 0,
        resize: 'none',
      } as unknown as TextStyle)
    : null;

function formatOfferCountdown(expiresAt?: string, nowMs = Date.now()) {
  const expiresMs = expiresAt ? Number(new Date(expiresAt).getTime()) : 0;
  if (!Number.isFinite(expiresMs) || expiresMs <= nowMs) {
    return '00:00';
  }
  const totalSeconds = Math.ceil((expiresMs - nowMs) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

type RawEmoji = {
  unified: string;
  name: string;
  short_name: string;
  category: string;
  sort_order: number;
  obsoleted_by?: string | null;
};

type ChatEmoji = {
  id: string;
  emoji: string;
  name: string;
  shortName: string;
  category: string;
};

const EMOJI_CATEGORIES = ['Smileys & Emotion', 'People & Body', 'Activities', 'Objects', 'Symbols', 'Food & Drink', 'Travel & Places'] as const;
type EmojiCategory = (typeof EMOJI_CATEGORIES)[number];

const DEFAULT_RECENT_EMOJIS = ['👍', '🙏', '🔥', '✅', '💚', '😂', '😍', '👏', '👌', '🚀', '💯', '✨'];

const EMOJI_CATEGORY_META: Record<EmojiCategory, { icon: keyof typeof Feather.glyphMap; label: string }> = {
  'Smileys & Emotion': { icon: 'smile', label: 'Smileys' },
  'People & Body': { icon: 'users', label: 'People' },
  Activities: { icon: 'activity', label: 'Activities' },
  Objects: { icon: 'box', label: 'Objects' },
  Symbols: { icon: 'heart', label: 'Symbols' },
  'Food & Drink': { icon: 'coffee', label: 'Food' },
  'Travel & Places': { icon: 'map-pin', label: 'Travel' },
};

function unifiedToEmoji(unified: string) {
  return unified
    .split('-')
    .map((part) => String.fromCodePoint(Number.parseInt(part, 16)))
    .join('');
}

let _cachedChatEmojis: ChatEmoji[] | null = null;
function getChatEmojis(): ChatEmoji[] {
  if (_cachedChatEmojis) return _cachedChatEmojis;
  _cachedChatEmojis = (emojiData as RawEmoji[])
    .filter((emoji) => emoji.unified && !emoji.obsoleted_by && EMOJI_CATEGORIES.includes(emoji.category as (typeof EMOJI_CATEGORIES)[number]))
    .sort((left, right) => left.sort_order - right.sort_order)
    .map((emoji) => ({
      id: emoji.unified,
      emoji: unifiedToEmoji(emoji.unified),
      name: emoji.name,
      shortName: emoji.short_name,
      category: emoji.category,
    }));
  return _cachedChatEmojis;
}

type MessageAttachmentInput = {
  name: string;
  mimeType?: string;
  sizeBytes?: number;
  uploadTarget?: 'local' | 'youtube';
  durationSeconds?: number;
  note?: string;
  externalUrl?: string;
};

function isInboxAudience(value: unknown): value is MobileInboxAudience {
  return value === 'admin' || value === 'manager' || value === 'freelancer';
}

function isConversationLane(value: unknown): value is MobileConversationLane {
  return value === 'customer' || value === 'internal';
}

function getInitialLane(audience: MobileInboxAudience): MobileConversationLane {
  return audience === 'freelancer' ? 'internal' : 'customer';
}

function formatCurrency(amount?: number) {
  if (!amount || !Number.isFinite(amount)) {
    return 'INR 0';
  }

  return `INR ${amount.toLocaleString('en-IN')}`;
}

function formatTime(value?: string) {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit' }).format(date);
}

function formatPresenceAgoLabel(timestampMs: number, nowMs: number) {
  const elapsedMs = Math.max(0, nowMs - timestampMs);
  const elapsedMinutes = Math.floor(elapsedMs / 60000);
  if (elapsedMinutes < 1) {
    return 'just now';
  }
  if (elapsedMinutes < 60) {
    return `${elapsedMinutes}m ago`;
  }

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) {
    return `${elapsedHours}h ago`;
  }

  const elapsedDays = Math.floor(elapsedHours / 24);
  return elapsedDays === 1 ? 'yesterday' : `${elapsedDays} days ago`;
}

function formatRecordingDuration(seconds: number) {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

function formatFileSize(sizeBytes?: number) {
  if (!sizeBytes || !Number.isFinite(sizeBytes)) {
    return '';
  }

  if (sizeBytes >= 1024 * 1024) {
    return `${(sizeBytes / (1024 * 1024)).toFixed(sizeBytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
  }

  if (sizeBytes >= 1024) {
    return `${Math.ceil(sizeBytes / 1024)} KB`;
  }

  return `${sizeBytes} B`;
}

function getAttachmentInputIcon(attachment: MessageAttachmentInput): keyof typeof Feather.glyphMap {
  const mimeType = String(attachment.mimeType ?? '').toLowerCase();
  if (attachment.durationSeconds) return 'play-circle';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'film';
  if (mimeType.startsWith('audio/')) return 'music';
  return 'file-text';
}

function getMessageTime(message: MobileConversationMessage) {
  if (!message.createdAt) {
    return 0;
  }
  const timestamp = new Date(message.createdAt).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function getPlatformTitle(conversation?: MobileConversation | null) {
  if (conversation?.sourceChannel === 'instagram' || conversation?.serviceId === 'svc-instagram-inbox') {
    return 'Instagram';
  }

  if (conversation?.isInAppCustomerThread) {
    return 'App inbox';
  }

  return 'WhatsApp';
}

function getCustomerDisplayNameForAudience(conversation: MobileConversation | null | undefined, audience: MobileInboxAudience) {
  if (audience === 'freelancer') {
    return conversation?.clientAlias?.trim() || conversation?.customerDisplayName?.trim() || 'Client';
  }

  return conversation?.customerDisplayName?.trim() || 'Conversation';
}

function maskCustomerPhoneForAudience(phone: string | null | undefined, audience: MobileInboxAudience) {
  const trimmed = phone?.trim();
  if (!trimmed) {
    return 'Contact hidden';
  }

  if (audience !== 'freelancer') {
    return trimmed;
  }

  const digits = trimmed.replace(/\D/g, '');
  if (digits.length <= 4) {
    return '****';
  }

  const tail = digits.slice(-4);
  if (digits.startsWith('91') && digits.length > 10) {
    return `+91 ******${tail}`;
  }

  return `******${tail}`;
}

function getMessageSenderLabelForAudience(message: MobileConversationMessage, audience: MobileInboxAudience) {
  if (audience === 'freelancer' && message.senderRole === 'customer') {
    return 'Client';
  }

  return message.senderLabel;
}

function getLaneLabel(lane: MobileConversationLane) {
  return lane === 'internal' ? 'Freelancer' : 'Client';
}

function isAgencyMessageRole(role: MobileConversationRole) {
  return role === 'admin' || role === 'manager';
}

function isMessageOutgoingForAudience(message: MobileConversationMessage, audience: MobileInboxAudience) {
  if (message.senderRole === 'customer') {
    return false;
  }

  if (audience === 'freelancer') {
    return message.senderRole === 'freelancer';
  }

  if (message.lane === 'customer') {
    return isAgencyMessageRole(message.senderRole);
  }

  return message.senderRole === audience;
}

function describeAttachment(attachment: MobileConversationAttachment) {
  if (attachment.kind === 'payment-request') {
    return attachment.note || 'Payment request';
  }
  if (attachment.kind === 'voice-note') {
    return attachment.durationLabel || 'Voice note';
  }
  if (attachment.kind === 'youtube-upload') {
    return attachment.collectionName || 'YouTube upload';
  }
  return [attachment.name, attachment.sizeLabel].filter(Boolean).join(' - ') || 'Attachment';
}

function getAttachmentIcon(attachment: MobileConversationAttachment): keyof typeof Feather.glyphMap {
  if (attachment.kind === 'payment-request') return 'credit-card';
  if (attachment.kind === 'image') return 'image';
  if (attachment.kind === 'video') return 'film';
  if (attachment.kind === 'audio' || attachment.kind === 'voice-note') return 'play-circle';
  if (attachment.kind === 'youtube-upload') return 'youtube';
  return 'paperclip';
}

function isImageAttachment(attachment: MobileConversationAttachment) {
  return attachment.kind === 'image' || String(attachment.mimeType ?? '').toLowerCase().startsWith('image/');
}

function isAudioAttachment(attachment: MobileConversationAttachment) {
  const mimeType = String(attachment.mimeType ?? '').toLowerCase();
  return attachment.kind === 'voice-note' || attachment.kind === 'audio' || mimeType.startsWith('audio/');
}

function isVideoAttachment(attachment: MobileConversationAttachment) {
  return attachment.kind === 'video' || String(attachment.mimeType ?? '').toLowerCase().startsWith('video/');
}

function getAttachmentUrl(attachment: MobileConversationAttachment) {
  const rawUrl = attachment.externalUrl?.trim();
  if (!rawUrl) {
    return '';
  }

  if (/^(data:|blob:|file:|content:|https?:\/\/)/i.test(rawUrl)) {
    return rawUrl;
  }

  const siteBaseUrl = getSiteBaseUrl().replace(/\/$/, '');
  return `${siteBaseUrl}/${rawUrl.replace(/^\//, '')}`;
}

function getDeliveryLabel(
  message: MobileConversationMessage,
  status?: NonNullable<MobileConversationMessage['deliveryStatus']> | null,
) {
  if (message.deliveryError) {
    return message.deliveryError;
  }
  if (status === 'read') return 'Read';
  if (status === 'delivered') return 'Delivered';
  if (status === 'sent') return 'Sent';
  if (status === 'failed') return 'Failed';
  return '';
}

function getCounterpartReadAtMs(
  audience: MobileInboxAudience,
  readStateByAudience?: MobileConversation['readStateByAudience'],
): number {
  if (!readStateByAudience) return 0;
  const counterpartKeys =
    audience === 'freelancer'
      ? ['admin:internal', 'manager:internal', 'admin', 'manager']
      : ['freelancer:internal', 'freelancer'];
  const readAt = counterpartKeys
    .map((key) => readStateByAudience[key as keyof NonNullable<MobileConversation['readStateByAudience']>])
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);
  const readAtMs = readAt ? new Date(readAt).getTime() : 0;
  return Number.isFinite(readAtMs) ? readAtMs : 0;
}

function getOutgoingDeliveryStatus(
  message: MobileConversationMessage,
  audience: MobileInboxAudience,
  counterpartReadAtMs = 0,
) {
  if (!isMessageOutgoingForAudience(message, audience)) {
    return null;
  }

  if (message.lane === 'internal') {
    const messageAtMs = message.createdAt ? new Date(message.createdAt).getTime() : 0;
    return counterpartReadAtMs > 0 && Number.isFinite(messageAtMs) && counterpartReadAtMs >= messageAtMs ? 'read' : 'sent';
  }

  if (message.lane !== 'customer') {
    return null;
  }

  return message.deliveryStatus ?? 'sent';
}

function getHeaderStatusLabel({
  activeLane,
  audience,
  conversation,
  customerPresenceLabel,
  typingLabel,
}: {
  activeLane: MobileConversationLane;
  audience: MobileInboxAudience;
  conversation?: MobileConversation | null;
  customerPresenceLabel: string;
  typingLabel?: string;
}) {
  if (!conversation) {
    return 'Loading conversation';
  }

  if (typingLabel) {
    return `${typingLabel} is typing...`;
  }

  const phone = maskCustomerPhoneForAudience(conversation.customerPhoneDisplay, audience);
  const statusLabel = activeLane === 'internal' ? 'Freelancer lane' : customerPresenceLabel || 'Offline';

  return [statusLabel, phone === 'Contact hidden' ? '' : phone].filter(Boolean).join(' - ');
}

function getRecordingMimeType(uri: string) {
  const lowerUri = uri.toLowerCase();
  if (lowerUri.endsWith('.webm')) return 'audio/webm';
  if (lowerUri.endsWith('.3gp')) return 'audio/3gpp';
  if (lowerUri.endsWith('.caf')) return 'audio/x-caf';
  if (lowerUri.endsWith('.mp3')) return 'audio/mpeg';
  return 'audio/mp4';
}

function getRecordingExtension(mimeType: string) {
  if (mimeType === 'audio/webm') return 'webm';
  if (mimeType === 'audio/3gpp') return '3gp';
  if (mimeType === 'audio/x-caf') return 'caf';
  if (mimeType === 'audio/mpeg') return 'mp3';
  return 'm4a';
}

async function readAudioAsBase64(uri: string) {
  if (uri.startsWith('data:')) {
    return uri.split(',')[1] ?? '';
  }

  if (Platform.OS !== 'web') {
    return FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  }

  const response = await fetch(uri);
  const blob = await response.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      resolve(result.split(',')[1] ?? '');
    };
    reader.onerror = () => reject(new Error('Audio read failed.'));
    reader.readAsDataURL(blob);
  });
}

async function readPickedAssetAsDataUrl(asset: DocumentPicker.DocumentPickerAsset) {
  const mimeType = asset.mimeType || 'application/octet-stream';

  if (Platform.OS !== 'web') {
    const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
    return `data:${mimeType};base64,${base64}`;
  }

  const file = (asset as DocumentPicker.DocumentPickerAsset & { file?: File }).file;
  if (file) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
      reader.onerror = () => reject(new Error('File read failed.'));
      reader.readAsDataURL(file);
    });
  }

  const response = await fetch(asset.uri);
  const blob = await response.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(new Error('File read failed.'));
    reader.readAsDataURL(blob);
  });
}

async function getAudioFileSize(uri: string) {
  if (Platform.OS === 'web') {
    try {
      const response = await fetch(uri);
      const blob = await response.blob();
      return blob.size;
    } catch {
      return undefined;
    }
  }

  try {
    const info = await FileSystem.getInfoAsync(uri);
    return info.exists && typeof info.size === 'number' ? info.size : undefined;
  } catch {
    return undefined;
  }
}

function DeliveryStatusIndicator({ label, status }: { label: string; status: NonNullable<MobileConversationMessage['deliveryStatus']> }) {
  if (status === 'failed') {
    return (
      <View accessibilityLabel={label || 'Failed'} style={styles.deliveryStatus}>
        <Feather name="alert-circle" size={12} color={theme.colors.danger} />
      </View>
    );
  }

  if (status === 'sent') {
    return (
      <View accessibilityLabel={label || 'Sent'} style={styles.deliveryStatus}>
        <Feather name="check" size={12} color={theme.colors.mutedText} />
      </View>
    );
  }

  const tickColor = status === 'read' ? '#34B7F1' : theme.colors.mutedText;

  return (
    <View accessibilityLabel={label || status} style={[styles.deliveryStatus, status === 'read' && styles.deliveryStatusRead]}>
      <Feather name="check" size={14} color={tickColor} />
      <Feather name="check" size={14} color={tickColor} style={styles.deliverySecondCheck} />
    </View>
  );
}

function AttachmentPreview({ attachment, mine }: { attachment: MobileConversationAttachment; mine: boolean }) {
  const [imageFailed, setImageFailed] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [voiceProgress, setVoiceProgress] = useState(0);
  const [audioError, setAudioError] = useState('');
  const soundRef = useRef<Audio.Sound | null>(null);
  const attachmentUrl = getAttachmentUrl(attachment);
  const cachedAttachmentUrl = useCachedMediaUri(attachmentUrl);
  const canOpen = Boolean(attachmentUrl);

  useEffect(() => {
    return () => {
      const sound = soundRef.current;
      soundRef.current = null;
      if (sound) {
        void sound.unloadAsync();
      }
    };
  }, []);

  async function openAttachment() {
    if (attachmentUrl) {
      await Linking.openURL(attachmentUrl);
    }
  }

  async function toggleAudioPlayback() {
    if (!attachmentUrl) {
      setAudioError('Audio unavailable');
      return;
    }

    setAudioError('');
    try {
      if (isPlaying) {
        await soundRef.current?.pauseAsync();
        setIsPlaying(false);
        return;
      }

      if (!soundRef.current) {
        const { sound } = await Audio.Sound.createAsync(
          { uri: attachmentUrl },
          { shouldPlay: true },
          (status) => {
            if (!('isLoaded' in status) || !status.isLoaded) {
              return;
            }

            const durationMillis = typeof status.durationMillis === 'number' ? status.durationMillis : 0;
            const positionMillis = typeof status.positionMillis === 'number' ? status.positionMillis : 0;
            setIsPlaying(Boolean(status.isPlaying));
            setVoiceProgress(durationMillis > 0 ? Math.min(1, Math.max(0, positionMillis / durationMillis)) : 0);

            if (status.didJustFinish) {
              setIsPlaying(false);
              setVoiceProgress(0);
            }
          },
        );
        soundRef.current = sound;
      } else {
        const status = await soundRef.current.getStatusAsync();
        if ('isLoaded' in status && status.isLoaded && status.didJustFinish) {
          await soundRef.current.setPositionAsync(0);
        }
        await soundRef.current.playAsync();
      }
      setIsPlaying(true);
    } catch (error) {
      setIsPlaying(false);
      setAudioError(error instanceof Error ? error.message : 'Audio playback failed');
    }
  }

  if (isImageAttachment(attachment) && attachmentUrl && !imageFailed) {
    return (
      <Pressable accessibilityLabel={`Open image ${attachment.name || 'attachment'}`} onPress={() => void openAttachment()} style={styles.imageAttachmentCard}>
        <Image
          accessibilityIgnoresInvertColors
          alt={attachment.name || 'Image attachment'}
          resizeMode="cover"
          source={{ uri: cachedAttachmentUrl || attachmentUrl }}
          style={styles.imageAttachmentPreview}
          onError={() => setImageFailed(true)}
        />
        <View style={styles.imageAttachmentOverlay}>
          <Feather name="image" size={13} color={theme.colors.text} />
          <Text numberOfLines={1} style={styles.imageAttachmentName}>
            {attachment.name || 'Image'}
          </Text>
        </View>
      </Pressable>
    );
  }

  if (isAudioAttachment(attachment)) {
    return (
      <Pressable
        accessibilityLabel={`${isPlaying ? 'Pause' : 'Play'} voice note ${attachment.name || ''}`.trim()}
        disabled={!canOpen}
        onPress={() => {
          toggleAudioPlayback().catch(() => undefined);
        }}
        style={[styles.voiceAttachmentCard, mine && styles.voiceAttachmentCardMine, !canOpen && styles.attachmentDisabled]}
      >
        <View style={[styles.voicePlayButton, isPlaying && styles.voicePlayButtonActive]}>
          <Feather name={isPlaying ? 'pause' : 'play'} size={17} color={theme.colors.background} />
        </View>
        <View style={styles.voiceWaveform}>
          {Array.from({ length: 12 }).map((_, index) => (
            <View
              key={index}
              style={[
                styles.voiceWaveBar,
                { height: 8 + ((index * 7) % 18) },
                (isPlaying || voiceProgress > 0) && index / 12 <= voiceProgress && styles.voiceWaveBarActive,
              ]}
            />
          ))}
        </View>
        <View style={styles.voiceMetaBlock}>
          <Text style={styles.voiceTitle}>{attachment.kind === 'voice-note' ? 'Voice note' : attachment.name || 'Audio'}</Text>
          <Text numberOfLines={1} style={styles.voiceMeta}>
            {audioError || attachment.durationLabel || attachment.sizeLabel || 'Tap to play'}
          </Text>
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable
      accessibilityLabel={`Open attachment ${attachment.name || describeAttachment(attachment)}`}
      disabled={!canOpen}
      onPress={() => {
        openAttachment().catch(() => undefined);
      }}
      style={[styles.attachmentCard, isVideoAttachment(attachment) && styles.videoAttachmentCard, !canOpen && styles.attachmentDisabled]}
    >
      <View style={[styles.attachmentIconBox, isVideoAttachment(attachment) && styles.videoAttachmentIconBox]}>
        <Feather name={getAttachmentIcon(attachment)} size={18} color={theme.colors.accent} />
      </View>
      <View style={styles.attachmentCopy}>
        <Text numberOfLines={1} style={styles.attachmentTitle}>
          {attachment.name || describeAttachment(attachment)}
        </Text>
        <Text numberOfLines={2} style={styles.attachmentMeta}>
          {describeAttachment(attachment)}
        </Text>
      </View>
      {canOpen ? <Feather name="external-link" size={14} color={theme.colors.mutedText} /> : null}
    </Pressable>
  );
}

const MessageBubble = memo(function MessageBubble({
  audience,
  counterpartReadAtMs = 0,
  message,
  onOpenOptions,
}: {
  audience: MobileInboxAudience;
  counterpartReadAtMs?: number;
  message: MobileConversationMessage;
  onOpenOptions?: (message: MobileConversationMessage) => void;
}) {
  const mine = isMessageOutgoingForAudience(message, audience);
  const time = formatTime(message.createdAt);
  const deliveryStatus = getOutgoingDeliveryStatus(message, audience, counterpartReadAtMs);
  const deliveryLabel = mine ? getDeliveryLabel(message, deliveryStatus) : '';
  const isDeleted = Boolean(message.deletedAt);
  const canDelete = !isDeleted && (mine || audience === 'admin' || audience === 'manager');
  const canCopy = !isDeleted && Boolean(message.body?.trim());

  function handleLongPress() {
    if (!canCopy && !canDelete) {
      return;
    }
    onOpenOptions?.(message);
  }

  return (
    <View style={[styles.bubbleWrap, mine && styles.bubbleWrapMine]}>
      <Pressable
        delayLongPress={250}
        disabled={!canCopy && !canDelete}
        style={[styles.bubble, mine && styles.bubbleMine, message.lane === 'internal' && styles.bubbleInternal]}
        onLongPress={handleLongPress}
      >
        <View style={styles.bubbleTopLine}>
          <Text style={[styles.bubbleSender, mine && styles.bubbleSenderMine]}>{getMessageSenderLabelForAudience(message, audience)}</Text>
          {message.lane === 'internal' ? <Text style={styles.internalBadge}>Freelancer</Text> : null}
        </View>
        {message.body ? (
          <Text selectable style={[styles.bubbleText, mine && styles.bubbleTextMine, isDeleted && styles.deletedMessageText]}>{message.body}</Text>
        ) : null}
        {!isDeleted && message.attachments?.length ? (
          <View style={styles.attachmentList}>
            {message.attachments.map((attachment) => (
              <AttachmentPreview attachment={attachment} key={attachment.id} mine={mine} />
            ))}
          </View>
        ) : null}
        {time || deliveryLabel ? (
          <View style={styles.bubbleMetaRow}>
            {time ? <Text style={[styles.bubbleMeta, mine && styles.bubbleMetaMine]}>{time}</Text> : null}
            {deliveryStatus ? <DeliveryStatusIndicator label={deliveryLabel} status={deliveryStatus} /> : null}
          </View>
        ) : null}
      </Pressable>
    </View>
  );
});

function ModalSheet({
  children,
  onClose,
  title,
  visible,
}: {
  children: ReactNode;
  onClose: () => void;
  title: string;
  visible: boolean;
}) {
  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <Pressable style={styles.modalScrim} onPress={onClose} />
        <View style={styles.modalSheet}>
          <View style={styles.modalHead}>
            <Text style={styles.modalTitle}>{title}</Text>
            <Pressable style={styles.modalClose} onPress={onClose}>
              <Feather name="x" size={18} color={theme.colors.text} />
            </Pressable>
          </View>
          {children}
        </View>
      </View>
    </Modal>
  );
}

function InviteEditorSheet({
  onClose,
  visible,
}: {
  onClose: () => void;
  visible: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const inviteMessage = `Hey! Join our agency workspace on Gigxomi. Download the app to collaborate on client editing projects with masked privacy protection: https://www.gigxomi.com/downloads/gigxomi-latest.apk`;

  async function handleWhatsAppShare() {
    const url = `whatsapp://send?text=${encodeURIComponent(inviteMessage)}`;
    const canOpen = await Linking.canOpenURL(url).catch(() => false);
    if (canOpen) {
      await Linking.openURL(url);
    } else {
      await Linking.openURL(`https://api.whatsapp.com/send?text=${encodeURIComponent(inviteMessage)}`);
    }
  }

  async function handleCopy() {
    await Clipboard.setStringAsync(inviteMessage);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <ModalSheet onClose={onClose} title="Invite Editor to Space" visible={visible}>
      <View style={styles.inviteSheetBody}>
        <View style={styles.inviteShieldBanner}>
          <Feather name="shield" size={18} color="#4ADE80" />
          <Text style={styles.inviteShieldText}>
            Direct customer communication with masked privacy. Editors chat with your clients without knowing client names or numbers.
          </Text>
        </View>

        <Text style={styles.inviteSectionTitle}>Invitation Message & App Link</Text>
        <View style={styles.inviteMessageBox}>
          <Text style={styles.inviteMessageText}>{inviteMessage}</Text>
        </View>

        <View style={styles.inviteActionButtons}>
          <Pressable style={styles.invitePrimaryBtn} onPress={handleWhatsAppShare}>
            <Feather name="message-circle" size={18} color="#0B1118" />
            <Text style={styles.invitePrimaryBtnText}>Send via WhatsApp</Text>
          </Pressable>

          <Pressable style={styles.inviteSecondaryBtn} onPress={handleCopy}>
            <Feather name={copied ? 'check' : 'copy'} size={17} color={copied ? '#4ADE80' : theme.colors.text} />
            <Text style={[styles.inviteSecondaryBtnText, copied && { color: '#4ADE80' }]}>
              {copied ? 'Copied to Clipboard!' : 'Copy Invite Link'}
            </Text>
          </Pressable>
        </View>
      </View>
    </ModalSheet>
  );
}

function MessageOptionsSheet({
  audience,
  message,
  onClose,
  onCopy,
  onDelete,
  visible,
}: {
  audience: MobileInboxAudience;
  message: MobileConversationMessage | null;
  onClose: () => void;
  onCopy: (message: MobileConversationMessage) => void;
  onDelete: (message: MobileConversationMessage) => void;
  visible: boolean;
}) {
  const canCopy = Boolean(message?.body?.trim() && !message.deletedAt);
  const canDelete = Boolean(message && !message.deletedAt && (isMessageOutgoingForAudience(message, audience) || audience === 'admin' || audience === 'manager'));

  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
      <Pressable style={styles.optionsBackdrop} onPress={onClose}>
        <Pressable style={styles.optionsSheet}>
          <View style={styles.optionsGrabber} />
          <View style={styles.optionsHeader}>
            <Text style={styles.optionsTitle}>Message options</Text>
            <Pressable accessibilityLabel="Close message options" style={styles.optionsClose} onPress={onClose}>
              <Feather name="x" size={18} color={theme.colors.textSecondary} />
            </Pressable>
          </View>
          {message?.body ? (
            <Text numberOfLines={3} style={styles.optionsPreview}>
              {message.body}
            </Text>
          ) : null}
          <View style={styles.optionsActions}>
            <Pressable
              disabled={!canCopy}
              style={[styles.optionsAction, !canCopy && styles.optionsActionDisabled]}
              onPress={() => {
                if (message) onCopy(message);
              }}
            >
              <View style={styles.optionsIconBox}>
                <Feather name="copy" size={17} color={theme.colors.accent} />
              </View>
              <View style={styles.optionsActionCopy}>
                <Text style={styles.optionsActionTitle}>Copy text</Text>
                <Text style={styles.optionsActionMeta}>Copy this chat message to clipboard.</Text>
              </View>
            </Pressable>
            <Pressable
              disabled={!canDelete}
              style={[styles.optionsAction, styles.optionsDangerAction, !canDelete && styles.optionsActionDisabled]}
              onPress={() => {
                if (message) onDelete(message);
              }}
            >
              <View style={[styles.optionsIconBox, styles.optionsDangerIconBox]}>
                <Feather name="trash-2" size={17} color={theme.colors.danger} />
              </View>
              <View style={styles.optionsActionCopy}>
                <Text style={[styles.optionsActionTitle, styles.optionsDangerText]}>Delete for everyone</Text>
                <Text style={styles.optionsActionMeta}>Remove this message from the Gigxomi thread.</Text>
              </View>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function DetailsSheet({
  audience,
  conversation,
  onClose,
  visible,
}: {
  audience: MobileInboxAudience;
  conversation: MobileConversation | null;
  onClose: () => void;
  visible: boolean;
}) {
  const payment = conversation?.latestPaymentRequest;
  const updateAlias = useUpdateClientAlias(audience);
  const [clientAlias, setClientAlias] = useState('');
  const [aliasStatus, setAliasStatus] = useState('');

  useEffect(() => {
    if (!visible) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      setClientAlias(conversation?.clientAlias || '');
      setAliasStatus('');
    });
    return () => cancelAnimationFrame(frame);
  }, [conversation?.clientAlias, visible]);

  async function saveAlias() {
    if (!conversation?.id) {
      return;
    }
    setAliasStatus('');
    try {
      await updateAlias.mutateAsync({ conversationId: conversation.id, alias: clientAlias });
      setAliasStatus(clientAlias.trim() ? 'Client name saved for your workspace.' : 'Client alias cleared.');
    } catch (error) {
      setAliasStatus(error instanceof Error ? error.message : 'Client name update failed.');
    }
  }

  return (
    <ModalSheet onClose={onClose} title="Client details" visible={visible}>
      <ScrollView contentContainerStyle={styles.sheetScroll} showsHorizontalScrollIndicator={false} showsVerticalScrollIndicator={false}>
        <InfoBlock label="Lead" title={conversation?.leadStatusLabel || 'New'} value={conversation?.status || 'Queue'} />
        <InfoBlock
          label="Assigned editor"
          title={conversation?.assignmentSummary.assignedFreelancerName || conversation?.assignedFreelancerName || 'Unassigned'}
          value={conversation?.assignedFreelancerId || conversation?.assignmentSummary.assignedFreelancerId || 'Assign an editor before handoff.'}
        />
        <InfoBlock label="Owner" title={conversation?.ownerName || conversation?.assignmentSummary.ownerName || 'Queue'} value={conversation?.ownerRole || 'Gigxomi'} />
        <InfoBlock label="Service" title={conversation?.serviceTitle || 'General support'} value={getPlatformTitle(conversation)} />
        <InfoBlock label="Internal note" title="Manager note" value={conversation?.internalNotes || 'No internal note saved.'} />
        <InfoBlock
          label={audience === 'freelancer' ? 'Client' : 'Customer'}
          title={getCustomerDisplayNameForAudience(conversation, audience)}
          value={`${maskCustomerPhoneForAudience(conversation?.customerPhoneDisplay, audience)}\n${conversation?.summary || ''}`.trim()}
        />
        {audience === 'freelancer' ? (
          <View style={styles.aliasEditor}>
            <Text style={styles.infoLabel}>Your client name</Text>
            <TextInput
              value={clientAlias}
              onChangeText={setClientAlias}
              placeholder={conversation?.customerDisplayName || 'Client name'}
              placeholderTextColor={theme.colors.mutedText}
              selectionColor={theme.colors.accent}
              style={styles.sheetInput}
            />
            {aliasStatus ? <Text style={styles.aliasStatus}>{aliasStatus}</Text> : null}
            <Pressable
              disabled={updateAlias.isPending}
              style={[styles.sheetPrimaryButton, updateAlias.isPending && styles.actionChipDisabled]}
              onPress={() => {
                saveAlias().catch(() => undefined);
              }}
            >
              <Feather name="edit-3" size={16} color={theme.colors.background} />
              <Text style={styles.sheetPrimaryText}>{updateAlias.isPending ? 'Saving...' : 'Save client name'}</Text>
            </Pressable>
          </View>
        ) : null}
        <InfoBlock
          label="Payment"
          title={payment ? `${payment.title} - ${formatCurrency(payment.amount)}` : 'No payment request'}
          value={
            payment
              ? `${payment.status} | Payer: ${payment.payerRole} | Payee: ${payment.payeeRole}${payment.paymentProvider ? ` | ${payment.paymentProvider}` : ''}`
              : 'Create a payment request from the chat actions.'
          }
        />
      </ScrollView>
    </ModalSheet>
  );
}

function InfoBlock({ label, title, value }: { label: string; title: string; value: string }) {
  return (
    <AppCard style={styles.sheetCard}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.sheetCardTitle}>{title}</Text>
      <Text style={styles.sheetCardValue}>{value}</Text>
    </AppCard>
  );
}

function StatusSheet({
  activeId,
  isSaving,
  onClose,
  onSelect,
  statuses,
  visible,
}: {
  activeId?: string;
  isSaving: boolean;
  onClose: () => void;
  onSelect: (statusId: string) => void;
  statuses: MobileLeadStatus[];
  visible: boolean;
}) {
  return (
    <ModalSheet onClose={onClose} title="Lead status" visible={visible}>
      <ScrollView contentContainerStyle={styles.sheetScroll} showsHorizontalScrollIndicator={false} showsVerticalScrollIndicator={false}>
        {statuses.map((status) => (
          <Pressable
            disabled={isSaving}
            key={status.id}
            style={[styles.pickerRow, activeId === status.id && styles.pickerRowActive]}
            onPress={() => onSelect(status.id)}
          >
            <View style={[styles.statusDot, status.tone === 'warning' && styles.statusWarning, status.tone === 'success' && styles.statusSuccess]} />
            <View style={styles.pickerRowCopy}>
              <Text style={styles.pickerTitle}>{status.label}</Text>
              <Text style={styles.pickerMeta}>{status.active ? 'Active' : 'Hidden'} lead stage</Text>
            </View>
            {activeId === status.id ? <Feather name="check" size={18} color={theme.colors.accent} /> : null}
          </Pressable>
        ))}
        {!statuses.length ? <Text style={styles.emptyInline}>No lead statuses found. Pull to refresh the chat and try again.</Text> : null}
      </ScrollView>
    </ModalSheet>
  );
}

function PaymentSheet({
  activeLane,
  audience,
  isSaving,
  onClose,
  onSubmit,
  projectTitle,
  visible,
}: {
  activeLane: MobileConversationLane;
  audience: MobileInboxAudience;
  isSaving: boolean;
  onClose: () => void;
  onSubmit: (input: { amount: number; title: string; note: string; dueLabel: string }) => void;
  projectTitle?: string;
  visible: boolean;
}) {
  const [amount, setAmount] = useState('');
  const defaultTitle = activeLane === 'internal' ? 'Editor payout request' : 'Project payment';
  const [title, setTitle] = useState(defaultTitle);
  const [note, setNote] = useState('');
  const [dueLabel, setDueLabel] = useState('');
  const canSubmit = Number(amount) > 0 && title.trim().length > 0;

  return (
    <ModalSheet onClose={onClose} title={activeLane === 'internal' || audience === 'freelancer' ? 'Request payment' : 'Send payment request'} visible={visible}>
      <ScrollView contentContainerStyle={styles.sheetScroll} showsHorizontalScrollIndicator={false} showsVerticalScrollIndicator={false}>
        <View style={styles.paymentProjectBox}>
          <Text style={styles.infoLabel}>Linked work</Text>
          <Text numberOfLines={2} style={styles.paymentProjectTitle}>{projectTitle || 'No project linked'}</Text>
        </View>
        <TextInput
          keyboardType="numeric"
          value={amount}
          onChangeText={setAmount}
          placeholder="Amount"
          placeholderTextColor={theme.colors.mutedText}
          style={styles.sheetInput}
          selectionColor={theme.colors.accent}
        />
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Title"
          placeholderTextColor={theme.colors.mutedText}
          style={styles.sheetInput}
          selectionColor={theme.colors.accent}
        />
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="Note"
          placeholderTextColor={theme.colors.mutedText}
          style={[styles.sheetInput, styles.sheetTextArea]}
          multiline
          selectionColor={theme.colors.accent}
        />
        <TextInput
          value={dueLabel}
          onChangeText={setDueLabel}
          placeholder="Due label"
          placeholderTextColor={theme.colors.mutedText}
          style={styles.sheetInput}
          selectionColor={theme.colors.accent}
        />
        <Pressable
          disabled={!canSubmit || isSaving}
          style={[styles.sheetPrimaryButton, (!canSubmit || isSaving) && styles.actionChipDisabled]}
          onPress={() => onSubmit({ amount: Number(amount), title: title.trim(), note: note.trim(), dueLabel: dueLabel.trim() })}
        >
          <Feather name="credit-card" size={16} color={theme.colors.background} />
          <Text style={styles.sheetPrimaryText}>{isSaving ? 'Creating...' : 'Create PhonePe link'}</Text>
        </Pressable>
      </ScrollView>
    </ModalSheet>
  );
}

const OfferCountdownBadge = memo(function OfferCountdownBadge({ expiresAt }: { expiresAt?: string }) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!expiresAt) return;
    const tick = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => clearInterval(tick);
  }, [expiresAt]);

  return <Text style={styles.offerCountdown}>{formatOfferCountdown(expiresAt, nowMs)}</Text>;
});

export default function ChatDetailScreen() {
  const params = useLocalSearchParams<{ id?: string; audience?: string; lane?: string; rejectOffer?: string; offerAction?: string }>();
  const insets = useSafeAreaInsets();
  const auth = useAuth();
  const isFocused = useIsFocused();
  const audience = isInboxAudience(params.audience) ? params.audience : resolveAudienceForRole(auth.session?.role);
  const requestedLane = isConversationLane(params.lane) ? params.lane : null;
  const conversationId = typeof params.id === 'string' ? params.id : '';
  const threadQuery = useChatThread(conversationId, audience, { isFocused });
  const sendMessage = useSendMessage(audience);
  const deleteMessage = useDeleteMessage(audience);
  const markRead = useMarkConversationRead(audience);
  const markPayment = useMarkPaymentStatus(audience);
  const assignConversation = useAssignConversation(audience);
  const respondAssignment = useRespondConversationAssignment(audience);
  const setLeadStatus = useSetConversationLeadStatus(audience);
  const toggleCustomerAccess = useToggleFreelancerCustomerLaneAccess(audience);
  const createPayment = useCreatePaymentRequest(audience);
  const updateTyping = useUpdateTypingState();
  const conversation = threadQuery.conversation;
  const conversationDataId = conversation?.id;
  const conversationPreferredLane = conversation?.preferredLane;
  const conversationInternalUnread = conversation?.unreadCountByLane?.internal ?? 0;
  const [activeLane, setActiveLane] = useState<MobileConversationLane>(requestedLane ?? getInitialLane(audience));
  const [message, setMessage] = useState('');
  const [offerResponseAction, setOfferResponseAction] = useState<'ACCEPT' | 'PASS' | null>(null);
  const [offerResponseNote, setOfferResponseNote] = useState('');
  const [respondedOfferIds, setRespondedOfferIds] = useState<Set<string>>(() => new Set());
  const [composerStatus, setComposerStatus] = useState('');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [messageOptionsTarget, setMessageOptionsTarget] = useState<MobileConversationMessage | null>(null);
  const [clientPrivateMode, setClientPrivateMode] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [emojiSearch, setEmojiSearch] = useState('');
  const [emojiCategory, setEmojiCategory] = useState<EmojiCategory>('Smileys & Emotion');
  const [recentEmojis, setRecentEmojis] = useState(DEFAULT_RECENT_EMOJIS);
  const [pendingAttachments, setPendingAttachments] = useState<MessageAttachmentInput[]>([]);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isAudioBusy, setIsAudioBusy] = useState(false);
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  const messageListRef = useRef<FlatList<MobileConversationMessage> | null>(null);
  const emojiScrollRef = useRef<ScrollView | null>(null);
  const emojiCategoryOffsetsRef = useRef<Partial<Record<EmojiCategory, number>>>({});
  const activeEmojiCategoryRef = useRef<EmojiCategory>('Smileys & Emotion');
  const emojiScrollFrameRef = useRef<number | null>(null);
  const shouldAutoScrollRef = useRef(true);
  const visibleThreadKeyRef = useRef('');
  const visibleMessageCountRef = useRef(0);
  const visibleLatestMessageIdRef = useRef('');
  const scrollOffsetYRef = useRef(0);
  const markReadKeyRef = useRef('');
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const typingStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingHeartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sendingMessageRef = useRef(false);
  const outboundTypingStateRef = useRef<{ conversationId: string; lane: MobileConversationLane; active: boolean } | null>(null);
  const markReadMutateRef = useRef(markRead.mutate);
  const updateTypingMutateRef = useRef(updateTyping.mutate);
  const lanes = useMemo<MobileConversationLane[]>(() => {
    const visible = (conversation?.visibleLanes ?? []).filter((lane): lane is MobileConversationLane => lane === 'customer' || lane === 'internal');
    return visible.length ? visible : ['customer', 'internal'];
  }, [conversation?.visibleLanes]);
  const laneMessages = useMemo(
    () => (conversation?.messages ?? []).filter((item) => item.lane === activeLane),
    [activeLane, conversation?.messages],
  );
  const displayMessages = useMemo(
    () => laneMessages.map((item, index) => ({ item, index })).sort((left, right) => {
      const timeDelta = getMessageTime(left.item) - getMessageTime(right.item);
      return timeDelta || left.index - right.index;
    }).map(({ item }) => item),
    [laneMessages],
  );
  const renderMessages = useMemo(() => [...displayMessages].reverse(), [displayMessages]);
  const emojiSections = useMemo(() => {
    if (!emojiOpen) return [];
    const chatEmojis = getChatEmojis();
    const normalizedSearch = emojiSearch.trim().toLowerCase();
    return EMOJI_CATEGORIES.map((category) => ({
      category,
      emojis: chatEmojis.filter((emoji) => {
        if (emoji.category !== category) {
          return false;
        }
        if (!normalizedSearch) {
          return true;
        }
        return emoji.name.toLowerCase().includes(normalizedSearch) || emoji.shortName.toLowerCase().includes(normalizedSearch);
      }).slice(0, normalizedSearch ? 80 : 96),
    })).filter((section) => section.emojis.length > 0);
  }, [emojiOpen, emojiSearch]);
  const counterpartReadAtMs = useMemo(
    () => getCounterpartReadAtMs(audience, conversation?.readStateByAudience),
    [audience, conversation?.readStateByAudience],
  );
  const renderItem = useCallback(
    ({ item }: { item: MobileConversationMessage }) => (
      <MessageBubble
        message={item}
        audience={audience}
        counterpartReadAtMs={counterpartReadAtMs}
        onOpenOptions={setMessageOptionsTarget}
      />
    ),
    [audience, counterpartReadAtMs],
  );
  const laneCapability = conversation?.laneCapabilities?.[activeLane];
  const canWrite =
    conversation?.capabilities
      ? (activeLane === 'customer' ? conversation.capabilities.canSendCustomerMessage : conversation.capabilities.canSendInternalMessage)
      : Boolean(laneCapability?.writable);
  const canManage = audience === 'admin' || audience === 'manager';
  const showClientPrivateControl = canManage && activeLane === 'customer';
  const isClientPrivateMode = showClientPrivateControl && clientPrivateMode;
  const canManageCustomerAccess = canManage && Boolean(conversation?.assignmentSummary.assignedFreelancerId || conversation?.assignedFreelancerId);
  const canCreatePayment = (canManage && activeLane === 'customer') || (audience === 'freelancer' && activeLane === 'internal');
  const pendingOffer = conversation?.myAssignmentOffer ?? conversation?.assignmentSummary.myOffer ?? null;
  const pendingOfferActive = audience === 'freelancer' && pendingOffer?.status === 'PENDING' && !respondedOfferIds.has(pendingOffer.id);
  const showInlineOfferCard = pendingOfferActive;
  const payment = conversation?.latestPaymentRequest;
  const [presenceNowMs, setPresenceNowMs] = useState(() => Date.now());
  const typingMessage = conversation?.typing?.find((entry) => {
    if (entry.active === false || entry.lane !== activeLane || entry.role === audience) {
      return false;
    }
    const updatedMs = entry.updatedAt ? Number(new Date(entry.updatedAt).getTime()) : presenceNowMs;
    return Number.isFinite(updatedMs) && presenceNowMs - updatedMs <= CHAT_TYPING_FRESH_WINDOW_MS;
  });
  const typingByLane = useMemo(() => {
    const result: Partial<Record<MobileConversationLane, string>> = {};
    for (const entry of conversation?.typing ?? []) {
      if (entry.active === false || entry.role === audience) {
        continue;
      }
      const updatedMs = entry.updatedAt ? Number(new Date(entry.updatedAt).getTime()) : presenceNowMs;
      if (!Number.isFinite(updatedMs) || presenceNowMs - updatedMs > CHAT_TYPING_FRESH_WINDOW_MS) {
        continue;
      }
      result[entry.lane] = entry.label;
    }
    return result;
  }, [audience, conversation?.typing, presenceNowMs]);
  const assignedFreelancerLabel = conversation?.assignmentSummary.assignedFreelancerName || conversation?.assignedFreelancerName || '';
  const customerPresence = useMemo(() => {
    if (!conversation || activeLane !== 'customer' || typingMessage) {
      return { label: activeLane === 'internal' ? 'Internal coordination' : '', online: false };
    }

    let lastActiveMs = Number(new Date(conversation.lastCustomerActivityAt ?? '').getTime());
    if (!Number.isFinite(lastActiveMs)) {
      lastActiveMs = 0;
    }

    const latestCustomerMessage = [...conversation.messages]
      .reverse()
      .find((item) => item.lane === 'customer' && item.senderRole === 'customer');
    if (latestCustomerMessage?.createdAt) {
      const messageMs = Number(new Date(latestCustomerMessage.createdAt).getTime());
      if (Number.isFinite(messageMs) && messageMs > lastActiveMs) {
        lastActiveMs = messageMs;
      }
    }

    const latestCustomerTyping = [...(conversation.typing ?? [])]
      .reverse()
      .find((entry) => entry.lane === 'customer' && entry.role === 'customer');
    if (latestCustomerTyping?.updatedAt) {
      const typingMs = Number(new Date(latestCustomerTyping.updatedAt).getTime());
      if (Number.isFinite(typingMs) && typingMs > lastActiveMs) {
        lastActiveMs = typingMs;
      }
    }

    if (!lastActiveMs) {
      return { label: 'Offline', online: false };
    }

    if (presenceNowMs - lastActiveMs <= CHAT_ONLINE_WINDOW_MS) {
      return { label: 'Online', online: true };
    }

    return { label: `Last reply ${formatPresenceAgoLabel(lastActiveMs, presenceNowMs)}`, online: false };
  }, [activeLane, conversation, presenceNowMs, typingMessage]);
  const headerStatusLabel = getHeaderStatusLabel({
    activeLane,
    audience,
    conversation,
    customerPresenceLabel: customerPresence.label,
    typingLabel: typingMessage?.label,
  });
  const headerStatusOnline = Boolean(typingMessage || customerPresence.online);
  const hasDraft = message.trim().length > 0;
  const hasPendingAttachments = pendingAttachments.length > 0;
  const threadKey = `${conversation?.id ?? conversationId}:${activeLane}`;
  const latestMessageId = displayMessages[displayMessages.length - 1]?.id ?? '';
  const [hasNewMessageBelow, setHasNewMessageBelow] = useState(false);

  useEffect(() => {
    markReadMutateRef.current = markRead.mutate;
  }, [markRead.mutate]);

  useEffect(() => {
    updateTypingMutateRef.current = updateTyping.mutate;
  }, [updateTyping.mutate]);

  const handleMessageScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset } = event.nativeEvent;
    scrollOffsetYRef.current = Math.max(0, contentOffset.y);
    const nearLatest = contentOffset.y <= 88;
    shouldAutoScrollRef.current = nearLatest;
    if (nearLatest) {
      setHasNewMessageBelow((current) => (current ? false : current));
    }
  }, []);

  const scrollToLatestMessage = useCallback((animated = true) => {
    shouldAutoScrollRef.current = true;
    setHasNewMessageBelow(false);
    requestAnimationFrame(() => {
      messageListRef.current?.scrollToOffset({ offset: 0, animated });
    });
  }, []);

  useEffect(() => {
    const authToken = auth.token;
    if (!authToken || !conversationId) {
      return undefined;
    }

    let registered = false;
    const heartbeat = () => {
      registered = true;
      void registerActiveMobileView(authToken, { viewType: 'chat', referenceId: conversationId });
    };
    const clearActiveView = () => {
      if (!registered) {
        return;
      }
      registered = false;
      void clearActiveMobileView(authToken, { viewType: 'chat', referenceId: conversationId });
    };

    heartbeat();
    const interval = setInterval(heartbeat, 45_000);
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        heartbeat();
      } else {
        clearActiveView();
      }
    });

    return () => {
      clearInterval(interval);
      appStateSubscription.remove();
      clearActiveView();
    };
  }, [auth.token, conversationId]);

  useEffect(() => {
    const previousThreadKey = visibleThreadKeyRef.current;
    const previousMessageCount = visibleMessageCountRef.current;
    const previousLatestMessageId = visibleLatestMessageIdRef.current;
    const nextMessageCount = displayMessages.length;
    const threadChanged = previousThreadKey !== threadKey;
    const latestMessageChanged = previousLatestMessageId !== latestMessageId;

    visibleThreadKeyRef.current = threadKey;
    visibleMessageCountRef.current = nextMessageCount;
    visibleLatestMessageIdRef.current = latestMessageId;

    if (threadChanged) {
      scrollOffsetYRef.current = 0;
      shouldAutoScrollRef.current = true;
      setHasNewMessageBelow(false);
      return;
    }

    if (previousMessageCount === 0 && nextMessageCount > 0) {
      shouldAutoScrollRef.current = true;
      return;
    }

    if (latestMessageChanged && previousLatestMessageId) {
      if (shouldAutoScrollRef.current) {
        scrollToLatestMessage(true);
      } else {
        setHasNewMessageBelow(true);
      }
      return;
    }

  }, [displayMessages.length, latestMessageId, scrollToLatestMessage, threadKey]);

  useEffect(() => {
    if (!conversationDataId) {
      return;
    }

    const preferred = requestedLane ?? (conversationInternalUnread > 0 ? 'internal' : conversationPreferredLane || getInitialLane(audience));
    setActiveLane((current) => {
      if (lanes.includes(current)) {
        return current;
      }
      return lanes.includes(preferred) ? preferred : lanes[0] ?? 'customer';
    });
  }, [audience, conversationDataId, conversationInternalUnread, conversationPreferredLane, lanes, requestedLane]);

  useEffect(() => {
    if (!isFocused) {
      markReadKeyRef.current = '';
      return;
    }
    if (!conversation?.id || !latestMessageId) {
      return;
    }

    const nextReadKey = `${conversation.id}:${activeLane}:${latestMessageId}`;
    if (markReadKeyRef.current !== nextReadKey) {
      markReadKeyRef.current = nextReadKey;
      markReadMutateRef.current({ conversationId: conversation.id, lane: activeLane });
    }
  }, [activeLane, conversation?.id, isFocused, latestMessageId]);

  useEffect(() => {
    const outbound = outboundTypingStateRef.current;
    if (!outbound?.active) {
      return;
    }
    if (outbound.conversationId === conversation?.id && outbound.lane === activeLane) {
      return;
    }

    clearTypingTimers();
    updateTypingMutateRef.current({ conversationId: outbound.conversationId, lane: outbound.lane, active: false });
    outboundTypingStateRef.current = null;
  }, [activeLane, conversation?.id]);

  useEffect(() => {
    const tick = setInterval(() => {
      setPresenceNowMs(Date.now());
    }, CHAT_PRESENCE_TICK_MS);

    return () => {
      clearInterval(tick);
    };
  }, []);

  useEffect(() => {
    const requestedAction = params.offerAction === 'ACCEPT' || params.offerAction === 'PASS'
      ? params.offerAction
      : params.rejectOffer === '1'
      ? 'PASS'
      : null;
    if (requestedAction && pendingOfferActive) {
      setOfferResponseAction(requestedAction);
      setComposerStatus(requestedAction === 'ACCEPT' ? 'Add an optional acceptance note.' : 'Add a reason to reject this project.');
    }
  }, [params.offerAction, params.rejectOffer, pendingOfferActive]);

  useEffect(() => {
    return () => {
      if (emojiScrollFrameRef.current !== null) {
        cancelAnimationFrame(emojiScrollFrameRef.current);
      }
      if (typingStopRef.current) {
        clearTimeout(typingStopRef.current);
      }
      if (typingHeartbeatRef.current) {
        clearInterval(typingHeartbeatRef.current);
      }
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
      const outbound = outboundTypingStateRef.current;
      if (outbound?.active) {
        updateTypingMutateRef.current({ conversationId: outbound.conversationId, lane: outbound.lane, active: false });
      }
    };
  }, []);

  function clearTypingTimers() {
    if (typingStopRef.current) {
      clearTimeout(typingStopRef.current);
      typingStopRef.current = null;
    }
    if (typingHeartbeatRef.current) {
      clearInterval(typingHeartbeatRef.current);
      typingHeartbeatRef.current = null;
    }
  }

  function postTypingState(active: boolean, force = false) {
    if (!conversation || !canWrite) {
      return;
    }

    const previous = outboundTypingStateRef.current;
    if (!force && previous?.active === active && previous.conversationId === conversation.id && previous.lane === activeLane) {
      return;
    }

    outboundTypingStateRef.current = { conversationId: conversation.id, lane: activeLane, active };
    updateTypingMutateRef.current({ conversationId: conversation.id, lane: activeLane, active });
  }

  function startTypingHeartbeat() {
    if (typingHeartbeatRef.current) {
      return;
    }
    typingHeartbeatRef.current = setInterval(() => {
      postTypingState(true, true);
    }, CHAT_TYPING_HEARTBEAT_MS);
  }

  function stopTyping() {
    clearTypingTimers();
    postTypingState(false, true);
  }

  function handleMessageChange(value: string) {
    setMessage(value);
    if (emojiOpen) {
      setEmojiOpen(false);
    }
    if (!conversation || !canWrite) {
      return;
    }

    if (!value.trim()) {
      stopTyping();
      return;
    }

    postTypingState(true);
    startTypingHeartbeat();
    if (typingStopRef.current) {
      clearTimeout(typingStopRef.current);
    }
    typingStopRef.current = setTimeout(stopTyping, CHAT_TYPING_STOP_DEBOUNCE_MS);
  }

  async function sendChatPayload(input: {
    body?: string;
    attachments?: MessageAttachmentInput[];
    restoreDraft?: string;
    restoreAttachments?: MessageAttachmentInput[];
  }) {
    const body = input.body?.trim() ?? '';
    const attachments = input.attachments ?? [];
    if (!conversation || (!body && !attachments.length) || !canWrite) {
      return;
    }
    if (sendingMessageRef.current) {
      return;
    }
    sendingMessageRef.current = true;

    setMessage('');
    setPendingAttachments([]);
    setEmojiOpen(false);
    setComposerStatus('');
    shouldAutoScrollRef.current = true;
    setHasNewMessageBelow(false);
    stopTyping();
    try {
      await sendMessage.mutateAsync({
        conversationId: conversation.id,
        lane: activeLane,
        body,
        attachments,
        visibility: isClientPrivateMode ? 'client_private' : undefined,
      });
      scrollToLatestMessage(true);
    } catch (error) {
      if (input.restoreDraft !== undefined) {
        setMessage(input.restoreDraft);
      }
      if (input.restoreAttachments) {
        setPendingAttachments(input.restoreAttachments);
      }
      setComposerStatus(error instanceof Error ? error.message : 'Message send failed.');
    } finally {
      sendingMessageRef.current = false;
    }
  }

  async function handleManualThreadRefresh() {
    setIsManualRefreshing(true);
    try {
      await threadQuery.refetch();
    } finally {
      setIsManualRefreshing(false);
    }
  }

  async function handleSend() {
    const body = message.trim();
    const attachments = pendingAttachments;
    await sendChatPayload({ body, attachments, restoreDraft: body, restoreAttachments: attachments });
  }

  async function handleCopyMessage(targetMessage: MobileConversationMessage) {
    const body = targetMessage.body?.trim();
    if (!body || targetMessage.deletedAt) {
      return;
    }

    await Clipboard.setStringAsync(body);
    setMessageOptionsTarget(null);
    setComposerStatus('Message text copied.');
  }

  function handleDeleteForEveryone(targetMessage: MobileConversationMessage) {
    if (!conversation?.id || targetMessage.deletedAt) {
      return;
    }

    setComposerStatus('');
    deleteMessage
      .mutateAsync({ conversationId: conversation.id, messageId: targetMessage.id, scope: 'everyone' })
      .then((response) => {
        setMessageOptionsTarget(null);
        const note = response.meta?.note?.trim();
        setComposerStatus(note || 'Message deleted for everyone in Gigxomi.');
      })
      .catch((error) => {
        const messageText = error instanceof Error ? error.message : 'Message delete failed.';
        const friendlyMessage = /HTML page instead of JSON|Status 404/i.test(messageText)
          ? 'Delete is not available on the current API version. Deploy the updated Gigxomi API, then retry.'
          : messageText;
        setComposerStatus(friendlyMessage);
      });
  }

  function removePendingAttachment(index: number) {
    setPendingAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  async function handlePickAttachment() {
    if (!conversation || !canWrite || recording || sendMessage.isPending || isAudioBusy) {
      return;
    }

    if (audience === 'freelancer' && activeLane === 'customer') {
      setComposerStatus('Client lane attachments are controlled by admin/manager access. Use freelancer lane for files.');
      return;
    }

    setEmojiOpen(false);
    setComposerStatus('');
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: true,
        type: '*/*',
      });

      if (result.canceled) {
        return;
      }

      const availableSlots = Math.max(0, MAX_PENDING_ATTACHMENTS - pendingAttachments.length);
      if (!availableSlots) {
        setComposerStatus(`You can attach up to ${MAX_PENDING_ATTACHMENTS} files at once.`);
        return;
      }

      const selectedAssets = result.assets.slice(0, availableSlots);
      const skippedByLimit = Math.max(0, result.assets.length - selectedAssets.length);
      const rejectedBySize = selectedAssets.filter((asset) => typeof asset.size === 'number' && asset.size > MAX_CHAT_ATTACHMENT_BYTES);
      const validAssets = selectedAssets.filter((asset) => typeof asset.size !== 'number' || asset.size <= MAX_CHAT_ATTACHMENT_BYTES);

      if (rejectedBySize.length) {
        setComposerStatus(`${rejectedBySize[0]?.name ?? 'File'} exceeds 20 MB and was skipped.`);
      } else if (skippedByLimit) {
        setComposerStatus(`Only ${MAX_PENDING_ATTACHMENTS} attachments can be sent at once.`);
      }

      if (!validAssets.length) {
        return;
      }

      const preparedAttachments = await Promise.all(
        validAssets.map(async (asset) => ({
          name: asset.name || `attachment-${Date.now()}`,
          mimeType: asset.mimeType || 'application/octet-stream',
          sizeBytes: typeof asset.size === 'number' ? asset.size : undefined,
          uploadTarget: 'local' as const,
          externalUrl: await readPickedAssetAsDataUrl(asset),
        })),
      );

      setPendingAttachments((current) => [...current, ...preparedAttachments].slice(0, MAX_PENDING_ATTACHMENTS));
      if (!rejectedBySize.length && !skippedByLimit) {
        setComposerStatus(`${preparedAttachments.length} attachment${preparedAttachments.length === 1 ? '' : 's'} ready.`);
      }
    } catch (error) {
      setComposerStatus(error instanceof Error ? error.message : 'File picker failed.');
    }
  }

  function appendEmoji(emoji: string) {
    const nextMessage = `${message}${emoji}`;
    setMessage(nextMessage);
    if (conversation && canWrite && nextMessage.trim()) {
      postTypingState(true);
      startTypingHeartbeat();
      if (typingStopRef.current) {
        clearTimeout(typingStopRef.current);
      }
      typingStopRef.current = setTimeout(stopTyping, CHAT_TYPING_STOP_DEBOUNCE_MS);
    }
    setRecentEmojis((current) => [emoji, ...current.filter((item) => item !== emoji)].slice(0, 16));
  }

  function updateEmojiCategory(category: EmojiCategory) {
    if (activeEmojiCategoryRef.current === category) {
      return;
    }

    activeEmojiCategoryRef.current = category;
    setEmojiCategory(category);
  }

  function handleEmojiCategoryPress(category: EmojiCategory) {
    updateEmojiCategory(category);
    const sectionOffset = emojiCategoryOffsetsRef.current[category] ?? 0;
    emojiScrollRef.current?.scrollTo({ y: Math.max(0, sectionOffset - 4), animated: true });
  }

  function handleEmojiPickerScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    if (emojiSearch.trim() || emojiScrollFrameRef.current !== null || !emojiSections.length) {
      return;
    }

    const scrollY = event.nativeEvent.contentOffset.y + 24;
    emojiScrollFrameRef.current = requestAnimationFrame(() => {
      emojiScrollFrameRef.current = null;
      let nextCategory = activeEmojiCategoryRef.current;
      for (const section of emojiSections) {
        const sectionY = emojiCategoryOffsetsRef.current[section.category];
        if (typeof sectionY === 'number' && sectionY <= scrollY) {
          nextCategory = section.category;
        }
      }

      updateEmojiCategory(nextCategory);
    });
  }

  async function startVoiceRecording() {
    if (!conversation || !canWrite || isAudioBusy) {
      return;
    }

    if (audience === 'freelancer' && activeLane === 'customer') {
      setComposerStatus('Voice notes are available in the freelancer lane. Client lane is text-only here.');
      return;
    }

    setIsAudioBusy(true);
    setEmojiOpen(false);
    setComposerStatus('');
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        setComposerStatus('Microphone permission is required for voice notes.');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const nextRecording = new Audio.Recording();
      await nextRecording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await nextRecording.startAsync();
      setRecording(nextRecording);
      setRecordingSeconds(0);
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((current) => current + 1);
      }, 1000);
    } catch (error) {
      setComposerStatus(error instanceof Error ? error.message : 'Voice recording could not start.');
    } finally {
      setIsAudioBusy(false);
    }
  }

  async function stopAndSendVoiceRecording() {
    if (!recording || !conversation || isAudioBusy) {
      return;
    }

    setIsAudioBusy(true);
    setComposerStatus('Preparing voice note...');
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    try {
      const status = await recording.getStatusAsync().catch(() => null);
      await recording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      const uri = recording.getURI();
      setRecording(null);
      if (!uri) {
        throw new Error('Voice note file was not saved.');
      }

      const mimeType = getRecordingMimeType(uri);
      const extension = getRecordingExtension(mimeType);
      const [base64Audio, sizeBytes] = await Promise.all([readAudioAsBase64(uri), getAudioFileSize(uri)]);
      const durationSeconds =
        status && 'durationMillis' in status && typeof status.durationMillis === 'number'
          ? Math.max(1, Math.ceil(status.durationMillis / 1000))
          : Math.max(1, recordingSeconds);

      await sendChatPayload({
        body: '',
        attachments: [
          {
            name: `voice-note-${Date.now()}.${extension}`,
            mimeType,
            sizeBytes,
            uploadTarget: 'local',
            durationSeconds,
            externalUrl: `data:${mimeType};base64,${base64Audio}`,
          },
        ],
      });
      setRecordingSeconds(0);
      setComposerStatus('Voice note sent.');
    } catch (error) {
      setRecording(null);
      setComposerStatus(error instanceof Error ? error.message : 'Voice note send failed.');
    } finally {
      setIsAudioBusy(false);
    }
  }

  async function cancelVoiceRecording() {
    if (!recording) {
      return;
    }
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    try {
      await recording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
    } catch {
      // Cancel is best-effort.
    }
    setRecording(null);
    setRecordingSeconds(0);
    setComposerStatus('Voice note discarded.');
  }

  async function handleAssign(input: { freelancerIds: string[]; projectDetails: string; assignmentMode: 'offer' | 'direct' | 'replace' }) {
    if (!conversation) {
      return;
    }
    try {
      await assignConversation.mutateAsync({
        conversationId: conversation.id,
        freelancerIds: input.freelancerIds,
        assignmentMode: input.assignmentMode,
        projectDetails: input.projectDetails,
      });
      setComposerStatus(input.assignmentMode === 'direct' ? 'Editor assigned directly.' : `${input.assignmentMode === 'replace' ? 'Replacement offer' : 'Project offer'} sent to ${input.freelancerIds.length} editor${input.freelancerIds.length === 1 ? '' : 's'}.`);
      setAssignOpen(false);
    } catch (error) {
      if (error instanceof ApiError && error.status === 402) {
        setAssignOpen(false);
        setShowUpgradeModal(true);
        return;
      }
      setComposerStatus(error instanceof Error ? error.message : 'Assignment failed.');
    }
  }

  function openOfferResponse(action: 'ACCEPT' | 'PASS') {
    setOfferResponseAction(action);
    setOfferResponseNote('');
    setComposerStatus(action === 'ACCEPT' ? 'Add an optional acceptance note.' : 'Add a reason to reject this project.');
  }

  function closeOfferResponse() {
    if (respondAssignment.isPending || sendMessage.isPending) {
      return;
    }
    setOfferResponseAction(null);
    setOfferResponseNote('');
  }

  async function handleAssignmentResponse(action: 'ACCEPT' | 'PASS') {
    if (!conversation) {
      return;
    }
    const responseNote = offerResponseNote.trim();
    if (action === 'PASS' && !responseNote) {
      setComposerStatus('Please add a rejection reason before rejecting.');
      return;
    }
    try {
      await respondAssignment.mutateAsync({
        conversationId: conversation.id,
        action,
        rejectionReason: action === 'PASS' ? responseNote : undefined,
      });
      if (action === 'ACCEPT' && responseNote) {
        await sendMessage.mutateAsync({
          conversationId: conversation.id,
          lane: 'internal',
          body: `Project accepted. Note: ${responseNote}`,
          clientMessageId: `offer-accept-note-${conversation.id}-${Date.now()}`,
        });
      }
      if (pendingOffer?.id) {
        setRespondedOfferIds((current) => new Set(current).add(pendingOffer.id));
      }
      if (action === 'ACCEPT') {
        setActiveLane('internal');
      }
      setOfferResponseAction(null);
      setOfferResponseNote('');
      setComposerStatus(action === 'ACCEPT' ? 'Project accepted. Internal lane is open.' : 'Project rejected with reason.');
      void threadQuery.refetch();
    } catch (error) {
      setComposerStatus(error instanceof Error ? error.message : 'Project response failed.');
    }
  }

  async function handleLeadStatus(statusId: string) {
    if (!conversation) {
      return;
    }
    try {
      await setLeadStatus.mutateAsync({ conversationId: conversation.id, leadStatusId: statusId });
      setComposerStatus('Lead status updated.');
      setStatusOpen(false);
    } catch (error) {
      setComposerStatus(error instanceof Error ? error.message : 'Lead status update failed.');
    }
  }

  async function handleToggleCustomerAccess() {
    if (!conversation) {
      return;
    }
    try {
      await toggleCustomerAccess.mutateAsync({
        conversationId: conversation.id,
        enabled: !conversation.freelancerCustomerLanePermission?.enabled,
      });
      setComposerStatus(conversation.freelancerCustomerLanePermission?.enabled ? 'Client lane locked for editor.' : 'Client lane enabled for editor.');
    } catch (error) {
        setComposerStatus(error instanceof Error ? error.message : 'Client lane access update failed.');
    }
  }

  async function handleCreatePayment(input: { amount: number; title: string; note: string; dueLabel: string }) {
    if (!conversation) {
      return;
    }
    try {
      await createPayment.mutateAsync({
        conversationId: conversation.id,
        lane: activeLane,
        amount: input.amount,
        title: input.title,
        note: input.note,
        dueLabel: input.dueLabel,
        assignmentId: `assignment-${conversation.id}`,
        projectId: conversation.serviceId,
        projectTitle: conversation.serviceTitle || 'Linked work',
        payerRole: activeLane === 'internal' ? 'agency' : 'client',
        payeeRole: activeLane === 'internal' ? 'freelancer' : 'agency',
      });
      setComposerStatus('Payment request created.');
      setPaymentOpen(false);
    } catch (error) {
      setComposerStatus(error instanceof Error ? error.message : 'Payment request failed.');
    }
  }

  function handleBackToChats() {
    router.replace('/chats');
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <View style={styles.header}>
          <Pressable style={styles.iconButton} onPress={handleBackToChats}>
            <Feather name="arrow-left" size={22} color={theme.colors.text} />
          </Pressable>
          <StableAvatar imageUrl={conversation?.customerProfileImageUrl} label={getCustomerDisplayNameForAudience(conversation, audience)} size={42} />
          <View style={styles.headerCopy}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text numberOfLines={1} style={[styles.headerTitle, { flexShrink: 1 }]}>
                {getCustomerDisplayNameForAudience(conversation, audience)}
              </Text>
              {conversation?.sourceChannel === 'instagram' ? (
                <View style={{ backgroundColor: 'rgba(236, 72, 153, 0.15)', borderColor: 'rgba(236, 72, 153, 0.4)', borderWidth: 1, paddingVertical: 1, paddingHorizontal: 6, borderRadius: 10 }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: '#ec4899' }}>
                    {conversation.channelConnectionName ? `IG · ${conversation.channelConnectionName}` : 'Instagram'}
                  </Text>
                </View>
              ) : conversation?.sourceChannel === 'whatsapp' ? (
                <View style={{ backgroundColor: 'rgba(82, 194, 52, 0.15)', borderColor: 'rgba(82, 194, 52, 0.4)', borderWidth: 1, paddingVertical: 1, paddingHorizontal: 6, borderRadius: 10 }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: '#52c234' }}>
                    {conversation.channelConnectionName ? `WA · ${conversation.channelConnectionName}` : 'WhatsApp'}
                  </Text>
                </View>
              ) : null}
            </View>
            <View style={styles.headerStatusRow}>
              <View
                style={[
                  styles.presenceDot,
                  headerStatusOnline ? styles.presenceDotOnline : styles.presenceDotMuted,
                  typingMessage && styles.presenceDotTyping,
                ]}
              />
              <Text numberOfLines={1} style={[styles.headerMeta, headerStatusOnline && styles.headerMetaTyping]}>
                {headerStatusLabel}
              </Text>
            </View>
          </View>
          <Pressable style={styles.headerActionButton} onPress={() => setActionsOpen(true)}>
            <Feather name="more-vertical" size={20} color={theme.colors.text} />
          </Pressable>
        </View>

        {canManage && assignedFreelancerLabel ? (
          <View style={[styles.assignedFreelancerStrip, { justifyContent: 'space-between' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 6 }}>
              <Feather name="user-check" size={13} color={theme.colors.accent} />
              <Text numberOfLines={1} style={[styles.assignedFreelancerText, { flex: 1 }]}>Assigned: {assignedFreelancerLabel}</Text>
            </View>
            <Pressable
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              onPress={handleToggleCustomerAccess}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                paddingVertical: 3,
                paddingHorizontal: 8,
                backgroundColor: conversation?.freelancerCustomerLanePermission?.enabled ? 'rgba(82, 194, 52, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                borderColor: conversation?.freelancerCustomerLanePermission?.enabled ? 'rgba(82, 194, 52, 0.4)' : 'rgba(239, 68, 68, 0.4)',
                borderWidth: 1,
                borderRadius: 10,
              }}
            >
              <Feather
                name={conversation?.freelancerCustomerLanePermission?.enabled ? 'message-square' : 'lock'}
                size={11}
                color={conversation?.freelancerCustomerLanePermission?.enabled ? '#52c234' : '#f87171'}
              />
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '700',
                  color: conversation?.freelancerCustomerLanePermission?.enabled ? '#52c234' : '#f87171',
                }}
              >
                {conversation?.freelancerCustomerLanePermission?.enabled ? 'Client chat: ON' : 'Client chat: OFF'}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {threadQuery.error ? <Text style={styles.error}>{threadQuery.error.message}</Text> : null}

        <View style={styles.laneTabs}>
          {lanes.map((lane) => {
            const active = lane === activeLane;
            const locked = !conversation?.laneCapabilities?.[lane]?.writable;
            const unread = conversation?.unreadCountByLane?.[lane] ?? 0;
            const typingLabel = typingByLane[lane];
            return (
              <Pressable key={lane} style={[styles.laneTab, active && styles.laneTabActive]} onPress={() => setActiveLane(lane)}>
                <Feather name={locked ? 'lock' : lane === 'internal' ? 'users' : 'message-circle'} size={13} color={active ? theme.colors.accent : theme.colors.textSecondary} />
                <Text style={[styles.laneText, active && styles.laneTextActive]}>{getLaneLabel(lane)}</Text>
                {typingLabel && !active ? <Text style={styles.laneTypingText}>typing</Text> : null}
                {unread > 0 ? (
                  <View style={styles.laneUnreadBadge}>
                    <Text style={styles.laneUnreadText}>{unread > 9 ? '9+' : unread}</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>

        {canManage && activeLane === 'internal' ? (
          <View style={styles.freelancerLaneBar}>
            <View style={styles.freelancerLaneInfo}>
              <View style={styles.freelancerPrivacyBadge}>
                <Feather name="shield" size={11} color="#4ADE80" />
                <Text style={styles.freelancerPrivacyBadgeText}>Masked Privacy Active</Text>
              </View>
              <Text numberOfLines={1} style={styles.freelancerLaneNoticeText}>
                {assignedFreelancerLabel
                  ? `Assigned: ${assignedFreelancerLabel}`
                  : 'Freelancer chats with customer without seeing client phone or name.'}
              </Text>
            </View>
            <View style={styles.freelancerLaneActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Assign editor to this project"
                style={styles.freelancerLaneBtnPrimary}
                onPress={() => setAssignOpen(true)}
              >
                <Feather name="user-plus" size={13} color="#0B1118" />
                <Text style={styles.freelancerLaneBtnPrimaryText}>
                  {assignedFreelancerLabel ? 'Change' : 'Assign'}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Invite editor to space"
                style={styles.freelancerLaneBtnSecondary}
                onPress={() => setInviteOpen(true)}
              >
                <Feather name="share-2" size={13} color={theme.colors.text} />
                <Text style={styles.freelancerLaneBtnSecondaryText}>Invite</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {showClientPrivateControl ? (
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: clientPrivateMode }}
            onPress={() => {
              setClientPrivateMode((current) => !current);
              setComposerStatus(clientPrivateMode ? 'Client messages are visible to the assigned freelancer when access is enabled.' : 'Private mode on. Your next client-lane messages are hidden from freelancer.');
            }}
            style={styles.privateModeStrip}
          >
            <View style={styles.privateModeIcon}>
              <Feather name={clientPrivateMode ? 'eye-off' : 'eye'} size={14} color={theme.colors.accent} />
            </View>
            <View style={styles.privateModeCopy}>
              <Text style={styles.privateModeTitle}>{clientPrivateMode ? 'Private client mode' : 'Client lane visible'}</Text>
              <Text numberOfLines={2} style={styles.privateModeText}>
                {clientPrivateMode
                  ? 'Your next messages stay between agency/manager and client. Freelancer will not see previews, unread counts, cache, or pushes.'
                  : 'Swipe on before discussing payment or private client details. Normal messages can notify the assigned freelancer.'}
              </Text>
            </View>
            <View style={[styles.privateModeToggle, !clientPrivateMode && styles.privateModeToggleOff]}>
              <View style={styles.privateModeKnob} />
            </View>
          </Pressable>
        ) : null}

        {!canWrite ? (
          <Text style={styles.laneNotice}>
            {laneCapability?.reason || 'Client messaging is set to read-only by agency. Use the internal team lane to coordinate with your manager.'}
          </Text>
        ) : null}
        {typingMessage ? (
          <View style={styles.typingNotice}>
            <View style={styles.typingDot} />
            <Text style={styles.typingNoticeText}>{typingMessage.label} is typing...</Text>
          </View>
        ) : null}
        {composerStatus ? <Text style={styles.composerStatus}>{composerStatus}</Text> : null}
        {showInlineOfferCard ? (
          <AppCard style={styles.offerCard}>
            <View style={styles.offerHeaderRow}>
              <Text style={styles.infoLabel}>Ringing project offer</Text>
              <OfferCountdownBadge expiresAt={pendingOffer.expiresAt} />
            </View>
            <Text style={styles.offerTitle}>{conversation?.serviceTitle || 'New project'}</Text>
            <Text style={styles.offerBody}>{pendingOffer.projectDetails}</Text>
            <View style={styles.offerActions}>
              <Pressable
                disabled={respondAssignment.isPending}
                style={[styles.offerButton, styles.offerButtonPrimary, respondAssignment.isPending && styles.sendButtonDisabled]}
                onPress={() => openOfferResponse('ACCEPT')}
              >
                <Text style={styles.offerButtonPrimaryText}>Accept project</Text>
              </Pressable>
              <Pressable
                disabled={respondAssignment.isPending}
                style={[styles.offerButton, respondAssignment.isPending && styles.sendButtonDisabled]}
                onPress={() => openOfferResponse('PASS')}
              >
                <Text style={styles.offerButtonText}>Reject</Text>
              </Pressable>
            </View>
          </AppCard>
        ) : null}
        <Modal animationType="fade" transparent visible={Boolean(offerResponseAction && pendingOfferActive)} onRequestClose={closeOfferResponse}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.offerDecisionBackdrop}>
            <Pressable style={styles.offerDecisionScrim} onPress={closeOfferResponse} />
            <BlurView intensity={Platform.OS === 'android' ? 28 : 44} tint="dark" style={styles.offerDecisionCard}>
              <View style={styles.offerDecisionIcon}>
                <Feather name={offerResponseAction === 'ACCEPT' ? 'check-circle' : 'x-circle'} size={22} color={offerResponseAction === 'ACCEPT' ? theme.colors.accent : theme.colors.warning} />
              </View>
              <Text style={styles.offerDecisionTitle}>{offerResponseAction === 'ACCEPT' ? 'Accept project?' : 'Reject project?'}</Text>
              <Text style={styles.offerDecisionBody}>
                {offerResponseAction === 'ACCEPT'
                  ? 'Add a quick note for the agency before opening the internal lane.'
                  : 'Add a reason so the agency knows why this project was passed.'}
              </Text>
              <TextInput
                value={offerResponseNote}
                onChangeText={setOfferResponseNote}
                placeholder={offerResponseAction === 'ACCEPT' ? 'Optional note' : 'Reason for rejection'}
                placeholderTextColor={theme.colors.mutedText}
                style={styles.offerDecisionInput}
                multiline
                selectionColor={theme.colors.accent}
              />
              <View style={styles.offerDecisionActions}>
                <Pressable
                  disabled={respondAssignment.isPending || sendMessage.isPending}
                  style={[styles.offerDecisionButton, (respondAssignment.isPending || sendMessage.isPending) && styles.sendButtonDisabled]}
                  onPress={closeOfferResponse}
                >
                  <Text style={styles.offerDecisionCancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  disabled={respondAssignment.isPending || sendMessage.isPending || (offerResponseAction === 'PASS' && !offerResponseNote.trim())}
                  style={[
                    styles.offerDecisionButton,
                    styles.offerDecisionPrimaryButton,
                    (respondAssignment.isPending || sendMessage.isPending || (offerResponseAction === 'PASS' && !offerResponseNote.trim())) && styles.sendButtonDisabled,
                  ]}
                  onPress={() => {
                    if (offerResponseAction) {
                      handleAssignmentResponse(offerResponseAction).catch(() => undefined);
                    }
                  }}
                >
                  <Text style={styles.offerDecisionPrimaryText}>
                    {respondAssignment.isPending || sendMessage.isPending ? 'Saving...' : offerResponseAction === 'ACCEPT' ? 'Accept' : 'Reject'}
                  </Text>
                </Pressable>
              </View>
            </BlurView>
          </KeyboardAvoidingView>
        </Modal>

        <FlatList
          ref={messageListRef}
          style={styles.messageList}
          contentContainerStyle={[
            styles.messages,
            styles.messagesWithComposerInset,
            renderMessages.length === 0 && styles.messagesEmpty,
          ]}
          data={renderMessages}
          inverted
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          initialNumToRender={15}
          maxToRenderPerBatch={10}
          windowSize={9}
          updateCellsBatchingPeriod={30}
          ListEmptyComponent={
            activeLane === 'internal' && canManage ? (
              <View style={styles.freelancerEmptyCard}>
                <View style={styles.freelancerEmptyIconWrap}>
                  <Feather name="shield" size={28} color={theme.colors.accent} />
                </View>
                <Text style={styles.freelancerEmptyTitle}>Direct Client Chat with Privacy Protection</Text>
                <Text style={styles.freelancerEmptyDesc}>
                  Your assigned editor can chat directly with your customer to clarify requirements, share drafts, and deliver revisions quickly.
                </Text>
                <View style={styles.freelancerPrivacyPoints}>
                  <View style={styles.freelancerPointRow}>
                    <Feather name="check-circle" size={14} color="#4ADE80" />
                    <Text style={styles.freelancerPointText}>Client phone number & identity stay 100% hidden</Text>
                  </View>
                  <View style={styles.freelancerPointRow}>
                    <Feather name="check-circle" size={14} color="#4ADE80" />
                    <Text style={styles.freelancerPointText}>Agency monitors all conversation lanes in real-time</Text>
                  </View>
                  <View style={styles.freelancerPointRow}>
                    <Feather name="check-circle" size={14} color="#4ADE80" />
                    <Text style={styles.freelancerPointText}>Direct in-chat files, showreels & payment requests</Text>
                  </View>
                </View>

                <View style={styles.freelancerEmptyActions}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Find and assign editor"
                    style={styles.freelancerEmptyPrimaryBtn}
                    onPress={() => setAssignOpen(true)}
                  >
                    <Feather name="search" size={16} color="#0B1118" />
                    <Text style={styles.freelancerEmptyPrimaryBtnText}>
                      {assignedFreelancerLabel ? 'Reassign Editor' : 'Find & Assign Editor'}
                    </Text>
                  </Pressable>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Invite editor to space"
                    style={styles.freelancerEmptySecondaryBtn}
                    onPress={() => setInviteOpen(true)}
                  >
                    <Feather name="user-plus" size={16} color={theme.colors.text} />
                    <Text style={styles.freelancerEmptySecondaryBtnText}>
                      Invite Your Editor to Join App
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>{threadQuery.isLoading ? 'Loading messages...' : `No ${getLaneLabel(activeLane).toLowerCase()} messages yet`}</Text>
              </View>
            )
          }
          onScroll={handleMessageScroll}
          scrollEventThrottle={80}
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          keyboardShouldPersistTaps="handled"
          maintainVisibleContentPosition={{ minIndexForVisible: 0, autoscrollToTopThreshold: 88 }}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews={Platform.OS !== 'web'}
          refreshControl={
            <BrandedRefreshControl
              tintColor={theme.colors.accent}
              refreshing={isManualRefreshing}
              onRefresh={() => {
                void handleManualThreadRefresh();
              }}
            />
          }
        />

        {hasNewMessageBelow ? (
          <View pointerEvents="box-none" style={styles.newMessageAnchor}>
            <Pressable style={styles.newMessageButton} onPress={() => scrollToLatestMessage(true)}>
              <Feather name="chevron-down" size={15} color={theme.colors.background} />
              <Text style={styles.newMessageText}>New message</Text>
            </Pressable>
          </View>
        ) : null}

        <View
          style={[
            styles.composerDock,
            {
              paddingBottom:
                Platform.OS === 'android'
                  ? Math.max(insets.bottom, 4)
                  : Math.max(insets.bottom, theme.spacing.sm) + 8,
            },
          ]}
        >
          {emojiOpen ? (
            <View style={styles.emojiPanel}>
              <View style={styles.emojiSearchRow}>
                <Feather name="search" size={16} color={theme.colors.mutedText} />
                <TextInput
                  value={emojiSearch}
                  onChangeText={setEmojiSearch}
                  placeholder="Search emoji"
                  placeholderTextColor={theme.colors.mutedText}
                  selectionColor={theme.colors.accent}
                  style={styles.emojiSearchInput}
                />
              </View>
              <ScrollView
                contentContainerStyle={styles.recentEmojiRow}
                horizontal
                keyboardShouldPersistTaps="handled"
                showsHorizontalScrollIndicator={false}
                style={styles.recentEmojiStrip}
              >
                {recentEmojis.map((emoji, index) => (
                  <Pressable key={`${emoji}-${index}`} style={styles.recentEmojiButton} onPress={() => appendEmoji(emoji)}>
                    <Text style={styles.recentEmojiText}>{emoji}</Text>
                  </Pressable>
                ))}
              </ScrollView>
              <ScrollView
                ref={emojiScrollRef}
                contentContainerStyle={styles.emojiScrollContent}
                keyboardShouldPersistTaps="handled"
                onScroll={handleEmojiPickerScroll}
                scrollEventThrottle={32}
                showsHorizontalScrollIndicator={false}
                showsVerticalScrollIndicator={false}
                style={styles.emojiScroll}
              >
                {emojiSections.map((section) => (
                  <View
                    key={section.category}
                    onLayout={(event) => {
                      emojiCategoryOffsetsRef.current[section.category] = event.nativeEvent.layout.y;
                    }}
                    style={styles.emojiSection}
                  >
                    <View style={styles.emojiGrid}>
                      {section.emojis.map((item) => (
                        <Pressable key={item.id} style={styles.emojiItem} onPress={() => appendEmoji(item.emoji)}>
                          <Text style={styles.emojiText}>{item.emoji}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                ))}
                {!emojiSections.length ? <Text style={styles.emojiEmptyText}>No emoji found</Text> : null}
              </ScrollView>
              <View style={styles.emojiCategoryRail}>
                {EMOJI_CATEGORIES.map((category) => {
                  const active = emojiCategory === category;
                  return (
                    <Pressable
                      accessibilityLabel={EMOJI_CATEGORY_META[category].label}
                      accessibilityRole="button"
                      key={category}
                      style={[styles.emojiCategoryButton, active && styles.emojiCategoryButtonActive]}
                      onPress={() => handleEmojiCategoryPress(category)}
                    >
                      <Feather
                        name={EMOJI_CATEGORY_META[category].icon}
                        size={18}
                        color={active ? theme.colors.accent : theme.colors.textSecondary}
                      />
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          {pendingAttachments.length ? (
            <View style={styles.pendingAttachmentTray}>
              {pendingAttachments.map((attachment, index) => (
                <View key={`${attachment.name}-${index}`} style={styles.pendingAttachmentChip}>
                  <Feather name={getAttachmentInputIcon(attachment)} size={14} color={theme.colors.accent} />
                  <View style={styles.pendingAttachmentCopy}>
                    <Text numberOfLines={1} style={styles.pendingAttachmentName}>
                      {attachment.name}
                    </Text>
                    <Text numberOfLines={1} style={styles.pendingAttachmentMeta}>
                      {[attachment.mimeType, formatFileSize(attachment.sizeBytes)].filter(Boolean).join(' - ') || 'Attachment'}
                    </Text>
                  </View>
                  <Pressable accessibilityLabel={`Remove ${attachment.name}`} hitSlop={8} onPress={() => removePendingAttachment(index)}>
                    <Feather name="x" size={16} color={theme.colors.textSecondary} />
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}

          {recording ? (
            <View style={styles.recordingBar}>
              <View style={styles.recordingPulse} />
              <Text style={styles.recordingText}>Recording voice note</Text>
              <Text style={styles.recordingTime}>{formatRecordingDuration(recordingSeconds)}</Text>
              <Pressable style={styles.recordingCancel} onPress={() => cancelVoiceRecording().catch(() => undefined)}>
                <Feather name="x" size={16} color={theme.colors.textSecondary} />
              </Pressable>
            </View>
          ) : null}

          <View style={styles.composer}>
            <Pressable
              accessibilityLabel={emojiOpen ? 'Close emoji picker' : 'Open emoji picker'}
              accessibilityRole="button"
              disabled={!canWrite || Boolean(recording)}
              style={[styles.composerIconButton, emojiOpen && styles.composerIconButtonActive, (!canWrite || Boolean(recording)) && styles.sendButtonDisabled]}
              onPress={() => setEmojiOpen((current) => !current)}
            >
              <Feather name="smile" size={20} color={emojiOpen ? theme.colors.accent : theme.colors.textSecondary} />
            </Pressable>
            <Pressable
              accessibilityLabel="Attach file"
              accessibilityRole="button"
              disabled={!canWrite || Boolean(recording) || sendMessage.isPending || isAudioBusy}
              style={[
                styles.composerIconButton,
                hasPendingAttachments && styles.composerIconButtonActive,
                (!canWrite || Boolean(recording) || sendMessage.isPending || isAudioBusy) && styles.sendButtonDisabled,
              ]}
              onPress={() => {
                handlePickAttachment().catch(() => undefined);
              }}
            >
              <Feather name="paperclip" size={20} color={hasPendingAttachments ? theme.colors.accent : theme.colors.textSecondary} />
            </Pressable>
            <TextInput
              editable={canWrite && !recording}
              value={message}
              onChangeText={handleMessageChange}
              placeholder={
                canWrite
                  ? activeLane === 'internal'
                    ? 'Message freelancer'
                    : `Reply on ${getPlatformTitle(conversation)}`
                  : laneCapability?.reason || 'This lane is read only'
              }
              placeholderTextColor={theme.colors.mutedText}
              style={[styles.composerInput, WEB_TEXTAREA_RESET, message.includes('\n') && styles.composerInputMultiline]}
              multiline={Platform.OS !== 'web'}
              numberOfLines={Platform.OS === 'web' ? 1 : undefined}
              onFocus={() => {
                setEmojiOpen(false);
                shouldAutoScrollRef.current = true;
                scrollToLatestMessage(true);
              }}
              selectionColor={theme.colors.accent}
            />
            <Pressable
              accessibilityLabel={
                recording ? 'Stop and send voice note' : hasDraft || hasPendingAttachments ? 'Send message' : 'Record voice note'
              }
              accessibilityRole="button"
              disabled={!canWrite || sendMessage.isPending || isAudioBusy}
              style={[
                styles.sendButton,
                (hasDraft || hasPendingAttachments || recording) && canWrite && styles.sendButtonActive,
                (!canWrite || sendMessage.isPending || isAudioBusy) && styles.sendButtonDisabled,
                recording && styles.recordingSendButton,
              ]}
              onPress={() => {
                if (recording) {
                  stopAndSendVoiceRecording().catch(() => undefined);
                  return;
                }
                if (hasDraft || hasPendingAttachments) {
                  handleSend().catch(() => undefined);
                  return;
                }
                startVoiceRecording().catch(() => undefined);
              }}
            >
              <Feather name={recording ? 'square' : hasDraft || hasPendingAttachments ? 'send' : 'mic'} size={18} color={theme.colors.background} />
            </Pressable>
          </View>
        </View>

        <ModalSheet onClose={() => setActionsOpen(false)} title="Chat actions" visible={actionsOpen}>
          <ScrollView contentContainerStyle={styles.sheetScroll} showsHorizontalScrollIndicator={false} showsVerticalScrollIndicator={false}>
            <View style={styles.actionSummaryRow}>
              <View style={styles.actionSummaryItem}>
                <Text style={styles.infoLabel}>Owner</Text>
                <Text numberOfLines={1} style={styles.actionSummaryValue}>
                  {conversation?.ownerName || conversation?.assignmentSummary.ownerName || 'Queue'}
                </Text>
              </View>
              <View style={styles.actionSummaryItem}>
                <Text style={styles.infoLabel}>Editor</Text>
                <Text numberOfLines={1} style={styles.actionSummaryValue}>
                  {conversation?.assignedFreelancerName || conversation?.assignmentSummary.assignedFreelancerName || 'Unassigned'}
                </Text>
              </View>
            </View>

            {canManage ? (
              <Pressable
                style={styles.sheetActionRow}
                onPress={() => {
                  setActionsOpen(false);
                  setStatusOpen(true);
                }}
              >
                <Feather name="filter" size={18} color={theme.colors.accent} />
                <View style={styles.sheetActionCopy}>
                  <Text style={styles.sheetActionTitle}>Lead status</Text>
                  <Text style={styles.sheetActionMeta}>{conversation?.leadStatusLabel || conversation?.status || 'New'}</Text>
                </View>
                <Feather name="chevron-right" size={18} color={theme.colors.mutedText} />
              </Pressable>
            ) : null}

            {canManage ? (
              <Pressable
                style={styles.sheetActionRow}
                onPress={() => {
                  setActionsOpen(false);
                  setAssignOpen(true);
                }}
              >
                <Feather name="user-plus" size={18} color={theme.colors.accent} />
                <View style={styles.sheetActionCopy}>
                  <Text style={styles.sheetActionTitle}>Assign editor</Text>
                  <Text style={styles.sheetActionMeta}>{conversation?.assignmentSummary.assignedFreelancerName || 'Choose from live freelancer list'}</Text>
                </View>
                <Feather name="chevron-right" size={18} color={theme.colors.mutedText} />
              </Pressable>
            ) : null}

            {canManageCustomerAccess ? (
              <Pressable style={styles.sheetActionRow} onPress={handleToggleCustomerAccess}>
                <Feather name={conversation?.freelancerCustomerLanePermission?.enabled ? 'check-circle' : 'lock'} size={18} color={theme.colors.accent} />
                <View style={styles.sheetActionCopy}>
                  <Text style={styles.sheetActionTitle}>
                    {conversation?.freelancerCustomerLanePermission?.enabled ? 'Editor customer reply enabled' : 'Allow editor customer reply'}
                  </Text>
                  <Text style={styles.sheetActionMeta}>{conversation?.freelancerCustomerLanePermission?.transportNote || 'Controls freelancer access to customer lane.'}</Text>
                </View>
              </Pressable>
            ) : null}

            {canCreatePayment ? (
              <Pressable
                style={styles.sheetActionRow}
                onPress={() => {
                  setActionsOpen(false);
                  setPaymentOpen(true);
                }}
              >
                <Feather name="credit-card" size={18} color={theme.colors.accent} />
                <View style={styles.sheetActionCopy}>
                  <Text style={styles.sheetActionTitle}>Payment request</Text>
                  <Text style={styles.sheetActionMeta}>{payment ? `${payment.status} | ${formatCurrency(payment.amount)}` : 'Create PhonePe checkout link'}</Text>
                </View>
                <Feather name="chevron-right" size={18} color={theme.colors.mutedText} />
              </Pressable>
            ) : null}

            {payment ? (
              <View style={styles.inlineActionGroup}>
                {payment.paymentLink ? (
                  <Pressable style={styles.smallAction} onPress={() => void Linking.openURL(payment.paymentLink || '')}>
                    <Text style={styles.smallActionText}>Open payment link</Text>
                  </Pressable>
                ) : null}
                {(['Viewed', 'Paid'] as const).map((status) => (
                  <Pressable
                    key={status}
                    style={styles.smallAction}
                    onPress={() => markPayment.mutate({ conversationId, paymentRequestId: payment.id, status })}
                  >
                    <Text style={styles.smallActionText}>Mark {status}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

            <Pressable
              style={styles.sheetActionRow}
              onPress={() => {
                setActionsOpen(false);
                setDetailsOpen(true);
              }}
            >
              <Feather name="file-text" size={18} color={theme.colors.accent} />
              <View style={styles.sheetActionCopy}>
                <Text style={styles.sheetActionTitle}>Client details</Text>
                <Text style={styles.sheetActionMeta}>Customer, service, internal notes and latest payment.</Text>
              </View>
              <Feather name="chevron-right" size={18} color={theme.colors.mutedText} />
            </Pressable>
          </ScrollView>
        </ModalSheet>

        <DetailsSheet audience={audience} conversation={conversation ?? null} visible={detailsOpen} onClose={() => setDetailsOpen(false)} />
        <MessageOptionsSheet
          audience={audience}
          message={messageOptionsTarget}
          visible={Boolean(messageOptionsTarget)}
          onClose={() => setMessageOptionsTarget(null)}
          onCopy={(targetMessage) => {
            void handleCopyMessage(targetMessage);
          }}
          onDelete={handleDeleteForEveryone}
        />
        <StatusSheet
          activeId={conversation?.leadStatusId}
          isSaving={setLeadStatus.isPending}
          onClose={() => setStatusOpen(false)}
          onSelect={handleLeadStatus}
          statuses={threadQuery.leadStatuses}
          visible={statusOpen}
        />
        <AssignEditorSheet
          key={`${conversation?.id || 'conversation'}-${assignOpen ? 'open' : 'closed'}`}
          defaultProjectDetails={conversation?.internalNotes || conversation?.summary || conversation?.serviceTitle || ''}
          error={assignConversation.error}
          hasPrimaryEditor={Boolean(conversation?.assignmentSummary.assignedFreelancerId || conversation?.assignedFreelancerId)}
          isSaving={assignConversation.isPending}
          onAssign={handleAssign}
          onClose={() => setAssignOpen(false)}
          visible={assignOpen}
        />
        <InviteEditorSheet
          onClose={() => setInviteOpen(false)}
          visible={inviteOpen}
        />
        <PaymentSheet
          key={`${activeLane}-${paymentOpen ? 'open' : 'closed'}`}
          activeLane={activeLane}
          audience={audience}
          isSaving={createPayment.isPending}
          onClose={() => setPaymentOpen(false)}
          onSubmit={handleCreatePayment}
          projectTitle={conversation?.serviceTitle}
          visible={paymentOpen}
        />
        <UpgradePlanModal
          visible={showUpgradeModal}
          onClose={() => setShowUpgradeModal(false)}
          title="Freemium Assignment Limit"
          reason="Your 30-day Freemium workspace supports two distinct editors on active work. Upgrade to Agency Premium for unlimited editor assignments and operations managers."
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  keyboard: {
    flex: 1,
  },
  header: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderSubtle,
    backgroundColor: 'rgba(8,13,17,0.92)',
    paddingHorizontal: theme.spacing.md,
  },
  iconButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  headerAvatar: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: theme.colors.surfaceRaised,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  headerAvatarText: {
    color: theme.colors.accent,
    fontWeight: '900',
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  headerTitle: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  headerMeta: {
    color: theme.colors.mutedText,
    fontSize: 11,
    flex: 1,
  },
  headerMetaTyping: {
    color: theme.colors.accent,
  },
  headerStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 3,
    minWidth: 0,
  },
  presenceDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  presenceDotMuted: {
    backgroundColor: theme.colors.disabledText,
  },
  presenceDotOnline: {
    backgroundColor: theme.colors.success,
  },
  presenceDotTyping: {
    backgroundColor: theme.colors.accent,
  },
  headerActionButton: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 19,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  assignedFreelancerStrip: {
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderSubtle,
    backgroundColor: 'rgba(185,247,25,0.07)',
    paddingHorizontal: theme.spacing.md,
  },
  assignedFreelancerText: {
    flex: 1,
    color: theme.colors.textSecondary,
    fontSize: 11,
    fontWeight: '800',
  },
  error: {
    color: theme.colors.danger,
    fontSize: theme.typography.small,
    padding: theme.spacing.md,
  },
  threadTools: {
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    paddingBottom: theme.spacing.sm,
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  infoCard: {
    flexGrow: 1,
    flexBasis: '46%',
    gap: 4,
    padding: theme.spacing.sm,
  },
  infoLabel: {
    color: theme.colors.mutedText,
    fontSize: theme.typography.caption,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  infoValue: {
    color: theme.colors.text,
    fontSize: theme.typography.small,
    fontWeight: '900',
  },
  actionRow: {
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },
  actionChip: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing.md,
  },
  actionChipActive: {
    backgroundColor: theme.colors.accentSoft,
    borderColor: theme.colors.accentBorder,
  },
  actionChipDisabled: {
    opacity: 0.55,
  },
  actionChipText: {
    color: theme.colors.text,
    fontSize: theme.typography.caption,
    fontWeight: '900',
  },
  actionChipTextActive: {
    color: theme.colors.text,
  },
  paymentCard: {
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  paymentTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  paymentCopy: {
    flex: 1,
    minWidth: 0,
  },
  paymentTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.small,
    fontWeight: '900',
    marginTop: 3,
  },
  paymentAmount: {
    color: theme.colors.accent,
    fontSize: theme.typography.body,
    fontWeight: '900',
  },
  paymentNote: {
    color: theme.colors.mutedText,
    fontSize: theme.typography.caption,
    lineHeight: 16,
  },
  paymentActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  smallAction: {
    minHeight: 34,
    justifyContent: 'center',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.md,
  },
  smallActionText: {
    color: theme.colors.text,
    fontSize: theme.typography.caption,
    fontWeight: '900',
  },
  inlineActionGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  laneTabs: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: theme.spacing.md,
    paddingTop: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderSubtle,
    backgroundColor: 'rgba(5,7,10,0.86)',
  },
  laneTab: {
    flex: 1,
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 8,
    backgroundColor: 'rgba(17,25,32,0.82)',
  },
  laneTabActive: {
    backgroundColor: theme.colors.accentSoft,
    borderColor: theme.colors.accentBorder,
  },
  laneText: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: '800',
  },
  laneTextActive: {
    color: theme.colors.text,
  },
  laneTypingText: {
    color: theme.colors.accent,
    fontSize: 9,
    fontWeight: '900',
  },
  laneUnreadBadge: {
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
    backgroundColor: theme.colors.accentStrong,
    paddingHorizontal: 5,
  },
  laneUnreadText: {
    color: theme.colors.background,
    fontSize: 9,
    fontWeight: '900',
  },
  privateModeStrip: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderSubtle,
    backgroundColor: 'rgba(15,28,35,0.92)',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 9,
  },
  privateModeIcon: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    borderWidth: 1,
    borderColor: theme.colors.accentBorder,
    backgroundColor: theme.colors.accentSoft,
  },
  privateModeCopy: {
    flex: 1,
    gap: 2,
  },
  privateModeTitle: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '900',
  },
  privateModeText: {
    color: theme.colors.textSecondary,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
  },
  privateModeToggle: {
    width: 42,
    height: 24,
    alignItems: 'flex-end',
    justifyContent: 'center',
    borderRadius: 999,
    backgroundColor: theme.colors.accent,
    paddingHorizontal: 3,
  },
  privateModeToggleOff: {
    alignItems: 'flex-start',
    backgroundColor: theme.colors.surfaceRaised,
  },
  privateModeKnob: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: theme.colors.background,
  },
  laneNotice: {
    color: theme.colors.warning,
    fontSize: theme.typography.caption,
    lineHeight: 16,
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  offerCard: {
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
    gap: theme.spacing.sm,
  },
  offerHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  offerCountdown: {
    color: theme.colors.accent,
    fontSize: theme.typography.body,
    fontWeight: '900',
  },
  offerTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.body,
    fontWeight: '900',
  },
  offerBody: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.caption,
    lineHeight: 18,
  },
  offerRejectInput: {
    minHeight: 74,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    color: theme.colors.text,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    textAlignVertical: 'top',
  },
  offerDecisionBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.lg,
  },
  offerDecisionScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.58)',
  },
  offerDecisionCard: {
    width: '100%',
    maxWidth: 420,
    overflow: 'hidden',
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.accentBorder,
    backgroundColor: 'rgba(13, 19, 24, 0.92)',
    padding: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  offerDecisionIcon: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 23,
    borderWidth: 1,
    borderColor: theme.colors.accentBorder,
    backgroundColor: theme.colors.accentSoft,
  },
  offerDecisionTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.section,
    fontWeight: '900',
  },
  offerDecisionBody: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.caption,
    lineHeight: 18,
  },
  offerDecisionInput: {
    minHeight: 104,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: 'rgba(5, 7, 10, 0.72)',
    color: theme.colors.text,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    textAlignVertical: 'top',
  },
  offerDecisionActions: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  offerDecisionButton: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceRaised,
  },
  offerDecisionPrimaryButton: {
    borderColor: theme.colors.accentBorder,
    backgroundColor: theme.colors.accent,
  },
  offerDecisionCancelText: {
    color: theme.colors.text,
    fontSize: theme.typography.small,
    fontWeight: '900',
  },
  offerDecisionPrimaryText: {
    color: theme.colors.background,
    fontSize: theme.typography.small,
    fontWeight: '900',
  },
  offerActions: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  offerButton: {
    flex: 1,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  offerButtonPrimary: {
    borderColor: theme.colors.accentBorder,
    backgroundColor: theme.colors.accent,
  },
  offerButtonText: {
    color: theme.colors.text,
    fontWeight: '900',
  },
  offerButtonPrimaryText: {
    color: theme.colors.background,
    fontWeight: '900',
  },
  typingNotice: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.accentBorder,
    backgroundColor: theme.colors.accentSoft,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 6,
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.xs,
    marginBottom: theme.spacing.xs,
  },
  typingDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: theme.colors.accent,
  },
  typingNoticeText: {
    color: theme.colors.text,
    fontSize: theme.typography.caption,
    fontWeight: '800',
  },
  composerStatus: {
    color: theme.colors.warning,
    fontSize: theme.typography.caption,
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.xs,
  },
  messageList: {
    flex: 1,
  },
  messages: {
    flexGrow: 1,
    justifyContent: 'flex-start',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.md,
  },
  messagesWithComposerInset: {
    paddingBottom: 168,
  },
  messagesEmpty: {
    justifyContent: 'center',
  },
  newMessageAnchor: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  newMessageButton: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.accentBorder,
    backgroundColor: theme.colors.accent,
    paddingHorizontal: 12,
  },
  newMessageText: {
    color: theme.colors.background,
    fontSize: 11,
    fontWeight: '900',
  },
  dayDivider: {
    alignSelf: 'center',
    borderRadius: 999,
    backgroundColor: theme.colors.surfaceSoft,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 5,
    marginBottom: theme.spacing.sm,
  },
  dayDividerText: {
    color: theme.colors.mutedText,
    fontSize: theme.typography.caption,
    fontWeight: '800',
  },
  bubbleWrap: {
    alignItems: 'flex-start',
  },
  bubbleWrapMine: {
    alignItems: 'flex-end',
  },
  bubble: {
    maxWidth: '84%',
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.chatIncomingBorder,
    backgroundColor: theme.colors.chatIncomingBg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    gap: 5,
  },
  bubbleMine: {
    borderColor: theme.colors.chatOutgoingBorder,
    backgroundColor: theme.colors.chatOutgoingBg,
  },
  bubbleInternal: {
    borderColor: theme.colors.borderSubtle,
  },
  bubbleTopLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  bubbleSender: {
    color: theme.colors.textSecondary,
    fontSize: 10,
    fontWeight: '900',
  },
  bubbleSenderMine: {
    color: theme.colors.text,
  },
  internalBadge: {
    overflow: 'hidden',
    borderRadius: 999,
    backgroundColor: theme.colors.accentSoft,
    color: theme.colors.accent,
    fontSize: 9,
    fontWeight: '900',
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  bubbleText: {
    color: theme.colors.chatIncomingText,
    fontSize: theme.typography.small,
    lineHeight: 19,
  },
  bubbleTextMine: {
    color: theme.colors.chatOutgoingText,
  },
  deletedMessageText: {
    color: theme.colors.mutedText,
    fontStyle: 'italic',
    fontWeight: '700',
  },
  bubbleMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: theme.spacing.xs,
  },
  bubbleMeta: {
    color: theme.colors.mutedText,
    fontSize: 9,
    fontWeight: '800',
  },
  bubbleMetaMine: {
    color: theme.colors.mutedText,
  },
  deliveryStatus: {
    minWidth: 20,
    height: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  deliveryStatusRead: {
    minWidth: 22,
  },
  deliverySecondCheck: {
    marginLeft: -8,
  },
  deliveryFailed: {
    color: theme.colors.danger,
  },
  attachmentList: {
    gap: 7,
  },
  attachmentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    minWidth: 214,
    minHeight: 54,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(5,7,10,0.36)',
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  attachmentDisabled: {
    opacity: 0.65,
  },
  attachmentIconBox: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.accentBorder,
    backgroundColor: theme.colors.accentSoft,
  },
  attachmentCopy: {
    flex: 1,
    minWidth: 0,
  },
  attachmentTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.caption,
    fontWeight: '900',
  },
  attachmentMeta: {
    color: theme.colors.mutedText,
    fontSize: 10,
    marginTop: 2,
  },
  imageAttachmentCard: {
    overflow: 'hidden',
    width: 228,
    maxWidth: '100%',
    aspectRatio: 1.18,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(5,7,10,0.42)',
  },
  imageAttachmentPreview: {
    width: '100%',
    height: '100%',
    backgroundColor: theme.colors.surfaceRaised,
  },
  imageAttachmentOverlay: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 8,
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 14,
    backgroundColor: 'rgba(5,7,10,0.72)',
    paddingHorizontal: 9,
  },
  imageAttachmentName: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 11,
    fontWeight: '800',
  },
  voiceAttachmentCard: {
    minWidth: 236,
    maxWidth: '100%',
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    backgroundColor: 'rgba(5,7,10,0.34)',
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  voiceAttachmentCardMine: {
    borderColor: theme.colors.accentBorder,
    backgroundColor: 'rgba(5,7,10,0.22)',
  },
  voicePlayButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: theme.colors.accentMuted,
  },
  voicePlayButtonActive: {
    backgroundColor: theme.colors.accent,
  },
  voiceWaveform: {
    height: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  voiceWaveBar: {
    width: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(184,194,204,0.5)',
  },
  voiceWaveBarActive: {
    backgroundColor: theme.colors.accent,
  },
  voiceMetaBlock: {
    flex: 1,
    minWidth: 0,
  },
  voiceTitle: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '900',
  },
  voiceMeta: {
    color: theme.colors.mutedText,
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
  },
  videoAttachmentCard: {
    borderColor: 'rgba(185,247,25,0.12)',
  },
  videoAttachmentIconBox: {
    backgroundColor: 'rgba(185,247,25,0.08)',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: theme.spacing.xxl,
  },
  emptyTitle: {
    color: theme.colors.mutedText,
    fontSize: theme.typography.small,
  },
  emojiPanel: {
    height: EMOJI_PANEL_HEIGHT,
    overflow: 'hidden',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    backgroundColor: 'rgba(13,19,24,0.96)',
    marginBottom: 10,
  },
  emojiSearchRow: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 14,
  },
  emojiSearchInput: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 14,
    paddingVertical: 0,
    includeFontPadding: false,
  },
  recentEmojiStrip: {
    maxHeight: 44,
    flexGrow: 0,
    flexShrink: 0,
  },
  recentEmojiRow: {
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  recentEmojiButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  recentEmojiText: {
    fontSize: 19,
    lineHeight: 24,
  },
  emojiScroll: {
    flex: 1,
  },
  emojiScrollContent: {
    paddingHorizontal: 8,
    paddingTop: 4,
    paddingBottom: 18,
  },
  emojiSection: {
    paddingBottom: 6,
  },
  emojiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignContent: 'flex-start',
    justifyContent: 'flex-start',
  },
  emojiItem: {
    width: '12.5%',
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
  },
  emojiText: {
    fontSize: 24,
    lineHeight: 30,
  },
  emojiEmptyText: {
    color: theme.colors.mutedText,
    fontSize: theme.typography.caption,
    paddingVertical: theme.spacing.lg,
    textAlign: 'center',
  },
  emojiCategoryRail: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  emojiCategoryButton: {
    width: 38,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
  },
  emojiCategoryButtonActive: {
    borderWidth: 1,
    borderColor: theme.colors.accentBorder,
    backgroundColor: theme.colors.accentSoft,
  },
  composerDock: {
    borderTopWidth: 0,
    backgroundColor: 'transparent',
    paddingHorizontal: theme.spacing.md,
    paddingTop: 8,
  },
  pendingAttachmentTray: {
    gap: 7,
    marginBottom: 8,
  },
  pendingAttachmentChip: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    backgroundColor: 'rgba(13,19,24,0.92)',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  pendingAttachmentCopy: {
    flex: 1,
    minWidth: 0,
  },
  pendingAttachmentName: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '900',
  },
  pendingAttachmentMeta: {
    color: theme.colors.mutedText,
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
  },
  recordingBar: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.22)',
    backgroundColor: 'rgba(239,68,68,0.08)',
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  recordingPulse: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: theme.colors.danger,
  },
  recordingText: {
    flex: 1,
    color: theme.colors.text,
    fontSize: theme.typography.caption,
    fontWeight: '800',
  },
  recordingTime: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.caption,
    fontWeight: '900',
  },
  recordingCancel: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    backgroundColor: 'rgba(13,19,24,0.92)',
    padding: 6,
  },
  composerIconButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 21,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  composerIconButtonActive: {
    borderColor: theme.colors.accentBorder,
    backgroundColor: theme.colors.accentSoft,
  },
  composerInput: {
    flex: 1,
    height: Platform.OS === 'web' ? 46 : undefined,
    maxHeight: 104,
    minHeight: 46,
    borderRadius: 22,
    borderWidth: 0,
    backgroundColor: 'transparent',
    color: theme.colors.text,
    paddingHorizontal: 6,
    paddingTop: Platform.OS === 'web' ? 0 : 10,
    paddingBottom: Platform.OS === 'web' ? 0 : 10,
    fontSize: 15,
    lineHeight: Platform.OS === 'web' ? 46 : 20,
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
  composerInputMultiline: {
    textAlignVertical: 'top',
  },
  sendButton: {
    width: 48,
    height: 48,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(185,247,25,0.18)',
    backgroundColor: 'rgba(107,143,22,0.78)',
  },
  sendButtonActive: {
    borderColor: 'rgba(185,247,25,0.42)',
    backgroundColor: theme.colors.accent,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  recordingSendButton: {
    borderColor: 'rgba(239,68,68,0.35)',
    backgroundColor: 'rgba(239,68,68,0.92)',
  },
  optionsBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.68)',
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.md,
  },
  optionsSheet: {
    overflow: 'hidden',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: 'rgba(13,19,24,0.98)',
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.md,
    shadowColor: theme.colors.background,
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.24,
    shadowRadius: 20,
    elevation: 16,
  },
  optionsGrabber: {
    alignSelf: 'center',
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.16)',
    marginBottom: theme.spacing.sm,
  },
  optionsHeader: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  optionsTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.section,
    fontWeight: '900',
  },
  optionsClose: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  optionsPreview: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.small,
    lineHeight: 19,
    marginBottom: theme.spacing.sm,
  },
  optionsActions: {
    gap: theme.spacing.sm,
  },
  optionsAction: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    backgroundColor: theme.colors.surfaceSoft,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  optionsDangerAction: {
    borderColor: 'rgba(239,68,68,0.18)',
    backgroundColor: 'rgba(239,68,68,0.08)',
  },
  optionsActionDisabled: {
    opacity: 0.55,
  },
  optionsIconBox: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.accentBorder,
    backgroundColor: theme.colors.accentSoft,
  },
  optionsDangerIconBox: {
    borderColor: 'rgba(239,68,68,0.22)',
    backgroundColor: 'rgba(239,68,68,0.12)',
  },
  optionsActionCopy: {
    flex: 1,
    minWidth: 0,
  },
  optionsActionTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.small,
    fontWeight: '900',
  },
  optionsDangerText: {
    color: theme.colors.danger,
  },
  optionsActionMeta: {
    color: theme.colors.mutedText,
    fontSize: theme.typography.caption,
    lineHeight: 16,
    marginTop: 2,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.62)',
  },
  modalSheet: {
    maxHeight: '82%',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
    paddingBottom: theme.spacing.md,
  },
  modalHead: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    paddingHorizontal: theme.spacing.md,
  },
  modalTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.title,
    fontWeight: '900',
  },
  modalClose: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 21,
  },
  sheetScroll: {
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
  },
  actionSummaryRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  actionSummaryItem: {
    flex: 1,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.sm,
    gap: 4,
  },
  actionSummaryValue: {
    color: theme.colors.text,
    fontSize: theme.typography.small,
    fontWeight: '900',
  },
  sheetActionRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.md,
  },
  sheetActionCopy: {
    flex: 1,
    minWidth: 0,
  },
  sheetActionTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.small,
    fontWeight: '900',
  },
  sheetActionMeta: {
    color: theme.colors.mutedText,
    fontSize: theme.typography.caption,
    lineHeight: 16,
    marginTop: 3,
  },
  sheetCard: {
    gap: 5,
  },
  sheetCardTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.small,
    fontWeight: '900',
  },
  sheetCardValue: {
    color: theme.colors.mutedText,
    fontSize: theme.typography.caption,
    lineHeight: 16,
  },
  pickerRow: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.sm,
  },
  pickerRowActive: {
    borderColor: theme.colors.accentBorder,
    backgroundColor: theme.colors.accentSoft,
  },
  pickerRowDisabled: {
    opacity: 0.52,
  },
  pickerRowCopy: {
    flex: 1,
    minWidth: 0,
  },
  pickerTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.small,
    fontWeight: '900',
  },
  pickerMeta: {
    color: theme.colors.mutedText,
    fontSize: theme.typography.caption,
    lineHeight: 16,
    marginTop: 3,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.colors.accent,
  },
  statusWarning: {
    backgroundColor: theme.colors.warning,
  },
  statusSuccess: {
    backgroundColor: theme.colors.success,
  },
  sheetSearch: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    paddingHorizontal: theme.spacing.md,
  },
  sheetSearchInput: {
    flex: 1,
    color: theme.colors.text,
    fontSize: theme.typography.body,
  },
  assignmentDetailsInput: {
    minHeight: 104,
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.accentBorder,
    backgroundColor: 'rgba(5, 7, 10, 0.68)',
    color: theme.colors.text,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    textAlignVertical: 'top',
  },
  assignSourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
  },
  assignSourceButton: {
    minHeight: 38,
    justifyContent: 'center',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.md,
  },
  assignSourceButtonActive: {
    borderColor: theme.colors.accentBorder,
    backgroundColor: theme.colors.accentSoft,
  },
  assignSourceText: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.caption,
    fontWeight: '900',
  },
  assignSourceTextActive: {
    color: theme.colors.accent,
  },
  onlineFilter: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: 'auto',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.sm,
  },
  onlineFilterText: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.caption,
    fontWeight: '800',
  },
  assignScopeCopy: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.caption,
    lineHeight: 17,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
  },
  editorProofText: {
    color: theme.colors.accent,
    fontSize: 10,
    fontWeight: '800',
    marginTop: 3,
  },
  editorStatusColumn: {
    alignItems: 'flex-end',
    gap: 4,
  },
  editorSourceLabel: {
    color: theme.colors.textSecondary,
    fontSize: 9,
    fontWeight: '900',
  },
  editorPresenceText: {
    color: theme.colors.mutedText,
    fontSize: 9,
    fontWeight: '800',
  },
  editorPresenceOnline: {
    color: theme.colors.success,
  },
  assignEmptyState: {
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  assignDirectoryButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.accentBorder,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  assignDirectoryButtonText: {
    color: theme.colors.accent,
    fontSize: theme.typography.caption,
    fontWeight: '900',
  },
  assignFooter: {
    gap: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    padding: theme.spacing.md,
  },
  assignSelectedText: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.caption,
    fontWeight: '800',
  },
  assignFooterActions: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  assignSecondaryButton: {
    minHeight: 48,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.accentBorder,
    paddingHorizontal: theme.spacing.sm,
  },
  assignSecondaryButtonText: {
    color: theme.colors.text,
    fontSize: theme.typography.caption,
    fontWeight: '900',
  },
  assignOfferButton: {
    flex: 1,
  },
  editorAvatar: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: theme.colors.surfaceRaised,
  },
  editorAvatarText: {
    color: theme.colors.accent,
    fontSize: theme.typography.caption,
    fontWeight: '900',
  },
  emptyInline: {
    color: theme.colors.mutedText,
    fontSize: theme.typography.small,
    padding: theme.spacing.md,
    textAlign: 'center',
  },
  sheetInput: {
    minHeight: 48,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    color: theme.colors.text,
    paddingHorizontal: theme.spacing.md,
    fontSize: theme.typography.body,
  },
  sheetTextArea: {
    minHeight: 96,
    paddingTop: theme.spacing.sm,
    textAlignVertical: 'top',
  },
  sheetHint: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.small,
    lineHeight: 19,
  },
  aliasEditor: {
    gap: theme.spacing.sm,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    backgroundColor: 'rgba(255,255,255,0.03)',
    padding: theme.spacing.md,
  },
  aliasStatus: {
    color: theme.colors.accent,
    fontSize: theme.typography.caption,
    fontWeight: '800',
  },
  paymentProjectBox: {
    gap: 4,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    backgroundColor: 'rgba(255,255,255,0.03)',
    padding: theme.spacing.md,
  },
  paymentProjectTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.small,
    fontWeight: '900',
  },
  sheetPrimaryButton: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.accent,
    paddingHorizontal: theme.spacing.md,
  },
  sheetPrimaryText: {
    color: theme.colors.background,
    fontSize: theme.typography.small,
    fontWeight: '900',
  },

  // Freelancer Lane Action Bar
  freelancerLaneBar: {
    backgroundColor: 'rgba(185,247,25,0.06)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(185,247,25,0.15)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  freelancerLaneInfo: {
    flex: 1,
    marginRight: 8,
  },
  freelancerPrivacyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  freelancerPrivacyBadgeText: {
    color: '#4ADE80',
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  freelancerLaneNoticeText: {
    color: theme.colors.textSecondary,
    fontSize: 11,
    marginTop: 2,
  },
  freelancerLaneActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  freelancerLaneBtnPrimary: {
    backgroundColor: theme.colors.accent,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  freelancerLaneBtnPrimaryText: {
    color: '#0B1118',
    fontWeight: '800',
    fontSize: 12,
  },
  freelancerLaneBtnSecondary: {
    backgroundColor: theme.colors.surfaceRaised,
    borderColor: theme.colors.border,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  freelancerLaneBtnSecondaryText: {
    color: theme.colors.text,
    fontWeight: '700',
    fontSize: 12,
  },

  // Freelancer Empty Card
  freelancerEmptyCard: {
    backgroundColor: '#0E1715',
    borderColor: '#1D3B2B',
    borderWidth: 1.5,
    borderRadius: 18,
    padding: 20,
    marginHorizontal: 16,
    marginVertical: 24,
    alignItems: 'center',
    gap: 12,
  },
  freelancerEmptyIconWrap: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#163323',
    alignItems: 'center',
    justifyContent: 'center',
  },
  freelancerEmptyTitle: {
    color: '#F3F4F6',
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
  },
  freelancerEmptyDesc: {
    color: '#9CA3AF',
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  freelancerPrivacyPoints: {
    backgroundColor: 'rgba(22,51,35,0.45)',
    borderColor: 'rgba(74,222,128,0.15)',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    width: '100%',
    gap: 8,
  },
  freelancerPointRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  freelancerPointText: {
    color: '#D1D5DB',
    fontSize: 12,
    flex: 1,
  },
  freelancerEmptyActions: {
    width: '100%',
    gap: 8,
    marginTop: 4,
  },
  freelancerEmptyPrimaryBtn: {
    backgroundColor: theme.colors.accent,
    paddingVertical: 12,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  freelancerEmptyPrimaryBtnText: {
    color: '#0B1118',
    fontWeight: '800',
    fontSize: 14,
  },
  freelancerEmptySecondaryBtn: {
    backgroundColor: '#162820',
    borderColor: '#264A35',
    borderWidth: 1,
    paddingVertical: 11,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  freelancerEmptySecondaryBtnText: {
    color: '#4ADE80',
    fontWeight: '700',
    fontSize: 13,
  },

  // Invite Sheet Body
  inviteSheetBody: {
    padding: 16,
    gap: 14,
  },
  inviteShieldBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#163323',
    padding: 12,
    borderRadius: 12,
  },
  inviteShieldText: {
    color: '#4ADE80',
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
    lineHeight: 16,
  },
  inviteSectionTitle: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  inviteMessageBox: {
    backgroundColor: theme.colors.surfaceRaised,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  inviteMessageText: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  inviteActionButtons: {
    gap: 8,
    marginTop: 6,
  },
  invitePrimaryBtn: {
    backgroundColor: '#25D366',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
  },
  invitePrimaryBtnText: {
    color: '#0B1118',
    fontWeight: '800',
    fontSize: 14,
  },
  inviteSecondaryBtn: {
    backgroundColor: theme.colors.surfaceRaised,
    borderColor: theme.colors.border,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
  },
  inviteSecondaryBtnText: {
    color: theme.colors.text,
    fontWeight: '700',
    fontSize: 13,
  },
});
