import type { WizardStep } from '../types'

const STEPS: Array<{ id: WizardStep; label: string }> = [
  { id: 'upload', label: 'Subir nómina' },
  { id: 'evaluations', label: 'Evaluaciones' },
  { id: 'export', label: 'Generar Excel' },
]

export default function StepIndicator({ current }: { current: WizardStep }) {
  const currentIndex = STEPS.findIndex((s) => s.id === current)

  return (
    <ol className="steps">
      {STEPS.map((s, i) => {
        const state = i === currentIndex ? 'active' : i < currentIndex ? 'done' : 'pending'
        return (
          <li key={s.id} className={`step step--${state}`}>
            <span className="step__num">{i < currentIndex ? '✓' : i + 1}</span>
            <span className="step__label">{s.label}</span>
          </li>
        )
      })}
    </ol>
  )
}
