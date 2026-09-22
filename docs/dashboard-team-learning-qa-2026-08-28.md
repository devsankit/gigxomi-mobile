# Dashboard, Team Learning and portfolio playback — local QA

## Scope and safety

Latest mobile source in `C:/gx/mobile-app`, branch `codex/onboarding-autopay-release-2.1.2`, base HEAD `aaec2930` with pre-existing local changes preserved.

No production push, backend/chat routing changes, real invitations, payments, account deletion or release APK/AAB in this pass. The installed production Gigxomi account was not used for mutations.

Android evidence is **native component QA with isolated fixtures**, not authenticated production acceptance. The runner lives outside the app at `C:/gx/qa/dashboard-portfolio`. Its API adapter has no production fetch fallback. Names, scores, sample video and progress in these screenshots are test data and are not bundled in the app source.

## Implemented

- Learning renders within both role-specific Team screens, beside My Team/My agencies. The bottom navigation is unchanged.
- Shared Learning screen serves both embedded Team and standalone dashboard navigation.
- Dashboard shows a compact work snapshot, editor/agency discovery slides, course slides, saved learning totals and account metrics. Removed generated trend bars and the startup tutorial.
- Course cards resolve their own course/lesson. Completed courses open their own chapter progress; resume revalidates access through the catalog API.
- Shared portfolio player opens from Team and dashboard before an invitation. Full profiles use the same playback implementation.
- Direct video uses native controls; YouTube uses an app-identified WebView with ready/error events. Provider URL normalization covers Vimeo, Loom and Drive while preserving original fallback links.
- Player loading is bounded, failed playback has retry/browser fallback, and leaving/backgrounding unmounts portfolio playback. Missing media is never replaced with fabricated portfolio artwork.
- Portfolio invitation errors appear inside the modal with contextual copy and a direct retry action. Success is confirmed only after the mutation succeeds.
- Missing Trust Score is marked pending, missing price/workload is not invented, and notification/create buttons have accessible labels.

## Verification

| Check | Result | Evidence |
| --- | --- | --- |
| Mobile TypeScript | Passed | `npm run typecheck` |
| Focused lint | Passed | Dashboard, Team, shared Learning/player/media helpers and feedback components; no errors/warnings |
| Focused regression tests | Passed | 47 tests across learning, full-app reliability, Team/Work and dashboard navigation |
| Native bundling | Passed | Current production components compiled in isolated Expo Go runner, 1,032 modules |
| Agency dashboard/editor slides | Passed — fixtures | `36-restored-runtime.png`, `17-course-slides.png` |
| Team Learning/no new footer | Passed — fixtures | `12-team.png`, `13-learning-in-team.png` |
| Portfolio preview and native play control | Passed — fixtures/public CC0 video | `10-native-controls.png`, `11-playing-portfolio.png`, `26-watch-before-invite.png` |
| Invitation failure then successful retry | Passed — fixtures | `27-invite-retry.png`, `28-invitation-pending.png`; copy subsequently refined to “Invitation not confirmed”/“Retry invitation” |
| Completed course opens correct report | Passed — fixtures | `19-selected-course-report.png` |
| Dashboard resume opens selected lesson | Passed — fixtures | `20-resume-selected-lesson.png`, `21-resumed-lesson-ready.png` |
| YouTube learning playback and progress acknowledgement | Passed — fixtures/public video | `23-learning-progress.png`; redacted log records 10 watched seconds acknowledged; chapter showed 1% saved |
| Package-locked chapter | Passed — fixture access response | `25-learning-package-lock.png` |
| Freelancer Team/Learning/dashboard | Passed — fixtures | `29-freelancer-team.png`, `30-freelancer-learning.png`, `32-freelancer-dashboard.png` |
| Learning API error/recovery | Passed — simulated 503 | `31-learning-retry.png`; library restored after recovery |
| Enlarged text Team layout | Passed — emulator at font scale 1.3 | `37-team-large-text-verified.png`: single-column cards, readable tabs and profile action; restored font scale 1.0 |
| Seeking/background/retry/account isolation accounting | Passed — unit tests | Watch accumulator, durable queue, scoped storage and cache tests; not live backend proof |

Screenshots, matching UI XML and `emulator-redacted.log` are in `C:/gx/qa/dashboard-portfolio`.

## Remaining verification

- Authenticated production directory/profile permissions, invitations and actual freelancer portfolio URLs need separate verification before release. No account approval, import cleanup or production data migration is claimed here.
- Vimeo/Loom/Drive routing has unit coverage, but their native playback with owner permissions remains unverified.
- This is not full-app sign-off for registration, assignment races, payments, push notifications or integrations.
- Expo AV emits a deprecation warning in this existing runtime. Playback worked; migration requires a separately verified native dependency/build change.
- The test host needed an IPv4-to-IPv6 localhost bridge for Metro. That helper is outside the mobile source and does not alter production API configuration.

No new APK/AAB should be represented as containing these changes until the requested release gates are completed.
