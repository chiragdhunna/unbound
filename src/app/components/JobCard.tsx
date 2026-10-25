import type { Job } from '../types'
import { StatusIcon } from './StatusIcon'
import { WarningIcon } from './WarningIcon'

type JobCardProps = {
  job: Job
  isSelected: boolean
  onSelect: () => void
  onRunOcr: () => void
  onCopyFile: () => void
  onDownloadFile: () => void
  onCancel: () => void
  onRetry: () => void
  onRemove: () => void
}

export function JobCard({
  job,
  isSelected,
  onSelect,
  onRunOcr,
  onCopyFile,
  onDownloadFile,
  onCancel,
  onRetry,
  onRemove
}: JobCardProps) {
  const page =
    job.progress?.page ??
    (job.progress && job.progress.total > 1 ? job.progress.current : 1)
  const totalPages =
    job.progress?.totalPages ??
    (job.progress && job.progress.total > 1 ? job.progress.total : 1)
  const percent =
    job.progress?.percent !== undefined
      ? job.progress.percent
      : job.progress
        ? job.progress.total === 100
          ? job.progress.current
          : Math.round((job.progress.current / (job.progress.total || 1)) * 100)
        : 0
  const valuenow = Math.min(100, Math.max(0, percent))
  const progressText = `Page ${page} of ${totalPages} — ${valuenow}%`

  return (
    <li
      data-job-id={job.id}
      className={`job-card ${isSelected ? 'selected' : ''}`}
    >
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          onSelect()
        }}
      >
        <div className="job-header">
          <strong>{job.name}</strong>
          <span className={`job-status ${job.status}`}>
            <StatusIcon status={job.status} />
            {job.status}
          </span>
        </div>
      </button>
      {job.status === 'converting' && job.progress ? (
        <div
          role="progressbar"
          aria-valuenow={valuenow}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Progress for ${job.name}`}
          className="job-progress"
        >
          <div
            className="progress-fill"
            style={{ width: `${valuenow}%` }}
          />
          <span className="progress-text">{progressText}</span>
        </div>
      ) : null}
      {job.error ? <p className="job-error">{job.error}</p> : null}
      {job.warnings.length > 0 ? (
        <ul className="warning-list">
          {job.warnings.map((warning) => (
            <li key={warning} className="warning-item">
              <WarningIcon />
              <span>{warning}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="job-actions">
        {job.status === 'done' &&
        job.warningCodes?.includes('EMBEDDED_IMAGES_MAY_CONTAIN_TEXT') ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onRunOcr()
            }}
            className="job-action-button action-run-ocr"
          >
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
              <path d="M8 5v3l2 2" />
            </svg>
            Run OCR on this PDF
          </button>
        ) : null}
        {job.status === 'done' ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onCopyFile()
            }}
            className="job-action-button"
          >
            Copy file
          </button>
        ) : null}
        {job.status === 'done' ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onDownloadFile()
            }}
            className="job-action-button"
          >
            Download file
          </button>
        ) : null}
        {job.status === 'converting' ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onCancel()
            }}
            className="job-action-button action-cancel"
          >
            Cancel
          </button>
        ) : null}
        {job.status === 'error' ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onRetry()
            }}
            className="job-action-button"
          >
            Retry
          </button>
        ) : null}
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onRemove()
          }}
          className="job-action-button"
        >
          Remove
        </button>
      </div>
    </li>
  )
}
