import type * as XLSXType from 'xlsx'
import type { ParsedRoster } from '../types'

export class RosterParseError extends Error {}

const norm = (value: unknown): string => String(value ?? '').trim()
const normUpper = (value: unknown): string =>
  norm(value)
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quita tildes para comparar sin acentos

/** Busca, dentro de una fila, el primer valor no vacío ubicado después del
 * índice `afterIndex`. Útil para leer el "valor" que sigue a una etiqueta
 * como "CURSO :" en la misma fila. */
function firstNonEmptyAfter(row: unknown[], afterIndex: number): string {
  for (let i = afterIndex + 1; i < row.length; i++) {
    const v = norm(row[i])
    if (v !== '') return v
  }
  return ''
}

/** Interpreta un archivo de nómina (.xls o .xlsx) y devuelve la información
 * del curso más la tabla de estudiantes, preservando el orden de columnas
 * original del archivo. Lanza RosterParseError con un mensaje entendible
 * si no logra encontrar una fila de encabezado reconocible (columna RUN). */
export async function parseRosterFile(file: File): Promise<ParsedRoster> {
  // Carga diferida: la librería de lectura de Excel es pesada y sólo se
  // necesita en este paso, así el resto de la app carga más rápido.
  const XLSX: typeof XLSXType = await import('xlsx')
  const buffer = await file.arrayBuffer()

  let workbook: XLSXType.WorkBook
  try {
    workbook = XLSX.read(buffer, { type: 'array', cellDates: false })
  } catch (err) {
    throw new RosterParseError(
      'No pudimos abrir este archivo. Verifica que sea un Excel (.xls o .xlsx) válido.',
    )
  }

  const sheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]
  if (!sheet) {
    throw new RosterParseError('El archivo no tiene hojas con datos.')
  }

  const grid: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
    raw: true,
  })

  let courseTitle = ''
  let profesores = ''
  let semestre = ''
  let headerRowIndex = -1
  let headerRow: unknown[] = []

  for (let i = 0; i < grid.length; i++) {
    const row = grid[i]
    for (let j = 0; j < row.length; j++) {
      const cell = normUpper(row[j])
      if (cell.startsWith('CURSO') && !courseTitle) {
        courseTitle = firstNonEmptyAfter(row, j)
      } else if (cell.startsWith('PROFESOR') && !profesores) {
        profesores = firstNonEmptyAfter(row, j)
      } else if ((cell.startsWith('SEM/A') || cell === 'SEMESTRE') && !semestre) {
        semestre = firstNonEmptyAfter(row, j)
      } else if (/^R\.?U\.?N\.?$/.test(cell) || cell === 'RUT') {
        headerRowIndex = i
        headerRow = row
      }
    }
    if (headerRowIndex > -1) break
  }

  if (headerRowIndex === -1) {
    throw new RosterParseError(
      'No encontramos una columna "R.U.N" en el archivo, así que no pudimos ' +
        'reconocer la tabla de estudiantes. ¿Es una nómina del mismo formato ' +
        'que usa la universidad?',
    )
  }

  // Si no encontramos el semestre como etiqueta aparte, intentamos sacarlo
  // del propio título del curso, que suele traer algo como "[2/2026]".
  if (!semestre) {
    const match = courseTitle.match(/\[(\d\/\d{4})\]/)
    if (match) semestre = match[1]
  }

  const colIndexes: number[] = []
  const headers: string[] = []
  headerRow.forEach((h, idx) => {
    const val = norm(h)
    if (val !== '') {
      colIndexes.push(idx)
      headers.push(val)
    }
  })

  const rows: Array<Array<string | number>> = []
  for (let i = headerRowIndex + 1; i < grid.length; i++) {
    const row = grid[i]
    const values = colIndexes.map((c) => row[c])
    const isBlankRow = values.every((v) => norm(v) === '')
    if (isBlankRow) break // llegamos al final de la tabla
    rows.push(
      values.map((v) => (typeof v === 'number' ? v : norm(v))),
    )
  }

  if (rows.length === 0) {
    throw new RosterParseError(
      'Encontramos el encabezado de la nómina, pero no hay estudiantes ' +
        'debajo. Revisa el archivo.',
    )
  }

  return {
    courseTitle,
    profesores,
    semestre,
    headers,
    rows,
    sourceFileName: file.name,
  }
}
