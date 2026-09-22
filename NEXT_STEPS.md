# Gigxomi Mobile Next Steps

## Current Status

- Expo Router app is in `mobile-app`.
- Expo Go development works with `npx expo start --go`.
- Android JavaScript export passes with `npx expo export --platform android`.
- EAS project is linked to `@ppw/gigxomi`.
- Production workflow is `.eas/workflows/create-production-builds.yml`.
- Mobile login now uses `POST /api/mobile/auth/login` and stores the returned token in `expo-secure-store`.
- Protected backend APIs accept `Authorization: Bearer <token>` alongside the existing web session cookie.
- Dashboard, profile, service list, and create-service screens are wired to the existing backend APIs.

## Next Build Process

1. Keep feature work inside `mobile-app` unless backend APIs need to change.
2. Run `npm install`, `npm run typecheck`, and `npx expo export --platform android` before each push.
3. Push to `mobile`.
4. Run Android preview APK when direct install is needed:

```bash
eas build -p android --profile preview
```

5. Run production workflow when app-store artifacts are needed:

```bash
npx eas-cli@latest workflow:run .eas/workflows/create-production-builds.yml
```

## Product Build Plan

1. Extend mobile registration to match the existing package selection and WhatsApp OTP signup flow.
2. Add full loading, empty, and error states to orders and future connected screens.
3. Add edit, pause, submit-for-review, and delete controls for mobile services.
4. Connect orders to the real freelancer assignment/conversation data model.
5. Add Expo Go QA on Android, then EAS preview APK QA, then production build.
6. Fix the malformed Expo dashboard repository path so ref-based workflow runs can pull directly from GitHub.
