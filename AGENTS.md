# Gigxomi Native Mobile Application (Android / iOS)

## 📌 Context & Architecture
- **Purpose**: Pure client-side Native Mobile UI for Agency Founders, Managers, and Freelancer Editors.
- **Technology**: React Native, Expo, Native Android wrapper.
- **Server Deployment**: **ZERO / NONE**. The mobile app source code is NEVER hosted or built on the production VPS.
- **Backend APIs**: Connects strictly to live backend services via HTTPS:
  - Primary Mobile API: `https://api.gigxomi.com` (Port 3003 on VPS)
  - Dashboard Origin: `https://app.gigxomi.com` (Port 3002 on VPS)

## ⚠️ Pre-Flight Verification Mandate
Before making any changes:
1. Verify what API endpoints exist on `https://api.gigxomi.com`.
2. Do NOT run server commands or PM2 commands here.
3. If an API is missing or needs modification, make the change inside `gigxomi-main-kb-push` first, verify on the backend, and then integrate in this mobile UI.
