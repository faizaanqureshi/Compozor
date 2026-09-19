export function OutlookIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none">
      <path d="M10 5h10v13H10z" fill="currentColor" opacity=".15" />
      <path d="M11 5h9v13h-9M12 9l5 4 5-4v11H11" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <rect x="1" y="6" width="12" height="14" rx="1.5" fill="currentColor" />
      <ellipse cx="7" cy="13" rx="2.5" ry="3.5" className="stroke-card" strokeWidth="1.6" />
    </svg>
  );
}
