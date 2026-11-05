import { Minus, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ToggleProps {
  checked: boolean
  onChange: (value: boolean) => void
  label: string
  description?: string
  disabled?: boolean
}

export function Toggle({ checked, onChange, label, description, disabled }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 rounded-xl border border-white/10 bg-night-950/50 px-4 py-3 text-left transition hover:bg-night-950/80 disabled:opacity-50"
    >
      <span>
        <span className="block font-semibold text-slate-100">{label}</span>
        {description && <span className="block text-xs text-slate-400">{description}</span>}
      </span>
      <span
        className={cn(
          'relative h-7 w-12 shrink-0 rounded-full transition',
          checked ? 'bg-neon-400 shadow-glow-neon' : 'bg-night-600',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all',
            checked ? 'left-[calc(100%-1.625rem)]' : 'left-0.5',
          )}
        />
      </span>
    </button>
  )
}

interface StepperProps {
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  step?: number
  label: string
  hint?: string
}

export function Stepper({ value, onChange, min, max, step = 1, label, hint }: StepperProps) {
  const dec = () => onChange(Math.max(min, value - step))
  const inc = () => onChange(Math.min(max, value + step))
  return (
    <div>
      <span className="field-label">{label}</span>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={dec}
          disabled={value <= min}
          className="btn btn-ghost !min-h-12 !w-12 !px-0"
          aria-label={`Menos ${label}`}
        >
          <Minus size={20} />
        </button>
        <span
          className="min-w-16 text-center font-display text-5xl leading-none font-extrabold text-gold-300 tabular-nums"
          aria-live="polite"
        >
          {value}
        </span>
        <button
          type="button"
          onClick={inc}
          disabled={value >= max}
          className="btn btn-ghost !min-h-12 !w-12 !px-0"
          aria-label={`Más ${label}`}
        >
          <Plus size={20} />
        </button>
      </div>
      {hint && <p className="mt-1.5 text-xs text-slate-500">{hint}</p>}
    </div>
  )
}

interface SegmentedProps<T extends string> {
  value: T
  onChange: (value: T) => void
  options: { value: T; label: string }[]
  label?: string
}

export function Segmented<T extends string>({ value, onChange, options, label }: SegmentedProps<T>) {
  return (
    <div>
      {label && <span className="field-label">{label}</span>}
      <div className="grid auto-cols-fr grid-flow-col gap-1 rounded-xl border border-white/10 bg-night-950/60 p-1">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={value === o.value}
            className={cn(
              'rounded-lg px-3 py-2 font-display text-lg font-bold tracking-wider uppercase transition',
              value === o.value
                ? 'bg-gold-500 text-night-950 shadow-glow-gold'
                : 'text-slate-400 hover:text-white',
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}
