# `.well-known/` — universal-link / app-link association files

These files let iOS and Android trust `deutschfit.app` to open the
DeutschFit mobile app for `/auth/*` URLs (the email-confirmation bridge in
`src/app/auth/confirm/route.ts`).

They are served from `https://deutschfit.app/.well-known/...` with
`Content-Type: application/json` (set in `next.config.ts`).

## Files

| File                          | Platform | Purpose                                                |
| ----------------------------- | -------- | ------------------------------------------------------ |
| `apple-app-site-association`  | iOS      | Universal Links — extension-less by Apple's contract.  |
| `assetlinks.json`             | Android  | App Links — verified at install time + on demand.      |

## Required placeholders

Two hard-coded placeholders ship in this PR. Replace both before the bridge
can actually open the app:

### 1. `TEAMID_PLACEHOLDER` (iOS, in `apple-app-site-association`)

Apple Team ID is a 10-character alphanumeric string (e.g. `ABCDE12345`).

How to obtain:

1. Sign in to https://developer.apple.com/account
2. Click **Membership** in the sidebar
3. Copy **Team ID** (under "Membership Details")

Replace the literal string `TEAMID_PLACEHOLDER` so the entry reads:

```json
"appIDs": ["ABCDE12345.com.deutschfit.app"]
```

### 2. `SHA256_PLACEHOLDER` (Android, in `assetlinks.json`)

This is the SHA-256 fingerprint of the signing certificate Google Play
uses for `com.deutschfit.app`. Format: 32 colon-separated bytes
(`AB:CD:EF:...`).

How to obtain (preferred — uses the EAS-managed Play upload key):

```bash
cd repos/deutschfit-mobile
eas credentials -p android
# pick: production → "Show fingerprint"
```

Alternative (raw keystore):

```bash
keytool -list -v -keystore <path-to-upload-keystore.jks> -alias <alias>
```

Replace the literal string `SHA256_PLACEHOLDER` with the colon-separated
hex fingerprint.

## Important: redeploy after editing

These files are static assets baked into the Vercel deployment. **Any
change to either file requires a new Vercel deploy** for the new content
to be served. iOS and Android cache the association response — after
deployment, you may also need to:

- iOS: reinstall the app or wait up to 24 h for the CDN-style cache to flush
  (Apple verifies via `app-site-association.cdn-apple.com`).
- Android: re-run `adb shell pm verify-app-links --re-verify com.deutschfit.app`
  on a test device, or wait for the next install/update cycle.

## Verifying

After deploy, the files must be reachable at the apex domain:

```bash
curl -i https://deutschfit.app/.well-known/apple-app-site-association
curl -i https://deutschfit.app/.well-known/assetlinks.json
```

Both responses should be HTTP 200 with `Content-Type: application/json`.
