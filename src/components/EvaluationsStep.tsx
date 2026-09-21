import { useMemo } from 'react'
import type { Evaluation, ParsedRoster } from '../types'
import EvaluationRow from './EvaluationRow'
import { formatNumberEs, isCloseToHundred } from '../lib/numberFormat'

interface Props {
  roster: ParsedRoster
  evaluations: Evaluation[]
  onChange: (evaluations: Evaluation[]) => void
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

export default function EvaluationsStep({ roster, evaluations, onChange, onBack, onContinue }: Props) {
  const totalWeight = useMemo(
    () => evaluations.reduce((sum, ev) => sum + (ev.weight ?? 0), 0),
    [evaluations],
  )
  const weightOk = isCloseToHundred(totalWeight)
  const namesOk = evaluations.every((ev) => ev.name.trim() !== '')
  const subdivisionsOk = evaluations.every((ev) => !ev.hasSubdivisions || ev.subCount >= 2)
  const canContinue = evaluations.length > 0 && weightOk && namesOk && subdivisionsOk

  function updateEvaluation(id: string, patch: Partial<Evaluation>) {
    onChange(evaluations.map((ev) => (ev.id === id ? { ...ev, ...patch } : ev)))
  }

  function removeEvaluation(id: string) {
    onChange(evaluations.filter((ev) => ev.id !== id))
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
