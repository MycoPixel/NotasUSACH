import { useState } from 'react'
import type { CourseSettings, Evaluation, ParsedRoster } from '../types'
import { buildWorkbook } from '../lib/buildWorkbook'
import { formatNumberEs } from '../lib/numberFormat'
import { ACCENT_OPTIONS, DEFAULT_ACCENT } from '../lib/palette'

interface Props {
  roster: ParsedRoster
  evaluations: Evaluation[]
  courseSettings: CourseSettings
  onBack: () => void
  onRestart: () => void
}

function describeAssessment(evaluations: Evaluation[], settings: CourseSettings): string | null {
  const a = settings.finalAssessment
  if (!a) return null
  if (a.type === 'examen') {
    const parts = [`Examen: ${formatNumberEs(a.weight ?? 0)}% (Presentación: ${formatNumberEs(100 - (a.weight ?? 0))}%)`]
    if (a.exemptionThreshold != null) parts.push(`eximición desde ${formatNumberEs(a.exemptionThreshold)}`)
    if (a.mandatoryThreshold != null) parts.push(`obligatorio bajo ${formatNumberEs(a.mandatoryThreshold)}`)
    return parts.join(' · ')
  }
  const names = evaluations
    .filter((ev) => a.eligibleEvaluationIds.includes(ev.id))
    .map((ev) => ev.name)
    .join(', ')
  const parts = [`PAR/POR: reemplaza la más baja entre ${names || '—'}`]
  if (a.exemptionThreshold != null) parts.push(`eximición desde ${formatNumberEs(a.exemptionThreshold)}`)
  if (a.mandatoryThreshold != null) parts.push(`obligatorio bajo ${formatNumberEs(a.mandatoryThreshold)}`)
  return parts.join(' · ')
}

export default function ExportStep({ roster, evaluations, courseSettings, onBack, onRestart }: Props) {
  const [generating, setGenerating] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [accentColor, setAccentColor] = useState(DEFAULT_ACCENT)
  const [platformSheets, setPlatformSheets] = useState(false)
  const [linkPlatformSheets, setLinkPlatformSheets] = useState(true)

  const assessmentSummary = describeAssessment(evaluations, courseSettings)

  async function handleGenerate() {
    setGenerating(true)
    setError(null)
    try {
      const { blob, fileName } = await buildWorkbook(roster, evaluations, courseSettings, {
        accentColor,
        platformSheets,
        linkPlatformSheets,
      })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos generar el archivo.')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <section aria-labelledby="export-title">
      <h2 id="export-title">3. Genera la planilla</h2>

      <dl className="summary">
        <div>
          <dt>Curso</dt>
          <dd>{roster.courseTitle || '—'}</dd>
        </div>
        <div>
          <dt>Profesor(es)</dt>
          <dd>{roster.profesores || '—'}</dd>
        </div>
        <div>
          <dt>Semestre</dt>
          <dd>{roster.semestre || '—'}</dd>
        </div>
        <div>
          <dt>Estudiantes</dt>
          <dd>{roster.rows.length}</dd>
        </div>
      </dl>

      <table className="eval-summary-table">
        <caption className="sr-only">Resumen de evaluaciones configuradas</caption>
        <thead>
          <tr>
            <th scope="col">Evaluación</th>
            <th scope="col">Ponderación</th>
            <th scope="col">Subdivisiones</th>
          </tr>
        </thead>
        <tbody>
          {evaluations.map((ev) => (
            <tr key={ev.id}>
              <td>{ev.name}</td>
              <td>{formatNumberEs(ev.weight ?? 0)}%</td>
              <td>{ev.hasSubdivisions ? `${ev.subCount} notas + promedio` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="summary">
        <div>
          <dt>Nota mínima para aprobar</dt>
          <dd>{formatNumberEs(courseSettings.passingGrade)}</dd>
        </div>
        {assessmentSummary && (
          <div>
            <dt>{courseSettings.finalAssessment?.type === 'examen' ? 'Examen' : 'PAR/POR'}</dt>
            <dd>{assessmentSummary}</dd>
          </div>
        )}
      </dl>

      <fieldset className="accent-picker">
        <legend>Pestañas para subir notas a la plataforma</legend>
        <label className="platform-toggle">
          <input
            type="checkbox"
            checked={platformSheets}
            onChange={(event) => setPlatformSheets(event.target.checked)}
          />
          <span>Crear una pestaña por cada nota (formato de la plataforma)</span>
        </label>
        {platformSheets && (
          <>
            <label className="platform-toggle platform-toggle--sub">
              <input
                type="checkbox"
                checked={linkPlatformSheets}
                onChange={(event) => setLinkPlatformSheets(event.target.checked)}
              />
              <span>Vincular las notas con la planilla (se actualizan solas)</span>
            </label>
            <p className="hint hint--inline">
              El archivo incluirá, además de la planilla, una pestaña por cada nota con el formato
              exacto que exige la plataforma: columnas RUN, Nombre Alumno y Nota; el RUN va sin
              puntos y la Nota parte en 0. Si una evaluación se divide en varias notas (por
              ejemplo, dos controles), cada nota tiene su propia pestaña —llamada igual que su
              columna en la hoja “Notas”, ej. «CONTROL 1» y «CONTROL 2»— y el promedio de esa
              evaluación no genera pestaña.
              {linkPlatformSheets
                ? ' Con la vinculación activada, escribe las notas en la hoja “Notas” y la columna Nota de cada pestaña se llena sola (redondeada a 1 decimal).'
                : ' Sin vinculación, llenas la columna Nota directamente en cada pestaña.'}
            </p>
          </>
        )}
      </fieldset>

      <fieldset className="accent-picker">
        <legend>Color para destacar el encabezado</legend>
        <div className="accent-picker__swatches">
          {ACCENT_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={
                option.hex === accentColor ? 'accent-swatch accent-swatch--selected' : 'accent-swatch'
              }
              style={{ backgroundColor: `#${option.hex}` }}
              aria-label={option.label}
              aria-pressed={option.hex === accentColor}
              title={option.label}
              onClick={() => setAccentColor(option.hex)}
            />
          ))}
        </div>
      </fieldset>

      <p className="hint">
        Las columnas de notas quedarán vacías, listas para llenar en Excel (acepta notas de 1,0 a
        7,0). El promedio de cada evaluación con subdivisiones, el Promedio de Presentación (si
        corresponde), el promedio final y el estado se calculan solos con fórmulas.
      </p>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <div className="actions">
        <button type="button" className="btn btn--ghost" onClick={onBack}>
          Atrás
        </button>
        <button type="button" className="btn btn--primary" onClick={handleGenerate} disabled={generating}>
          {generating ? 'Generando…' : 'Descargar Excel'}
        </button>
      </div>

      {done && (
        <div className="success-banner" role="status">
          <p>Listo, descargamos tu planilla.</p>
          <button type="button" className="btn btn--ghost" onClick={onRestart}>
            Empezar con otro curso
          </button>
        </div>
      )}
    </section>
  )
}
