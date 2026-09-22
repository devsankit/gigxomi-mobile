import { RefreshControl } from 'react-native';
import type { RefreshControlProps } from 'react-native';

import { theme } from '@/src/constants/theme';

type BrandedRefreshControlProps = RefreshControlProps & {
  idleTitle?: string;
  syncingTitle?: string;
};

export function BrandedRefreshControl({
  idleTitle = 'Pull to refresh',
  refreshing,
  syncingTitle = 'Syncing latest...',
  tintColor = theme.colors.accent,
  titleColor = theme.colors.mutedText,
  ...props
}: BrandedRefreshControlProps) {
  return (
    <RefreshControl
      {...props}
      colors={[theme.colors.accent, theme.colors.accentStrong, theme.colors.text]}
      progressBackgroundColor={theme.colors.surface}
      refreshing={refreshing}
      tintColor={tintColor}
      title={refreshing ? syncingTitle : idleTitle}
      titleColor={titleColor}
    />
  );
}
