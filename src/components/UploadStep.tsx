import { useState } from 'react'
import type { DragEvent } from 'react'
import { parseRosterFile, RosterParseError } from '../lib/parseRoster'
import type { ParsedRoster } from '../types'

export default function UploadStep({ onParsed }: { onParsed: (roster: ParsedRoster) => void }) {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [parsed, setParsed] = useState<ParsedRoster | null>(null)
  const [keepColumn, setKeepColumn] = useState<boolean[]>([])
  const [isDragging, setIsDragging] = useState(false)

  async function handleFile(file: File) {
    setLoading(true)
    setError(null)
    try {
      const roster = await parseRosterFile(file)
      setParsed(roster)
      setKeepColumn(roster.headers.map(() => true))
    } catch (err) {
      if (err instanceof RosterParseError) {
        setError(err.message)
      } else {
        console.error(err)
        setError('Ocurrió un problema inesperado al leer el archivo. Intenta de nuevo.')
      }
    } finally {
      setLoading(false)
    }
  }

  function handleDragOver(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault()
    setIsDragging(true)
  }

  function handleDragLeave(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault()
    setIsDragging(false)
  }

  function handleDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }


  function toggleColumn(idx: number) {
    setKeepColumn((prev) => prev.map((v, i) => (i === idx ? !v : v)))
  }

  function handleContinue() {
    if (!parsed) return
    const keptIndexes = keepColumn
      .map((keep, i) => (keep ? i : -1))
      .filter((i) => i >= 0)
    const filtered: ParsedRoster = {
      ...parsed,
      headers: keptIndexes.map((i) => parsed.headers[i]),
      rows: parsed.rows.map((row) => keptIndexes.map((i) => row[i])),
    }
    onParsed(filtered)
  }

  if (parsed) {
    const noneSelected = keepColumn.every((v) => !v)
    return (
      <section aria-labelledby="upload-title">
        <h2 id="upload-title">1. Confirma la nómina</h2>

        <dl className="summary">
          <div>
            <dt>Curso</dt>
            <dd>{parsed.courseTitle || '—'}</dd>
          </div>
          <div>
            <dt>Profesor(es)</dt>
            <dd>{parsed.profesores || '—'}</dd>
          </div>
          <div>
            <dt>Semestre</dt>
            <dd>{parsed.semestre || '—'}</dd>
          </div>
          <div>
            <dt>Estudiantes</dt>
            <dd>{parsed.rows.length}</dd>
          </div>
        </dl>

        <p className="hint">
          Elige qué columnas de la nómina original quieres mantener en la planilla final (por
          ejemplo, puedes quitar "Ingreso", "Carrera" o "Correo Electrónico" si no las necesitas).
        </p>

        <ul className="column-checklist">
          {parsed.headers.map((header, idx) => (
            <li key={`${header}-${idx}`}>
              <label>
                <input
                  type="checkbox"
                  checked={keepColumn[idx] ?? true}
                  onChange={() => toggleColumn(idx)}
                />
                {header}
              </label>
            </li>
          ))}
        </ul>

        {noneSelected && (
          <p className="error" role="alert">
            Debes mantener al menos una columna.
          </p>
        )}

        <div className="actions">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => {
              setParsed(null)
              setKeepColumn([])
            }}
          >
            Elegir otro archivo
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={noneSelected}
            onClick={handleContinue}
          >
            Continuar
          </button>
        </div>
      </section>
    )
  }

  return (
    <section aria-labelledby="upload-title">
      <h2 id="upload-title">1. Sube la nómina del curso</h2>
      <p className="hint">
        Usa el archivo tal como lo entrega la universidad (.xls o .xlsx). Lo
        convertimos a Excel moderno y detectamos automáticamente el curso, el
        profesor y la lista de estudiantes.
      </p>

      <label
        className={isDragging ? 'dropzone dropzone--active' : 'dropzone'}
        htmlFor="roster-file"
        onDragOver={handleDragOver}
        onDragEnter={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          id="roster-file"
          type="file"
          accept=".xls,.xlsx"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleFile(file)
          }}
          hidden
        />
        <span className="dropzone__title">
          {loading ? 'Leyendo archivo…' : isDragging ? 'Suelta el archivo aquí' : 'Elegir archivo de nómina'}
        </span>
        <span className="dropzone__hint">.xls o .xlsx — también puedes arrastrarlo aquí</span>
      </label>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
