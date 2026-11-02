import { youtubeVideoId, youtubeThumbnail, youtubeWatchUrl } from '../youtube';

describe('youtubeVideoId', () => {
  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://youtube.com/watch?feature=share&v=dQw4w9WgXcQ&t=42s', 'dQw4w9WgXcQ'],
    ['https://m.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://youtu.be/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://youtu.be/dQw4w9WgXcQ?si=abc123&t=10', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/shorts/aB3_d-Ef9Gh', 'aB3_d-Ef9Gh'],
    ['https://www.youtube.com/live/aB3_d-Ef9Gh?feature=shared', 'aB3_d-Ef9Gh'],
    ['https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['  https://youtu.be/dQw4w9WgXcQ  ', 'dQw4w9WgXcQ'],
  ])('accepts %s', (url, id) => expect(youtubeVideoId(url)).toBe(id));

  it.each([
    'https://vimeo.com/123456789',
    'https://evil.com/watch?v=dQw4w9WgXcQ',
    'https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ',
    'https://www.youtube.com/watch?v=short',
    'https://www.youtube.com/@somechannel',
    'https://www.youtube.com/playlist?list=PL123',
    'javascript:alert(1)',
    '',
  ])('rejects %s', (url) => expect(youtubeVideoId(url)).toBeNull());

  it('builds watch and thumbnail URLs from the id only', () => {
    expect(youtubeWatchUrl('dQw4w9WgXcQ')).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(youtubeThumbnail('dQw4w9WgXcQ')).toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
  });
});
