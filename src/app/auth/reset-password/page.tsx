import type { Metadata } from "next";
import { ResetForm } from "./ResetForm";

export const metadata: Metadata = {
  title: "Réinitialisation du mot de passe · DeutschFit",
  robots: { index: false, follow: false },
};

type Props = { searchParams: Promise<{ token_hash?: string }> };

export default async function ResetPasswordPage({ searchParams }: Props) {
  const { token_hash } = await searchParams;
  const safeTokenHash =
    typeof token_hash === "string" && token_hash.length > 0 ? token_hash : undefined;
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-10">
      <div className="w-full max-w-md">
        <h1 className="font-display text-[34px] leading-[1.15] tracking-tight text-text-primary">
          {safeTokenHash ? "Nouveau mot de passe" : "Réinitialiser le mot de passe"}
        </h1>
        <ResetForm token_hash={safeTokenHash} />
      </div>
    </main>
  );
}
