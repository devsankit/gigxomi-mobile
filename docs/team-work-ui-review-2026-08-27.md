# Team and Work native UI review

Status: implemented locally; release/integration verification is NOT complete.

## What these screenshots are

These are actual Android emulator captures of the implemented React Native components, running in an isolated Expo Go SDK 54 preview. They are not HTML mockups. The names, scores, workloads and work posts marked `QA` are fixture data, not production records. The sample playback is a public CC0 test clip. Fixtures and the preview entry point live outside `mobile-app` at `C:/gx/qa/team-work-native` and are not imported by the release app.

The installed `com.gigxomi.app` release was not replaced. No Gigxomi APK/AAB, release version bump, production deployment, payment mutation, or messaging-routing change was made. Expo Go was installed only on emulator-5554 as a separate preview tool; its official SDK 54 download is documented at https://expo.dev/go?device=true&platform=android&sdkVersion=54.

## Implemented

- Discover editors and My Team use separate server queries, search, presence filtering and pagination. Accepted members and pending Team invitations have independent totals.
- Portfolio cards show server assessment scores (including unassessed/provisional), workload aggregates, prices and presence. Editor profiles use an authenticated allowlisted response; private accounting/contact/identity data is excluded.
- Native profile playback starts after a user chooses a sample. Unsupported or failed media has an explicit browser fallback.
- Assignment is Choose editors → Review assignment, with keyboard-safe Continue, retained profile/search selections, Team-only direct assignment and General offers. Existing conversation mutations and server permissions were preserved.
- Work cards have concise briefs, one budget, neutral deduplicated tags, applicant names/statuses and assigned editors. Proposals and review actions live in details. Actual completed/cancelled task states are retained.
- Freelancer Team prioritizes incoming invitations; agency discovery and work/team introductions remain available separately.
- Outgoing freelancer requests cannot appear as invitations they can accept themselves. Work-interest requests are not mislabelled as Team invitations.
- Account/tenant-scoped caches and explicit loading/empty/error/retry states replace silent failures and fabricated recommendation percentages.

## Verification

| Check | Result |
| --- | --- |
| Mobile TypeScript | Passed |
| Backend source-only TypeScript | Passed using `.codex-tmp/team-work-tsconfig.json` |
| Focused lint | Passed, no remaining warnings in changed mobile files |
| Mobile presentation/adapter/cache and onboarding tests | 21 passed |
| Directory/profile/privacy and existing billing contracts | 21 passed |
| Application stability / protected messaging regression suites | 44 passed |
| Prisma schema validation and client generation | Passed |
| Android native fixture interactions | Grid, profile playback/fallback, invite-pending state, application details, tag expansion, Team/General selection, offline selection, keyboard Continue, profile-return selection, role switching, retry recovery, large-text single-column layout checked |
| Production web build | Blocked: unchanged `src/app/globals.css` fails Tailwind compilation with `E.map is not a function` |
| Read-only configured database check | Blocked: Prisma `P1001` (unreachable database); no write was attempted |
| Authenticated agency/freelancer integration | Not verified in this phase; preview auth/API responses are isolated fixtures |

The unrestricted root TypeScript command also traverses unrelated temporary snapshots and stale generated `.next` files; the source-only check excludes those artifacts. A successful source-only check is not a substitute for a successful web production build.

The emulator display density and font-scale overrides used for accessibility checks were restored. The preview process log is at [native-logcat.txt](C:/gx/qa/team-work-native/native-logcat.txt). One deliberately exercised media failure was a 403 from the original public sample host; a working CC0 clip then verified native playback. No crash/React Native error was found in the final preview-process log check. Push notification, real session expiry, actual invitation acceptance, application submission, assignment races and seat enforcement still require authenticated staging verification.

## Screenshots

### Agency Team — Discover

Updated after preview-size feedback: square portfolio covers in the grid, landscape covers in single-column mode, presence over the media and a shorter details/action area. Profile and compact assignment cards retain their own layouts. These QA clips have no supplied poster, so the neutral play fallback is intentional, not fabricated artwork.

Follow-up verification: mobile TypeScript, focused lint and all 21 mobile tests passed. On emulator-5554 the grid cover measured 479 × 480 px; at 360 dp / 1.3 font scale the single-column cover measured 978 × 550 px. Profile opening and scrolling to its card actions were checked. Display overrides were restored afterward. [Large-text cover](C:/gx/qa/team-work-native/24-portfolio-large-text.png) · [Large-text actions](C:/gx/qa/team-work-native/25-portfolio-large-text-actions.png).

![Native Team discovery with larger portfolio covers](C:/gx/qa/team-work-native/22-portfolio-proportions.png)

### Agency Work

![Native agency Work](C:/gx/qa/team-work-native/02-agency-work.png)

### Freelancer Work

![Native freelancer Work](C:/gx/qa/team-work-native/12-freelancer-work.png)

### Freelancer Team — incoming invitations

![Native freelancer Team](C:/gx/qa/team-work-native/13-freelancer-team.png)

### My Team and pending invitations

![Accepted Team members](C:/gx/qa/team-work-native/15-my-team.png)

![Pending Team invitations](C:/gx/qa/team-work-native/16-team-pending.png)

### Profile and portfolio playback

![Native portfolio playback with test clip](C:/gx/qa/team-work-native/14-portfolio-playback.png)

### Assignment search with the keyboard open

![Keyboard-safe assignment](C:/gx/qa/team-work-native/08-keyboard-search.png)

### General multi-editor offer review

![General offer review](C:/gx/qa/team-work-native/11-general-offer.png)

### Applications

![Applicant details](C:/gx/qa/team-work-native/03-applications.png)

### Tags and error recovery

![Expanded tags](C:/gx/qa/team-work-native/21-expanded-tags.png)

![Retry state](C:/gx/qa/team-work-native/17-directory-retry.png)

### Narrow screen / enlarged text

![Single-column layout at 360 dp and 1.3 font scale](C:/gx/qa/team-work-native/20-large-text-single-column.png)

## Source ownership and next gate

Mobile edits: `C:/gx/mobile-app`, branch `codex/onboarding-autopay-release-2.1.2`, base `c38d52fc`.

Backend edits: `C:/Users/hello/OneDrive/Documents/New project`, branch `codex/phonepe-autopay-fix`, base `fb870c43`. Only the editor directory route, new profile route/loader and related tests changed. No protected messaging module was edited.

Before integration/release: resolve the web build failure, provide a reachable staging database and authenticated QA sessions, deploy the directory/profile contracts to staging, then test real agency/freelancer invitations, applications, assignment permission/race/limit handling and account switching. Do not use these fixture screenshots as evidence that production flows passed.
