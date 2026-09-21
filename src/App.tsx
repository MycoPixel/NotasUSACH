import { useEffect, useState } from 'react'
import type { Evaluation, ParsedRoster, WizardStep } from './types'
import StepIndicator from './components/StepIndicator'
import UploadStep from './components/UploadStep'
import EvaluationsStep from './components/EvaluationsStep'
import ExportStep from './components/ExportStep'

function createEvaluation(): Evaluation {
  return {
    id: crypto.randomUUID(),
    name: '',
    weight: null,
    hasSubdivisions: false,
    subCount: 2,
  }
}

export default function App() {
  const [step, setStep] = useState<WizardStep>('upload')
  const [roster, setRoster] = useState<ParsedRoster | null>(null)
  const [evaluations, setEvaluations] = useState<Evaluation[]>([createEvaluation()])

  useEffect(() => {
    // Si el archivo se suelta fuera del recuadro exacto, el navegador por
    // defecto lo abriría directamente (reemplazando la app). Esto lo evita
    // en toda la ventana, para que arrastrar y soltar sea más tolerante.
    const preventDefault = (e: DragEvent) => e.preventDefault()
    window.addEventListener('dragover', preventDefault)
    window.addEventListener('drop', preventDefault)
    return () => {
      window.removeEventListener('dragover', preventDefault)
      window.removeEventListener('drop', preventDefault)
    }
  }, [])

  function handleRosterParsed(parsed: ParsedRoster) {
    setRoster(parsed)
    setStep('evaluations')
  }

  function handleRestart() {
    setRoster(null)
    setEvaluations([createEvaluation()])
    setStep('upload')
  }

  return (
    <div className="page">
      <header className="app-header">
        <h1>Gestión de Notas</h1>
        <p className="app-subtitle">Nómina → evaluaciones → planilla en Excel</p>
      </header>

      <StepIndicator current={step} />

      <main className="card">
        {step === 'upload' && <UploadStep onParsed={handleRosterParsed} />}

        {step === 'evaluations' && roster && (
          <EvaluationsStep
            roster={roster}
            evaluations={evaluations}
            onChange={setEvaluations}
            onBack={() => setStep('upload')}
            onContinue={() => setStep('export')}
          />
        )}

        {step === 'export' && roster && (
          <ExportStep
            roster={roster}
            evaluations={evaluations}
            onBack={() => setStep('evaluations')}
            onRestart={handleRestart}
          />
        )}
      </main>

      <footer className="app-footer">
        <p>Todo se procesa en tu navegador: los datos de los estudiantes nunca salen de tu computador.</p>
      </footer>
    </div>
  )
}
