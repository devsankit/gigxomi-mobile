# Gigxomi Mobile

Expo React Native app for Gigxomi Android testing with EAS/native builds.

## Install

```bash
cd apps/mobile
npm install
```

## Run Live Testing

```bash
npx expo start --tunnel
```

## Testing On Phone

1. Use an installed preview APK, development build, or Play Store build for native features.
2. Keep phone and laptop on the same Wi-Fi when testing local development APIs.
3. Run `npx expo start --tunnel` for JS iteration.
4. Test push notifications only in the installed build.

## Environment

Create `.env` from `.env.example` and set:

```bash
EXPO_PUBLIC_API_URL=https://gigxomi.com/api
```

## Backend Connection

- Login calls `POST /api/mobile/auth/login` and WhatsApp OTP calls `POST /api/mobile/auth/request-otp`.
- Signup calls `POST /api/mobile/auth/signup`, verifies through `POST /api/mobile/auth/verify-signup-otp`, then starts the same package billing flow as the website.
- Package status calls `GET /api/mobile/subscription/status`; packages call `GET /api/mobile/packages`.
- Chats call the existing `GET /api/conversations`, `POST /api/conversations/[id]/messages`, and related read/payment endpoints.
- Projects, services, and delivery orders call the existing protected Gigxomi APIs.
- Native mobile push notifications use Firebase Messaging and Notifee, save Firebase FCM device tokens with `POST /api/mobile/push-token`, disable tokens with `DELETE /api/mobile/push-token`, and can be tested with `POST /api/mobile/push-test`.
- The session token is stored with `expo-secure-store`.
- Business data stays on the backend/database. Do not store chats, services, projects, packages, payments, or roles in local app storage.

## Push Notifications

Mobile push is wired for installed Android/iOS builds. Turn it on from `Settings > Notifications`, then use `Send test notification` from the same Settings section.

Important: remote push notifications are not available in Expo Go on Android for current Expo SDKs. Use an installed preview APK, development build, or Play Store build for real Android push testing.

Foreground notification UX:

- When a chat notification arrives for the currently open conversation, Gigxomi silently refreshes that thread without showing a duplicate system notification or in-app bubble.
- When a notification arrives while the app is open elsewhere, Gigxomi shows an in-app floating bubble that opens the linked chat, assignment, or notification page.
- When the app is minimized, chat pushes are displayed through Notifee so Android can show the reply action. A true Messenger-style bubble over other apps needs native Android conversation bubbles or overlay permission work; Expo Go cannot provide that.

Desktop install:

- The mobile Expo app can run on desktop as Expo Web and can be packaged as an installable PWA after web build/hosting.
- For a full downloadable Windows/macOS desktop app, wrap the web build with Electron or Tauri. The existing Next.js web app can also be made installable as a PWA.

Android Firebase config:

- `google-services.json` is included at the mobile app root.
- `app.json` points `expo.android.googleServicesFile` to `./google-services.json`.
- The Android package is `com.gigxomi.app` for Play Store release.
- The production Firebase project is `gigxomi-516f1` and the Android app id is `1:902040776606:android:2dde549edfbebc175fb08f`.
- If Firebase push is reconfigured in the Firebase console, download a fresh `google-services.json` for `com.gigxomi.app` and replace the root mobile copy.
- Backend push delivery goes directly through Firebase Cloud Messaging. Configure Firebase Admin credentials on the server with `FIREBASE_PROJECT_ID` plus either `FIREBASE_SERVICE_ACCOUNT_JSON`, `FIREBASE_SERVICE_ACCOUNT_FILE`, or a service-account `FIREBASE_CLIENT_EMAIL`/`FIREBASE_PRIVATE_KEY` pair. A normal Google login email such as `gigxomi@gmail.com` is not the Firebase Admin service-account email.

## APK Build Later

```bash
npm install -g eas-cli
eas login
cd apps/mobile
eas build:configure
eas build -p android --profile preview
```

The `preview` profile creates an APK for direct Android installation. The `production` profile creates an Android App Bundle for Play Store release.

## EAS Workflows

Android preview APK builds run from `.eas/workflows/android-preview.yml`.

Production Android and iOS builds run from `.eas/workflows/create-production-builds.yml`:

```bash
npx eas-cli@latest workflow:run .eas/workflows/create-production-builds.yml
```

If the dashboard git ref run fails because the connected repository path is malformed, run the workflow from the local mobile project directory so EAS uploads the project archive directly.
