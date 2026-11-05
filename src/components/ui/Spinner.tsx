import { cn } from '@/lib/utils'

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Cargando"
      className={cn(
        'inline-block h-6 w-6 animate-spin rounded-full border-2 border-white/15 border-t-neon-400',
        className,
      )}
    />
  )
}

export function FullScreenLoader({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="stadium-bg flex min-h-dvh flex-col items-center justify-center gap-4">
      <img src="/logo.svg" alt="" width={72} height={72} className="animate-float" />
      <div className="flex items-center gap-3 font-display text-lg tracking-widest text-slate-400 uppercase">
        <Spinner />
        {label}
      </div>
    </div>
  )
}

export function PageLoader() {
  return (
    <div className="flex items-center justify-center py-24">
      <Spinner className="h-8 w-8" />
    </div>
  )
}
