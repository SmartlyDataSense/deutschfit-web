"use client";

/**
 * `SettingsRow` — web port of
 * `mobile/src/features/profil/components/SettingsRow.tsx`.
 * S11-D11: no leading icon (canonical sprite lacks the glyphs mobile
 * uses; inventing glyphs is forbidden). Chevron hidden for
 * `tone="warning"` and disabled rows (mobile parity). min-h 56px
 * (`min-h-14`) matches mobile's touch target.
 *
 * Layout decision (S11.4, resolving the Task 3 open inference): the row
 * itself is FLAT — no own background or radius. Mobile's own
 * ProfilScreen groups `SettingsRow`s inside a single container
 * (`styles.settingsList`), but that container has no `backgroundColor` —
 * mobile's ProfilScreen list is fully flat/transparent on the hero
 * background, and mobile's profil `SettingsRow` carries no card
 * background either. The shared `bg-bg-card` / rounded-surface-with-
 * hairline-dividers look applied here is **borrowed from
 * `SettingsScreen.tsx`'s pattern** (`features/settings/screens/
 * SettingsScreen.tsx`, its `styles.card` — the cog-reached screen, a
 * different mobile screen from ProfilScreen), not something mobile's
 * ProfilScreen itself renders. The caller (`ProfilScreen`) owns that
 * shared surface; this component only renders its content.
 */
import type { ReactNode } from "react";
import clsx from "clsx";

import { Icon } from "@/learner/core/icons/Icon";
import { AppText } from "@/learner/ui/primitives";

export interface SettingsRowProps {
  readonly label: string;
  readonly value?: string;
  readonly trailing?: ReactNode;
  readonly comingSoon?: string;
  readonly tone?: "default" | "warning";
  readonly disabled?: boolean;
  readonly onClick?: () => void;
  /** Renders an <a target="_blank"> instead of a <button> (S11-D7/D8 legal links). */
  readonly href?: string;
  readonly ariaLabel?: string;
  readonly testID?: string;
}

export function SettingsRow({
  label,
  value,
  trailing,
  comingSoon,
  tone = "default",
  disabled = false,
  onClick,
  href,
  ariaLabel,
  testID,
}: SettingsRowProps) {
  const showChevron =
    tone !== "warning" && !disabled && (onClick !== undefined || href !== undefined);

  const body = (
    <>
      <AppText
        size="body"
        weight="medium"
        tone={tone === "warning" ? "warning" : disabled ? "tertiary" : "primary"}
        className="flex-1 text-left"
      >
        {label}
      </AppText>
      {comingSoon ? (
        <span className="rounded-full bg-bg-hero px-2 py-0.5">
          <AppText size="caption" tone="tertiary">
            {comingSoon}
          </AppText>
        </span>
      ) : null}
      {value ? (
        <AppText size="small" tone="secondary">
          {value}
        </AppText>
      ) : null}
      {trailing ?? null}
      {showChevron ? (
        <span data-testid={testID ? `${testID}-chevron` : undefined} aria-hidden="true">
          <Icon name="chevron" size={16} color="var(--color-text-tertiary)" />
        </span>
      ) : null}
    </>
  );

  const className = clsx(
    "flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left transition",
    disabled ? "cursor-not-allowed opacity-50" : "hover:bg-bg-subtle active:opacity-70"
  );

  if (href) {
    // Mobile parity: a disabled row is never interactive regardless of
    // whether it would otherwise be a link or a button (mobile's
    // SettingsRow.tsx:130-141 renders a plain, non-Pressable View for
    // any disabled row). A live `<a href>` here would stay clickable and
    // navigable even while "disabled" — so disabled+href drops the
    // anchor semantics entirely instead of just dimming it.
    if (disabled) {
      return (
        <span
          aria-disabled="true"
          aria-label={ariaLabel}
          data-testid={testID}
          className={clsx(className, "pointer-events-none")}
        >
          {body}
        </span>
      );
    }
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={ariaLabel}
        data-testid={testID}
        className={className}
      >
        {body}
      </a>
    );
  }

  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      data-testid={testID}
      className={className}
    >
      {body}
    </button>
  );
}
