import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import { LogoMark, Wordmark } from '@/components/ui/Logo'

interface AuthShellProps {
  title: string
  subtitle: string
  children: ReactNode
  footer: ReactNode
}

export function AuthShell({ title, subtitle, children, footer }: AuthShellProps) {
  return (
    <div className="stadium-bg relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-5 py-10">
      <div className="pitch-lines pointer-events-none absolute inset-0" />
      <motion.div
        className="relative z-10 flex w-full max-w-sm flex-col items-center"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      >
        <LogoMark size={104} className="animate-float" />
        <Wordmark stacked className="mt-4 text-4xl sm:text-5xl" />
        <p className="mt-3 text-center text-sm tracking-wide text-slate-400">
          Tu liga. Tu copa. Tu leyenda.
        </p>

        <div className="card card-gold mt-8 w-full p-6">
          <h1 className="text-3xl font-bold text-white uppercase">{title}</h1>
          <p className="mt-1 mb-5 text-sm text-slate-400">{subtitle}</p>
          {children}
        </div>

        <div className="mt-5 text-sm text-slate-400">{footer}</div>
      </motion.div>
    </div>
  )
}
