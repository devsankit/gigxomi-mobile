# Mobile 2.1.4 journey groundwork verification — 28 August 2026

## Result

The mobile source is prepared for future referral and journey tracking, but it is **not connected to Meta** and no final APK/AAB was generated in this pass. Final signing remains gated by authenticated isolated QA, as required by the release plan.

Current production `/api/mobile/config` returns JSON without a `journeyTracking` capability. The parser therefore disables the feature: no optional events are queued, no journey preference is displayed, and no request is made to the future endpoint.

## Implemented

- Google Play Install Referrer 2.2 through a reproducible Expo config plugin and native Kotlin bridge.
- Approved `gigxomi.com/r/<opaque-id>` and `gigxomi://r/<opaque-id>` parsing without changing the existing billing-return link.
- Local first-touch metadata limited to a validated opaque referral ID and timestamps. Phone numbers, arbitrary URLs, credentials and raw referrer strings are never retained.
- A fail-closed `journeyTracking` mobile-config capability supporting schema version 1 and a versioned privacy notice.
- A fixed same-origin `/api/journey/events` destination, an allowlisted event/property contract, a maximum 200-event queue, seven-day expiry, stable retry IDs and account isolation.
- Explicit optional preference handling. Logout, account change or consent withdrawal clears pending optional events. Disabled mode does not create historical events.
- Lightweight hooks for app/session, onboarding, Learning, portfolio playback and acknowledged Work applications. Mobile observations never assert payment, package activation, assessment completion or verified registration.
- Play Reader checkout handlers independently block paid checkout and web-pricing links. This is in addition to hiding those controls.
- Release bundling resets Metro's transform cache for every native build. This prevents Direct and Play Reader distribution flags from leaking across sequential APK/AAB builds.

No Meta SDK, advertising ID, Facebook Graph request, production messaging change or payment-calculation change was added.

## Verification

| Check | Result | Evidence |
|---|---|---|
| Mobile regression suite | Passed | 81 tests, including 20 journey/referral tests |
| Mobile TypeScript | Passed | `tsc --noEmit` |
| Focused mobile lint | Passed | New and touched release-groundwork files |
| Native Kotlin compile | Passed | `:app:compileDebugKotlin` |
| Direct production JS export | Passed | Production API, QA mode off |
| Play Reader production JS export | Passed | Reader distribution marker, QA mode off |
| Direct/Reader cache isolation | Passed | Fresh bundles differ (`0243…1581` vs `9915…73ED`); Reader contains neither payment CTA copy nor QA controls |
| Play version-code lookup | Passed | Play lists codes 1, 13, 14 and 15; code 20 is unused |
| Live capability check | Passed | `/api/mobile/config` returned 200 JSON; capability absent, therefore disabled |
| Fresh isolated native install | Passed | Separate package `com.gigxomi.app.journeyqa`, not the production package |
| Direct-install referrer absence | Passed | Native result `unavailable`, one read, no crash |
| Duplicate launch / malformed link | Passed | Referrer read stayed at one; journey requests stayed at zero |
| UI fixtures | Passed, fixture only | Agency/Freelancer dashboard, Team, portfolio player and Learning |
| Authenticated Agency/Freelancer end-to-end | **Blocked** | No reachable isolated QA database/accounts/provider sandbox |

Actual Android captures (fixture data is visibly labelled and is not production evidence):

- `C:/gx/qa/journey-native/02-native-referrer-disabled.png`
- `C:/gx/qa/journey-native/03-freelancer-dashboard.png`
- `C:/gx/qa/journey-native/04-freelancer-team.png`
- `C:/gx/qa/dashboard-portfolio/38-journey-release-agency-team.png`
- `C:/gx/qa/dashboard-portfolio/40-journey-release-portfolio-ready.png`
- `C:/gx/qa/dashboard-portfolio/42-journey-release-played.png`
- `C:/gx/qa/dashboard-portfolio/43-journey-release-agency-learning.png`

## Explicit blockers before final signing

The required authenticated flows cannot be honestly marked passed without an isolated QA API/database and accounts. The production account ending 7309 and its tenant were not used or changed. No real OTP, customer message, Meta connection or payment was initiated.

Before final artifacts, verify isolated Freelancer onboarding/deferral, applications, invitations, assignment/delivery, Learning persistence and account switching; then Agency plan/setup, integrations, Team/General assignment and Work. Native provider/push checks also need test assets. Only after those pass should the existing upload key be used to generate the direct APK and Play Reader AAB.

Prepared referral links also require website routing and Android verified-domain association in the later backend/web phase. Local parsing must not be presented as a live Sales attribution service.
