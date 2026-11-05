import { cn, initials } from '@/lib/utils'

interface AvatarProps {
  name: string
  url?: string | null
  size?: number
  className?: string
  ring?: boolean
}

export function Avatar({ name, url, size = 40, className, ring }: AvatarProps) {
  const style = { width: size, height: size, fontSize: Math.max(11, size * 0.38) }
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-night-600 font-display font-bold text-gold-300 select-none',
        ring && 'ring-2 ring-gold-500/70 ring-offset-2 ring-offset-night-900',
        className,
      )}
      style={style}
      title={name}
    >
      {url ? (
        <img src={url} alt={name} className="h-full w-full object-cover" loading="lazy" />
      ) : (
        initials(name)
      )}
    </span>
  )
}
