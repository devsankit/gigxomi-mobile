import { Feather } from '@expo/vector-icons';
import { journey } from '@/src/lib/journey-runtime';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { useRefreshOnFocus } from '@/src/hooks/useRefreshOnFocus';
import { PORTFOLIO_PLAYER_ORIGIN } from '@/src/lib/portfolio-media';
import { AppState, BackHandler, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { AppButton } from '@/src/components/AppButton';
import { AppCard } from '@/src/components/AppCard';
import { AppInput } from '@/src/components/AppInput';
import { Screen } from '@/src/components/Screen';
import { theme } from '@/src/constants/theme';
import { useAuth } from '@/src/hooks/useAuth';
import { ApiError, apiRequest, isNetworkError } from '@/src/lib/api';

import { useLearningProgress } from '@/src/hooks/useLearningProgress';
import { learningScope, parseWatchSample, WatchAccumulator, type PlaybackState } from '@/src/lib/learning-progress';

type Progress = {
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
  progressPercent: number;
  watchedSeconds: number;
  durationSeconds: number;
  lastPositionSeconds: number;
};
type Lesson = {
  id: string; chapterId: string; title: string; description?: string | null; tags: string[];
  youtubeVideoId?: string | null; isRequired: boolean; completionThreshold: number; estimatedDuration?: number | null;
  locked: boolean; progress?: Progress | null;
};
type Chapter = {
  id: string; courseId: string; title: string; description?: string | null; thumbnailUrl?: string | null; tags: string[];
  locked: boolean; requiredPackages: Array<{ id: string; name: string }>; lessonCount: number; estimatedDuration: number;
  completionPercent: number; lessons: Lesson[];
};
type Playlist = {
  id: string; title: string; description?: string | null; thumbnailUrl?: string | null; completionPercent: number;
  chapterCount: number; lessonCount: number; estimatedDuration: number; chapters: Chapter[];
};
type CatalogResponse = {
  audience: 'AGENCY' | 'FREELANCER' | 'CRM';
  playlists: Playlist[];
  continueLearning?: { playlistId: string; chapterId: string; lessonId: string } | null;
};
type PlayerSelection = { playlist: Playlist; chapter: Chapter; lesson: Lesson; startPosition: number };


function playerHtml(videoId: string, start: number) {
  return `<!doctype html><html><head><meta name="referrer" content="strict-origin-when-cross-origin"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body,#player{margin:0;width:100%;height:100%;background:#000;overflow:hidden}</style></head><body><div id="player"></div><script src="https://www.youtube.com/iframe_api"></script><script>let player,timer;function send(){if(player&&player.getCurrentTime){window.ReactNativeWebView.postMessage(JSON.stringify({position:player.getCurrentTime(),duration:player.getDuration(),state:player.getPlayerState()}));}}function onYouTubeIframeAPIReady(){player=new YT.Player('player',{videoId:'${videoId}',playerVars:{playsinline:1,start:${Math.max(0, Math.floor(start))},rel:0,modestbranding:1,enablejsapi:1,origin:'${PORTFOLIO_PLAYER_ORIGIN}'},events:{onReady:function(){window.pauseLesson=function(){player.pauseVideo();};window.ReactNativeWebView.postMessage(JSON.stringify({kind:'ready'}));},onError:function(){window.ReactNativeWebView.postMessage(JSON.stringify({kind:'error'}));},onStateChange:function(e){send();clearInterval(timer);if(e.data===1){timer=setInterval(send,1000);}}}});}</script></body></html>`;
}

function formatDuration(seconds: number | null | undefined) {
  if (!seconds || seconds <= 0) return 'Duration coming soon';
  const minutes = Math.max(1, Math.round(seconds / 60));
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function ProgressBar({ percent }: { percent: number }) {
  return <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${Math.max(0, Math.min(100, percent))}%` }]} /></View>;
}

type LearningProps = { header?: ReactNode; onExit?: () => void; initialPlaylistId?: string; initialChapterId?: string; initialLessonId?: string };

export function LearningView(props: LearningProps) {
  const auth = useAuth();
  const scope = learningScope(auth.session?.userId ?? 'signed-out', auth.session?.role ?? '', auth.session?.tenantId);
  return <LearningScreen key={scope} scope={scope} {...props} />;
}

function LearningScreen({ scope, header, onExit, initialPlaylistId, initialChapterId, initialLessonId }: LearningProps & { scope: string }) {
  const journeyPlayback = useRef(false);
  useEffect(() => { void journey.track('learning.opened'); }, []);
  const focused = useIsFocused();
  const initialHandled = useRef(false);
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [playlistId, setPlaylistId] = useState<string | null>(initialPlaylistId ?? null);
  const [player, setPlayer] = useState<PlayerSelection | null>(null);
  const [lockedChapter, setLockedChapter] = useState<Chapter | null>(null);
  const [opening, setOpening] = useState(false);
  const [actionError, setActionError] = useState<unknown>(null);
  const [playerError, setPlayerError] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);
  const [playback, setPlayback] = useState({ percent: 0, completed: false });
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const webview = useRef<WebView>(null);
  const watch = useRef<WatchAccumulator | null>(null);
  const currentPlayer = useRef<PlayerSelection | null>(null);
  const openingRequest = useRef(0);
  const lifecycle = useRef<{ flush(state: PlaybackState): void; pause(): void }>({ flush: () => {}, pause: () => {} });

  const catalog = useQuery({
    queryKey: ['connected-lms', scope],
    enabled: Boolean(auth.token),
    staleTime: 0,
    queryFn: ({ signal }) => apiRequest<CatalogResponse>('/mobile/v2/lms', { token: auth.token, signal }),
  });
  useRefreshOnFocus(catalog.refetch);
  const progress = useLearningProgress(scope, auth.token, (event, confirmed) => {
    if (currentPlayer.current?.lesson.id === event.lessonId) setPlayback({ percent: confirmed.progressPercent, completed: confirmed.status === 'COMPLETED' });
    void queryClient.invalidateQueries({ queryKey: ['connected-lms', scope] });
  });

  useEffect(() => {
    if (!focused) { lifecycle.current.pause(); lifecycle.current.flush('PAUSED'); }
  }, [focused]);
  useEffect(() => {
    if (!catalog.data || initialHandled.current || !initialPlaylistId) return;
    initialHandled.current = true;
    const playlist = catalog.data.playlists.find(item => item.id === initialPlaylistId);
    const chapter = playlist?.chapters.find(item => item.id === initialChapterId);
    const lesson = chapter?.lessons.find(item => item.id === initialLessonId);
    if (!playlist) { setActionError(new Error('Learning content changed.')); return; }
    if (chapter && lesson) void openLesson(playlist, chapter, lesson);
    // Handle the selected dashboard destination once; openLesson revalidates access.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog.data, initialPlaylistId, initialChapterId, initialLessonId]);

  function flush(state: PlaybackState) {
    const event = watch.current?.take(state);
    if (event && progress.queue.current) void progress.queue.current.enqueue(event);
  }
  function pause() { webview.current?.injectJavaScript('window.pauseLesson && window.pauseLesson(); true;'); watch.current?.pause(); }
  function closePlayer() {
    pause(); flush('PAUSED');
    watch.current = null; currentPlayer.current = null; setPlayer(null);
  }
  useEffect(() => { lifecycle.current = { flush, pause }; });
  useEffect(() => {
    const requests = openingRequest;
    const listener = AppState.addEventListener('change', state => {
      setForeground(state === 'active');
      if (state !== 'active') { lifecycle.current.pause(); lifecycle.current.flush('PAUSED'); }
      else { void progress.queue.current?.retry(); void catalog.refetch(); }
    });
    return () => { requests.current++; listener.remove(); lifecycle.current.pause(); lifecycle.current.flush('PAUSED'); };
    // The listener deliberately uses current refs, not a stale player/position.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (progress.status.error || progress.status.pending > 1) {
      lifecycle.current.pause(); lifecycle.current.flush('PAUSED');
    }
  }, [progress.status.error, progress.status.pending]);
  useEffect(() => {
    if (!player || playerReady || playerError) return;
    const timeout = setTimeout(() => { lifecycle.current.pause(); lifecycle.current.flush('PAUSED'); setPlayerError(true); }, 20000);
    return () => clearTimeout(timeout);
  }, [player, playerReady, playerError]);
  useEffect(() => {
    if (!player || !catalog.data) return;
    const chapter = catalog.data.playlists.find(p => p.id === player.playlist.id)?.chapters.find(c => c.id === player.chapter.id);
    const lesson = chapter?.lessons.find(l => l.id === player.lesson.id);
    if (!chapter || !lesson || chapter.locked || lesson.locked) {
      lifecycle.current.pause(); lifecycle.current.flush('PAUSED');
      watch.current = null; currentPlayer.current = null; setPlayer(null);
      if (chapter) setLockedChapter(chapter); else setActionError(new Error('Learning content changed.'));
    }
  }, [catalog.data, player]);
  useEffect(() => {
    const listener = BackHandler.addEventListener('hardwareBackPress', () => {
      if (player) { closePlayer(); return true; }
      if (playlistId) { setPlaylistId(null); return true; }
      if (onExit) { onExit(); return true; }
      return false;
    });
    return () => listener.remove();
  });

  const playlists = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (catalog.data?.playlists ?? []).filter(p => !query || [p.title, p.description, ...p.chapters.flatMap(c => [c.title, c.description, ...c.tags, ...c.lessons.flatMap(l => [l.title, l.description, ...l.tags])])].some(v => v?.toLowerCase().includes(query)));
  }, [catalog.data?.playlists, search]);
  const selectedPlaylist = catalog.data?.playlists.find(p => p.id === playlistId);
  const playerSource = useMemo(() => player?.lesson.youtubeVideoId ? playerHtml(player.lesson.youtubeVideoId, player.startPosition) : '', [player]);

  async function openLesson(playlist: Playlist, chapter: Chapter, lesson: Lesson) {
    if (opening || progress.status.error || progress.status.pending > 1) return;
    const request = ++openingRequest.current;
    setOpening(true); setActionError(null);
    try {
      // Never open a previously cached premium video without checking current access.
      const fresh = await catalog.refetch({ throwOnError: true });
      if (request !== openingRequest.current) return;
      const nextPlaylist = fresh.data?.playlists.find(p => p.id === playlist.id);
      const nextChapter = nextPlaylist?.chapters.find(c => c.id === chapter.id);
      const nextLesson = nextChapter?.lessons.find(l => l.id === lesson.id);
      if (!nextPlaylist || !nextChapter || !nextLesson) throw new Error('Learning content changed.');
      if (nextChapter.locked || nextLesson.locked) { setLockedChapter(nextChapter); return; }
      if (!nextLesson.youtubeVideoId || !/^[a-zA-Z0-9_-]{11}$/.test(nextLesson.youtubeVideoId)) { setActionError({ kind: 'video-unavailable' }); return; }
      const startPosition = nextLesson.progress?.lastPositionSeconds ?? 0;
      watch.current = new WatchAccumulator({ courseId: nextPlaylist.id, chapterId: nextChapter.id, lessonId: nextLesson.id, playbackSessionId: 'learning-' + Date.now() + '-' + Math.random().toString(36).slice(2) }, startPosition, nextLesson.estimatedDuration ?? 0);
      const selection = { playlist: nextPlaylist, chapter: nextChapter, lesson: nextLesson, startPosition };
      currentPlayer.current = selection; setPlayer(selection); setPlaylistId(nextPlaylist.id);
      journeyPlayback.current = false;
      void journey.track('learning.lesson_opened');
      setPlayback({ percent: nextLesson.progress?.progressPercent ?? 0, completed: nextLesson.progress?.status === 'COMPLETED' });
      setPlayerError(false); setPlayerReady(false);
    } catch (error) { setActionError(error); }
    finally { if (request === openingRequest.current) setOpening(false); }
  }
  function handlePlayerMessage(event: WebViewMessageEvent) {
    try {
      const value = JSON.parse(event.nativeEvent.data);
      if (value.kind === 'ready') { setPlayerReady(true); return; }
      if (value.kind === 'error') { pause(); flush('PAUSED'); setPlayerError(true); return; }
      const next = parseWatchSample(value);
      if (!next || !watch.current) return;
      if (next.state === 1 && foreground && focused && !journeyPlayback.current) { journeyPlayback.current = true; void journey.track('learning.playback_started'); }
      watch.current.observe(next, Date.now(), foreground && focused && !progress.status.error && progress.status.pending < 2);
      if (watch.current.pendingSeconds >= 10) flush('PLAYING');
      if (next.state === 0) flush('ENDED');
      else if (next.state === 2) { flush('PAUSED'); watch.current.pause(); }
    } catch { /* The embedded player may also send unrelated messages. */ }
  }
  function resumeLearning() {
    const target = catalog.data?.continueLearning;
    const playlist = catalog.data?.playlists.find(p => p.id === target?.playlistId);
    const chapter = playlist?.chapters.find(c => c.id === target?.chapterId);
    const lesson = chapter?.lessons.find(l => l.id === target?.lessonId);
    if (playlist && chapter && lesson) void openLesson(playlist, chapter, lesson);
  }
  const failure = actionError ?? catalog.error;
  const expired = !auth.token || (failure instanceof ApiError && failure.status === 401);
  const offline = isNetworkError(failure);
  const videoMissing = Boolean(failure && typeof failure === 'object' && 'kind' in failure);
  const freelancer = catalog.data?.audience === 'FREELANCER' || auth.session?.role === 'FREELANCER';
  const syncBlocked = Boolean(progress.status.error) || progress.status.pending > 1;
  const syncExpired = progress.status.error instanceof ApiError && progress.status.error.status === 401;
  const syncLocked = progress.status.error instanceof ApiError && progress.status.error.status === 402;
  const retry = () => { setActionError(null); void catalog.refetch(); void progress.queue.current?.retry(); };
  const back = () => { if (player) closePlayer(); else if (playlistId) setPlaylistId(null); else if (onExit) onExit(); else router.back(); };

  return <Screen key={player ? 'player' : selectedPlaylist ? 'chapters' : 'library'}>
    {header}
    <View style={styles.topbar}><Pressable accessibilityRole="button" accessibilityLabel="Back from Learning" style={styles.backTarget} onPress={back}><Feather name="arrow-left" size={22} color={theme.colors.text} /></Pressable><Text style={styles.eyebrow}>Gigxomi Learning</Text></View>
    <View style={styles.header}>
      <Text style={styles.title}>{player ? player.lesson.title : selectedPlaylist ? selectedPlaylist.title : freelancer ? 'Learn more. Create better.' : 'Build a team clients trust.'}</Text>
      <Text style={styles.copy}>{player ? player.chapter.title : selectedPlaylist ? selectedPlaylist.description : freelancer ? 'Practical lessons for your next great project.' : 'Practical skills for better service and stronger client relationships.'}</Text>
    </View>
    {failure || expired ? <AppCard style={styles.errorCard}><Text style={styles.heading}>{expired ? 'Sign in to keep learning' : offline ? 'You’re offline' : videoMissing ? 'This video isn’t ready yet' : 'Learning couldn’t load'}</Text><Text style={styles.copy}>{expired ? 'Your saved progress will be here when you sign in again.' : offline ? 'Reconnect to open lessons and sync your progress.' : videoMissing ? 'The lesson needs a valid video. Try another lesson or check back soon.' : 'Please try again. Your saved progress hasn’t been removed.'}</Text><AppButton title={expired ? 'Sign in' : 'Try again'} onPress={expired ? () => router.push('/login') : retry} /></AppCard> : null}
    {syncBlocked ? <AppCard style={styles.errorCard}><Text style={styles.heading}>{syncLocked ? 'Plan access changed' : syncExpired ? 'Sign in to save your progress' : 'Your progress is waiting to sync'}</Text><Text style={styles.copy}>{syncLocked ? 'Lesson playback is paused. Refresh your plan access to continue.' : 'Playback is paused so your watched time stays safe. Reconnect and retry before continuing.'}</Text><AppButton title={syncExpired ? 'Sign in' : syncLocked ? 'Review plan access' : 'Retry saving progress'} onPress={syncExpired ? () => router.push('/login') : syncLocked ? () => { closePlayer(); router.push('/package'); } : retry} /><AppButton title="Refresh access" variant="secondary" onPress={retry} /></AppCard> : null}
    {opening ? <Text accessibilityLiveRegion="polite" style={styles.copy}>Checking lesson access…</Text> : null}
    {player ? <AppCard style={styles.playerCard}>
      {playerError ? <View style={styles.stack}><Feather name="video-off" size={30} color={theme.colors.textSecondary} /><Text style={styles.heading}>This video couldn’t play</Text><Text style={styles.copy}>Check your connection and try again. If the video is unavailable, try another lesson.</Text><AppButton title="Retry video" disabled={opening || syncBlocked} onPress={() => { closePlayer(); void openLesson(player.playlist, player.chapter, player.lesson); }} /></View> :
        <View style={styles.player}><WebView ref={webview} allowsFullscreenVideo javaScriptEnabled mediaPlaybackRequiresUserAction onMessage={handlePlayerMessage} onError={() => { pause(); flush('PAUSED'); setPlayerError(true); }} onHttpError={() => { pause(); flush('PAUSED'); setPlayerError(true); }} source={{ html: playerSource, baseUrl: PORTFOLIO_PLAYER_ORIGIN }} /></View>}
      <View style={styles.rowBetween}><Text style={styles.status}>{playback.completed ? 'Lesson completed' : playback.percent + '% saved'}</Text><Text style={styles.meta}>{player.lesson.completionThreshold}% required</Text></View>
      <ProgressBar percent={playback.percent} /><Text style={styles.meta}>{progress.status.pending ? 'Saving your watched time…' : 'Progress saved automatically while you watch.'}</Text>
      <Text style={styles.copy}>{player.lesson.description}</Text><AppButton onPress={closePlayer} title="Back to chapter" variant="secondary" />
    </AppCard> : selectedPlaylist && !expired ? <View style={styles.stack}>
      <View style={styles.summaryCard}><Text style={styles.summaryValue}>{selectedPlaylist.completionPercent}%</Text><View style={styles.grow}><Text style={styles.summaryLabel}>Playlist progress</Text><ProgressBar percent={selectedPlaylist.completionPercent} /></View></View>
      {selectedPlaylist.chapters.map((chapter, index) => <AppCard key={chapter.id} style={[styles.chapterCard, chapter.locked && styles.lockedCard]}>
        <View style={styles.chapterTop}><View style={styles.chapterIndex}><Text style={styles.chapterIndexText}>{index + 1}</Text></View><View style={styles.grow}><Text style={styles.heading}>{chapter.title}</Text><Text style={styles.meta}>{chapter.lessonCount} {chapter.lessonCount === 1 ? 'lesson' : 'lessons'} · {formatDuration(chapter.estimatedDuration)}</Text></View><Feather color={chapter.locked ? theme.colors.warning : theme.colors.accent} name={chapter.locked ? 'lock' : 'play-circle'} size={20} /></View>
        {chapter.description ? <Text numberOfLines={2} style={styles.copy}>{chapter.description}</Text> : null}
        <ProgressBar percent={chapter.completionPercent} />
        {chapter.locked ? <AppButton title="See chapter access" variant="secondary" onPress={() => setLockedChapter(chapter)} /> : chapter.lessons.length ? chapter.lessons.map(lesson => <Pressable accessibilityRole="button" disabled={opening || syncBlocked} key={lesson.id} onPress={() => void openLesson(selectedPlaylist, chapter, lesson)} style={styles.lessonRow}><Feather color={lesson.progress?.status === 'COMPLETED' ? theme.colors.success : theme.colors.textSecondary} name={lesson.progress?.status === 'COMPLETED' ? 'check-circle' : 'play'} size={18} /><View style={styles.grow}><Text style={styles.lessonTitle}>{lesson.title}</Text><Text style={styles.meta}>{lesson.progress?.status === 'COMPLETED' ? 'Completed' : lesson.progress?.progressPercent ? lesson.progress.progressPercent + '% saved' : formatDuration(lesson.estimatedDuration)}</Text></View><Feather color={theme.colors.mutedText} name="chevron-right" size={18} /></Pressable>) : <Text style={styles.copy}>Lessons are being prepared for this chapter.</Text>}
      </AppCard>)}
      {!selectedPlaylist.chapters.length ? <Text style={styles.copy}>Chapters will appear here when they’re published.</Text> : null}
    </View> : !expired ? <View style={styles.stack}>
      <AppInput accessibilityLabel="Search learning topics" label="Find a skill or topic" onChangeText={setSearch} placeholder="Search topics, chapters or lessons" value={search} />
      {catalog.isLoading ? <View accessibilityLabel="Loading learning library" style={styles.stack}>{[0,1].map(i => <View key={i} style={styles.skeleton}><View style={styles.skeletonLine} /><View style={[styles.skeletonLine, { width: '65%' }]} /></View>)}</View> : null}
      {!catalog.error && catalog.data ? <>
        {catalog.data.continueLearning ? <Pressable accessibilityRole="button" disabled={opening || syncBlocked} onPress={resumeLearning} style={styles.resumeCard}><Feather name="play-circle" size={28} color={theme.colors.accent} /><View style={styles.grow}><Text style={styles.resumeTitle}>Continue learning</Text><Text style={styles.copy}>Pick up where you stopped.</Text></View><Feather name="arrow-right" size={20} color={theme.colors.accent} /></Pressable> : null}
        <View style={styles.sectionRow}><Text style={styles.sectionTitle}>Explore playlists</Text><Text style={styles.meta}>{playlists.length} available</Text></View>
        {playlists.map(playlist => <Pressable accessibilityRole="button" accessibilityLabel={'Open playlist: ' + playlist.title} key={playlist.id} onPress={() => setPlaylistId(playlist.id)}><AppCard style={styles.playlistCard}>
          {playlist.thumbnailUrl ? <Image accessible={false} alt="" source={{ uri: playlist.thumbnailUrl }} style={styles.thumbnail} /> : <View style={styles.thumbnailFallback}><Feather color={theme.colors.accent} name="book-open" size={30} /></View>}
          <View style={styles.playlistBody}><Text style={styles.heading}>{playlist.title}</Text><Text numberOfLines={2} style={styles.copy}>{playlist.description || 'Build a useful skill, one lesson at a time.'}</Text><Text style={styles.meta}>{playlist.chapterCount} {playlist.chapterCount === 1 ? 'chapter' : 'chapters'} · {playlist.lessonCount} {playlist.lessonCount === 1 ? 'lesson' : 'lessons'} · {formatDuration(playlist.estimatedDuration)}</Text><ProgressBar percent={playlist.completionPercent} /><View style={styles.rowBetween}><Text style={styles.status}>{playlist.completionPercent ? playlist.completionPercent + '% complete' : 'Start playlist'}</Text><Feather color={theme.colors.accent} name="arrow-right" size={20} /></View></View>
        </AppCard></Pressable>)}
        {!playlists.length ? <AppCard><Text style={styles.heading}>{search.trim() ? 'No matching topics' : 'Your learning library is on its way'}</Text><Text style={styles.copy}>{search.trim() ? 'Try another skill or clear your search.' : 'Published playlists for your account will appear here.'}</Text>{search ? <AppButton title="Clear search" variant="secondary" onPress={() => setSearch('')} /> : <AppButton title="Refresh library" variant="secondary" onPress={retry} />}</AppCard> : null}
      </> : null}
    </View> : null}
    <Modal visible={Boolean(lockedChapter)} transparent animationType="fade" onRequestClose={() => setLockedChapter(null)}>
      <View style={styles.modalBackdrop}><View style={styles.modalCard}><ScrollView><Text style={styles.heading}>{lockedChapter?.title}</Text><Text style={[styles.copy, { marginVertical: 12 }]}>This chapter is included with {lockedChapter?.requiredPackages.map(p => p.name).join(' or ') || 'an eligible Gigxomi plan'}. Explore the preview now, or review your plan access.</Text><View style={styles.stack}><AppButton title="See plan access" onPress={() => { setLockedChapter(null); router.push('/package'); }} /><AppButton title="Refresh access" variant="secondary" onPress={() => { setLockedChapter(null); retry(); }} /><AppButton title="Keep browsing" variant="secondary" onPress={() => setLockedChapter(null)} /></View></ScrollView></View></View>
    </Modal>
  </Screen>;
}

const styles = StyleSheet.create({
  topbar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  backTarget: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  skeleton: { backgroundColor: theme.colors.surface, borderRadius: 16, padding: 20, gap: 16, minHeight: 130 },
  skeletonLine: { height: 16, width: '90%', backgroundColor: theme.colors.surfaceRaised, borderRadius: 6 },
  modalBackdrop: { flex: 1, padding: 24, backgroundColor: '#000B', justifyContent: 'center' },
  modalCard: { padding: 20, borderRadius: 20, backgroundColor: theme.colors.surface, maxHeight: '80%' },
  header: { gap: 7, marginBottom: 18 },
  eyebrow: { color: theme.colors.accent, fontSize: 12, fontWeight: '900', letterSpacing: 0.5, textTransform: 'uppercase' },
  title: { color: theme.colors.text, fontSize: 24, fontWeight: '800', lineHeight: 30 },
  copy: { color: theme.colors.textSecondary, fontSize: 14, lineHeight: 21 },
  stack: { gap: 13 },
  grow: { flex: 1 },
  heading: { color: theme.colors.text, fontSize: 16, fontWeight: '700', lineHeight: 22 },
  meta: { color: theme.colors.mutedText, fontSize: 12, fontWeight: '700' },
  status: { color: theme.colors.accent, fontSize: 12, fontWeight: '900' },
  progressTrack: { backgroundColor: theme.colors.surfaceRaised, borderRadius: 999, height: 6, overflow: 'hidden' },
  progressFill: { backgroundColor: theme.colors.accent, borderRadius: 999, height: '100%' },
  rowBetween: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  backRow: { alignItems: 'center', flexDirection: 'row', gap: 8, paddingVertical: 4 },
  backText: { color: theme.colors.accent, fontSize: 14, fontWeight: '900' },
  summaryCard: { alignItems: 'center', backgroundColor: theme.colors.accentDark, borderColor: theme.colors.accentBorder, borderRadius: theme.radius.md, borderWidth: 1, flexDirection: 'row', gap: 16, padding: 16 },
  summaryValue: { color: theme.colors.accent, fontSize: 28, fontWeight: '900' },
  summaryLabel: { color: theme.colors.text, fontSize: 13, fontWeight: '800', marginBottom: 7 },
  chapterCard: { gap: 12 },
  lockedCard: { borderColor: 'rgba(245, 158, 11, 0.35)' },
  chapterTop: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  chapterIndex: { alignItems: 'center', backgroundColor: theme.colors.accentSoft, borderRadius: 12, height: 38, justifyContent: 'center', width: 38 },
  chapterIndexText: { color: theme.colors.accent, fontSize: 15, fontWeight: '900' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  tag: { backgroundColor: theme.colors.surfaceRaised, borderRadius: 999, color: theme.colors.textSecondary, fontSize: 11, fontWeight: '800', overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 6 },
  lessonRow: { alignItems: 'center', backgroundColor: theme.colors.surfaceRaised, borderRadius: theme.radius.sm, flexDirection: 'row', gap: 11, padding: 13 },
  lessonTitle: { color: theme.colors.text, fontSize: 14, fontWeight: '800', marginBottom: 3 },
  resumeCard: { alignItems: 'center', backgroundColor: theme.colors.accentDark, borderColor: theme.colors.accentBorder, borderRadius: theme.radius.lg, borderWidth: 1, flexDirection: 'row', gap: 13, padding: 16 },
  resumeIcon: { alignItems: 'center', backgroundColor: theme.colors.accent, borderRadius: 999, height: 44, justifyContent: 'center', width: 44 },
  resumeEyebrow: { color: theme.colors.accent, fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  resumeTitle: { color: theme.colors.text, fontSize: 15, fontWeight: '900', marginTop: 3 },
  sectionRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 5 },
  sectionTitle: { color: theme.colors.text, fontSize: 18, fontWeight: '900' },
  playlistCard: { gap: 0, overflow: 'hidden', padding: 0 },
  thumbnail: { backgroundColor: theme.colors.surfaceRaised, height: 150, width: '100%' },
  thumbnailFallback: { alignItems: 'center', backgroundColor: theme.colors.accentDark, height: 132, justifyContent: 'center', width: '100%' },
  playlistBody: { gap: 10, padding: 16 },
  playerCard: { gap: 13 },
  player: { aspectRatio: 16 / 9, minHeight: 220, backgroundColor: '#000', borderRadius: 14, overflow: 'hidden' },
  accessCard: { borderColor: 'rgba(245, 158, 11, 0.35)', gap: 11, marginTop: 14 },
  accessIcon: { alignItems: 'center', backgroundColor: 'rgba(245, 158, 11, 0.12)', borderRadius: 999, height: 44, justifyContent: 'center', width: 44 },
  errorCard: { borderColor: 'rgba(239, 68, 68, 0.3)', gap: 10, marginTop: 12 },
});
