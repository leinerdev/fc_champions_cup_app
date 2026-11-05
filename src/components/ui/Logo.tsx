import { cn } from '@/lib/utils'

interface LogoProps {
  size?: number
  className?: string
}

export function LogoMark({ size = 40, className }: LogoProps) {
  return (
    <img
      src="/logo.svg"
      alt=""
      width={size}
      height={size}
      className={cn('shrink-0 drop-shadow-[0_0_14px_rgba(245,184,61,0.35)]', className)}
      draggable={false}
    />
  )
}

interface WordmarkProps {
  className?: string
  /** Muestra el wordmark en dos líneas, para pantallas de entrada. */
  stacked?: boolean
}

export function Wordmark({ className, stacked }: WordmarkProps) {
  return (
    <span
      className={cn(
        'font-display leading-none font-extrabold tracking-[0.08em] uppercase',
        stacked ? 'flex flex-col items-center text-center' : 'inline-flex items-baseline gap-1.5',
        className,
      )}
    >
      <span className="text-gradient-gold animate-shimmer">FC Champions</span>
      <span className={cn('text-neon-400', stacked ? 'mt-1 tracking-[0.5em]' : 'tracking-[0.2em]')}>
        Cup
      </span>
    </span>
  )
}
