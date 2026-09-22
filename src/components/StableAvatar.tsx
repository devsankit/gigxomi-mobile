import { Image, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/src/constants/theme';
import { useCachedMediaUri } from '@/src/lib/media';

function getInitials(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'GX';
}

export function StableAvatar({
  imageUrl,
  label,
  size = 50,
}: {
  imageUrl?: string | null;
  label: string;
  size?: number;
}) {
  const uri = useCachedMediaUri(imageUrl);
  const initials = getInitials(label);
  const radius = size / 2;

  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: radius }]}>
      {uri ? <Image accessibilityIgnoresInvertColors alt={label} source={{ uri }} style={[styles.image, { borderRadius: radius }]} /> : null}
      {!uri ? <Text style={[styles.text, { fontSize: Math.max(12, Math.round(size * 0.3)) }]}>{initials}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    backgroundColor: theme.colors.surfaceRaised,
  },
  image: {
    width: '100%',
    height: '100%',
    backgroundColor: theme.colors.surfaceRaised,
  },
  text: {
    color: theme.colors.accent,
    fontWeight: '900',
  },
});
