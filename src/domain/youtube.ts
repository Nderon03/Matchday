/**
 * YouTube links for match videos. Only YouTube is accepted (watch, youtu.be, Shorts, Live and embed
 * links); we keep just the 11-character video id, so nothing else can be linked. Mirrors the
 * database function public.youtube_video_id.
 */
const ID = '([A-Za-z0-9_-]{11})';
const HOST = '^(?:https?://)?(?:(?:www|m|music)\\.)?';
const PATTERNS = [
  new RegExp(`${HOST}youtu\\.be/${ID}(?:[?&#/].*)?$`, 'i'),
  new RegExp(`${HOST}(?:youtube\\.com|youtube-nocookie\\.com)/(?:shorts|live|embed)/${ID}(?:[?&#/].*)?$`, 'i'),
  new RegExp(`${HOST}youtube\\.com/watch\\?(?:.*&)?v=${ID}(?:[&#].*)?$`, 'i'),
];

export function youtubeVideoId(url: string): string | null {
  const u = url.trim();
  if (!u || u.length > 300) return null;
  for (const re of PATTERNS) {
    const m = u.match(re);
    if (m) return m[1];
  }
  return null;
}

export const youtubeWatchUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`;
export const youtubeThumbnail = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
