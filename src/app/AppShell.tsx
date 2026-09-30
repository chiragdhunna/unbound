import { type ChangeEvent, useMemo, useState } from 'react'
import { convertFile } from '../core/pipeline'
import { createConvertContext } from '../core/context'
import { UnsupportedFormatError } from '../core/errors'

interface ConversionState {
  fileName: string
  output: string
  warnings: string[]
}

function formatError(error: unknown): string {
  if (error instanceof UnsupportedFormatError) {
    return error.message
  }

  if (error instanceof Error) {
    return error.message
  }

  return 'Conversion failed for an unknown reason.'
}

export function AppShell() {
  const [conversion, setConversion] = useState<ConversionState | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isConverting, setIsConverting] = useState(false)

  const countSummary = useMemo(() => {
    if (!conversion) {
      return '0 chars · 0 words'
    }

    const words = conversion.output.trim().length === 0 ? 0 : conversion.output.trim().split(/\s+/).length
    return `${conversion.output.length} chars · ${words} words`
  }, [conversion])

  const onFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget
    const selectedFile = input.files?.[0]
    if (!selectedFile) {
      return
    }

    setErrorMessage(null)
    setIsConverting(true)

    try {
      const result = await convertFile(selectedFile, createConvertContext())
      setConversion({
        fileName: selectedFile.name,
        output: result.markdown,
        warnings: result.warnings.map((warning) => warning.message)
      })
    } catch (error) {
      setConversion(null)
      setErrorMessage(formatError(error))
    } finally {
      setIsConverting(false)
      input.value = ''
    }
  }

  return (
    <main>
      <section className="shell" aria-label="Unbound application shell">
        <h1>unbound_</h1>
        <p>Drop a file to convert it into clean markdown or plain text.</p>

        <label htmlFor="file-input">Choose file</label>
        <input id="file-input" name="file-input" type="file" onChange={onFileChange} />

        <p role="status" aria-live="polite">
          {isConverting ? 'Converting…' : 'Ready'}
        </p>

        {errorMessage ? (
          <p role="alert" className="error-text">
            {errorMessage}
          </p>
        ) : null}

        {conversion ? (
          <article aria-label="Conversion output">
            <h2>{conversion.fileName}</h2>
            <p>{countSummary}</p>
            {conversion.warnings.length > 0 ? (
              <ul>
                {conversion.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            ) : null}
            <textarea readOnly value={conversion.output} rows={16} style={{ width: '100%' }} />
          </article>
        ) : null}
      </section>
    </main>
  )
}
