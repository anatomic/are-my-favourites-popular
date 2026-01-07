export type SharePlatform = 'twitter' | 'facebook' | 'linkedin' | 'copy';

export interface ShareContent {
  url: string;
  title: string;
  text: string;
  hashtags?: string[];
}

export interface PersonalizedStats {
  totalTracks: number;
  avgPopularity: number;
}

export interface ShareButtonProps {
  platform: SharePlatform;
  content: ShareContent;
  variant?: 'primary' | 'secondary' | 'icon-only';
  size?: 'sm' | 'md' | 'lg';
  onShare?: (platform: SharePlatform) => void;
}

export interface ShareButtonGroupProps {
  stats?: PersonalizedStats | null;
  variant?: 'primary' | 'secondary' | 'icon-only';
  showToggle?: boolean;
  onShare?: (platform: SharePlatform, isPersonalized: boolean) => void;
}
