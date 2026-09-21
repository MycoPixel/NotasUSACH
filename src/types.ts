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

export type WizardStep = 'upload' | 'evaluations' | 'export'
