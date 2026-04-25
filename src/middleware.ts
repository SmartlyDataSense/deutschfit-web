import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);

export const config = {
  // Match every path EXCEPT:
  //   - /api/* (API routes are locale-agnostic)
  //   - /admin/* (operator UI is English-only in v1; no /en/admin etc.)
  //   - /_next/* (Next.js internals)
  //   - any file with an extension (assets, /favicon.ico, /fonts/*.ttf)
  matcher: ["/((?!api|admin|_next|_vercel|.*\\..*).*)"],
};
