import { useEffect, useMemo } from 'react'
import confetti from 'canvas-confetti'
import { motion } from 'motion/react'
import { Crown, Medal, Trophy } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { computeBracketProgress } from '@/lib/tournament-engine'
import { memberLabel } from './api'
import type { TournamentView } from './view'

const COLORS = ['#f5b83d', '#ffe08a', '#22d3ee', '#ffffff']

function celebrate() {
  const fire = (originX: number, angle: number) =>
    confetti({
      particleCount: 90,
      spread: 70,
      angle,
      origin: { x: originX, y: 0.7 },
      colors: COLORS,
      disableForReducedMotion: true,
    })
  fire(0.1, 60)
  fire(0.9, 120)
  window.setTimeout(() => {
    void confetti({
      particleCount: 140,
      spread: 100,
      origin: { y: 0.55 },
      colors: COLORS,
      disableForReducedMotion: true,
    })
  }, 350)
}

export function ChampionBanner({ view }: { view: TournamentView }) {
  const { t, memberById, matches } = view
  const champion = t.champion_member_id ? memberById.get(t.champion_member_id) : undefined
  const podium = useMemo(() => computeBracketProgress(matches), [matches])

  useEffect(() => {
    if (!champion) return
    const key = `fccc-celebrated-${t.id}-${champion.id}`
    if (localStorage.getItem(key)) return
    localStorage.setItem(key, '1')
    celebrate()
  }, [champion, t.id])

  if (!champion) return null
  const name = memberLabel(champion)
  const runnerUp = podium.runnerUpId ? memberById.get(podium.runnerUpId) : undefined
  const third = podium.thirdId ? memberById.get(podium.thirdId) : undefined

  return (
    <motion.section
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', damping: 18 }}
      className="card card-gold relative overflow-hidden text-center"
      aria-label={`Campeón: ${name}`}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(245,184,61,0.28),transparent_65%)]" />
      <div className="relative flex flex-col items-center gap-3 py-4">
        <p className="flex items-center gap-2 font-display text-xl tracking-[0.4em] text-gold-400 uppercase">
          <Trophy size={18} /> Campeón <Trophy size={18} />
        </p>
        <div className="relative animate-float">
          <Crown size={40} className="absolute -top-8 left-1/2 -translate-x-1/2 text-gold-300 drop-shadow-[0_0_12px_rgba(245,184,61,0.8)]" />
          <Avatar name={name} url={champion.profile?.avatar_url} size={112} ring />
        </div>
        <h2 className="text-gradient-gold animate-shimmer text-5xl font-extrabold uppercase">{name}</h2>
        <p className="text-sm text-slate-400">{t.name}</p>

        {(runnerUp || third) && (
          <div className="mt-2 flex flex-wrap justify-center gap-3 text-sm">
            {runnerUp && (
              <span className="chip">
                <Medal size={14} className="text-slate-300" /> Subcampeón: {memberLabel(runnerUp)}
              </span>
            )}
            {third && (
              <span className="chip">
                <Medal size={14} className="text-amber-700" /> Tercero: {memberLabel(third)}
              </span>
            )}
          </div>
        )}
      </div>
    </motion.section>
  )
}
