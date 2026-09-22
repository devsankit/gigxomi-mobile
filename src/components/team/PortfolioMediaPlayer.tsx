import { useEffect, useRef, useState } from 'react';
import { journey } from '@/src/lib/journey-runtime';
import {
  ActivityIndicator,
  AppState,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { Video, ResizeMode } from 'expo-av';
import { WebView } from 'react-native-webview';
import { Feather } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { AppButton } from '@/src/components/AppButton';
import { theme } from '@/src/constants/theme';
import { PORTFOLIO_PLAYER_ORIGIN, resolvePortfolioMedia, youtubePortfolioHtml } from '@/src/lib/portfolio-media';

export function PortfolioMediaPlayer({ url }: { url: string }) {
  useEffect(() => { void journey.track('editor.portfolio_opened'); }, [url]);
  const focused = useIsFocused();
  const [foreground, setForeground] = useState(AppState.currentState === 'active');

  useEffect(() => {
    const listener = AppState.addEventListener('change', state => setForeground(state === 'active'));
    return () => listener.remove();
  }, []);

  return foreground && focused ? (
    <Player key={url} url={url} />
  ) : (
    <View style={[s.paused, { height: 220 }]}>
      <Text style={s.copy}>Portfolio paused while you’re away.</Text>
    </View>
  );
}

function Player({ url }: { url: string }) {
  const observedPlay = useRef(false);
  function onPlay() {
    if (!observedPlay.current) {
      observedPlay.current = true;
      void journey.track('editor.portfolio_played');
    }
  }

  const { width } = useWindowDimensions();
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);

  const media = resolvePortfolioMedia(url);
  const kind = media?.kind;

  // Detect 9:16 vertical / reel format:
  // 1. Instagram reels, YouTube shorts, TikTok
  // 2. URLs containing reel, shorts, vertical, 9_16, 9-16
  const isReelUrl = Boolean(
    kind === 'instagram' ||
    url.includes('/shorts/') ||
    url.includes('/reel/') ||
    url.includes('reels') ||
    /(\b|_)(reel|reels|short|shorts|vertical|tiktok|9_16|9-16)(\b|_|\.|\/)/i.test(url)
  );

  const [aspectRatioMode, setAspectRatioMode] = useState<'landscape' | 'vertical'>(
    isReelUrl ? 'vertical' : 'landscape'
  );

  useEffect(() => {
    if (loaded || failed || !kind || kind === 'drive_folder') return;
    const timer = setTimeout(() => setFailed(true), 25000);
    return () => clearTimeout(timer);
  }, [loaded, failed, attempt, kind]);

  function retry() {
    setLoaded(false);
    setFailed(false);
    setAttempt(value => value + 1);
  }

  async function handleCopy() {
    await Clipboard.setStringAsync(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // Responsive heights: 16:9 Landscape vs 9:16 Vertical Reel
  const landscapeHeight = Math.max(220, Math.min(440, ((width - 32) * 9) / 16));
  const verticalHeight = Math.min(520, Math.max(380, Math.round(((width - 32) * 16) / 9 * 0.85)));
  const height = aspectRatioMode === 'vertical' ? verticalHeight : landscapeHeight;

  if (!media) {
    return (
      <View style={s.feedback}>
        <Text style={s.title}>This portfolio link is unavailable</Text>
        <Text style={s.copy}>Choose another sample or view the editor’s profile.</Text>
      </View>
    );
  }

  // 1. Google Drive Folder: Dedicated native card matching super-admin
  if (media.kind === 'drive_folder') {
    return (
      <View style={s.driveCard}>
        <View style={s.driveHeaderRow}>
          <View style={s.driveIconBox}>
            <Feather name="folder" size={28} color="#4ADE80" />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <View style={s.driveBadgeRow}>
              <View style={s.driveBadge}>
                <Text style={s.driveBadgeText}>Google Drive</Text>
              </View>
              <Text style={s.driveTag}>Folder Showcase</Text>
            </View>
            <Text style={s.driveTitle}>Google Drive Portfolio Folder</Text>
          </View>
        </View>

        <Text style={s.driveDesc}>
          This editor submitted a Google Drive folder containing showreels, raw edits, and portfolio files. Tap below to preview the folder in Google Drive.
        </Text>

        <View style={s.driveActionRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open Google Drive folder"
            onPress={() => Linking.openURL(media.url)}
            style={s.driveOpenBtn}
          >
            <Feather name="external-link" size={17} color="#0B1118" />
            <Text style={s.driveOpenBtnText}>Open Google Drive ↗</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Copy Drive link"
            onPress={handleCopy}
            style={s.driveCopyBtn}
          >
            <Feather name={copied ? 'check' : 'copy'} size={16} color={copied ? '#4ADE80' : theme.colors.text} />
            <Text style={[s.driveCopyBtnText, copied && { color: '#4ADE80' }]}>
              {copied ? 'Copied!' : 'Copy'}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // 2. Video host playback failed (e.g. YouTube Error 152 / embed restriction)
  if (failed) {
    return (
      <View style={s.feedback}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Feather name="alert-circle" size={20} color="#FBBF24" />
          <Text style={s.title}>Playback restricted in in-app view</Text>
        </View>
        <Text style={s.copy}>
          The video host restricts embedding inside third-party mobile webviews. You can watch it directly without any restrictions.
        </Text>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
          <Pressable
            onPress={() => Linking.openURL(media.url)}
            style={[s.driveOpenBtn, { flex: 1 }]}
          >
            <Feather name="external-link" size={16} color="#0B1118" />
            <Text style={s.driveOpenBtnText}>Watch Video ↗</Text>
          </Pressable>
          <Pressable onPress={handleCopy} style={s.driveCopyBtn}>
            <Feather name={copied ? 'check' : 'copy'} size={16} color={copied ? '#4ADE80' : theme.colors.text} />
            <Text style={[s.driveCopyBtnText, copied && { color: '#4ADE80' }]}>
              {copied ? 'Copied!' : 'Copy Link'}
            </Text>
          </Pressable>
          <AppButton title="Retry" onPress={retry} />
        </View>
      </View>
    );
  }

  // 3. Media Player (YouTube / Drive File / Direct MP4 / Instagram / Vimeo / Loom)
  return (
    <View style={s.container}>
      <View style={{ height, borderRadius: 16, overflow: 'hidden', backgroundColor: '#000' }}>
        {media.kind === 'direct' ? (
          <Video
            key={`${attempt}-${aspectRatioMode}`}
            accessibilityLabel="Portfolio video player"
            source={{ uri: media.url }}
            style={s.video}
            useNativeControls
            resizeMode={ResizeMode.CONTAIN}
            onReadyForDisplay={(event) => {
              setLoaded(true);
              const { width: vw, height: vh } = event.naturalSize ?? {};
              if (vh && vw && vh > vw) {
                setAspectRatioMode('vertical');
              }
            }}
            onLoad={() => setLoaded(true)}
            onPlaybackStatusUpdate={status => {
              if (status.isLoaded && status.isPlaying) onPlay();
            }}
            onError={() => setFailed(true)}
          />
        ) : (
          <WebView
            key={attempt}
            style={s.video}
            originWhitelist={['https://*', 'http://*']}
            allowsFullscreenVideo
            allowsInlineMediaPlayback
            javaScriptEnabled
            domStorageEnabled
            mediaPlaybackRequiresUserAction={false}
            userAgent="Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
            source={
              media.kind === 'youtube'
                ? { html: youtubePortfolioHtml(media.videoId), baseUrl: PORTFOLIO_PLAYER_ORIGIN }
                : media.kind === 'drive_file'
                ? { uri: media.embedUrl }
                : media.kind === 'instagram'
                ? { uri: media.embedUrl }
                : media.kind === 'loom'
                ? { uri: media.embedUrl }
                : (media as any).embedUrl
                ? { uri: (media as any).embedUrl }
                : { uri: media.url }
            }
            onLoadEnd={() => setLoaded(true)}
            onMessage={event => {
              if (media.kind !== 'youtube') return;
              try {
                const message = JSON.parse(event.nativeEvent.data);
                if (message.kind === 'ready') setLoaded(true);
                if (message.kind === 'playing') onPlay();
                if (message.kind === 'error') setFailed(true);
              } catch {
                /* Ignore */
              }
            }}
            onError={() => setFailed(true)}
            onHttpError={() => setFailed(true)}
          />
        )}
      </View>

      {!loaded ? (
        <View accessibilityLiveRegion="polite" style={s.loading}>
          <ActivityIndicator color={theme.colors.accent} />
          <Text style={s.copy}>Loading {media.platformTitle}…</Text>
        </View>
      ) : null}

      {/* Aspect Ratio Display Mode Toggle (Detects 9:16 Reels & provides 1-tap view switch) */}
      <View style={s.ratioRow}>
        <Text style={s.ratioLabel}>Display size:</Text>
        <View style={s.ratioControls}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Switch to 16:9 Landscape"
            onPress={() => setAspectRatioMode('landscape')}
            style={[s.ratioBtn, aspectRatioMode === 'landscape' && s.ratioBtnActive]}
          >
            <Feather name="maximize-2" size={11} color={aspectRatioMode === 'landscape' ? '#000' : theme.colors.textSecondary} />
            <Text style={[s.ratioBtnText, aspectRatioMode === 'landscape' && s.ratioBtnTextActive]}>16:9 Landscape</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Switch to 9:16 Reel view"
            onPress={() => setAspectRatioMode('vertical')}
            style={[s.ratioBtn, aspectRatioMode === 'vertical' && s.ratioBtnActive]}
          >
            <Feather name="smartphone" size={11} color={aspectRatioMode === 'vertical' ? '#000' : theme.colors.textSecondary} />
            <Text style={[s.ratioBtnText, aspectRatioMode === 'vertical' && s.ratioBtnTextActive]}>9:16 Reel View</Text>
          </Pressable>
        </View>
      </View>

      {/* Always-visible Submitted Link Bar matching super-admin */}
      <View style={s.linkBar}>
        <View style={s.linkInfo}>
          <View style={s.platformPill}>
            <Text style={s.platformPillText}>{media.platformTitle}</Text>
          </View>
          <Text numberOfLines={1} style={s.linkUrlText}>
            {media.url}
          </Text>
        </View>
        <View style={s.linkBarActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Copy submitted link"
            onPress={handleCopy}
            style={s.linkBarBtn}
          >
            <Feather name={copied ? 'check' : 'copy'} size={14} color={copied ? '#4ADE80' : theme.colors.textSecondary} />
            <Text style={[s.linkBarBtnText, copied && { color: '#4ADE80' }]}>
              {copied ? 'Copied' : 'Copy'}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open submitted link externally"
            onPress={() => Linking.openURL(media.url)}
            style={[s.linkBarBtn, s.linkBarBtnPrimary]}
          >
            <Feather name="external-link" size={14} color={theme.colors.accent} />
            <Text style={[s.linkBarBtnText, { color: theme.colors.accent, fontWeight: '700' }]}>
              Open ↗
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { gap: 10 },
  video: { flex: 1, width: '100%', backgroundColor: '#000' },
  ratioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  ratioLabel: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  ratioControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ratioBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 7,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  ratioBtnActive: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  ratioBtnText: {
    color: theme.colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
  },
  ratioBtnTextActive: {
    color: '#000',
    fontWeight: '800',
  },
  feedback: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    gap: 10,
  },
  title: { color: theme.colors.text, fontWeight: '800', fontSize: 16 },
  copy: { color: theme.colors.textSecondary, fontSize: 13, lineHeight: 19 },
  loading: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  paused: { backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },

  // Dedicated Google Drive Folder Card
  driveCard: {
    backgroundColor: '#0E1715',
    borderColor: '#1D3B2B',
    borderWidth: 1.5,
    borderRadius: 18,
    padding: 18,
    gap: 14,
  },
  driveHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  driveIconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#163323',
    alignItems: 'center',
    justifyContent: 'center',
  },
  driveBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  driveBadge: {
    backgroundColor: '#1D4530',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  driveBadgeText: {
    color: '#4ADE80',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  driveTag: {
    color: theme.colors.mutedText,
    fontSize: 12,
  },
  driveTitle: {
    color: '#F3F4F6',
    fontSize: 16,
    fontWeight: '800',
  },
  driveDesc: {
    color: '#9CA3AF',
    fontSize: 13,
    lineHeight: 19,
  },
  driveActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 2,
  },
  driveOpenBtn: {
    flex: 1,
    backgroundColor: '#4ADE80',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  driveOpenBtnText: {
    color: '#0B1118',
    fontWeight: '800',
    fontSize: 14,
  },
  driveCopyBtn: {
    backgroundColor: '#1A2922',
    borderColor: '#264A35',
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  driveCopyBtnText: {
    color: theme.colors.text,
    fontWeight: '700',
    fontSize: 13,
  },

  // Link bar styles
  linkBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  linkInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  platformPill: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
  },
  platformPillText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '700',
  },
  linkUrlText: {
    flex: 1,
    color: theme.colors.mutedText,
    fontSize: 12,
  },
  linkBarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  linkBarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#1E293B',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
  },
  linkBarBtnPrimary: {
    backgroundColor: '#162820',
  },
  linkBarBtnText: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
});

