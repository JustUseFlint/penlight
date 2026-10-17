export type ParsedUrl =
  | { ok: true; kind: 'youtube'; id: string | null; url: string; playlist: boolean }
  | { ok: true; kind: 'other'; url: string }
  | { ok: false; error: string };

const YT_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com', 'youtu.be']);
const ID = /^[A-Za-z0-9_-]{11}$/;

function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || h === '0.0.0.0') return true;
  if (h === '::1' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80')) return h.includes(':');
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }
  return false;
}

/** Normalises any YouTube / generic video URL. Playlist links with a video id resolve to that single video. */
export function parseVideoUrl(input: string): ParsedUrl {
  let raw = (input || '').trim();
  if (!raw) return { ok: false, error: 'Paste a video link to get started.' };
  if (ID.test(raw)) return { ok: true, kind: 'youtube', id: raw, url: `https://www.youtube.com/watch?v=${raw}`, playlist: false };
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) raw = 'https://' + raw;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { ok: false, error: "That doesn't look like a valid link." };
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return { ok: false, error: 'Only http(s) video links are supported.' };
  if (isPrivateHost(u.hostname)) return { ok: false, error: "Links to local or private network addresses aren't allowed." };
  const host = u.hostname.toLowerCase();
  if (YT_HOSTS.has(host)) {
    let id: string | null = null;
    if (host === 'youtu.be') id = u.pathname.split('/')[1] || null;
    else {
      const p = u.pathname.split('/').filter(Boolean);
      if (u.pathname === '/watch') id = u.searchParams.get('v');
      else if (['shorts', 'embed', 'live', 'v'].includes(p[0] || '')) id = p[1] || null;
    }
    if (id && ID.test(id)) {
      return { ok: true, kind: 'youtube', id, url: `https://www.youtube.com/watch?v=${id}`, playlist: u.searchParams.has('list') };
    }
    const list = u.searchParams.get('list');
    if (list && u.pathname === '/playlist') {
      return { ok: true, kind: 'youtube', id: null, url: `https://www.youtube.com/playlist?list=${encodeURIComponent(list)}`, playlist: true };
    }
    return { ok: false, error: "That YouTube link doesn't point to a specific video." };
  }
  return { ok: true, kind: 'other', url: u.toString() };
}
