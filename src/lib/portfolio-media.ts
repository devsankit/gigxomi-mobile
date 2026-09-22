import type { MobileTeamEditor } from '@/src/types';
import { publicMediaUrl, youtubeVideoId } from './work-presentation';

export const PORTFOLIO_PLAYER_ORIGIN = 'https://www.youtube.com';

export type PortfolioMedia =
  | { kind: 'youtube'; videoId: string; url: string; platformTitle: string }
  | { kind: 'drive_folder'; folderId: string; url: string; platformTitle: string }
  | { kind: 'drive_file'; fileId: string; embedUrl: string; url: string; platformTitle: string }
  | { kind: 'instagram'; reelId: string; embedUrl: string; url: string; platformTitle: string }
  | { kind: 'vimeo'; embedUrl: string; url: string; platformTitle: string }
  | { kind: 'loom'; embedUrl: string; url: string; platformTitle: string }
  | { kind: 'direct'; url: string; platformTitle: string }
  | { kind: 'external'; url: string; platformTitle: string };

export function portfolioSources(editor: Pick<MobileTeamEditor, 'services' | 'portfolioLinks'>) {
  return [...new Set([...editor.services.map(service => service.portfolioUrl), ...editor.portfolioLinks]
    .map(value => publicMediaUrl(value)).filter((value): value is string => Boolean(value)))];
}

export function resolvePortfolioMedia(value?: string | null): PortfolioMedia | null {
  const url = publicMediaUrl(value);
  if (!url) return null;

  const videoId = youtubeVideoId(url);
  if (videoId) return { kind: 'youtube', videoId, url, platformTitle: 'YouTube' };

  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();

    // 1. Google Drive Folders
    if (host === 'drive.google.com') {
      const folderMatch = parsed.pathname.match(/^\/drive\/(?:u\/\d+\/)?folders\/([a-zA-Z0-9_-]+)/);
      if (folderMatch) {
        return {
          kind: 'drive_folder',
          folderId: folderMatch[1],
          url,
          platformTitle: 'Google Drive Folder',
        };
      }

      // 2. Google Drive Video Files
      const fileMatch = parsed.pathname.match(/^\/file\/d\/([a-zA-Z0-9_-]+)/)?.[1]
        ?? (parsed.pathname === '/open' ? parsed.searchParams.get('id') : null);
      if (fileMatch && /^[a-zA-Z0-9_-]+$/.test(fileMatch)) {
        return {
          kind: 'drive_file',
          fileId: fileMatch,
          embedUrl: `https://drive.google.com/file/d/${fileMatch}/preview`,
          url,
          platformTitle: 'Google Drive Video',
        };
      }
    }

    // 3. Instagram Reels
    if (['instagram.com', 'instagr.am'].includes(host)) {
      const reelMatch = parsed.pathname.match(/^\/(?:reel|p)\/([a-zA-Z0-9_-]+)/);
      if (reelMatch) {
        return {
          kind: 'instagram',
          reelId: reelMatch[1],
          embedUrl: `https://www.instagram.com/reel/${reelMatch[1]}/embed/`,
          url,
          platformTitle: 'Instagram Reel',
        };
      }
    }

    // 4. Direct video files
    if (/\.(mp4|m4v|webm|mov)$/i.test(parsed.pathname)) {
      return { kind: 'direct', url, platformTitle: 'Direct Video' };
    }

    // 5. Vimeo
    const vimeo = ['vimeo.com', 'player.vimeo.com'].includes(host)
      ? parsed.pathname.match(/^\/(?:video\/)?(\d+)(?:\/([a-zA-Z0-9]+))?\/?$/)
      : null;
    if (vimeo) {
      const embed = new URL(`https://player.vimeo.com/video/${vimeo[1]}`);
      const hash = parsed.searchParams.get('h') ?? vimeo[2];
      if (hash) embed.searchParams.set('h', hash);
      return { kind: 'embed' as const, url, embedUrl: embed.href, platformTitle: 'Vimeo' } as any;
    }

    // 6. Loom
    const loom = host === 'loom.com' ? parsed.pathname.match(/^\/(?:share|embed)\/([a-zA-Z0-9-]+)\/?$/) : null;
    if (loom) {
      return { kind: 'loom', url, embedUrl: `https://www.loom.com/embed/${loom[1]}`, platformTitle: 'Loom' };
    }

    return { kind: 'external', url, platformTitle: 'Web Link' };
  } catch {
    return { kind: 'external', url, platformTitle: 'Web Link' };
  }
}

export function youtubePortfolioHtml(videoId: string) {
  if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) throw new Error('Invalid portfolio video');
  return `<!doctype html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; background: #000; overflow: hidden; display: flex; align-items: center; justify-content: center; }
    iframe { width: 100%; height: 100%; border: 0; }
  </style>
</head>
<body>
  <iframe
    id="ytplayer"
    src="https://www.youtube.com/embed/${videoId}?autoplay=1&playsinline=1&rel=0&modestbranding=1&controls=1&enablejsapi=1&origin=https://www.youtube.com&widget_referrer=https://www.youtube.com"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
    allowfullscreen>
  </iframe>
  <script>
    var tag = document.createElement('script');
    tag.src = "https://www.youtube.com/iframe_api";
    var firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

    var player;
    function onYouTubeIframeAPIReady() {
      player = new YT.Player('ytplayer', {
        events: {
          'onReady': onPlayerReady,
          'onStateChange': onPlayerStateChange,
          'onError': onPlayerError
        }
      });
    }
    function onPlayerReady() {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ kind: 'ready' }));
      }
    }
    function onPlayerStateChange(event) {
      if (event.data === 1 && window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ kind: 'playing' }));
      }
    }
    function onPlayerError(event) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ kind: 'error', code: event.data }));
      }
    }
  </script>
</body>
</html>`;
}
