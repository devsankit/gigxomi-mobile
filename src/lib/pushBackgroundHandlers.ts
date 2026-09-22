import notifee, { EventType } from '@notifee/react-native';
import messaging from '@react-native-firebase/messaging';

import {
  acceptProjectOfferFromNotification,
  cancelProjectOfferNotification,
  displayRemotePushNotification,
  GIGXOMI_NOTIFICATION_REPLY_ACTION_ID,
  GIGXOMI_PROJECT_OFFER_ACCEPT_ACTION_ID,
  GIGXOMI_PROJECT_OFFER_REJECT_ACTION_ID,
  rejectProjectOfferFromNotification,
  sendChatReplyFromNotification,
  shouldDisplayRemotePushInBackground,
} from '@/src/lib/pushNotifications';

messaging().setBackgroundMessageHandler(async (message) => {
  if (shouldDisplayRemotePushInBackground(message)) {
    await displayRemotePushNotification(message);
  }
});

notifee.onBackgroundEvent(async ({ detail, type }) => {
  if (type !== EventType.ACTION_PRESS) {
    return;
  }

  if (detail.pressAction?.id === GIGXOMI_NOTIFICATION_REPLY_ACTION_ID) {
    await sendChatReplyFromNotification((detail.notification?.data ?? {}) as Record<string, unknown>, detail.input);
    if (detail.notification?.id) {
      await notifee.cancelNotification(detail.notification.id);
    }
    return;
  }

  const data = (detail.notification?.data ?? {}) as Record<string, unknown>;
  const conversationId = typeof data.conversationId === 'string' ? data.conversationId.trim() : '';
  if (detail.pressAction?.id === GIGXOMI_PROJECT_OFFER_ACCEPT_ACTION_ID) {
    await acceptProjectOfferFromNotification(data);
    await cancelProjectOfferNotification(conversationId);
    return;
  }

  if (detail.pressAction?.id === GIGXOMI_PROJECT_OFFER_REJECT_ACTION_ID) {
    await rejectProjectOfferFromNotification(data, detail.input);
    await cancelProjectOfferNotification(conversationId);
  }
});
