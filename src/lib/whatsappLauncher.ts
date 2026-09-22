import { Linking, NativeModules, Platform } from 'react-native';
import { DEFAULT_PUBLIC_AUTH_WHATSAPP_HREF, PUBLIC_AUTH_OTP_COMMAND } from '@/src/constants/mobileConfig';

export type WhatsAppTarget = 'personal' | 'business' | 'chooser' | 'default';

export const OFFICIAL_OTP_NUMBER = '919981807309';

export async function getInstalledWhatsAppApps(): Promise<{ hasPersonal: boolean; hasBusiness: boolean }> {
  if (Platform.OS === 'android' && NativeModules.GigxomiWhatsApp?.getInstalledApps) {
    try {
      return await NativeModules.GigxomiWhatsApp.getInstalledApps();
    } catch {
      return { hasPersonal: false, hasBusiness: false };
    }
  }
  return { hasPersonal: false, hasBusiness: false };
}

export async function openWhatsAppChat(
  phone: string,
  rawText: string,
  target: WhatsAppTarget = 'chooser',
  customHref?: string | null,
) {
  const cleanPhone = phone.replace(/\D/g, '');
  const encodedText = encodeURIComponent(rawText);

  // 1. Native Android Direct Chat Launcher via ACTION_VIEW
  // Opens chat directly with recipient and pre-fills text in the message input (NO share sheet!)
  if (Platform.OS === 'android' && NativeModules.GigxomiWhatsApp?.openChat) {
    try {
      await NativeModules.GigxomiWhatsApp.openChat(target, cleanPhone, rawText);
      return;
    } catch {
      // Fall through to Linking openURL
    }
  }

  // 2. Direct Meta WhatsApp URI (whatsapp://send?phone=...&text=...)
  const metaDirectUri = `whatsapp://send?phone=${cleanPhone}&text=${encodedText}`;
  try {
    const canOpen = await Linking.canOpenURL(metaDirectUri);
    if (canOpen) {
      await Linking.openURL(metaDirectUri);
      return;
    }
  } catch {
    // try universal web links
  }

  // 3. Fallback to Meta Conversion / Click-to-Chat Universal Links
  const candidates = [
    `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodedText}`,
    customHref || `https://wa.me/${cleanPhone}?text=${encodedText}`,
  ];

  for (const candidateUrl of candidates) {
    try {
      await Linking.openURL(candidateUrl);
      return;
    } catch {
      // try next
    }
  }
}

export async function openWhatsAppForOtp(target: WhatsAppTarget = 'chooser', customHref?: string | null) {
  const phone = OFFICIAL_OTP_NUMBER;
  const rawText = PUBLIC_AUTH_OTP_COMMAND || 'Get OTP';
  return openWhatsAppChat(phone, rawText, target, customHref || DEFAULT_PUBLIC_AUTH_WHATSAPP_HREF);
}
