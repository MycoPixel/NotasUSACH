/**
 * Utilidades para números ingresados por el usuario en español (coma decimal)
 * o en formato internacional (punto decimal). Se usan para los porcentajes
 * de ponderación y para cualquier otro campo numérico de la aplicación.
 */

/** Convierte un texto como "12,5" o "12.5" a número. Devuelve null si el
 * texto está vacío o no es un número válido. */
export function parseFlexibleNumber(input: string): number | null {
  if (input == null) return null
  const trimmed = input.trim()
  if (trimmed === '') return null

  // Sólo reemplazamos la primera coma por punto: estos campos son
  // porcentajes o conteos pequeños, nunca llevan separador de miles.
  const normalized = trimmed.replace(',', '.')
  if (!/^-?\d*\.?\d*$/.test(normalized)) return null

  const value = Number(normalized)
  return Number.isFinite(value) ? value : null
}

/** Formatea un número para mostrarlo en la UI, con coma decimal (es-CL). */
export function formatNumberEs(value: number, maxDecimals = 2): string {
  return value.toLocaleString('es-CL', {
    maximumFractionDigits: maxDecimals,
    minimumFractionDigits: 0,
  })
}

/** Suma de pesos con tolerancia a errores de redondeo de punto flotante. */
export function isCloseToHundred(total: number): boolean {
  return Math.abs(total - 100) < 0.01
}
