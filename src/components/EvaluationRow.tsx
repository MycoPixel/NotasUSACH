import { useEffect, useRef, useState } from 'react'
import type { Evaluation } from '../types'
import { formatNumberEs, parseFlexibleNumber } from '../lib/numberFormat'

interface Props {
  index: number
  evaluation: Evaluation
  onChange: (patch: Partial<Evaluation>) => void
  onRemove: () => void
  canRemove: boolean
}

export default function EvaluationRow({ index, evaluation, onChange, onRemove, canRemove }: Props) {
  const [weightText, setWeightText] = useState(
    evaluation.weight != null ? formatNumberEs(evaluation.weight) : '',
  )
  // Recuerda el último valor que este input le envió al padre, para poder
  // distinguir "el usuario está escribiendo" de "el valor cambió desde
  // afuera" (por ejemplo, al usar "Repartir en partes iguales").
  const lastEmitted = useRef<number | null>(evaluation.weight)

  useEffect(() => {
    if (evaluation.weight !== lastEmitted.current) {
      setWeightText(evaluation.weight != null ? formatNumberEs(evaluation.weight) : '')
      lastEmitted.current = evaluation.weight
    }
  }, [evaluation.weight])

  function handleWeightChange(text: string) {
    setWeightText(text)
    const value = parseFlexibleNumber(text)
    lastEmitted.current = value
    onChange({ weight: value })
  }

  const displayName = evaluation.name.trim() || 'Evaluación'

  return (
    <div className="eval-row">
      <div className="eval-row__main">
        <span className="eval-row__num">{index + 1}</span>
        <input
          type="text"
          className="input input--name"
          placeholder="Nombre (ej: Prueba 1, Controles)"
          value={evaluation.name}
          onChange={(e) => onChange({ name: e.target.value })}
        />
        <div className="input-with-suffix">
          <input
            type="text"
            inputMode="decimal"
            className="input input--weight"
            placeholder="0"
            aria-label="Ponderación en porcentaje"
            value={weightText}
            onChange={(e) => handleWeightChange(e.target.value)}
          />
          <span aria-hidden="true">%</span>
        </div>
        {canRemove && (
          <button
            type="button"
            className="btn-icon"
            aria-label={`Eliminar evaluación ${displayName}`}
            onClick={onRemove}
          >
            ×
          </button>
        )}
      </div>

      <label className="eval-row__toggle">
        <input
          type="checkbox"
          checked={evaluation.hasSubdivisions}
          onChange={(e) => onChange({ hasSubdivisions: e.target.checked })}
        />
        Se divide en varias notas (ej: controles)
      </label>

      {evaluation.hasSubdivisions && (
        <div className="eval-row__sub">
          <span>¿Cuántas?</span>
          <input
            type="number"
            min={2}
            max={30}
            className="input input--count"
            aria-label={`Cantidad de subdivisiones de ${displayName}`}
            value={evaluation.subCount}
            onChange={(e) => onChange({ subCount: Math.max(2, Number(e.target.value) || 2) })}
          />
          <span className="hint hint--inline">
            Se crearán las columnas "{displayName} 1" a "{displayName} {evaluation.subCount}",
            más una columna de promedio.
          </span>
        </div>
      )}
    </div>
  )
}
