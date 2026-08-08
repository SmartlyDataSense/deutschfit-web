export default function LearnerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ backgroundColor: "var(--color-cream)" }} className="min-h-screen">
      {children}
    </div>
  );
}
