// Root layout — only here so that `app/not-found.tsx` and unmatched paths
// outside the [locale] segment have an <html>/<body> shell to render in.
// The real shell (font variables, lang attribute, NextIntlClientProvider)
// lives in src/app/[locale]/layout.tsx.
//
// See: https://next-intl.dev/docs/getting-started/app-router/with-i18n-routing#layout

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
