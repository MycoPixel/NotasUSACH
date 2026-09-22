/** Datos generales del curso, extraídos de la nómina subida. */
export interface CourseInfo {
  courseTitle: string
  profesores: string
  semestre: string
}

/** Nómina de estudiantes ya interpretada: encabezados + filas, en el mismo
 * orden de columnas detectado en el archivo original. */
export interface ParsedRoster extends CourseInfo {
  headers: string[]
  rows: Array<Array<string | number>>
  sourceFileName: string
}

/** Una evaluación configurada por el profesor (ej: "Prueba 1", "Controles"). */
export interface Evaluation {
  id: string
  name: string
  /** Porcentaje de ponderación (0-100). null mientras el campo está vacío. */
  weight: number | null
  hasSubdivisions: boolean
  /** Cantidad de sub-evaluaciones (solo si hasSubdivisions es true). */
  subCount: number
}

/** Examen final: se combina con el Promedio de Presentación usando un
 * porcentaje propio; el resto lo aporta la Presentación. */
export interface ExamenConfig {
  type: 'examen'
  /** Porcentaje del examen sobre la nota final (0-100). */
  weight: number | null
  /** Eximición: si la Presentación es mayor o igual a este valor, no hace
   * falta rendir el examen y la nota final es la Presentación tal cual. */
  exemptionThreshold: number | null
  /** Obligatoriedad: si la Presentación es menor a este valor, es
   * obligación rendir el examen (si no se cumple, es opcional). */
  mandatoryThreshold: number | null
}

/** PAR/POR: una prueba de recuperación que reemplaza siempre la nota más
 * baja entre un subconjunto de evaluaciones (nunca una con subdivisiones). */
export interface ParPorConfig {
  type: 'parpor'
  /** IDs de evaluaciones (sin subdivisiones) que el PAR/POR puede
   * reemplazar. */
  eligibleEvaluationIds: string[]
  exemptionThreshold: number | null
  mandatoryThreshold: number | null
}

export type FinalAssessmentConfig = ExamenConfig | ParPorConfig | null

/** Ajustes del curso que no son evaluaciones individuales. */
export interface CourseSettings {
  /** Nota mínima para aprobar el curso (escala 1,0-7,0). Por defecto 4,0. */
  passingGrade: number
  finalAssessment: FinalAssessmentConfig
}

export type WizardStep = 'upload' | 'evaluations' | 'export'
