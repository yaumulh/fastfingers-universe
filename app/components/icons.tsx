import type { ReactNode, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & {
  size?: number;
};

function IconBase({
  size = 18,
  children,
  className,
  ...props
}: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      {...props}
    >
      {children}
    </svg>
  );
}

export function HomeIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
      <path d="M9.5 21v-6.5h5V21" />
    </IconBase>
  );
}

export function KeyboardIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="2.5" y="6.5" width="19" height="11" rx="2.5" />
      <path d="M6 10h.01M9 10h.01M12 10h.01M15 10h.01M18 10h.01" />
      <path d="M7.5 14h9" />
    </IconBase>
  );
}

export function UsersIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M16.5 19.5v-1.2a3.8 3.8 0 0 0-3.8-3.8H6.8A3.8 3.8 0 0 0 3 18.3v1.2" />
      <circle cx="9.8" cy="8" r="3" />
      <path d="M21 19.5v-1a3.2 3.2 0 0 0-2.6-3.2" />
      <path d="M15.7 5.1a2.7 2.7 0 0 1 0 5.2" />
    </IconBase>
  );
}

export function TrophyIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M8 21h8" />
      <path d="M12 17v4" />
      <path d="M7 3h10v4a5 5 0 0 1-10 0V3Z" />
      <path d="M7 5H4a2 2 0 0 0 2 2h1" />
      <path d="M17 5h3a2 2 0 0 1-2 2h-1" />
    </IconBase>
  );
}

export function SparkIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m12 2 1.7 4.4L18 8l-4.3 1.6L12 14l-1.7-4.4L6 8l4.3-1.6L12 2Z" />
      <path d="m5 16 .9 2.2L8 19l-2.1.8L5 22l-.9-2.2L2 19l2.1-.8L5 16Z" />
      <path d="m19 14 .8 1.8L22 16.5l-2.2.7L19 19l-.8-1.8-2.2-.7 2.2-.7L19 14Z" />
    </IconBase>
  );
}

export function GlobeIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3.5 12h17" />
      <path d="M12 3a14 14 0 0 1 0 18" />
      <path d="M12 3a14 14 0 0 0 0 18" />
    </IconBase>
  );
}

export function GaugeIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M4.5 16a8.5 8.5 0 1 1 15 0" />
      <path d="m12 12 4.5-3" />
      <circle cx="12" cy="12" r="1" />
    </IconBase>
  );
}

export function TimerIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 13V9.5" />
      <path d="M9.2 2h5.6" />
      <path d="m16.6 4.2 1.6-1.6" />
    </IconBase>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m4.5 12.5 5 5 10-10" />
    </IconBase>
  );
}

export function AlertIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 8v5" />
      <circle cx="12" cy="16.5" r=".6" />
      <path d="M10.3 3.8 2.8 17a2 2 0 0 0 1.7 3h15a2 2 0 0 0 1.7-3L13.7 3.8a2 2 0 0 0-3.4 0Z" />
    </IconBase>
  );
}

export function CrownIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m3 18 2-10 5 4 2-6 2 6 5-4 2 10H3Z" />
      <path d="M3 21h18" />
    </IconBase>
  );
}

export function ChatIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v6A2.5 2.5 0 0 1 16.5 15H10l-4.5 4v-4H7.5A2.5 2.5 0 0 1 5 12.5v-6Z" />
      <path d="M8.2 8.9h7.6" />
      <path d="M8.2 11.8h5.1" />
    </IconBase>
  );
}

export function RocketIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M14.5 4.5c2.8-.8 5 .2 5 .2s1 2.2.2 5l-4.2 4.2-5.2-5.2 4.2-4.2Z" />
      <path d="m9.8 9.8-3.7 3.7" />
      <path d="M6.2 14.4 4 20l5.6-2.2" />
      <circle cx="16.7" cy="7.3" r="1.1" />
    </IconBase>
  );
}

export function RefreshIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M20 6v5h-5" />
      <path d="M4 18v-5h5" />
      <path d="M6.8 9.2A7 7 0 0 1 18 11" />
      <path d="M17.2 14.8A7 7 0 0 1 6 13" />
    </IconBase>
  );
}

export function EyeIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z" />
      <circle cx="12" cy="12" r="2.6" />
    </IconBase>
  );
}

export function EyeOffIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M3 3 21 21" />
      <path d="M10 6.4A10.9 10.9 0 0 1 12 6c6.1 0 9.5 6 9.5 6a14 14 0 0 1-3.4 3.9" />
      <path d="M6.1 6.1A13.5 13.5 0 0 0 2.5 12S5.9 18 12 18c1.3 0 2.4-.2 3.5-.6" />
      <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
    </IconBase>
  );
}

export function UserIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4 20a8 8 0 0 1 16 0" />
    </IconBase>
  );
}

export function ArrowLeftIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M19 12H5" />
      <path d="m12 5-7 7 7 7" />
    </IconBase>
  );
}

export function PencilIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m3 21 3.9-1 10.6-10.6-2.9-2.9L4 17.1 3 21Z" />
      <path d="m13.9 5.1 2.9 2.9" />
      <path d="M12 20h9" />
    </IconBase>
  );
}

export function InfoIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 10v6" />
      <circle cx="12" cy="7.2" r=".7" />
    </IconBase>
  );
}

export function BellIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 4.3a5.2 5.2 0 0 1 5.2 5.2v3.7l1.7 2.2H5.1l1.7-2.2V9.5A5.2 5.2 0 0 1 12 4.3Z" />
      <path d="M9.7 18a2.3 2.3 0 0 0 4.6 0" />
      <path d="M12 3.1v1.2" />
    </IconBase>
  );
}
