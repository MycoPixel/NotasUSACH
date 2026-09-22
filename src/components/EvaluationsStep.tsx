import { useMemo } from 'react'
import type { CourseSettings, Evaluation, ParsedRoster } from '../types'
import EvaluationRow from './EvaluationRow'
import FinalAssessmentConfigSection from './FinalAssessmentConfig'
import { formatNumberEs, isCloseToHundred } from '../lib/numberFormat'

interface Props {
  roster: ParsedRoster
  evaluations: Evaluation[]
  onChange: (evaluations: Evaluation[]) => void
  courseSettings: CourseSettings
  onSettingsChange: (settings: CourseSettings) => void
  onBack: () => void
  onContinue: () => void
}

function createEvaluation(): Evaluation {
  return {
    id: crypto.randomUUID(),
    name: '',
    weight: null,
    hasSubdivisions: false,
    subCount: 2,
  }
}

export default function EvaluationsStep({
  roster,
  evaluations,
  onChange,
  courseSettings,
  onSettingsChange,
  onBack,
  onContinue,
}: Props) {
  const totalWeight = useMemo(
    () => evaluations.reduce((sum, ev) => sum + (ev.weight ?? 0), 0),
    [evaluations],
  )
  const weightOk = isCloseToHundred(totalWeight)
  const namesOk = evaluations.every((ev) => ev.name.trim() !== '')
  const subdivisionsOk = evaluations.every((ev) => !ev.hasSubdivisions || ev.subCount >= 2)

  const assessment = courseSettings.finalAssessment
  let assessmentOk = true
  if (assessment?.type === 'examen') {
    assessmentOk = assessment.weight != null && assessment.weight > 0 && assessment.weight < 100
    if (assessmentOk && assessment.exemptionThreshold != null && assessment.mandatoryThreshold != null) {
      assessmentOk = assessment.mandatoryThreshold < assessment.exemptionThreshold
    }
  } else if (assessment?.type === 'parpor') {
    assessmentOk = assessment.eligibleEvaluationIds.length > 0
    if (assessmentOk && assessment.exemptionThreshold != null && assessment.mandatoryThreshold != null) {
      assessmentOk = assessment.mandatoryThreshold < assessment.exemptionThreshold
    }
  }

  const canContinue = evaluations.length > 0 && weightOk && namesOk && subdivisionsOk && assessmentOk

  function pruneAssessment(nextEvaluations: Evaluation[]): CourseSettings {
    if (courseSettings.finalAssessment?.type !== 'parpor') return courseSettings
    const validIds = new Set(
      nextEvaluations.filter((ev) => !ev.hasSubdivisions).map((ev) => ev.id),
    )
    const eligibleEvaluationIds = courseSettings.finalAssessment.eligibleEvaluationIds.filter((id) =>
      validIds.has(id),
    )
    return {
      ...courseSettings,
      finalAssessment: { ...courseSettings.finalAssessment, eligibleEvaluationIds },
    }
  }

  function updateEvaluation(id: string, patch: Partial<Evaluation>) {
    const next = evaluations.map((ev) => (ev.id === id ? { ...ev, ...patch } : ev))
    onChange(next)
    if (patch.hasSubdivisions) onSettingsChange(pruneAssessment(next))
  }

  function removeEvaluation(id: string) {
    const next = evaluations.filter((ev) => ev.id !== id)
    onChange(next)
    onSettingsChange(pruneAssessment(next))
  }

  function addEvaluation() {
    onChange([...evaluations, createEvaluation()])
  }

  function distributeEqually() {
    const n = evaluations.length
    if (n === 0) return
    const share = 100 / n
    onChange(evaluations.map((ev) => ({ ...ev, weight: share })))
  }

  const weightMessage = weightOk
    ? '✓'
    : totalWeight < 100
      ? `— faltan ${formatNumberEs(100 - totalWeight)}%`
      : `— sobran ${formatNumberEs(totalWeight - 100)}%`

  return (
    <section aria-labelledby="evaluations-title">
      <h2 id="evaluations-title">2. Define las evaluaciones</h2>
      <p className="hint">
        {roster.courseTitle || roster.sourceFileName} · {roster.rows.length} estudiantes. Agrega
        cada evaluación del curso y su ponderación; entre todas deben sumar 100%. Si una
        evaluación se divide en varias notas (por ejemplo, controles de laboratorio), actívalo y
        la planilla calculará el promedio automáticamente.
      </p>

      <div className="eval-list">
        {evaluations.map((ev, index) => (
          <EvaluationRow
            key={ev.id}
            index={index}
            evaluation={ev}
            onChange={(patch) => updateEvaluation(ev.id, patch)}
            onRemove={() => removeEvaluation(ev.id)}
            canRemove={evaluations.length > 1}
          />
        ))}
      </div>

      <div className="eval-actions-row">
        <button type="button" className="btn btn--ghost" onClick={addEvaluation}>
          + Agregar evaluación
        </button>
        <button type="button" className="btn btn--ghost" onClick={distributeEqually}>
          Repartir 100% en partes iguales
        </button>
      </div>

      <div className={weightOk ? 'weight-total weight-total--ok' : 'weight-total weight-total--warn'}>
        Total: {formatNumberEs(totalWeight)}% {weightMessage}
      </div>

      <FinalAssessmentConfigSection
        evaluations={evaluations}
        settings={courseSettings}
        onChange={onSettingsChange}
      />
      {!assessmentOk && (
        <p className="error" role="alert">
          {assessment?.type === 'examen' && (assessment.weight == null || assessment.weight <= 0 || assessment.weight >= 100)
            ? 'Define el porcentaje del examen (entre 0 y 100).'
            : assessment?.type === 'parpor' && assessment.eligibleEvaluationIds.length === 0
              ? 'Marca al menos una evaluación que el PAR/POR pueda reemplazar.'
              : 'La nota de obligatoriedad debe ser menor que la de eximición.'}
        </p>
      )}

      <div className="actions">
        <button type="button" className="btn btn--ghost" onClick={onBack}>
          Atrás
        </button>
        <button type="button" className="btn btn--primary" disabled={!canContinue} onClick={onContinue}>
          Continuar
        </button>
      </div>
    </section>
  )
}
