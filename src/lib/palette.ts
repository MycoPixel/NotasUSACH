export interface AccentOption {
  id: string
  label: string
  /** Color en hex, sin "#". */
  hex: string
}

/** Opciones de color para destacar el encabezado de la planilla exportada.
 * Todos son lo suficientemente oscuros para que el texto blanco del
 * encabezado se siga leyendo bien. */
export const ACCENT_OPTIONS: AccentOption[] = [
  { id: 'burgundy', label: 'Burdeo', hex: '6B2737' },
  { id: 'navy', label: 'Azul marino', hex: '1F3A5F' },
  { id: 'forest', label: 'Verde bosque', hex: '2F5233' },
  { id: 'slate', label: 'Gris pizarra', hex: '3B4252' },
  { id: 'plum', label: 'Vino', hex: '5B3256' },
]

export const DEFAULT_ACCENT = ACCENT_OPTIONS[0].hex
