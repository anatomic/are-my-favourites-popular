import type { ShareContent, SharePlatform, PersonalizedStats } from '../types/sharing';

/** Base URL for the app */
export const APP_URL = typeof window !== 'undefined' ? window.location.origin : '';

/** Generate static share content (generic app promotion) */
export function getStaticShareContent(): ShareContent {
  return {
    url: APP_URL,
    title: 'Are My Favourites Popular?',
    text: 'Discover how your Spotify saved tracks compare to global listening trends!',
    hashtags: ['Spotify', 'Music', 'DataViz'],
  };
}

/** Generate personalized share content based on user stats */
export function getPersonalizedShareContent(stats: PersonalizedStats): ShareContent {
  const { totalTracks, avgPopularity } = stats;

  return {
    url: APP_URL,
    title: 'My Spotify Stats',
    text: `I have ${totalTracks.toLocaleString()} saved tracks with an average popularity of ${Math.round(avgPopularity)}! Check yours:`,
    hashtags: ['Spotify', 'MyMusicStats'],
  };
}

/** Generate platform-specific share URL */
export function getShareUrl(platform: SharePlatform, content: ShareContent): string {
  const { url, title, text, hashtags } = content;
  const encodedUrl = encodeURIComponent(url);
  const encodedText = encodeURIComponent(text);
  const encodedTitle = encodeURIComponent(title);

  switch (platform) {
    case 'twitter': {
      const hashtagString = hashtags?.length ? `&hashtags=${hashtags.join(',')}` : '';
      return `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedText}${hashtagString}`;
    }

    case 'facebook':
      // Facebook only uses the URL, extracts OG tags
      return `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`;

    case 'linkedin':
      return `https://www.linkedin.com/shareArticle?mini=true&url=${encodedUrl}&title=${encodedTitle}&summary=${encodedText}`;

    case 'copy':
      return url; // Just return the URL for copying

    default:
      return url;
  }
}

/** Copy text to clipboard */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for older browsers
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      return true;
    } catch {
      return false;
    } finally {
      document.body.removeChild(textarea);
    }
  }
}

/** Open share URL in popup window */
export function openSharePopup(url: string, platform: SharePlatform): void {
  const width = 600;
  const height = 400;
  const left = (window.innerWidth - width) / 2;
  const top = (window.innerHeight - height) / 2;

  window.open(
    url,
    `share-${platform}`,
    `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no`
  );
}
