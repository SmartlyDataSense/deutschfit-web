import { Text } from "@/components/primitives";

type Props = {
  headline: string;
  subhead: string;
};

export function LandingHero({ headline, subhead }: Props) {
  return (
    <header className="mt-12 sm:mt-16">
      <Text variant="display" className="text-text-primary">
        {headline}
      </Text>
      <Text variant="body" className="mt-4 max-w-xl text-text-secondary">
        {subhead}
      </Text>
    </header>
  );
}
