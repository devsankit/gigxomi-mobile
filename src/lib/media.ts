import * as FileSystem from 'expo-file-system/legacy';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { getSiteBaseUrl } from '@/src/lib/api';

const MEDIA_CACHE_DIRECTORY = `${FileSystem.cacheDirectory ?? ''}gigxomi-media/`;

export function resolveMediaUrl(rawUrl?: string | null) {
  const value = rawUrl?.trim();
  if (!value) {
    return '';
  }

  if (/^(data:|blob:|file:|content:|https?:\/\/)/i.test(value)) {
    return value;
  }

  return `${getSiteBaseUrl().replace(/\/$/, '')}/${value.replace(/^\//, '')}`;
}

function extensionFromUrl(url: string) {
  const cleanUrl = url.split('?')[0].split('#')[0];
  const extension = cleanUrl.match(/\.(png|jpe?g|webp|gif)$/i)?.[1]?.toLowerCase();
  return extension ? (extension === 'jpeg' ? 'jpg' : extension) : 'img';
}

function hashUrl(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36);
}

async function ensureMediaCacheDirectory() {
  if (!MEDIA_CACHE_DIRECTORY) {
    return;
  }

  try {
    await FileSystem.makeDirectoryAsync(MEDIA_CACHE_DIRECTORY, { intermediates: true });
  } catch {
    // Cache directory creation is best-effort; the original URL remains usable.
  }
}

export function useCachedMediaUri(rawUrl?: string | null) {
  const resolvedUrl = resolveMediaUrl(rawUrl);
  const [cachedMedia, setCachedMedia] = useState<{ source: string; uri: string } | null>(null);

  useEffect(() => {
    let active = true;

    async function cacheRemoteMedia() {
      if (Platform.OS === 'web' || !MEDIA_CACHE_DIRECTORY || !/^https?:\/\//i.test(resolvedUrl)) {
        return;
      }

      const localUri = `${MEDIA_CACHE_DIRECTORY}${hashUrl(resolvedUrl)}.${extensionFromUrl(resolvedUrl)}`;
      try {
        await ensureMediaCacheDirectory();
        const info = await FileSystem.getInfoAsync(localUri);
        if (!info.exists) {
          await FileSystem.downloadAsync(resolvedUrl, localUri);
        }
        if (active) {
          setCachedMedia({ source: resolvedUrl, uri: localUri });
        }
      } catch {
        // Keep rendering the original URL if caching fails.
      }
    }

    void cacheRemoteMedia();

    return () => {
      active = false;
    };
  }, [resolvedUrl]);

  return cachedMedia?.source === resolvedUrl ? cachedMedia.uri : resolvedUrl;
}
