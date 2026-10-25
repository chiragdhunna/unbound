import type { JobStatus } from '../types'

export function StatusIcon({ status }: { status: JobStatus }) {
  if (status === 'done') {
    return (
      <svg
        className="status-icon"
        width="14"
        height="14"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <polyline points="3 8.5 6.5 12 13 4" />
      </svg>
    )
  }
  if (status === 'converting') {
    return (
      <svg
        className="status-icon status-spin"
        width="14"
        height="14"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
      >
        <circle cx="8" cy="8" r="6" strokeOpacity="0.3" />
        <path d="M14 8a6 6 0 0 0-6-6" />
      </svg>
    )
  }
  if (status === 'error') {
    return (
      <svg
        className="status-icon"
        width="14"
        height="14"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="8" cy="8" r="6" />
        <line x1="8" y1="5" x2="8" y2="8.5" />
        <circle cx="8" cy="11.5" r="0.75" fill="currentColor" />
      </svg>
    )
  }
  return (
    <svg
      className="status-icon"
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="6" />
      <polyline points="8 4.5 8 8 10.5 9.5" />
    </svg>
  )
}
