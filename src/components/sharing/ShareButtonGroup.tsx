import type { ReactElement } from 'react';
import { useState, useMemo } from 'react';
import ShareButton from './ShareButton';
import type { ShareButtonGroupProps, SharePlatform, ShareContent } from '../../types/sharing';
import { getStaticShareContent, getPersonalizedShareContent } from '../../utils/sharing';
import './sharing.css';

const platforms: SharePlatform[] = ['twitter', 'facebook', 'linkedin', 'copy'];

function ShareButtonGroup({
  stats,
  variant = 'secondary',
  showToggle = true,
  onShare,
}: ShareButtonGroupProps): ReactElement {
  const [usePersonalized, setUsePersonalized] = useState(!!stats);

  const content: ShareContent = useMemo(() => {
    if (usePersonalized && stats) {
      return getPersonalizedShareContent(stats);
    }
    return getStaticShareContent();
  }, [usePersonalized, stats]);

  const handleShare = (platform: SharePlatform) => {
    onShare?.(platform, usePersonalized);
  };

  return (
    <div className="share-group">
      {showToggle && stats && (
        <div className="share-group__toggle">
          <label className="share-toggle">
            <input
              type="checkbox"
              checked={usePersonalized}
              onChange={(e) => setUsePersonalized(e.target.checked)}
            />
            <span className="share-toggle__label">Share my stats</span>
          </label>
        </div>
      )}
      <div className="share-group__buttons">
        {platforms.map((platform) => (
          <ShareButton
            key={platform}
            platform={platform}
            content={content}
            variant={variant}
            onShare={handleShare}
          />
        ))}
      </div>
    </div>
  );
}

export default ShareButtonGroup;
