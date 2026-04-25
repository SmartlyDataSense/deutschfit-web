import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { Text } from "@/components/primitives";

type Props = {
  title: string;
  effective?: string;
  version?: string;
  children: ReactNode;
};

/**
 * Shared shell for /legal/* pages. Keeps the typography stack consistent
 * (Playfair display heading + Inter body) and gives a back link to the
 * landing page so users on a deep link have an obvious way out.
 *
 * Body content uses a token-driven `prose-legal` class instead of pulling
 * in @tailwindcss/typography — the legal pages are short enough that a
 * hand-rolled style is leaner and avoids one more dependency.
 */
export function LegalShell({ title, effective, version, children }: Props) {
  return (
    <div className="min-h-screen flex flex-col">
      <main className="mx-auto w-full max-w-3xl px-6 py-10 sm:py-14 flex-1">
        <header className="mb-8">
          <Link
            href="/"
            className="inline-block text-sm text-text-secondary underline underline-offset-4 hover:text-text-primary"
          >
            ← DeutschFit
          </Link>
          <Text variant="h1" as="h1" className="mt-4 text-text-primary">
            {title}
          </Text>
          {(effective || version) && (
            <p className="mt-3 text-sm text-text-tertiary">
              {effective && (
                <>
                  <span className="font-semibold text-text-secondary">
                    Effective date:
                  </span>{" "}
                  {effective}
                </>
              )}
              {effective && version && " · "}
              {version && (
                <>
                  <span className="font-semibold text-text-secondary">Version:</span>{" "}
                  {version}
                </>
              )}
            </p>
          )}
        </header>

        <article className="prose-legal text-text-primary [&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-text-primary [&_p]:mb-4 [&_p]:leading-relaxed [&_p]:text-text-secondary [&_ul]:my-4 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:text-text-secondary [&_ol]:my-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:text-text-secondary [&_li]:mb-2 [&_a]:text-text-primary [&_a]:underline [&_a]:underline-offset-4 [&_strong]:text-text-primary">
          {children}
        </article>
      </main>
      <footer className="border-t border-line-soft px-6 py-6">
        <p className="mx-auto max-w-3xl text-center text-xs text-text-tertiary">
          © 2026 DeutschFit.
        </p>
      </footer>
    </div>
  );
}
