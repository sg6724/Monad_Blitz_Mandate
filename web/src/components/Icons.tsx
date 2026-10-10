type P = { className?: string };
const s = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

export const SearchIcon = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...s}>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="M15.5 15.5 21 21" />
  </svg>
);
export const UserIcon = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...s}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
  </svg>
);
export const BagIcon = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...s}>
    <path d="M5 8h14l-1 13H6L5 8Z" />
    <path d="M9 8V6a3 3 0 0 1 6 0v2" />
  </svg>
);
export const ArrowRight = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...s}>
    <path d="M4 12h16M14 6l6 6-6 6" />
  </svg>
);
export const ArrowLeft = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...s}>
    <path d="M20 12H4M10 6l-6 6 6 6" />
  </svg>
);
export const DropIcon = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...s}>
    <path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z" />
    <path d="M4 20c2 1.3 4.6 2 8 2s6-.7 8-2" />
  </svg>
);
export const PocketIcon = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...s}>
    <rect x="6" y="3" width="12" height="18" rx="2" />
    <path d="M6 9h12M12 12v3" />
  </svg>
);
export const FitIcon = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...s}>
    <path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4" />
    <circle cx="12" cy="12" r="1.5" />
  </svg>
);
export const ShieldIcon = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...s}>
    <path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);
export const SparkIcon = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...s}>
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" />
  </svg>
);
