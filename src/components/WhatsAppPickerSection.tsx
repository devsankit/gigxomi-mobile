import { Feather, FontAwesome5 } from '@expo/vector-icons';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { theme } from '@/src/constants/theme';
import { openWhatsAppForOtp, type WhatsAppTarget } from '@/src/lib/whatsappLauncher';

type WhatsAppPickerSectionProps = {
  customHref?: string | null;
  onOpened?: () => void;
};

export function WhatsAppPickerSection({ customHref, onOpened }: WhatsAppPickerSectionProps) {
  const handleLaunch = async (target: WhatsAppTarget) => {
    onOpened?.();
    await openWhatsAppForOtp(target, customHref);
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Feather name="shield" size={14} color={theme.colors.accent} />
        <Text style={styles.headerText}>Select WhatsApp to Get OTP</Text>
      </View>
      <Text style={styles.subText}>
        Choose your preferred WhatsApp app. Send &quot;Get OTP&quot; to receive your verification code. This screen will stay frozen and hold your state.
      </Text>

      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={[styles.appButton, styles.personalButton]}
          activeOpacity={0.8}
          onPress={() => void handleLaunch('personal')}
        >
          <View style={styles.iconCircle}>
            <FontAwesome5 name="whatsapp" size={18} color="#25D366" />
          </View>
          <View style={styles.buttonTextWrap}>
            <Text style={styles.appTitle}>WhatsApp</Text>
            <Text style={styles.appSub}>Personal</Text>
          </View>
          <Feather name="chevron-right" size={16} color={theme.colors.mutedText} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.appButton, styles.businessButton]}
          activeOpacity={0.8}
          onPress={() => void handleLaunch('business')}
        >
          <View style={[styles.iconCircle, styles.businessCircle]}>
            <FontAwesome5 name="whatsapp" size={18} color="#128C7E" />
          </View>
          <View style={styles.buttonTextWrap}>
            <Text style={styles.appTitle}>WhatsApp Business</Text>
            <Text style={styles.appSub}>Business App</Text>
          </View>
          <Feather name="chevron-right" size={16} color={theme.colors.mutedText} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.appButton, styles.chooserButton]}
          activeOpacity={0.8}
          onPress={() => void handleLaunch('chooser')}
        >
          <View style={[styles.iconCircle, styles.chooserCircle]}>
            <Feather name="share-2" size={16} color={theme.colors.accent} />
          </View>
          <View style={styles.buttonTextWrap}>
            <Text style={styles.appTitle}>App Chooser</Text>
            <Text style={styles.appSub}>System Share Sheet</Text>
          </View>
          <Feather name="chevron-right" size={16} color={theme.colors.mutedText} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.surfaceSoft,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.accentBorder,
    gap: theme.spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerText: {
    color: theme.colors.text,
    fontSize: theme.typography.section,
    fontWeight: '800',
  },
  subText: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.caption,
    lineHeight: 18,
  },
  buttonRow: {
    gap: 8,
  },
  appButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.sm,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    gap: theme.spacing.sm,
  },
  personalButton: {
    borderColor: '#25D36640',
  },
  businessButton: {
    borderColor: '#128C7E40',
  },
  chooserButton: {
    borderColor: theme.colors.accentBorder,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#25D36615',
    alignItems: 'center',
    justifyContent: 'center',
  },
  businessCircle: {
    backgroundColor: '#128C7E15',
  },
  chooserCircle: {
    backgroundColor: theme.colors.accentSoft,
  },
  buttonTextWrap: {
    flex: 1,
    gap: 1,
  },
  appTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.body,
    fontWeight: '700',
  },
  appSub: {
    color: theme.colors.mutedText,
    fontSize: theme.typography.caption,
  },
});

