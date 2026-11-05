import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { ChevronRight, Crown, Swords, Trophy, Users } from 'lucide-react'
import { STATUS_LABEL, TYPE_LABEL } from '@/lib/tournament-engine'
import type { TournamentListItem } from './api'
import { cn } from '@/lib/utils'

const STATUS_STYLE = {
  draft: 'chip',
  league: 'chip chip-neon',
  knockout: 'chip chip-neon',
  finished: 'chip chip-gold',
} as const

export function StatusChip({ status }: { status: keyof typeof STATUS_STYLE }) {
  return <span className={STATUS_STYLE[status]}>{STATUS_LABEL[status]}</span>
}

export function TournamentCard({ t, index = 0 }: { t: TournamentListItem; index?: number }) {
  const count = t.members[0]?.count ?? 0
  const role = t.me[0]?.role
  const Icon = t.type === 'league' ? Swords : Trophy

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 8) * 0.05 }}
    >
      <Link
        to={`/torneos/${t.id}`}
        className={cn(
          'card group flex items-center gap-4 transition hover:-translate-y-0.5 hover:border-gold-500/40',
          t.status === 'finished' && 'card-gold',
        )}
      >
        <span
          className={cn(
            'flex h-14 w-14 shrink-0 items-center justify-center rounded-xl',
            t.type === 'league' ? 'bg-neon-400/10 text-neon-300' : 'bg-gold-500/10 text-gold-400',
          )}
        >
          <Icon size={28} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-2xl leading-tight font-bold text-white">{t.name}</h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className="chip">{TYPE_LABEL[t.type]}</span>
            <StatusChip status={t.status} />
            <span className="chip">
              <Users size={12} /> {count}/{t.config.size}
            </span>
            {role === 'admin' && (
              <span className="chip chip-gold">
                <Crown size={12} /> Admin
              </span>
            )}
          </div>
        </div>
        <ChevronRight className="shrink-0 text-slate-500 transition group-hover:translate-x-1 group-hover:text-gold-400" />
      </Link>
    </motion.div>
  )
}
