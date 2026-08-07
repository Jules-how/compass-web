import type { ReactNode, SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { title?: string }

function Icon({ title, children, className, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      className={className ?? 'h-4 w-4 shrink-0'}
      {...props}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  )
}

export function HomeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.25" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.25" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.25" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.25" />
    </Icon>
  )
}

export function InboxIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 8.5 5.2 5.8A2 2 0 0 1 7.05 4.5h9.9a2 2 0 0 1 1.85 1.3L20 8.5" />
      <path d="M4 8.5h4.2a2 2 0 0 1 1.8 1.1l.3.6a2 2 0 0 0 1.8 1.1h0a2 2 0 0 0 1.8-1.1l.3-.6a2 2 0 0 1 1.8-1.1H20" />
      <path d="M4 8.5V18a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 18V8.5" />
    </Icon>
  )
}

export function TasksIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M9 6.5h11" />
      <path d="M9 12h11" />
      <path d="M9 17.5h11" />
      <path d="M4.5 6.5 5.5 7.5 7.5 5.5" />
      <path d="M4.5 12 5.5 13 7.5 11" />
      <rect x="3.75" y="16" width="3.5" height="3.5" rx="0.75" />
    </Icon>
  )
}

export function ProjectsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 8.5V18a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 18V9.5A1.5 1.5 0 0 0 18.5 8H11L9.3 6.2A1.5 1.5 0 0 0 8.2 5.5H5.5A1.5 1.5 0 0 0 4 7v1.5Z" />
      <path d="M9 13h6" />
      <path d="M9 16h4" />
    </Icon>
  )
}

export function FunctionsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="5.5" r="2" />
      <circle cx="6.5" cy="17.5" r="2" />
      <circle cx="17.5" cy="17.5" r="2" />
      <path d="M12 7.5v3.5l-5.5 4.5" />
      <path d="M12 11l5.5 4.5" />
    </Icon>
  )
}

export function ClientsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8 9V7.5A2.5 2.5 0 0 1 10.5 5h3A2.5 2.5 0 0 1 16 7.5V9" />
      <rect x="4" y="9" width="16" height="10.5" rx="1.75" />
      <path d="M4 13.5h16" />
    </Icon>
  )
}

export function OverviewIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8.5 14.5c1.2-1.4 2.6-2.1 3.5-2.1s2.3.7 3.5 2.1" />
      <path d="M7 16.5c1.6-1.8 3.4-2.7 5-2.7s3.4.9 5 2.7" />
      <circle cx="12" cy="10" r="1.6" />
      <path d="M9.5 8.2C10 7 11 6.2 12 6.2s2 0.8 2.5 2" />
    </Icon>
  )
}

export function PipelineIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="5.5" cy="12" r="2" />
      <circle cx="12" cy="7" r="2" />
      <circle cx="18.5" cy="14" r="2" />
      <path d="M7.4 11.2 10.1 8.4" />
      <path d="M13.8 8.4 16.7 12.4" />
    </Icon>
  )
}

export function CrmIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="8" r="3.25" />
      <path d="M5.5 18.5c1.6-3 4-4.5 6.5-4.5s4.9 1.5 6.5 4.5" />
    </Icon>
  )
}

export function FinancesIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 9.5h14v8A1.5 1.5 0 0 1 17.5 19h-11A1.5 1.5 0 0 1 5 17.5v-8Z" />
      <path d="M5 9.5 7.2 6.8A1.5 1.5 0 0 1 8.4 6.3h7.2a1.5 1.5 0 0 1 1.2.5L19 9.5" />
      <path d="M12 12.5v3" />
      <path d="M10.5 14h3" />
    </Icon>
  )
}

export function SettingsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.75v2.1" />
      <path d="M12 18.15v2.1" />
      <path d="M5.9 5.9l1.5 1.5" />
      <path d="M16.6 16.6l1.5 1.5" />
      <path d="M3.75 12h2.1" />
      <path d="M18.15 12h2.1" />
      <path d="M5.9 18.1l1.5-1.5" />
      <path d="M16.6 7.4l1.5-1.5" />
    </Icon>
  )
}

export function CompassMark({ className }: { className?: string }) {
  return (
    <span
      className={
        className ??
        'flex h-8 w-8 items-center justify-center rounded-[10px] bg-[#f3e4d8] text-[#e85d2a]'
      }
      aria-hidden
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
        <circle cx="12" cy="12" r="8.25" stroke="currentColor" strokeWidth="1.6" />
        <path
          d="M12 5.4 13.35 10.65 18.6 12 13.35 13.35 12 18.6 10.65 13.35 5.4 12 10.65 10.65Z"
          fill="currentColor"
        />
      </svg>
    </span>
  )
}
