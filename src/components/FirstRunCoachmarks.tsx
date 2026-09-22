import * as SecureStore from 'expo-secure-store';
import type { RefObject } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { Dimensions, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/src/constants/theme';

type TargetRect = { x: number; y: number; width: number; height: number };

export type CoachmarkStep = {
  title: string;
  copy: string;
  target: RefObject<View | null>;
};

export function FirstRunCoachmarks({ storageKey, steps }: { storageKey: string; steps: CoachmarkStep[] }) {
  const [visible, setVisible] = useState(false);
  const [index, setIndex] = useState(0);
  const [target, setTarget] = useState<TargetRect | null>(null);
  const step = steps[index];
  const screen = Dimensions.get('window');

  const measure = useCallback(() => {
    requestAnimationFrame(() => {
      step?.target.current?.measureInWindow((x, y, width, height) => {
        setTarget({ x: Math.max(8, x - 6), y: Math.max(8, y - 6), width: Math.min(screen.width - 16, width + 12), height: height + 12 });
      });
    });
  }, [screen.width, step]);

  useEffect(() => {
    let active = true;
    void SecureStore.getItemAsync(storageKey).then((value) => {
      if (active && value !== 'complete') setVisible(true);
    }).catch(() => { if (active) setVisible(true); });
    return () => { active = false; };
  }, [storageKey]);

  useEffect(() => {
    if (visible) measure();
  }, [index, measure, visible]);

  async function finish() {
    setVisible(false);
    await SecureStore.setItemAsync(storageKey, 'complete').catch(() => undefined);
  }

  function next() {
    if (index >= steps.length - 1) {
      void finish();
      return;
    }
    setIndex((current) => current + 1);
  }

  if (!step || !target) return null;
  const showBelow = target.y + target.height + 220 < screen.height;
  const tooltipPosition = showBelow ? { top: target.y + target.height + 12 } : { bottom: screen.height - target.y + 12 };

  return (
    <Modal animationType="fade" onRequestClose={() => void finish()} transparent visible={visible}>
      <View style={styles.overlay}>
        <View style={[styles.scrim, { height: target.y, left: 0, right: 0, top: 0 }]} />
        <View style={[styles.scrim, { height: target.height, left: 0, top: target.y, width: target.x }]} />
        <View style={[styles.scrim, { height: target.height, left: target.x + target.width, right: 0, top: target.y }]} />
        <View style={[styles.scrim, { bottom: 0, left: 0, right: 0, top: target.y + target.height }]} />
        <View pointerEvents="none" style={[styles.highlight, target]} />
        <View style={[styles.tooltip, tooltipPosition]}>
          <Text style={styles.stepLabel}>Quick tour · {index + 1} of {steps.length}</Text>
          <Text style={styles.title}>{step.title}</Text>
          <Text style={styles.copy}>{step.copy}</Text>
          <View style={styles.actions}><Pressable accessibilityRole="button" onPress={() => void finish()} style={styles.skip}><Text style={styles.skipText}>Skip tour</Text></Pressable><Pressable accessibilityRole="button" onPress={next} style={styles.next}><Text style={styles.nextText}>{index === steps.length - 1 ? 'Start using Gigxomi' : 'Next'}</Text></Pressable></View>
        </View>
      </View>
    </Modal>
  );
}

export async function resetFirstRunCoachmarks(storageKey: string) {
  await SecureStore.deleteItemAsync(storageKey);
}

const styles = StyleSheet.create({
  overlay: { flex: 1 },
  scrim: { backgroundColor: 'rgba(0,0,0,0.82)', position: 'absolute' },
  highlight: { borderColor: theme.colors.accentStrong, borderRadius: 20, borderWidth: 2, position: 'absolute', shadowColor: theme.colors.accentStrong, shadowOpacity: 0.7, shadowRadius: 16 },
  tooltip: { backgroundColor: theme.colors.surface, borderColor: theme.colors.accentBorder, borderRadius: 20, borderWidth: 1, gap: 8, left: theme.spacing.lg, padding: theme.spacing.lg, position: 'absolute', right: theme.spacing.lg },
  stepLabel: { color: theme.colors.accentStrong, fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  title: { color: theme.colors.text, fontSize: 20, fontWeight: '900' },
  copy: { color: theme.colors.textSecondary, fontSize: theme.typography.small, lineHeight: 20 },
  actions: { alignItems: 'center', flexDirection: 'row', gap: 10, justifyContent: 'flex-end', marginTop: 4 },
  skip: { paddingHorizontal: 10, paddingVertical: 11 },
  skipText: { color: theme.colors.mutedText, fontSize: 12, fontWeight: '800' },
  next: { backgroundColor: theme.colors.accentStrong, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 11 },
  nextText: { color: theme.colors.background, fontSize: 12, fontWeight: '900' },
});
