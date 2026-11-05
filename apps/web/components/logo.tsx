export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden>
      <rect x="2" y="12" width="36" height="26" rx="9" fill="#9178E8" />
      <rect x="7" y="18" width="26" height="9" rx="4.5" fill="#F9A6BA" />
      <rect x="18.5" y="4" width="3" height="9" rx="1.5" fill="#F5C870" />
      <ellipse cx="20" cy="4.5" rx="2.6" ry="3.4" fill="#F5C870" />
      <circle cx="13" cy="32" r="2" fill="#FAF8FF" />
      <circle cx="20" cy="32" r="2" fill="#FAF8FF" />
      <circle cx="27" cy="32" r="2" fill="#FAF8FF" />
    </svg>
  );
}
