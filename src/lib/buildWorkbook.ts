import type ExcelJSType from 'exceljs'
import type { CourseInfo, CourseSettings, Evaluation, ParsedRoster } from '../types'
import { columnLetter } from './excelColumns'
import { DEFAULT_ACCENT } from './palette'

const HEADER_TEXT_ARGB = 'FFFFFFFF'
const APPROVED_FILL = 'FFD9EAD3'
const FAILED_FILL = 'FFF4CCCC'
const HEADER_ROW = 5
const MIN_COL_WIDTH = 10
const MAX_COL_WIDTH = 42
// Si dos pesos difieren en menos que esto, se consideran "iguales" para
// efectos de usar un promedio simple en vez de una suma ponderada.
const WEIGHT_EQUALITY_TOLERANCE = 1e-6

interface EvalColumnRange {
  evaluation: Evaluation
  /** Columna (0-based) que representa la nota final de esta evaluación:
   * la única columna si no tiene subdivisiones, o la de promedio si las
   * tiene. */
  scoreColIndex: number
  subStart?: number
  subEnd?: number
}

export interface BuildWorkbookOptions {
  /** Color de énfasis para el encabezado, en hex sin "#" (ej: "6B2737"). */
  accentColor?: string
  /** Si es true, agrega al libro una pestaña por cada NOTA con el formato
   * EXACTO que exige la plataforma de notas (columnas RUN, Nombre Alumno y
   * Nota; sin estilos, sin anchos personalizados): una pestaña por
   * evaluación simple y una por cada subdivisión cuando la evaluación se
   * divide en varias notas (ej. dos controles → dos pestañas). */
  platformSheets?: boolean
  /** Si es true (por defecto cuando se crean pestañas), la columna Nota de
   * cada pestaña queda vinculada con una fórmula a la columna de su
   * evaluación en la hoja "Notas": al escribir la nota ahí, la pestaña se
   * actualiza sola. Si es false, la Nota parte en 0 fijo para llenarla
   * directamente en la pestaña. */
  linkPlatformSheets?: boolean
}

export interface BuildWorkbookResult {
  blob: Blob
  fileName: string
}

/** Genera la planilla final: nómina original + columnas de evaluaciones
 * (vacías, listas para llenar) + Presentación/Examen/PAR-POR si corresponde
 * + promedio final + estado, con fórmulas y validaciones ya aplicadas. */
export async function buildWorkbook(
  roster: ParsedRoster,
  evaluations: Evaluation[],
  courseSettings: CourseSettings,
  options: BuildWorkbookOptions = {},
): Promise<BuildWorkbookResult> {
  if (evaluations.length === 0) {
    throw new Error('Agrega al menos una evaluación antes de generar el archivo.')
  }
  for (const ev of evaluations) {
    if (ev.weight == null) {
      throw new Error(`Falta el porcentaje de la evaluación "${ev.name || 'sin nombre'}".`)
    }
  }
  const assessment = courseSettings.finalAssessment
  if (assessment?.type === 'examen' && assessment.weight == null) {
    throw new Error('Falta el porcentaje del examen.')
  }
  if (assessment?.type === 'parpor' && assessment.eligibleEvaluationIds.length === 0) {
    throw new Error('Marca al menos una evaluación que el PAR/POR pueda reemplazar.')
  }

  const passingGrade = courseSettings.passingGrade
  // Con el redondeo estándar chileno (a la décima, hacia arriba desde la
  // centésima 5), un promedio real de X,95 ya redondea a (X+1),0. Por eso el
  // umbral de aprobación efectivo, aplicado sobre el promedio sin redondear,
  // es (nota mínima - 0,05) — ver https://escaladenotas.cl/
  const passingRawThreshold = passingGrade - 0.05

  const accentArgb = `FF${(options.accentColor || DEFAULT_ACCENT).replace('#', '').toUpperCase()}`

  // Carga diferida: la librería que escribe el Excel es pesada y sólo se
  // necesita en este paso, así el resto de la app carga más rápido.
  const ExcelJS: typeof ExcelJSType = (await import('exceljs')).default
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Gestión de Notas'
  workbook.created = new Date()
  workbook.calcProperties = { fullCalcOnLoad: true }

  const sheet = workbook.addWorksheet('Notas', {
    properties: { defaultColWidth: 13 },
  })

  writeCourseHeader(sheet, roster)

  const plan = buildColumnPlan(roster.headers, evaluations, courseSettings)
  const baseColCount = roster.headers.length

  plan.headers.forEach((label, idx) => {
    const cell = sheet.getRow(HEADER_ROW).getCell(idx + 1)
    cell.value = label
    cell.font = { bold: true, color: { argb: HEADER_TEXT_ARGB }, name: 'IBM Plex Sans' }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: accentArgb } }
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
  })
  sheet.getRow(HEADER_ROW).height = 34

  roster.rows.forEach((studentRow, rowOffset) => {
    const excelRow = HEADER_ROW + 1 + rowOffset
    const row = sheet.getRow(excelRow)

    studentRow.forEach((value, colIdx) => {
      row.getCell(colIdx + 1).value = value
    })

    plan.evalRanges.forEach((range) => {
      if (range.subStart !== undefined && range.subEnd !== undefined) {
        for (let c = range.subStart; c <= range.subEnd; c++) {
          applyGradeCell(row.getCell(c + 1))
        }
        const startLetter = columnLetter(range.subStart)
        const endLetter = columnLetter(range.subEnd)
        const avgCell = row.getCell(range.scoreColIndex + 1)
        avgCell.value = {
          formula: `IFERROR(AVERAGE(${startLetter}${excelRow}:${endLetter}${excelRow}),"")`,
        }
        avgCell.numFmt = '0.0'
        avgCell.font = { italic: true }
      } else {
        applyGradeCell(row.getCell(range.scoreColIndex + 1))
      }
    })

    const scoreRefs = plan.evalRanges.map((r) => `${columnLetter(r.scoreColIndex)}${excelRow}`)
    const ppRawOriginal = buildPresentacionExpr(plan.evalRanges, scoreRefs)
    const completenessGuard = `COUNT(${scoreRefs.join(',')})<${scoreRefs.length}`

    if (!plan.assessmentPlan) {
      // Curso simple: sin examen ni PAR/POR, el promedio de las
      // evaluaciones ES el promedio final (comportamiento de siempre).
      const finalCell = row.getCell(plan.finalColIndex + 1)
      finalCell.value = { formula: `IF(${completenessGuard},"",ROUND(${ppRawOriginal},1))` }
      finalCell.numFmt = '0.0'
      finalCell.font = { bold: true }

      const finalLetter = columnLetter(plan.finalColIndex)
      const statusCell = row.getCell(plan.statusColIndex + 1)
      statusCell.value = {
        formula: `IF(${finalLetter}${excelRow}="","",IF(TRUNC(${ppRawOriginal}+0.0000001,2)>=${passingRawThreshold},"Aprobado","Reprobado"))`,
      }
      statusCell.alignment = { horizontal: 'center' }
      return
    }

    // Curso con examen o PAR/POR: se agrega la columna de Presentación.
    const ppCell = row.getCell(plan.assessmentPlan.presentacionColIndex + 1)
    ppCell.value = { formula: `IF(${completenessGuard},"",ROUND(${ppRawOriginal},1))` }
    ppCell.numFmt = '0.0'
    ppCell.font = { italic: true }

    const assessmentRef = `${columnLetter(plan.assessmentPlan.assessmentColIndex)}${excelRow}`
    applyGradeCell(row.getCell(plan.assessmentPlan.assessmentColIndex + 1))

    let ppRawEffective = ppRawOriginal
    if (plan.assessmentPlan.kind === 'parpor') {
      const eligibleRefs = plan.assessmentPlan.eligibleScoreColIndexes.map(
        (idx) => `${columnLetter(idx)}${excelRow}`,
      )
      const effectiveByRef = new Map(
        eligibleRefs.map((ref, i) => [ref, buildParPorEffectiveTerm(eligibleRefs, i, assessmentRef)]),
      )
      ppRawEffective = buildPresentacionExpr(
        plan.evalRanges,
        scoreRefs,
        (ref) => effectiveByRef.get(ref) ?? ref,
      )
    }

    const buildRound = (expr: string) => `ROUND(${expr},1)`
    const buildStatus = (expr: string) =>
      `IF(TRUNC(${expr}+0.0000001,2)>=${passingRawThreshold},"Aprobado","Reprobado")`

    let finalCore: string
    let statusCore: string
    if (plan.assessmentPlan.kind === 'examen') {
      const cfg = plan.assessmentPlan
      finalCore = buildExamenCore(cfg, ppRawOriginal, assessmentRef, buildRound)
      statusCore = buildExamenCore(cfg, ppRawOriginal, assessmentRef, buildStatus)
    } else {
      const cfg = plan.assessmentPlan
      finalCore = buildParPorCore(cfg, ppRawOriginal, ppRawEffective, assessmentRef, buildRound)
      statusCore = buildParPorCore(cfg, ppRawOriginal, ppRawEffective, assessmentRef, buildStatus)
    }

    const finalCell = row.getCell(plan.finalColIndex + 1)
    finalCell.value = { formula: `IF(${completenessGuard},"",${finalCore})` }
    finalCell.numFmt = '0.0'
    finalCell.font = { bold: true }

    const finalLetter = columnLetter(plan.finalColIndex)
    const statusCell = row.getCell(plan.statusColIndex + 1)
    statusCell.value = {
      formula: `IF(${finalLetter}${excelRow}="","",${statusCore})`,
    }
    statusCell.alignment = { horizontal: 'center' }
  })

  applyColumnWidths(sheet, plan.headers, baseColCount, roster.rows)

  if (roster.rows.length > 0) {
    const statusLetter = columnLetter(plan.statusColIndex)
    const lastDataRow = HEADER_ROW + roster.rows.length
    sheet.addConditionalFormatting({
      ref: `${statusLetter}${HEADER_ROW + 1}:${statusLetter}${lastDataRow}`,
      rules: [
        {
          type: 'containsText',
          operator: 'containsText',
          text: 'Reprobado',
          priority: 1,
          style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: FAILED_FILL } } },
        },
        {
          type: 'containsText',
          operator: 'containsText',
          text: 'Aprobado',
          priority: 2,
          style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: APPROVED_FILL } } },
        },
      ],
    })
  }

  sheet.views = [
    {
      state: 'frozen',
      xSplit: Math.min(3, baseColCount),
      ySplit: HEADER_ROW,
    },
  ]

  // Pestañas por nota en formato de la plataforma (opcional): una por
  // evaluación simple y una por cada subdivisión de las evaluaciones que
  // se dividen en varias notas (el promedio no genera pestaña).
  if (options.platformSheets) {
    const rangeByEvalId = new Map(plan.evalRanges.map((range) => [range.evaluation.id, range]))
    addPlatformSheets(
      workbook,
      roster,
      evaluations,
      rangeByEvalId,
      options.linkPlatformSheets !== false,
    )
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([arrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })

  return { blob, fileName: buildFileName(roster) }
}

// ─── Pestañas por evaluación (formato de la plataforma) ─────────────────────

const PLATFORM_HEADER_RUN = 'RUN'
const PLATFORM_HEADER_NAME = 'Nombre Alumno'
const PLATFORM_HEADER_GRADE = 'Nota'
/** La plataforma entrega su plantilla con la nota partiendo en 0 (sin nota
 * aún), así que las pestañas generadas replican ese valor exactamente. */
const PLATFORM_EMPTY_GRADE = 0

interface PlatformColumns {
  runIndex: number
  paternoIndex: number | null
  maternoIndex: number | null
  nombresIndex: number | null
  /** Columna única con el nombre completo, sólo si la nómina no trae
   * PATERNO/MATERNO/NOMBRES separados. */
  singleNameIndex: number | null
}

/** Normaliza un encabezado para compararlo sin depender de mayúsculas,
 * espacios o tildes. */
function normalizeHeader(header: string): string {
  return String(header ?? '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

/** Localiza en la nómina las columnas necesarias para el formato de la
 * plataforma: el RUN y el nombre completo (PATERNO MATERNO NOMBRES, o una
 * columna única con el nombre). Lanza un error entendible si no existen. */
function findPlatformColumns(headers: string[]): PlatformColumns {
  let runIndex = -1
  let paternoIndex: number | null = null
  let maternoIndex: number | null = null
  let nombresIndex: number | null = null

  headers.forEach((header, idx) => {
    const h = normalizeHeader(header)
    if (runIndex === -1 && (/^R\.?U\.?N\.?$/.test(h) || h === 'RUT')) {
      runIndex = idx
    } else if (h === 'PATERNO' || h === 'APELLIDO PATERNO') {
      paternoIndex = idx
    } else if (h === 'MATERNO' || h === 'APELLIDO MATERNO') {
      maternoIndex = idx
    } else if (h === 'NOMBRES' || h === 'NOMBRE') {
      nombresIndex = idx
    }
  })

  if (runIndex === -1) {
    throw new Error(
      'Para crear las pestañas de la plataforma necesitamos la columna R.U.N de la nómina.',
    )
  }

  if (paternoIndex != null && maternoIndex != null && nombresIndex != null) {
    return { runIndex, paternoIndex, maternoIndex, nombresIndex, singleNameIndex: null }
  }

  // Respaldo: una sola columna con el nombre completo del estudiante.
  const singleNameIndex = headers.findIndex((header) => {
    const h = normalizeHeader(header)
    return h === 'NOMBRE ALUMNO' || h === 'NOMBRE COMPLETO' || h === 'ALUMNO' || h === 'NOMBRE ESTUDIANTE'
  })
  if (singleNameIndex !== -1) {
    return { runIndex, paternoIndex: null, maternoIndex: null, nombresIndex: null, singleNameIndex }
  }

  throw new Error(
    'Para crear las pestañas de la plataforma, la nómina debe tener las columnas ' +
      'PATERNO, MATERNO y NOMBRES (o una columna con el nombre completo del estudiante).',
  )
}

/** Deja el RUN como lo espera la plataforma: texto sin puntos ni espacios
 * ("22.237.062-0" → "22237062-0"). */
function normalizePlatformRun(value: string | number | null | undefined): string {
  return String(value ?? '')
    .replace(/\./g, '')
    .replace(/\s+/g, '')
    .trim()
    .toUpperCase()
}

function platformCellText(value: string | number | null | undefined): string {
  if (value == null) return ''
  return String(value).trim()
}

/** Arma "PATERNO MATERNO NOMBRES" con un espacio simple entre partes, tal
 * como aparece en el archivo que entrega la plataforma. */
function buildPlatformStudentName(row: Array<string | number>, cols: PlatformColumns): string {
  if (cols.singleNameIndex != null) {
    return platformCellText(row[cols.singleNameIndex])
  }
  return [cols.paternoIndex, cols.maternoIndex, cols.nombresIndex]
    .map((idx) => (idx != null ? platformCellText(row[idx]) : ''))
    .filter((part) => part !== '')
    .join(' ')
}

/** Sanitiza el nombre de la pestaña: Excel no permite : \\ / ? * [ ] y
 * limita el nombre a 31 caracteres; además los nombres son únicos e
 * insensibles a mayúsculas, así que los duplicados reciben un sufijo. */
function sanitizePlatformSheetName(name: string, usedNames: Set<string>): string {
  const base = name.replace(/[\\/:*?\[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31)
  let candidate = base === '' ? 'Evaluación' : base
  let counter = 2
  while (usedNames.has(candidate.toLowerCase())) {
    const suffix = ` (${counter})`
    candidate = base.slice(0, 31 - suffix.length).trimEnd() + suffix
    counter += 1
  }
  usedNames.add(candidate.toLowerCase())
  return candidate
}

/** Agrega una pestaña por cada NOTA con el formato EXACTO de la plataforma:
 * fila 1 con los encabezados RUN | Nombre Alumno | Nota y una fila por
 * estudiante de la nómina, con el RUN como texto sin puntos y la Nota
 * partiendo en 0. Sin estilos, sin anchos de columna ni validaciones, igual
 * que el archivo que entrega la plataforma.
 *
 * Una evaluación simple genera una pestaña; una evaluación subdividida en
 * varias notas genera UNA PESTAÑA POR NOTA ("CONTROLES 1", "CONTROLES 2",
 * …), con el mismo nombre de su columna en la hoja "Notas", y su promedio
 * no genera pestaña.
 *
 * Si `linked` es true, la Nota no es un 0 fijo sino una fórmula vinculada a
 * la columna de esa nota en la hoja "Notas": mientras no haya nota muestra
 * 0, igual que la plantilla, y al escribir la nota en la planilla la
 * pestaña se actualiza sola. La fórmula lleva 0 como resultado en caché,
 * así los lectores que no recalculan (pandas, openpyxl data_only, etc.)
 * también leen un número. */
function addPlatformSheets(
  workbook: ExcelJSType.Workbook,
  roster: ParsedRoster,
  evaluations: Evaluation[],
  rangeByEvalId: Map<string, EvalColumnRange>,
  linked: boolean,
) {
  const cols = findPlatformColumns(roster.headers)
  const usedNames = new Set(workbook.worksheets.map((ws) => ws.name.toLowerCase()))

  // Una pestaña por NOTA (no por evaluación): si una evaluación se divide
  // en varias notas (ej. dos controles), cada nota tiene su propia pestaña
  // —con el mismo nombre que su columna en "Notas"— vinculada a esa
  // columna; el promedio de la evaluación no genera pestaña.
  const targets: Array<{ name: string; colIndex: number }> = []
  for (const ev of evaluations) {
    const range = rangeByEvalId.get(ev.id)
    if (!range) continue
    if (range.subStart !== undefined && range.subEnd !== undefined) {
      for (let colIndex = range.subStart; colIndex <= range.subEnd; colIndex++) {
        const subNumber = colIndex - range.subStart + 1
        targets.push({ name: `${ev.name.trim()} ${subNumber}`, colIndex })
      }
    } else {
      targets.push({ name: ev.name.trim() || 'Evaluación', colIndex: range.scoreColIndex })
    }
  }

  for (const target of targets) {
    const sheet = workbook.addWorksheet(
      sanitizePlatformSheetName(target.name || 'Evaluación', usedNames),
    )
    sheet.getCell('A1').value = PLATFORM_HEADER_RUN
    sheet.getCell('B1').value = PLATFORM_HEADER_NAME
    sheet.getCell('C1').value = PLATFORM_HEADER_GRADE

    const scoreColIndex = target.colIndex
    roster.rows.forEach((studentRow, rowOffset) => {
      const row = sheet.getRow(rowOffset + 2)
      row.getCell(1).value = normalizePlatformRun(studentRow[cols.runIndex])
      row.getCell(2).value = buildPlatformStudentName(studentRow, cols)
      if (linked) {
        // Las filas de datos de "Notas" parten en HEADER_ROW + 1; las de la
        // pestaña, en la fila 2.
        const notasRef = `Notas!${columnLetter(scoreColIndex)}${HEADER_ROW + 1 + rowOffset}`
        row.getCell(3).value = {
          formula: `IF(${notasRef}="",0,ROUND(${notasRef},1))`,
          result: PLATFORM_EMPTY_GRADE,
        }
      } else {
        row.getCell(3).value = PLATFORM_EMPTY_GRADE
      }
    })
  }
}

function applyGradeCell(cell: ExcelJSType.Cell) {
  cell.numFmt = '0.0'
  cell.dataValidation = {
    type: 'decimal',
    operator: 'between',
    allowBlank: true,
    showErrorMessage: true,
    errorTitle: 'Nota fuera de rango',
    error: 'La nota debe estar entre 1,0 y 7,0.',
    formulae: [1, 7],
  }
}

function writeCourseHeader(sheet: ExcelJSType.Worksheet, course: CourseInfo) {
  sheet.getCell('A1').value = 'Curso:'
  sheet.getCell('A1').font = { bold: true }
  sheet.getCell('B1').value = course.courseTitle || '(sin datos)'
  sheet.getCell('A2').value = 'Profesor(es):'
  sheet.getCell('A2').font = { bold: true }
  sheet.getCell('B2').value = course.profesores || '(sin datos)'
  sheet.getCell('A3').value = 'Semestre:'
  sheet.getCell('A3').font = { bold: true }
  sheet.getCell('B3').value = course.semestre || '(sin datos)'
}

/** Construye la expresión (sin ROUND) del promedio de las evaluaciones
 * regulares: AVERAGE si todas pesan igual, o una suma ponderada si no.
 * `termFor` permite reemplazar la referencia de una columna puntual por
 * otra expresión (usado por el PAR/POR). */
function buildPresentacionExpr(
  evalRanges: EvalColumnRange[],
  scoreRefs: string[],
  termFor?: (plainRef: string) => string,
): string {
  const allWeightsEqual =
    evalRanges.length > 1 &&
    evalRanges.every(
      (r) =>
        Math.abs(
          (r.evaluation.weight as number) - (evalRanges[0].evaluation.weight as number),
        ) < WEIGHT_EQUALITY_TOLERANCE,
    )
  const terms = scoreRefs.map((ref) => (termFor ? termFor(ref) : ref))
  if (allWeightsEqual) {
    return `AVERAGE(${terms.join(',')})`
  }
  return evalRanges.map((r, i) => `${terms[i]}*${(r.evaluation.weight as number) / 100}`).join('+')
}

/** Para una evaluación elegible del PAR/POR, arma la expresión "efectiva":
 * su propia nota, salvo que sea la primera (de izquierda a derecha) en
 * tener la nota más baja entre las elegibles Y el PAR/POR tenga nota — en
 * ese caso, se usa la nota del PAR/POR (aunque sea peor). "Primera" evita
 * reemplazar dos columnas a la vez cuando hay un empate en la más baja. */
function buildParPorEffectiveTerm(eligibleRefs: string[], index: number, parPorRef: string): string {
  const target = eligibleRefs[index]
  const minExpr = `MIN(${eligibleRefs.join(',')})`
  const earlier = eligibleRefs.slice(0, index)
  const isFirstMin =
    earlier.length === 0
      ? `${target}=${minExpr}`
      : `AND(${target}=${minExpr},${earlier.map((ref) => `${ref}<>${minExpr}`).join(',')})`
  return `IF(${parPorRef}="",${target},IF(${isFirstMin},${parPorRef},${target}))`
}

/** Árbol de decisión para un curso con Examen: eximición (si se cumple,
 * ignora el examen aunque tenga nota) > obligatoriedad (bajo cierta
 * Presentación, hay que esperar la nota del examen) > por defecto, si no
 * hay regla de obligatoriedad el examen es obligatorio para todos. */
function buildExamenCore(
  config: { weight: number | null; exemptionThreshold: number | null; mandatoryThreshold: number | null },
  ppRaw: string,
  examRef: string,
  leaf: (expr: string) => string,
): string {
  const w = (config.weight as number) / 100
  const blend = `(${ppRaw})*${1 - w}+${examRef}*${w}`

  const mandatoryBranch =
    config.mandatoryThreshold != null
      ? `IF(${ppRaw}<${config.mandatoryThreshold},IF(${examRef}="","",${leaf(blend)}),IF(${examRef}="",${leaf(ppRaw)},${leaf(blend)}))`
      : `IF(${examRef}="","",${leaf(blend)})`

  if (config.exemptionThreshold != null) {
    return `IF(${ppRaw}>=${config.exemptionThreshold},${leaf(ppRaw)},${mandatoryBranch})`
  }
  return mandatoryBranch
}

/** Mismo árbol que el examen, pero la "nota combinada" ya es el promedio de
 * Presentación con la sustitución del PAR/POR aplicada (ppRawEffective), no
 * una mezcla ponderada con un peso propio. */
function buildParPorCore(
  config: { exemptionThreshold: number | null; mandatoryThreshold: number | null },
  ppRawOriginal: string,
  ppRawEffective: string,
  parPorRef: string,
  leaf: (expr: string) => string,
): string {
  const mandatoryBranch =
    config.mandatoryThreshold != null
      ? `IF(${ppRawOriginal}<${config.mandatoryThreshold},IF(${parPorRef}="","",${leaf(ppRawEffective)}),${leaf(ppRawEffective)})`
      : leaf(ppRawEffective)

  if (config.exemptionThreshold != null) {
    return `IF(${ppRawOriginal}>=${config.exemptionThreshold},${leaf(ppRawOriginal)},${mandatoryBranch})`
  }
  return mandatoryBranch
}

interface ColumnPlan {
  headers: string[]
  evalRanges: EvalColumnRange[]
  finalColIndex: number
  statusColIndex: number
  assessmentPlan:
    | null
    | ({ kind: 'examen'; presentacionColIndex: number; assessmentColIndex: number } & {
        weight: number | null
        exemptionThreshold: number | null
        mandatoryThreshold: number | null
      })
    | ({
        kind: 'parpor'
        presentacionColIndex: number
        assessmentColIndex: number
        eligibleScoreColIndexes: number[]
      } & {
        exemptionThreshold: number | null
        mandatoryThreshold: number | null
      })
}

function buildColumnPlan(
  baseHeaders: string[],
  evaluations: Evaluation[],
  courseSettings: CourseSettings,
): ColumnPlan {
  const headers: string[] = [...baseHeaders]
  const evalRanges: EvalColumnRange[] = []

  evaluations.forEach((ev) => {
    const weightLabel = formatWeightLabel(ev.weight as number)
    if (ev.hasSubdivisions) {
      const subStart = headers.length
      for (let i = 1; i <= ev.subCount; i++) {
        headers.push(`${ev.name} ${i}`)
      }
      const subEnd = headers.length - 1
      headers.push(`Promedio ${ev.name} (${weightLabel}%)`)
      evalRanges.push({ evaluation: ev, scoreColIndex: headers.length - 1, subStart, subEnd })
    } else {
      headers.push(`${ev.name} (${weightLabel}%)`)
      evalRanges.push({ evaluation: ev, scoreColIndex: headers.length - 1 })
    }
  })

  const assessment = courseSettings.finalAssessment
  let assessmentPlan: ColumnPlan['assessmentPlan'] = null

  if (assessment?.type === 'examen') {
    const presentacionColIndex = headers.length
    headers.push('Promedio de Presentación')
    const assessmentColIndex = headers.length
    headers.push(`Examen (${formatWeightLabel(assessment.weight as number)}%)`)
    assessmentPlan = {
      kind: 'examen',
      presentacionColIndex,
      assessmentColIndex,
      weight: assessment.weight,
      exemptionThreshold: assessment.exemptionThreshold,
      mandatoryThreshold: assessment.mandatoryThreshold,
    }
  } else if (assessment?.type === 'parpor') {
    const presentacionColIndex = headers.length
    headers.push('Promedio de Presentación')
    const assessmentColIndex = headers.length
    headers.push('PAR/POR')
    const eligibleScoreColIndexes = evalRanges
      .filter((r) => assessment.eligibleEvaluationIds.includes(r.evaluation.id))
      .map((r) => r.scoreColIndex)
    assessmentPlan = {
      kind: 'parpor',
      presentacionColIndex,
      assessmentColIndex,
      eligibleScoreColIndexes,
      exemptionThreshold: assessment.exemptionThreshold,
      mandatoryThreshold: assessment.mandatoryThreshold,
    }
  }

  const finalColIndex = headers.length
  headers.push('Promedio Final')
  const statusColIndex = headers.length
  headers.push('Estado')

  return { headers, evalRanges, finalColIndex, statusColIndex, assessmentPlan }
}

/** Redondea a como máximo 2 decimales sin dejar ceros de más: 30 -> "30",
 * 30,5 -> "30,5", 33,3333... -> "33,33". Así, al repartir 100% en partes
 * iguales, todas las evaluaciones muestran exactamente el mismo texto. */
function formatWeightLabel(weight: number): string {
  const rounded = Math.round(weight * 100) / 100
  return rounded.toString().replace('.', ',')
}

/** Ajusta el ancho de cada columna a su contenido: para las columnas de la
 * nómina original, mira el largo del encabezado y de los valores reales;
 * para las columnas nuevas (evaluaciones, promedio, estado) sólo hay
 * encabezado, así que se ajusta a ese texto. */
function applyColumnWidths(
  sheet: ExcelJSType.Worksheet,
  headers: string[],
  baseColCount: number,
  rows: ParsedRoster['rows'],
) {
  headers.forEach((header, idx) => {
    let maxLen = header.length
    if (idx < baseColCount) {
      for (const row of rows) {
        const value = row[idx]
        if (value != null) maxLen = Math.max(maxLen, String(value).length)
      }
    }
    sheet.getColumn(idx + 1).width = Math.min(Math.max(maxLen + 3, MIN_COL_WIDTH), MAX_COL_WIDTH)
  })
}

function buildFileName(roster: ParsedRoster): string {
  const base = roster.courseTitle.trim() || 'curso'
  const safe =
    base
      .replace(/[\\/:*?"<>|]/g, '-') // caracteres inválidos en nombres de archivo
      .replace(/\s+/g, '_')
      .slice(0, 80) || 'curso'
  return `Notas_${safe}.xlsx`
}
