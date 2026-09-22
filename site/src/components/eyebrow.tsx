export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-display text-[13px] font-medium uppercase tracking-[0.12em] text-brand-accent dark:text-brand-accent-bright">
      {children}
    </p>
  );
}
