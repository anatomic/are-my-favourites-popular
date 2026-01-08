import type { ReactElement } from 'react';
import { useState, useCallback } from 'react';
import type { ShareButtonProps, SharePlatform } from '../../types/sharing';
import { getShareUrl, copyToClipboard, openSharePopup } from '../../utils/sharing';
import './sharing.css';

// Platform-specific icons as inline SVGs
function XIcon(): ReactElement {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function FacebookIcon(): ReactElement {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

function LinkedInIcon(): ReactElement {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}

function LinkIcon(): ReactElement {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
      <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z" />
    </svg>
  );
}

function CheckIcon(): ReactElement {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
    </svg>
  );
}

const icons: Record<SharePlatform, () => ReactElement> = {
  twitter: XIcon,
  facebook: FacebookIcon,
  linkedin: LinkedInIcon,
  copy: LinkIcon,
};

const platformLabels: Record<SharePlatform, string> = {
  twitter: 'Share on X',
  facebook: 'Share on Facebook',
  linkedin: 'Share on LinkedIn',
  copy: 'Copy link',
};

function ShareButton({
  platform,
  content,
  variant = 'secondary',
  size = 'md',
  onShare,
}: ShareButtonProps): ReactElement {
  const [copied, setCopied] = useState(false);

  const handleClick = useCallback(async () => {
    if (platform === 'copy') {
      const success = await copyToClipboard(content.url);
      if (success) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } else {
      const shareUrl = getShareUrl(platform, content);
      openSharePopup(shareUrl, platform);
    }
    onShare?.(platform);
  }, [platform, content, onShare]);

  const label = platform === 'copy' && copied ? 'Copied!' : platformLabels[platform];
  const Icon = platform === 'copy' && copied ? CheckIcon : icons[platform];

  const className = [
    'share-btn',
    `share-btn--${variant}`,
    `share-btn--${size}`,
    `share-btn--${platform}`,
    copied && 'share-btn--success',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      className={className}
      onClick={handleClick}
      aria-label={label}
      title={label}
    >
      <Icon />
      {variant !== 'icon-only' && <span className="share-btn__label">{label}</span>}
    </button>
  );
}

export default ShareButton;
