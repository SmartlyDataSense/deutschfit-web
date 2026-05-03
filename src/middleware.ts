import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);

export const config = {
  // Match every path EXCEPT:
  //   - /api/* (API routes are locale-agnostic)
  //   - /admin/* (operator UI is English-only in v1; no /en/admin etc.)
  //   - /auth/* (email-confirmation bridge — locale-agnostic, opened from email)
  //   - /.well-known/* (Universal Link / App Link association files)
  //   - /_next/* (Next.js internals)
  //   - any file with an extension (assets, /favicon.ico, /fonts/*.ttf)
  matcher: ["/((?!api|admin|auth|\\.well-known|_next|_vercel|.*\\..*).*)"],
};
