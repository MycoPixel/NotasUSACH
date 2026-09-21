/** Convierte un índice de columna base 0 (0 = A, 1 = B, 25 = Z, 26 = AA...)
 * a la letra de columna usada por Excel. No depende de ninguna librería, así
 * que se puede usar tanto al construir fórmulas como al hacer pruebas. */
export function columnLetter(index0: number): string {
  let n = index0 + 1
  let letters = ''
  while (n > 0) {
    const remainder = (n - 1) % 26
    letters = String.fromCharCode(65 + remainder) + letters
    n = Math.floor((n - 1) / 26)
  }
  return letters
}
