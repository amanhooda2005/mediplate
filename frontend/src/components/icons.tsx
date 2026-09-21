import type { SVGProps } from 'react'

type P = SVGProps<SVGSVGElement>
const base = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }

export const PlateLogo = (p: P) => (
  <svg viewBox="0 0 32 32" width={30} height={30} aria-hidden {...p}>
    <circle cx="16" cy="16" r="14" fill="#1E6B52" />
    <circle cx="16" cy="16" r="9" fill="#F3F6F4" />
    <path d="M12 19c0-5 4-8 9-8-1 5-4 8-9 8z" fill="#1E6B52" />
  </svg>
)
export const SunIcon = (p: P) => (<svg {...base} {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>)
export const CalendarIcon = (p: P) => (<svg {...base} {...p}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 11h18" /></svg>)
export const SearchIcon = (p: P) => (<svg {...base} {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>)
export const ChartIcon = (p: P) => (<svg {...base} {...p}><path d="M3 3v18h18" /><path d="m7 15 4-4 3 3 5-6" /></svg>)
export const UserIcon = (p: P) => (<svg {...base} {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 5-6 8-6s6.5 2 8 6" /></svg>)
export const ShieldIcon = (p: P) => (<svg {...base} {...p}><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z" /></svg>)
export const CheckIcon = (p: P) => (<svg {...base} {...p}><path d="m5 12 5 5 9-10" /></svg>)
export const XIcon = (p: P) => (<svg {...base} {...p}><path d="M6 6l12 12M18 6 6 18" /></svg>)
export const AlertIcon = (p: P) => (<svg {...base} {...p}><path d="M12 3 2 20h20z" /><path d="M12 10v4M12 17.5v.5" /></svg>)
export const InfoIcon = (p: P) => (<svg {...base} {...p}><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.5" /></svg>)
export const SwapIcon = (p: P) => (<svg {...base} {...p}><path d="M7 7h11l-3-3M17 17H6l3 3" /></svg>)
export const ThumbUpIcon = (p: P) => (<svg {...base} {...p}><path d="M7 11v9H4v-9zM7 11l4-8c1.5 0 2.5 1 2.5 2.5V9h5a2 2 0 0 1 2 2.3l-1.2 7A2 2 0 0 1 17.3 20H7" /></svg>)
export const ThumbDownIcon = (p: P) => (<svg {...base} {...p}><path d="M17 13V4h3v9zM17 13l-4 8c-1.5 0-2.5-1-2.5-2.5V15h-5a2 2 0 0 1-2-2.3l1.2-7A2 2 0 0 1 6.7 4H17" /></svg>)
export const PinIcon = (p: P) => (<svg {...base} {...p}><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></svg>)
export const PillIcon = (p: P) => (<svg {...base} {...p}><rect x="3" y="8" width="18" height="8" rx="4" transform="rotate(-35 12 12)" /><path d="m9.5 8.5 5 7" /></svg>)
export const DropIcon = (p: P) => (<svg {...base} {...p}><path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z" /></svg>)
export const ChevronIcon = (p: P) => (<svg {...base} {...p}><path d="m9 6 6 6-6 6" /></svg>)
export const GlobeIcon = (p: P) => (<svg {...base} {...p}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18" /></svg>)
export const LeafIcon = (p: P) => (<svg {...base} {...p}><path d="M5 19c0-8 6-14 15-14-1 9-7 15-15 14z" /><path d="M5 19 13 11" /></svg>)
