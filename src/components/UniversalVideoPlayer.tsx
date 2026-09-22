import React, { useState } from 'react';
import { Feather, FontAwesome5 } from '@expo/vector-icons';
import { Video, ResizeMode } from 'expo-av';
import * as Linking from 'expo-linking';
import {
  Image,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { ViewStyle } from 'react-native';
import { WebView } from 'react-native-webview';

import { theme } from '@/src/constants/theme';

export type VideoPlatformType =
  | 'youtube'
  | 'youtube_shorts'
  | 'google_drive'
  | 'instagram'
  | 'loom'
  | 'vimeo'
  | 'direct_video'
  | 'unknown';

export type ParsedMediaInfo = {
  embedUrl: string;
  originalUrl: string;
  platform: VideoPlatformType;
  platformLabel: string;
  thumbnailUrl: string;
  videoId?: string;
};

export function parseVideoUrl(input?: string | null): ParsedMediaInfo {
  let url = String(input ?? '').trim();
  if (!url) {
    return {
      embedUrl: '',
      originalUrl: '',
      platform: 'unknown',
      platformLabel: 'Media',
      thumbnailUrl: '',
    };
  }

  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }

  try {
    // 1. YouTube Shorts
    const shortsMatch = url.match(/(?:youtube\.com|m\.youtube\.com)\/shorts\/([a-zA-Z0-9_-]+)/i);
    if (shortsMatch && shortsMatch[1]) {
      const id = shortsMatch[1];
      return {
        embedUrl: `https://www.youtube.com/embed/${id}?autoplay=1&rel=0`,
        originalUrl: url,
        platform: 'youtube_shorts',
        platformLabel: 'YouTube Reel',
        thumbnailUrl: `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
        videoId: id,
      };
    }

    // 2. YouTube Standard / youtu.be
    const ytBeMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]+)/i);
    if (ytBeMatch && ytBeMatch[1]) {
      const id = ytBeMatch[1];
      return {
        embedUrl: `https://www.youtube.com/embed/${id}?autoplay=1&rel=0`,
        originalUrl: url,
        platform: 'youtube',
        platformLabel: 'YouTube',
        thumbnailUrl: `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
        videoId: id,
      };
    }

    const ytWatchMatch = url.match(/(?:youtube\.com|m\.youtube\.com)\/(?:watch\?v=|embed\/|v\/)([a-zA-Z0-9_-]+)/i);
    if (ytWatchMatch && ytWatchMatch[1]) {
      const id = ytWatchMatch[1];
      return {
        embedUrl: `https://www.youtube.com/embed/${id}?autoplay=1&rel=0`,
        originalUrl: url,
        platform: 'youtube',
        platformLabel: 'YouTube',
        thumbnailUrl: `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
        videoId: id,
      };
    }

    // 3. Google Drive Video or Folder
    const driveFolderMatch = url.match(/(?:drive\.google\.com|google\.com)\/(?:drive\/)?(?:u\/\d+\/)?folders\/([a-zA-Z0-9_-]+)/i);
    if (driveFolderMatch && driveFolderMatch[1]) {
      const id = driveFolderMatch[1];
      return {
        embedUrl: `https://drive.google.com/embeddedfolderview?id=${id}#grid`,
        originalUrl: url,
        platform: 'google_drive',
        platformLabel: 'Google Drive Folder',
        thumbnailUrl: '',
        videoId: id,
      };
    }

    const driveMatch = url.match(/(?:drive\.google\.com|google\.com)\/(?:file\/d\/|open\?id=|file\/u\/\d+\/d\/)([a-zA-Z0-9_-]+)/i);
    if (driveMatch && driveMatch[1]) {
      const id = driveMatch[1];
      return {
        embedUrl: `https://drive.google.com/file/d/${id}/preview`,
        originalUrl: url,
        platform: 'google_drive',
        platformLabel: 'Google Drive',
        thumbnailUrl: '',
        videoId: id,
      };
    }

    // 4. Instagram Reel or Post
    const instaMatch = url.match(/(?:instagram\.com|instagr\.am)\/(?:reel|reels|p|tv)\/([a-zA-Z0-9_-]+)/i);
    if (instaMatch && instaMatch[1]) {
      const id = instaMatch[1];
      return {
        embedUrl: `https://www.instagram.com/reel/${id}/embed/`,
        originalUrl: url,
        platform: 'instagram',
        platformLabel: 'Instagram Reel',
        thumbnailUrl: '',
        videoId: id,
      };
    }

    // 5. Loom
    const loomMatch = url.match(/loom\.com\/(?:share|embed)\/([a-zA-Z0-9_-]+)/i);
    if (loomMatch && loomMatch[1]) {
      const id = loomMatch[1];
      return {
        embedUrl: `https://www.loom.com/embed/${id}`,
        originalUrl: url,
        platform: 'loom',
        platformLabel: 'Loom Video',
        thumbnailUrl: '',
        videoId: id,
      };
    }

    // 6. Vimeo
    const vimeoMatch = url.match(/vimeo\.com\/(?:video\/)?([0-9]+)/i);
    if (vimeoMatch && vimeoMatch[1]) {
      const id = vimeoMatch[1];
      return {
        embedUrl: `https://player.vimeo.com/video/${id}?autoplay=1`,
        originalUrl: url,
        platform: 'vimeo',
        platformLabel: 'Vimeo',
        thumbnailUrl: '',
        videoId: id,
      };
    }

    // 7. Direct Video File (.mp4, .mov, .webm, .m3u8)
    if (/\.(mp4|mov|webm|m3u8)($|\?)/i.test(url)) {
      return {
        embedUrl: url,
        originalUrl: url,
        platform: 'direct_video',
        platformLabel: 'Video File',
        thumbnailUrl: '',
      };
    }

    // Fallback: Generic link
    return {
      embedUrl: url,
      originalUrl: url,
      platform: 'unknown',
      platformLabel: 'Video Link',
      thumbnailUrl: '',
    };
  } catch {
    return {
      embedUrl: url,
      originalUrl: url,
      platform: 'unknown',
      platformLabel: 'Video Link',
      thumbnailUrl: '',
    };
  }
}

type UniversalVideoPlayerProps = {
  aspectRatio?: number;
  autoPlay?: boolean;
  containerStyle?: ViewStyle;
  showPlatformBadge?: boolean;
  thumbnailPlaceholder?: string;
  title?: string;
  url?: string | null;
};

export function UniversalVideoPlayer({
  aspectRatio = 16 / 9,
  containerStyle,
  showPlatformBadge = true,
  thumbnailPlaceholder,
  title,
  url,
}: UniversalVideoPlayerProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [playingInline, setPlayingInline] = useState(false);
  const parsed = parseVideoUrl(url);

  if (!parsed.originalUrl) {
    return null;
  }

  const isDirectVideo = parsed.platform === 'direct_video';
  const isReel =
    parsed.platform === 'instagram' ||
    parsed.platform === 'youtube_shorts' ||
    /(\b|_)(reel|reels|short|shorts|vertical|tiktok|9_16|9-16)(\b|_|\.|\/)/i.test(parsed.originalUrl);
  const effectiveAspectRatio = isReel ? 9 / 16 : aspectRatio;
  const effectiveThumbnail = parsed.thumbnailUrl || thumbnailPlaceholder;

  function handleOpenPlayer() {
    if (Platform.OS === 'web') {
      setPlayingInline(true);
    } else {
      setModalOpen(true);
    }
  }

  function handleOpenExternal() {
    void Linking.openURL(parsed.originalUrl);
  }

  function renderPlatformIcon() {
    switch (parsed.platform) {
      case 'youtube':
      case 'youtube_shorts':
        return <FontAwesome5 name="youtube" size={13} color="#ef4444" />;
      case 'instagram':
        return <FontAwesome5 name="instagram" size={13} color="#e1306c" />;
      case 'google_drive':
        return <FontAwesome5 name="google-drive" size={13} color="#22c55e" />;
      case 'vimeo':
        return <FontAwesome5 name="vimeo-v" size={13} color="#38bdf8" />;
      default:
        return <Feather name="video" size={13} color={theme.colors.accent} />;
    }
  }

  return (
    <View style={[styles.container, containerStyle]}>
      {playingInline && Platform.OS === 'web' ? (
        <View style={[styles.playerBox, { aspectRatio: effectiveAspectRatio }]}>
          {isDirectVideo ? (
            <video
              src={parsed.originalUrl}
              controls
              autoPlay
              style={{ width: '100%', height: '100%', borderRadius: 8, backgroundColor: '#000' }}
            />
          ) : (
            <iframe
              src={parsed.embedUrl}
              title={title || 'Gigxomi Video Preview'}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              style={{ width: '100%', height: '100%', border: 'none', borderRadius: 8 }}
            />
          )}
        </View>
      ) : (
        <Pressable accessibilityRole="button" style={[styles.card, { aspectRatio: effectiveAspectRatio }]} onPress={handleOpenPlayer}>
          {effectiveThumbnail ? (
            <Image source={{ uri: effectiveThumbnail }} style={styles.thumbnail} resizeMode="cover" />
          ) : (
            <View style={styles.thumbnailFallback}>
              {renderPlatformIcon()}
              <Text style={styles.thumbnailFallbackText}>{parsed.platformLabel}</Text>
            </View>
          )}

          <View style={styles.overlayScrim} />

          <View style={styles.playButtonWrap}>
            <View style={styles.playButton}>
              <Feather name="play" size={24} color="#000" style={{ marginLeft: 3 }} />
            </View>
          </View>

          {showPlatformBadge ? (
            <View style={styles.badge}>
              {renderPlatformIcon()}
              <Text style={styles.badgeText}>{parsed.platformLabel}</Text>
            </View>
          ) : null}

          {title ? (
            <View style={styles.titleWrap}>
              <Text numberOfLines={1} style={styles.titleText}>
                {title}
              </Text>
            </View>
          ) : null}
        </Pressable>
      )}

      {/* Fullscreen modal for native/web */}
      <Modal animationType="fade" transparent visible={modalOpen} onRequestClose={() => setModalOpen(false)}>
        <View style={styles.modalBackdrop}>
          <Pressable style={styles.modalScrim} onPress={() => setModalOpen(false)} />
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderLeft}>
                {renderPlatformIcon()}
                <Text numberOfLines={1} style={styles.modalTitle}>
                  {title || parsed.platformLabel}
                </Text>
              </View>
              <Pressable style={styles.modalCloseButton} onPress={() => setModalOpen(false)}>
                <Feather name="x" size={20} color="#fff" />
              </Pressable>
            </View>

            <View style={styles.modalVideoWrap}>
              {isDirectVideo ? (
                <Video
                  source={{ uri: parsed.originalUrl }}
                  style={styles.nativeVideo}
                  useNativeControls
                  resizeMode={ResizeMode.CONTAIN}
                  shouldPlay
                  isLooping
                />
              ) : Platform.OS === 'web' ? (
                <iframe
                  src={parsed.embedUrl}
                  title={title || 'Gigxomi Video Preview'}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  style={{ width: '100%', height: '100%', border: 'none' }}
                />
              ) : (
                <WebView
                  source={{ uri: parsed.embedUrl }}
                  style={styles.nativeVideo}
                  javaScriptEnabled
                  domStorageEnabled
                  allowsFullscreenVideo
                  allowsInlineMediaPlayback
                  mediaPlaybackRequiresUserAction={false}
                />
              )}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    overflow: 'hidden',
    borderRadius: theme.radius.md,
  },
  playerBox: {
    width: '100%',
    backgroundColor: '#000',
    borderRadius: theme.radius.md,
    overflow: 'hidden',
  },
  card: {
    width: '100%',
    backgroundColor: '#020617',
    borderRadius: theme.radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbnail: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  thumbnailFallback: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#090d16',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  thumbnailFallbackText: {
    color: theme.colors.mutedText,
    fontSize: 12,
    fontWeight: '700',
  },
  overlayScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.42)',
  },
  playButtonWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  badge: {
    position: 'absolute',
    top: 10,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  badgeText: {
    color: '#fff',
    fontSize: 10.5,
    fontWeight: '800',
  },
  titleWrap: {
    position: 'absolute',
    bottom: 8,
    left: 10,
    right: 10,
  },
  titleText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.88)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.md,
  },
  modalScrim: {
    ...StyleSheet.absoluteFillObject,
  },
  modalContent: {
    width: '100%',
    maxWidth: 620,
    backgroundColor: '#0f172a',
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    elevation: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderSubtle,
  },
  modalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  modalTitle: {
    color: '#fff',
    fontSize: theme.typography.body,
    fontWeight: '800',
  },
  modalCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalVideoWrap: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000',
  },
  nativeVideo: {
    width: '100%',
    height: '100%',
  },
  nativeEmbedFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.lg,
    gap: 10,
    backgroundColor: '#020617',
  },
  nativeEmbedTitle: {
    color: '#fff',
    fontSize: theme.typography.section,
    fontWeight: '900',
  },
  nativeEmbedSubtitle: {
    color: theme.colors.mutedText,
    fontSize: 11,
    textAlign: 'center',
  },
  openExternalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: theme.colors.accent,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: theme.radius.md,
    marginTop: 6,
  },
  openExternalText: {
    color: '#000',
    fontSize: 12,
    fontWeight: '900',
  },
});