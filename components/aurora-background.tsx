export function AuroraBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden>
      <div
        className="motion-safe:animate-[aurora-drift-a_28s_ease-in-out_infinite] absolute top-[-15%] left-[-10%] size-[38rem] rounded-full bg-secondary/40 blur-3xl"
      />
      <div
        className="motion-safe:animate-[aurora-drift-b_34s_ease-in-out_infinite] absolute top-[-10%] right-[-15%] size-[34rem] rounded-full bg-accent/25 blur-3xl"
      />
      <div
        className="motion-safe:animate-[aurora-drift-c_40s_ease-in-out_infinite] absolute bottom-[-20%] left-[15%] size-[44rem] rounded-full bg-muted-foreground/10 blur-3xl"
      />
      <div className="bg-grain absolute inset-0 opacity-[0.035] mix-blend-overlay" />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background" />
    </div>
  );
}
