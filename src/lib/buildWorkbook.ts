import type ExcelJSType from 'exceljs'
import type { CourseInfo, Evaluation, ParsedRoster } from '../types'
import { columnLetter } from './excelColumns'
import { DEFAULT_ACCENT } from './palette'

const HEADER_TEXT_ARGB = 'FFFFFFFF'
const APPROVED_FILL = 'FFD9EAD3'
const FAILED_FILL = 'FFF4CCCC'
const PASSING_GRADE = 4
// Con el redondeo estándar chileno (a la décima, hacia arriba desde la
// centésima 5), un promedio real de 3,95 ya redondea a 4,0. Por eso el
// umbral de aprobación efectivo, aplicado sobre el promedio sin redondear,
// es 3,95 y no 4,0 — ver https://escaladenotas.cl/
const PASSING_RAW_THRESHOLD = PASSING_GRADE - 0.05
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
   * tiene. Esta es la columna que participa en el promedio ponderado. */
  scoreColIndex: number
  subStart?: number
  subEnd?: number
}

export interface BuildWorkbookOptions {
  /** Color de énfasis para el encabezado, en hex sin "#" (ej: "6B2737"). */
  accentColor?: string
}

export interface BuildWorkbookResult {
  blob: Blob
  fileName: string
}

/** Genera la planilla final: nómina original + columnas de evaluaciones
 * (vacías, listas para llenar) + promedio ponderado + estado, con fórmulas
 * y validaciones ya aplicadas. */
export async function buildWorkbook(
  roster: ParsedRoster,
  evaluations: Evaluation[],
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

  const { headers, evalRanges, finalColIndex, statusColIndex } = buildColumnPlan(
    roster.headers,
    evaluations,
  )
  const baseColCount = roster.headers.length
  const allWeightsEqual =
    evalRanges.length > 1 &&
    evalRanges.every(
      (r) =>
        Math.abs(
          (r.evaluation.weight as number) - (evalRanges[0].evaluation.weight as number),
        ) < WEIGHT_EQUALITY_TOLERANCE,
    )

  headers.forEach((label, idx) => {
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

    evalRanges.forEach((range) => {
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

    const scoreRefs = evalRanges.map((r) => `${columnLetter(r.scoreColIndex)}${excelRow}`)
    // Cuando todas las evaluaciones pesan lo mismo, un promedio simple es
    // matemáticamente idéntico a la suma ponderada, pero se lee mucho más
    // claro en la fórmula (y evita mostrar pesos como 33/33/34 sólo para
    // que sumen 100 exacto).
    const combinedFormula = allWeightsEqual
      ? `AVERAGE(${scoreRefs.join(',')})`
      : evalRanges
          .map(
            (r) =>
              `${columnLetter(r.scoreColIndex)}${excelRow}*${(r.evaluation.weight as number) / 100}`,
          )
          .join('+')

    const finalCell = row.getCell(finalColIndex + 1)
    finalCell.value = {
      formula: `IF(COUNT(${scoreRefs.join(',')})<${scoreRefs.length},"",ROUND(${combinedFormula},1))`,
    }
    finalCell.numFmt = '0.0'
    finalCell.font = { bold: true }

    const finalLetter = columnLetter(finalColIndex)
    const statusCell = row.getCell(statusColIndex + 1)
    // El sitio de escala de notas describe el redondeo chileno como:
    // truncar a la centésima y, si esa centésima es >= 5, subir la décima.
    // Por eso comparamos aquí con TRUNC (no ROUND) a 2 decimales: usar
    // ROUND en este paso podría "adelantar" el redondeo con el tercer
    // decimal y aprobar casos que en realidad no corresponden (ej: 3,947
    // debe quedar en 3,9 y Reprobado, no en 3,95). El pequeño +0.0000001
    // sólo evita errores de coma flotante en la suma.
    statusCell.value = {
      formula: `IF(${finalLetter}${excelRow}="","",IF(TRUNC(${combinedFormula}+0.0000001,2)>=${PASSING_RAW_THRESHOLD},"Aprobado","Reprobado"))`,
    }
    statusCell.alignment = { horizontal: 'center' }
  })

  applyColumnWidths(sheet, headers, baseColCount, roster.rows)

  if (roster.rows.length > 0) {
    const statusLetter = columnLetter(statusColIndex)
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

  const arrayBuffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([arrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })

  return { blob, fileName: buildFileName(roster) }
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

function buildColumnPlan(baseHeaders: string[], evaluations: Evaluation[]) {
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

  const finalColIndex = headers.length
  headers.push('Promedio Final')
  const statusColIndex = headers.length
  headers.push('Estado')

  return { headers, evalRanges, finalColIndex, statusColIndex }
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
