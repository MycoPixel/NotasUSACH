import { useEffect, useRef, useState } from 'react'
import { formatNumberEs, parseFlexibleNumber } from '../lib/numberFormat'

interface Props {
  value: number | null
  onChange: (value: number | null) => void
  placeholder?: string
  ariaLabel?: string
  id?: string
  className?: string
}

/** Input numérico que acepta coma o punto decimal, sin pelear con el cursor
 * mientras la persona escribe. Se sincroniza si el valor cambia desde
 * afuera (por ejemplo, al limpiar el formulario). */
export default function DecimalField({
  value,
  onChange,
  placeholder,
  ariaLabel,
  id,
  className,
}: Props) {
  const [text, setText] = useState(value != null ? formatNumberEs(value) : '')
  const lastEmitted = useRef<number | null>(value)

  useEffect(() => {
    if (value !== lastEmitted.current) {
      setText(value != null ? formatNumberEs(value) : '')
      lastEmitted.current = value
    }
  }, [value])

  function handleChange(next: string) {
    setText(next)
    const parsed = parseFlexibleNumber(next)
    lastEmitted.current = parsed
    onChange(parsed)
  }

  return (
    <input
      id={id}
      type="text"
      inputMode="decimal"
      className={className ?? 'input'}
      placeholder={placeholder}
      aria-label={ariaLabel}
      value={text}
      onChange={(e) => handleChange(e.target.value)}
    />
  )
}
