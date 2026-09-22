import type { CourseSettings, Evaluation, FinalAssessmentConfig } from '../types'
import DecimalField from './DecimalField'

interface Props {
  evaluations: Evaluation[]
  settings: CourseSettings
  onChange: (settings: CourseSettings) => void
}

type AssessmentKind = 'none' | 'examen' | 'parpor'
type ExamenCfg = Extract<FinalAssessmentConfig, { type: 'examen' }>
type ParPorCfg = Extract<FinalAssessmentConfig, { type: 'parpor' }>

function kindOf(config: FinalAssessmentConfig): AssessmentKind {
  if (!config) return 'none'
  return config.type
}

export default function FinalAssessmentConfigSection({ evaluations, settings, onChange }: Props) {
  const kind = kindOf(settings.finalAssessment)
  const eligibleEvaluations = evaluations.filter((ev) => !ev.hasSubdivisions && ev.name.trim() !== '')

  function setPassingGrade(value: number | null) {
    onChange({ ...settings, passingGrade: value ?? 4 })
  }

  function setKind(next: AssessmentKind) {
    if (next === 'none') {
      onChange({ ...settings, finalAssessment: null })
    } else if (next === 'examen') {
      onChange({
        ...settings,
        finalAssessment: { type: 'examen', weight: null, exemptionThreshold: null, mandatoryThreshold: null },
      })
    } else {
      onChange({
        ...settings,
        finalAssessment: {
          type: 'parpor',
          eligibleEvaluationIds: [],
          exemptionThreshold: null,
          mandatoryThreshold: null,
        },
      })
    }
  }

  return (
    <div className="final-assessment">
      <h3>Configuración final del curso</h3>

      <div className="field-row">
        <label htmlFor="passing-grade">Nota mínima para aprobar</label>
        <DecimalField
          id="passing-grade"
          className="input input--weight"
          value={settings.passingGrade}
          onChange={setPassingGrade}
          placeholder="4,0"
        />
      </div>

      <fieldset className="assessment-kind">
        <legend>¿Tu curso tiene examen final o PAR/POR?</legend>
        <label>
          <input type="radio" name="assessment-kind" checked={kind === 'none'} onChange={() => setKind('none')} />
          Ninguno
        </label>
        <label>
          <input type="radio" name="assessment-kind" checked={kind === 'examen'} onChange={() => setKind('examen')} />
          Examen
        </label>
        <label>
          <input type="radio" name="assessment-kind" checked={kind === 'parpor'} onChange={() => setKind('parpor')} />
          PAR o POR
        </label>
      </fieldset>

      {settings.finalAssessment?.type === 'examen' && (
        <div className="assessment-detail">
          <p className="hint">
            El Promedio de Presentación se calcula igual que hoy, con las evaluaciones de arriba.
            El examen se combina con ese promedio usando el porcentaje que definas aquí; la
            Presentación se queda con el resto.
          </p>
          <div className="field-row">
            <label htmlFor="exam-weight">Porcentaje del examen</label>
            <div className="input-with-suffix">
              <DecimalField
                id="exam-weight"
                className="input input--weight"
                value={settings.finalAssessment.weight}
                onChange={(v) =>
                  onChange({
                    ...settings,
                    finalAssessment: { ...(settings.finalAssessment as ExamenCfg), weight: v },
                  })
                }
                placeholder="40"
              />
              <span aria-hidden="true">%</span>
            </div>
          </div>

          <div className="field-row">
            <label htmlFor="exam-exempt">Eximición: Presentación mayor o igual a</label>
            <DecimalField
              id="exam-exempt"
              className="input input--weight"
              value={settings.finalAssessment.exemptionThreshold}
              onChange={(v) =>
                onChange({
                  ...settings,
                  finalAssessment: { ...(settings.finalAssessment as ExamenCfg), exemptionThreshold: v },
                })
              }
              placeholder="opcional"
            />
          </div>
          <p className="hint hint--inline">
            Si la Presentación llega a esta nota o más, no hace falta rendir el examen: la nota
            final del curso será la Presentación tal cual, sin importar el examen.
          </p>

          <div className="field-row">
            <label htmlFor="exam-mandatory">Obligatoriedad: Presentación menor a</label>
            <DecimalField
              id="exam-mandatory"
              className="input input--weight"
              value={settings.finalAssessment.mandatoryThreshold}
              onChange={(v) =>
                onChange({
                  ...settings,
                  finalAssessment: { ...(settings.finalAssessment as ExamenCfg), mandatoryThreshold: v },
                })
              }
              placeholder="opcional"
            />
          </div>
          <p className="hint hint--inline">
            Bajo esta nota es obligación rendir el examen. Sin esta regla, el examen es obligatorio
            para todos por defecto — déjalo vacío si no necesitas distinguir.
          </p>
        </div>
      )}

      {settings.finalAssessment?.type === 'parpor' && (
        <div className="assessment-detail">
          <p className="hint">
            El PAR/POR siempre reemplaza la nota más baja entre las evaluaciones que marques abajo
            (aunque la nota del PAR/POR sea peor). Las evaluaciones con subdivisiones (como
            Controles) no pueden elegirse.
          </p>

          {eligibleEvaluations.length === 0 ? (
            <p className="hint">Agrega evaluaciones sin subdivisiones arriba para poder elegirlas aquí.</p>
          ) : (
            <ul className="column-checklist">
              {eligibleEvaluations.map((ev) => {
                const config = settings.finalAssessment as ParPorCfg
                const checked = config.eligibleEvaluationIds.includes(ev.id)
                return (
                  <li key={ev.id}>
                    <label>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const ids = e.target.checked
                            ? [...config.eligibleEvaluationIds, ev.id]
                            : config.eligibleEvaluationIds.filter((id) => id !== ev.id)
                          onChange({ ...settings, finalAssessment: { ...config, eligibleEvaluationIds: ids } })
                        }}
                      />
                      {ev.name}
                    </label>
                  </li>
                )
              })}
            </ul>
          )}

          <div className="field-row">
            <label htmlFor="parpor-exempt">Eximición: Presentación mayor o igual a</label>
            <DecimalField
              id="parpor-exempt"
              className="input input--weight"
              value={settings.finalAssessment.exemptionThreshold}
              onChange={(v) =>
                onChange({
                  ...settings,
                  finalAssessment: { ...(settings.finalAssessment as ParPorCfg), exemptionThreshold: v },
                })
              }
              placeholder="opcional"
            />
          </div>
          <p className="hint hint--inline">
            Si la Presentación llega a esta nota o más, el PAR/POR no se considera aunque tenga
            nota: la nota final será la Presentación original.
          </p>

          <div className="field-row">
            <label htmlFor="parpor-mandatory">Obligatoriedad: Presentación menor a</label>
            <DecimalField
              id="parpor-mandatory"
              className="input input--weight"
              value={settings.finalAssessment.mandatoryThreshold}
              onChange={(v) =>
                onChange({
                  ...settings,
                  finalAssessment: { ...(settings.finalAssessment as ParPorCfg), mandatoryThreshold: v },
                })
              }
              placeholder="opcional"
            />
          </div>
          <p className="hint hint--inline">
            Bajo esta nota es obligación rendir el PAR/POR. Sin esta regla, es opcional para todos
            por defecto (si no se rinde, queda la nota original).
          </p>
        </div>
      )}
    </div>
  )
}
