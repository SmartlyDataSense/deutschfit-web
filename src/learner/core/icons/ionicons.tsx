/**
 * Ionicons "outline" glyphs used by the learner web app: chat bubble
 * (Coach message), lightbulb (tip), mic (Sprechen recording affordance),
 * and the two glyphs that mirror mobile's Coach / Examen tab icons.
 * Mobile renders these via `@expo/vector-icons`' `Ionicons` component
 * (see `repos/deutschfit-mobile/src/app/navigation.tsx`, which uses
 * `name={focused ? "sparkles" : "sparkles-outline"}` for the Coach tab
 * and `name={focused ? "document-text" : "document-text-outline"}` for
 * the Examen tab); this port takes the outline variant of each, matching
 * the DeutschFit web app's non-native tab bar state (no filled/outline
 * toggle).
 *
 * Path data is copied **verbatim** (MIT License, Ionic Team) from the
 * canonical ionicons source —
 * https://github.com/ionic-team/ionicons/blob/main/src/svg/<name>.svg —
 * license: https://github.com/ionic-team/ionicons/blob/main/LICENSE.
 * Native ionicons viewBox is `0 0 512 512`; kept as-is per glyph (not
 * normalized to the 24×24 DeutschFit sprite grid).
 */
import type { ReactElement, ReactNode } from "react";

export interface IoniconProps {
  readonly size?: number;
  readonly color?: string;
  readonly label?: string;
}

function ioniconSvg(
  size: number,
  color: string,
  label: string | undefined,
  children: ReactNode
): ReactElement {
  const decorative = label === undefined;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      style={{ color }}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : label}
      aria-hidden={decorative ? true : undefined}
    >
      {children}
    </svg>
  );
}

/** ionicons `chatbubble-outline` — verbatim path data. */
export function chatbubbleOutline({
  size = 24,
  color = "currentColor",
  label,
}: IoniconProps): ReactElement {
  return ioniconSvg(
    size,
    color,
    label,
    <path
      d="M87.49,380c1.19-4.38-1.44-10.47-3.95-14.86A44.86,44.86,0,0,0,81,361.34a199.81,199.81,0,0,1-33-110C47.65,139.09,140.73,48,255.83,48,356.21,48,440,117.54,459.58,209.85A199,199,0,0,1,464,251.49c0,112.41-89.49,204.93-204.59,204.93-18.3,0-43-4.6-56.47-8.37s-26.92-8.77-30.39-10.11a31.09,31.09,0,0,0-11.12-2.07,30.71,30.71,0,0,0-12.09,2.43L81.51,462.78A16,16,0,0,1,76.84,464a9.6,9.6,0,0,1-9.57-9.74,15.85,15.85,0,0,1,.6-3.29Z"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeMiterlimit={10}
      strokeWidth={32}
    />
  );
}

/** ionicons `bulb-outline` — verbatim path data. */
export function bulbOutline({
  size = 24,
  color = "currentColor",
  label,
}: IoniconProps): ReactElement {
  return ioniconSvg(
    size,
    color,
    label,
    <>
      <path
        d="M304,384V360c0-29,31.54-56.43,52-76,28.84-27.57,44-64.61,44-108,0-80-63.73-144-144-144A143.6,143.6,0,0,0,112,176c0,41.84,15.81,81.39,44,108,20.35,19.21,52,46.7,52,76v24"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={32}
      />
      <line
        x1="224"
        y1="480"
        x2="288"
        y2="480"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={32}
      />
      <line
        x1="208"
        y1="432"
        x2="304"
        y2="432"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={32}
      />
      <line
        x1="256"
        y1="384"
        x2="256"
        y2="256"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={32}
      />
      <path
        d="M294,240s-21.51,16-38,16-38-16-38-16"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={32}
      />
    </>
  );
}

/** ionicons `mic-outline` — verbatim path data. */
export function micOutline({
  size = 24,
  color = "currentColor",
  label,
}: IoniconProps): ReactElement {
  return ioniconSvg(
    size,
    color,
    label,
    <>
      <line
        x1="192"
        y1="448"
        x2="320"
        y2="448"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={32}
      />
      <path
        d="M384,208v32c0,70.4-57.6,128-128,128h0c-70.4,0-128-57.6-128-128V208"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={32}
      />
      <line
        x1="256"
        y1="368"
        x2="256"
        y2="448"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={32}
      />
      <path
        d="M256,64a63.68,63.68,0,0,0-64,64V239c0,35.2,29,65,64,65s64-29,64-65V128C320,92,292,64,256,64Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={32}
      />
    </>
  );
}

/** ionicons `sparkles-outline` — verbatim path data (Coach tab equivalent). */
export function sparklesOutline({
  size = 24,
  color = "currentColor",
  label,
}: IoniconProps): ReactElement {
  return ioniconSvg(
    size,
    color,
    label,
    <>
      <path
        d="M259.92,262.91,216.4,149.77a9,9,0,0,0-16.8,0L156.08,262.91a9,9,0,0,1-5.17,5.17L37.77,311.6a9,9,0,0,0,0,16.8l113.14,43.52a9,9,0,0,1,5.17,5.17L199.6,490.23a9,9,0,0,0,16.8,0l43.52-113.14a9,9,0,0,1,5.17-5.17L378.23,328.4a9,9,0,0,0,0-16.8L265.09,268.08A9,9,0,0,1,259.92,262.91Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={32}
      />
      <polygon
        points="108 68 88 16 68 68 16 88 68 108 88 160 108 108 160 88 108 68"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={32}
      />
      <polygon
        points="426.67 117.33 400 48 373.33 117.33 304 144 373.33 170.67 400 240 426.67 170.67 496 144 426.67 117.33"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={32}
      />
    </>
  );
}

/** ionicons `document-text-outline` — verbatim path data (Examen tab equivalent). */
export function documentTextOutline({
  size = 24,
  color = "currentColor",
  label,
}: IoniconProps): ReactElement {
  return ioniconSvg(
    size,
    color,
    label,
    <>
      <path
        d="M416,221.25V416a48,48,0,0,1-48,48H144a48,48,0,0,1-48-48V96a48,48,0,0,1,48-48h98.75a32,32,0,0,1,22.62,9.37L406.63,198.63A32,32,0,0,1,416,221.25Z"
        fill="none"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth={32}
      />
      <path
        d="M256,56V176a32,32,0,0,0,32,32H408"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={32}
      />
      <line
        x1="176"
        y1="288"
        x2="336"
        y2="288"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={32}
      />
      <line
        x1="176"
        y1="368"
        x2="336"
        y2="368"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={32}
      />
    </>
  );
}
