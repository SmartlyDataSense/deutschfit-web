import { Box } from "@/components/primitives";
import { AdminNav } from "./AdminNav";

type Props = {
  operatorEmail: string | null;
  children: React.ReactNode;
};

/**
 * Visual chrome for every gated admin page. Pages call `requireOperator()`
 * first, then render `<AdminShell operatorEmail={…}>{content}</AdminShell>`.
 * Pulling the chrome out of the layout keeps the operator gate per-page
 * and prevents the login surface from accidentally being protected by it.
 */
export function AdminShell({ operatorEmail, children }: Props) {
  return (
    <>
      <AdminNav operatorEmail={operatorEmail} />
      <main className="mx-auto max-w-7xl px-6 py-8">
        <Box>{children}</Box>
      </main>
    </>
  );
}
