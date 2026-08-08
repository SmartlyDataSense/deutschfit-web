"use client";

import { useState } from "react";

import {
  AppText,
  AppButton,
  Chip,
  Card,
  ProgressBar,
  TimerPill,
  ScoreBadge,
  Donut,
  SegmentedControl,
  Input,
  Textarea,
  Skeleton,
  Waveform,
  GlassSurface,
} from "@/learner/ui/primitives";

/**
 * Interactive body of the dev gallery — every S0.8 learner primitive in
 * labeled sections so visual regressions are one Playwright screenshot
 * away. Split out from `page.tsx` (a Server Component) so the production
 * gate in `page.tsx` can call `notFound()` server-side and actually return
 * a 404 status code — a `"use client"` page can only swap in the not-found
 * UI after hydration, leaving the initial HTTP response at 200.
 */
function Section({
  title,
  testId,
  children,
}: {
  title: string;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <section data-testid={testId} className="flex flex-col gap-4 border-b border-line-soft pb-10">
      <AppText as="h2" size="h3" weight="bold" family="serif">
        {title}
      </AppText>
      <div className="flex flex-wrap items-start gap-4">{children}</div>
    </section>
  );
}

export function GalleryClient() {
  const [segment, setSegment] = useState<"fr" | "en">("fr");
  const [chipSelected, setChipSelected] = useState(false);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-10 px-6 py-10">
      <AppText as="h1" size="display" weight="bold" family="serif">
        Learner primitives gallery
      </AppText>

      <Section title="AppText" testId="gallery-apptext">
        <div className="flex flex-col gap-2">
          <AppText size="display" weight="bold" family="serif">
            Display 42
          </AppText>
          <AppText size="h1" weight="bold" family="serif">
            H1 34
          </AppText>
          <AppText size="h2" weight="semi">
            H2 28
          </AppText>
          <AppText size="h3" weight="semi">
            H3 22
          </AppText>
          <AppText size="bodyLg">Body large 18</AppText>
          <AppText size="body">Body 16</AppText>
          <AppText size="small" tone="secondary">
            Small 14
          </AppText>
          <AppText size="caption" tone="tertiary">
            Caption 12
          </AppText>
          <AppText tone="cta">Tone cta</AppText>
          <AppText tone="coach">Tone coach</AppText>
          <AppText tone="gold">Tone gold</AppText>
          <AppText tone="warning">Tone warning</AppText>
          <AppText tone="success">Tone success</AppText>
          <AppText numeric>01:23 numeric</AppText>
        </div>
      </Section>

      <Section title="AppButton" testId="gallery-appbutton">
        <AppButton label="Solid" variant="solid" onClick={() => {}} />
        <AppButton label="Outline" variant="outline" onClick={() => {}} />
        <AppButton label="Ghost" variant="ghost" onClick={() => {}} />
        <AppButton label="Premium" variant="premium" onClick={() => {}} />
        <AppButton label="Disabled" variant="solid" onClick={() => {}} disabled />
        <AppButton label="Loading" variant="solid" onClick={() => {}} loading />
      </Section>

      <Section title="Chip" testId="gallery-chip">
        <Chip label="Idle" />
        <Chip label="Selected" selected />
        <Chip
          label="Toggleable"
          selected={chipSelected}
          onClick={() => setChipSelected((v) => !v)}
        />
        <Chip label="Disabled" disabled />
      </Section>

      <Section title="Card" testId="gallery-card">
        <Card>
          <AppText size="small">Static card</AppText>
        </Card>
        <Card onClick={() => {}}>
          <AppText size="small">Pressable card</AppText>
        </Card>
      </Section>

      <Section title="ProgressBar" testId="gallery-progressbar">
        <div className="flex w-64 flex-col gap-3">
          <ProgressBar value={0} aria-label="0%" />
          <ProgressBar value={0.5} aria-label="50%" tone="coach" />
          <ProgressBar value={1} aria-label="100%" tone="success" />
          <ProgressBar aria-label="indeterminate" tone="gold" />
        </div>
      </Section>

      <Section title="TimerPill" testId="gallery-timerpill">
        <TimerPill remainingMs={125_000} state="idle" />
        <TimerPill remainingMs={45_000} state="warning" />
        <TimerPill remainingMs={5_000} state="danger" />
      </Section>

      <Section title="ScoreBadge" testId="gallery-scorebadge">
        <ScoreBadge score={68} total={100} label="Gesamt" tone="neutral" />
        <ScoreBadge score={85} total={100} label="Acquis" tone="success" />
        <ScoreBadge score={40} total={100} label="À consolider" tone="warning" />
        <ScoreBadge score={92} total={100} label="Or" tone="gold" />
      </Section>

      <Section title="Donut" testId="gallery-donut">
        <Donut value={0}>
          <AppText size="small">0%</AppText>
        </Donut>
        <Donut value={0.5}>
          <AppText size="small">50%</AppText>
        </Donut>
        <Donut value={1}>
          <AppText size="small">100%</AppText>
        </Donut>
        <Donut
          segments={[
            { value: 0.5, tone: "teal" },
            { value: 0.25, tone: "amber" },
          ]}
        >
          <AppText size="small">Segments</AppText>
        </Donut>
      </Section>

      <Section title="SegmentedControl" testId="gallery-segmentedcontrol">
        <SegmentedControl
          aria-label="Language"
          options={[
            { label: "FR", value: "fr" },
            { label: "EN", value: "en" },
          ]}
          value={segment}
          onChange={setSegment}
        />
      </Section>

      <Section title="Input / Textarea" testId="gallery-input">
        <div className="flex w-72 flex-col gap-4">
          <Input label="E-mail" placeholder="you@example.com" />
          <Input label="With error" placeholder="you@example.com" error="Adresse invalide" />
          <Textarea label="Réponse" placeholder="Écris ta réponse ici…" />
        </div>
      </Section>

      <Section title="Skeleton" testId="gallery-skeleton">
        <div className="flex w-72 flex-col gap-3">
          <Skeleton.Block height={40} />
          <Skeleton.Text />
          <Skeleton.Card />
        </div>
      </Section>

      <Section title="Waveform" testId="gallery-waveform">
        <div className="w-72">
          <Waveform />
        </div>
      </Section>

      <Section title="GlassSurface" testId="gallery-glasssurface">
        <GlassSurface>
          <AppText tone="inverse" size="body" weight="semi">
            Frosted glass surface
          </AppText>
        </GlassSurface>
      </Section>
    </main>
  );
}
