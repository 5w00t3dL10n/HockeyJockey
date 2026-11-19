import type { SVGProps } from 'react';

interface RefereeIconProps extends SVGProps<SVGSVGElement> {
  iconKey: string;
}

export function RefereeIcon({
  iconKey,
  className = 'w-9 h-9',
  ...rest
}: RefereeIconProps) {
  const baseProps: SVGProps<SVGSVGElement> = {
    viewBox: '0 0 48 48',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2.5,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    className,
    'aria-hidden': true,
    ...rest,
  };

  switch (iconKey) {
    case 'tripping':
      return (
        <svg {...baseProps}>
          <path d="M10 38 L22 30 L38 36" />
          <path d="M22 10 L22 24 L15 35" />
          <circle cx="22" cy="8" r="3" />
          <path d="M28 24 L37 20" strokeDasharray="3 3" />
          <path d="M35 17 L39 20 L35 23" />
        </svg>
      );

    case 'slashing':
      return (
        <svg {...baseProps}>
          <path d="M10 30 L34 30" />
          <path d="M32 10 L18 28" />
          <path d="M15 24 L18 29 L23 26" />
          <path d="M25 13 L30 18" />
        </svg>
      );

    case 'hooking':
      return (
        <svg {...baseProps}>
          <path d="M10 18 H30 C35 18 37 22 35 26 C33 30 28 30 25 27" />
          <path d="M16 32 L10 32 L14 36" />
          <path d="M10 32 H26" />
        </svg>
      );

    case 'holding':
      return (
        <svg {...baseProps}>
          <path d="M10 24 H38" />
          <rect x="18" y="16" width="12" height="16" rx="4" />
          <path d="M22 16 V32" />
          <path d="M26 16 V32" />
        </svg>
      );

    case 'roughing':
      return (
        <svg {...baseProps}>
          <rect x="22" y="15" width="15" height="14" rx="4" />
          <path d="M22 22 H10" />
          <path d="M13 17 L8 22 L13 27" />
          <path d="M27 15 V21 M32 15 V21" />
        </svg>
      );

    case 'interference':
      return (
        <svg {...baseProps}>
          <path d="M12 12 L36 36" />
          <path d="M36 12 L12 36" />
          <circle cx="24" cy="24" r="16" strokeOpacity="0.35" />
        </svg>
      );

    case 'high_sticking':
      return (
        <svg {...baseProps}>
          <circle cx="24" cy="22" r="5" />
          <path d="M15 39 C15 33 33 33 33 39" />
          <path d="M8 12 L40 12" />
          <path d="M14 8 V16 M34 8 V16" />
        </svg>
      );

    case 'boarding':
      return (
        <svg {...baseProps}>
          <path d="M38 8 V40" strokeWidth={3.5} />
          <rect x="10" y="17" width="12" height="12" rx="3" />
          <path d="M22 23 H34" />
          <path d="M30 18 L34 23 L30 28" />
        </svg>
      );

    case 'cross_checking':
      return (
        <svg {...baseProps}>
          <path d="M8 20 H40" />
          <path d="M14 20 V34 M34 20 V34" />
          <path d="M20 12 L24 8 L28 12" />
          <path d="M24 8 V17" />
        </svg>
      );

    case 'charging':
      return (
        <svg {...baseProps}>
          <path d="M35 20 A11 11 0 1 0 32 32" />
          <path d="M35 14 L36 21 L29 20" />
          <circle cx="19" cy="24" r="3.5" />
          <circle cx="29" cy="24" r="3.5" />
        </svg>
      );

    case 'checking_from_behind':
      return (
        <svg {...baseProps}>
          <circle cx="31" cy="12" r="3.5" />
          <path d="M31 16 V31 L36 40 M31 31 L26 40" />
          <path d="M10 22 H24" />
          <path d="M10 28 H24" />
          <path d="M20 19 L25 24 L20 29" />
        </svg>
      );

    case 'too_many_men':
      return (
        <svg {...baseProps}>
          <circle cx="12" cy="14" r="3" />
          <circle cx="24" cy="14" r="3" />
          <circle cx="36" cy="14" r="3" />
          <circle cx="12" cy="28" r="3" />
          <circle cx="24" cy="28" r="3" />
          <circle cx="36" cy="28" r="3" />
          <path d="M8 38 H40" strokeDasharray="4 3" />
        </svg>
      );

    case 'delay_of_game':
    default:
      return (
        <svg {...baseProps}>
          <circle cx="24" cy="24" r="14" />
          <path d="M24 16 V24 L30 28" />
          <path d="M10 40 H38" />
        </svg>
      );
  }
}
