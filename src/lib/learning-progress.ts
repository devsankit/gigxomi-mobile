export type LearningProgress = { status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED'; progressPercent: number; watchedSeconds: number; durationSeconds: number; lastPositionSeconds: number };
export type PlaybackState = 'PLAYING' | 'PAUSED' | 'ENDED';
export type WatchEvent = { courseId: string; chapterId: string; lessonId: string; playbackSessionId: string; eventId: string; activeSeconds: number; playbackState: PlaybackState; watchedSeconds: number; durationSeconds: number; positionSeconds: number };
export type WatchSample = { position: number; duration: number; state: number };

export function learningScope(userId: string, role: string, tenantId?: string | null) {
  return encodeURIComponent(JSON.stringify([userId, role, tenantId ?? null]));
}
export function parseWatchSample(value: unknown): WatchSample | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as WatchSample;
  if (![v.position, v.duration, v.state].every(Number.isFinite) || v.position < 0 || v.duration <= 0 || v.duration > 604800 || v.position > v.duration + 1 || ![-1, 0, 1, 2, 3, 5].includes(v.state)) return null;
  return v;
}

/** Counts only observed playback, not seeking, wall-clock gaps or background time. */
export class WatchAccumulator {
  private active = 0;
  private previous: WatchSample | null = null;
  private observedAt = 0;
  private sequence = 0;
  private lastSentPosition: number;
  position: number;
  duration: number;
  constructor(private identity: Pick<WatchEvent, 'courseId' | 'chapterId' | 'lessonId' | 'playbackSessionId'>, position = 0, duration = 0) { this.position = position; this.lastSentPosition = position; this.duration = duration; }
  get pendingSeconds() { return this.active; }
  observe(sample: WatchSample, now: number, foreground = true) {
    const delta = sample.position - (this.previous?.position ?? sample.position);
    const elapsed = Math.max(0, (now - this.observedAt) / 1000);
    if (foreground && this.previous?.state === 1 && delta > 0 && delta <= 2.5 && elapsed <= 3) this.active += Math.min(delta, elapsed);
    this.previous = foreground ? sample : null; this.observedAt = now;
    this.position = sample.position; this.duration = sample.duration;
  }
  pause() { this.previous = null; }
  take(state: PlaybackState): WatchEvent | null {
    if (!this.duration || (this.active < 1 && (state === 'PLAYING' || this.position === this.lastSentPosition))) return null;
    const activeSeconds = Math.min(15, Math.floor(this.active));
    this.active -= activeSeconds;
    this.lastSentPosition = this.position;
    return { ...this.identity, eventId: `${this.identity.playbackSessionId}-${++this.sequence}`, playbackState: state, activeSeconds, watchedSeconds: 0, positionSeconds: this.position, durationSeconds: this.duration };
  }
}

type QueueStorage = { read(): Promise<string | null>; write(value: string): Promise<void> };
export type QueueStatus = { pending: number; saving: boolean; error: unknown };
type QueueOptions = { storage: QueueStorage; send(event: WatchEvent): Promise<{ progress?: LearningProgress | null }>; changed(status: QueueStatus): void; confirmed(event: WatchEvent, progress: LearningProgress): void };

/** Persist before sending; delete only after acknowledgement. Retries reuse the exact event. */
export class LearningProgressQueue {
  private events: WatchEvent[] = [];
  private running: Promise<void> | null = null;
  private writes: Promise<void> = Promise.resolve();
  private stopped = false;
  private error: unknown = null;
  private loaded = false;
  readonly ready: Promise<void>;
  constructor(private options: QueueOptions) {
    this.ready = this.restore();
  }
  private async restore() {
    try {
      const stored = await this.options.storage.read();
      const parsed: unknown = stored ? JSON.parse(stored) : [];
      if (!Array.isArray(parsed) || !parsed.every(e => e && typeof e.eventId === 'string' && typeof e.lessonId === 'string' && typeof e.playbackSessionId === 'string' && Number.isFinite(e.activeSeconds))) throw new Error('Saved learning progress could not be read.');
      this.events = parsed; this.loaded = true;
    } catch (error) { this.error = error; }
    this.notify();
  }
  private notify() { if (!this.stopped) this.options.changed({ pending: this.events.length, saving: Boolean(this.running), error: this.error }); }
  private persist() {
    this.writes = this.writes.catch(() => undefined).then(() => this.options.storage.write(JSON.stringify(this.events)));
    return this.writes;
  }
  async enqueue(event: WatchEvent) {
    await this.ready;
    if (!this.loaded) { this.notify(); return false; }
    if (!this.events.some(item => item.eventId === event.eventId)) this.events.push(event);
    try { await this.persist(); } catch (error) { this.error = error; this.notify(); return false; }
    this.notify();
    if (!this.error && !this.stopped) void this.drain();
    return true;
  }
  async retry() {
    await this.ready;
    if (!this.loaded) await this.restore();
    if (!this.loaded || this.stopped) return;
    this.error = null;
    try { await this.persist(); await this.drain(); } catch (error) { this.error = error; this.notify(); }
  }
  private drain(): Promise<void> {
    if (this.running) return this.running;
    this.running = (async () => {
      // Defer until running is assigned, including when send resolves immediately.
      await Promise.resolve(); this.notify();
      while (!this.stopped && this.events.length && !this.error) {
        const event = this.events[0];
        try {
          const result = await this.options.send(event);
          if (!result.progress) throw new Error('Learning progress was not confirmed.');
          // Persist the acknowledged removal before notifying the UI.
          this.events.shift();
          try { await this.persist(); } catch (error) { this.events.unshift(event); throw error; }
          if (!this.stopped) this.options.confirmed(event, result.progress);
        } catch (error) { this.error = error; }
        this.notify();
      }
    })().finally(() => { this.running = null; this.notify(); });
    return this.running;
  }
  dispose() { this.stopped = true; }
}
