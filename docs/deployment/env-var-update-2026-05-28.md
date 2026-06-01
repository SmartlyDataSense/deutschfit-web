# Environment Variable Update — 2026-05-28

## Summary
Set `NEXT_PUBLIC_SITE_URL` for all Vercel environments to fix password reset and magic link redirects.

## Changes Made

### deutschfit-web (Vercel)
Set `NEXT_PUBLIC_SITE_URL` via Vercel CLI for three environments:

| Environment | Value | Git Branch | Set Date |
|-------------|-------|------------|----------|
| Development | `https://web-dev.deutschfit.app` | dev | 2026-04-26 (existing) |
| Preview | `https://deutschfit.app` | preprod | 2026-05-28 |
| Production | `https://deutschfit.app` | main | 2026-05-28 |

Commands executed:
```bash
# Production
vercel env rm NEXT_PUBLIC_SITE_URL production --yes
vercel env add NEXT_PUBLIC_SITE_URL production --value "https://deutschfit.app" --yes

# Preview (preprod branch)
vercel env add NEXT_PUBLIC_SITE_URL preview preprod --value "https://deutschfit.app" --yes
```

### deutschfit-mobile (EAS)
Added `EXPO_PUBLIC_WEB_URL` to all build profiles in `eas.json`:

| Profile | Value | Channel |
|---------|-------|---------|
| development | `https://web-dev.deutschfit.app` | development |
| preview | `https://deutschfit.app` | preview |
| production | `https://deutschfit.app` | production |

Also added `EXPO_PUBLIC_AUTH_MODE=otp` to preview/production profiles.

## Impact
- Password reset flows now redirect to correct domain per environment
- Magic link callbacks use correct origin
- OG metadata/social cards use correct URLs
- Mobile app "Forgot password" button respects build profile

## Next Deployments
- **Web app**: Next push to `preprod` or `main` will rebuild with new `NEXT_PUBLIC_SITE_URL`
- **Mobile app**: PR #440 (dev → preprod) contains the mobile changes

## Documentation Updated
- `deutschfit-web/docs/deployment/vercel-dev-branch.md` — updated env var matrix table

## Related Issues
- Fixes password reset redirecting to web-dev.deutschfit.app on production mobile builds
- Implements env-var approach instead of hardcoded URLs in mobile authMode.ts

## Verification Steps
After next deployment:

1. **Web app**: Check magic link emails contain correct domain
   ```bash
   # Development build should have: https://web-dev.deutschfit.app/auth/callback
   # Preview/Production: https://deutschfit.app/auth/callback
   ```

2. **Mobile app**: Tap "Forgot password?" button
   ```bash
   # Development build → opens web-dev.deutschfit.app
   # Preview/Production build → opens deutschfit.app
   ```

3. **OG metadata**: Inspect page source for `og:url` meta tags
   ```bash
   curl -s https://deutschfit.app | grep "og:url"
   # Should show: https://deutschfit.app (not empty or localhost)
   ```

## Rollback
If issues arise:

```bash
# Revert web production to previous value (if known)
vercel env rm NEXT_PUBLIC_SITE_URL production --yes
vercel env add NEXT_PUBLIC_SITE_URL production

# Mobile app: revert PR #440 changes in eas.json
```
