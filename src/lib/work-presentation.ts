import type { MobileTeamEditor } from '@/src/types';

export function uniqueTags(items: string[]) {
  const seen = new Set<string>();
  return items.map(item => item.trim()).filter(item => {
    const key = item.toLocaleLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key); return true;
  });
}
export function rupees(amount?: number | null) {
  return typeof amount === 'number' && Number.isFinite(amount) ? `₹${amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : 'Price on request';
}
export function budgetLabel(min?: number | null, max?: number | null) {
  if (min == null && max == null) return 'Budget to discuss';
  return min != null && max != null && min !== max ? `${rupees(min)}–${rupees(max)}` : rupees(min ?? max);
}
export function trustLabel(editor: Pick<MobileTeamEditor, 'trustScore' | 'trustProvisional'>) {
  return typeof editor.trustScore === 'number' ? `${editor.trustScore}/100${editor.trustProvisional ? ' · Provisional' : ''}` : 'Not assessed';
}
export function publicMediaUrl(value?: string | null) {
  try { const url = new URL(value ?? ''); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null; } catch { return null; }
}
export function youtubeVideoId(value?: string | null) {
  try {
    const url = new URL(value ?? '');
    const host = url.hostname.replace(/^www\./, '');
    const id = host === 'youtu.be' ? url.pathname.slice(1) : ['youtube.com', 'm.youtube.com', 'youtube-nocookie.com'].includes(host) ? url.searchParams.get('v') ?? url.pathname.match(/^\/(?:embed|shorts)\/([^/]+)/)?.[1] : null;
    return id && /^[\w-]{11}$/.test(id) ? id : null;
  } catch { return null; }
}
