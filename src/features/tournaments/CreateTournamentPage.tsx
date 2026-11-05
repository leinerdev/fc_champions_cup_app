import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowLeft, ArrowRight, Check, Swords, Trophy } from 'lucide-react'
import { Segmented, Stepper, Toggle } from '@/components/ui/Controls'
import { Spinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { friendlyError } from '@/lib/supabase'
import {
  LIMITS,
  STAGE_LABEL,
  defaultConfig,
  expectedLeagueMatches,
  knockoutParticipants,
  knockoutStagesOf,
  stagesForSize,
  bracketSizeFor,
  validateConfig,
} from '@/lib/tournament-engine'
import type { KnockoutStage, TournamentConfig, TournamentType } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useCreateTournament } from './api'

const STEPS = ['Tipo', 'Reglas', 'Confirmar']

export function CreateTournamentPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const create = useCreateTournament()

  const [step, setStep] = useState(0)
  const [type, setType] = useState<TournamentType>('league')
  const [name, setName] = useState('')
  const [config, setConfig] = useState<TournamentConfig>(defaultConfig('league'))

  function pickType(next: TournamentType) {
    setType(next)
    setConfig(defaultConfig(next))
    setStep(1)
  }

  const patch = (p: Partial<TournamentConfig>) => setConfig((c) => ({ ...c, ...p }))

  function setSize(size: number) {
    setConfig((c) => {
      const next = { ...c, size }
      if (type === 'league' && c.league) {
        const maxAdv = Math.max(2, size - (size % 2))
        next.league = { ...c.league, advance_count: Math.min(c.league.advance_count, maxAdv) }
      }
      return next
    })
  }

  // Rondas eliminatorias (sin tercer puesto) para los interruptores ida/vuelta
  const koStages: KnockoutStage[] = useMemo(() => {
    const n = knockoutParticipants(type, config)
    return n >= 2 ? stagesForSize(bracketSizeFor(n)) : []
  }, [type, config])

  const hasSemis = koStages.includes('semi')

  function normalized(): TournamentConfig {
    const two: TournamentConfig['knockout']['two_legged'] = {}
    for (const s of koStages) if (config.knockout.two_legged[s]) two[s] = true
    return {
      ...config,
      knockout: { two_legged: two, third_place: hasSemis && config.knockout.third_place },
    }
  }

  const finalConfig = normalized()
  const validation = validateConfig(type, finalConfig)
  const nameOk = name.trim().length >= 2
  const allStages = knockoutStagesOf(type, finalConfig)

  async function submit() {
    if (validation || !nameOk) return
    try {
      const t = await create.mutateAsync({ name: name.trim(), type, config: finalConfig })
      toast.success('¡Torneo creado! Invita a tus amigos con el código.')
      navigate(`/torneos/${t.id}`, { replace: true })
    } catch (err) {
      toast.error(friendlyError(err))
    }
  }

  const { min, max } = LIMITS[type]
  const advMax = Math.max(2, config.size - (config.size % 2))

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="space-y-4">
        <button
          type="button"
          onClick={() => (step === 0 ? navigate(-1) : setStep(step - 1))}
          className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white"
        >
          <ArrowLeft size={16} /> {step === 0 ? 'Volver' : 'Atrás'}
        </button>
        <h1 className="text-4xl font-extrabold text-white uppercase">Nuevo torneo</h1>

        <ol className="flex items-center gap-2" aria-label="Progreso">
          {STEPS.map((label, i) => (
            <li key={label} className="flex flex-1 items-center gap-2">
              <span
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-display text-lg font-bold transition',
                  i < step && 'bg-gold-500 text-night-950',
                  i === step && 'bg-neon-400 text-night-950 shadow-glow-neon',
                  i > step && 'bg-night-700 text-slate-500',
                )}
              >
                {i < step ? <Check size={16} /> : i + 1}
              </span>
              <span
                className={cn(
                  'hidden font-display text-lg tracking-wider uppercase sm:block',
                  i === step ? 'text-white' : 'text-slate-500',
                )}
              >
                {label}
              </span>
              {i < STEPS.length - 1 && <span className="h-px flex-1 bg-white/10" />}
            </li>
          ))}
        </ol>
      </header>

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ duration: 0.2 }}
        >
          {step === 0 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <TypeCard
                icon={Swords}
                title="Liga / Liguilla"
                accent="neon"
                text="Todos contra todos (opcional ida y vuelta). Los mejores avanzan a semifinales y final."
                onClick={() => pickType('league')}
              />
              <TypeCard
                icon={Trophy}
                title="Copa"
                accent="gold"
                text="Eliminación directa: pierdes y te vas. Cuartos, semis y final con sorteo aleatorio."
                onClick={() => pickType('cup')}
              />
            </div>
          )}

          {step === 1 && (
            <div className="card space-y-6">
              <div>
                <label htmlFor="t-name" className="field-label">
                  Nombre del torneo
                </label>
                <input
                  id="t-name"
                  className="input"
                  placeholder={type === 'league' ? 'Liga de los Cracks' : 'Copa Champions'}
                  maxLength={60}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <Segmented
                label="Tipo"
                value={type}
                onChange={(v) => {
                  setType(v)
                  setConfig(defaultConfig(v))
                }}
                options={[
                  { value: 'league', label: 'Liga' },
                  { value: 'cup', label: 'Copa' },
                ]}
              />

              <Stepper
                label={type === 'league' ? 'Jugadores' : 'Participantes'}
                value={config.size}
                min={type === 'cup' ? Math.max(min, 4) : min}
                max={max}
                step={type === 'cup' ? 2 : 1}
                onChange={setSize}
                hint={
                  type === 'cup'
                    ? 'Número par. Si no es potencia de 2 se reparten pases directos (byes) al azar.'
                    : `Entre ${min} y ${max} jugadores.`
                }
              />

              {type === 'league' && config.league && (
                <>
                  <Toggle
                    label="Liga a ida y vuelta"
                    description="Cada pareja se enfrenta dos veces (local y visitante)."
                    checked={config.league.double_leg}
                    onChange={(v) => patch({ league: { ...config.league!, double_leg: v } })}
                  />
                  <Stepper
                    label="Clasifican a eliminatorias"
                    value={config.league.advance_count}
                    min={2}
                    max={advMax}
                    step={2}
                    onChange={(v) => patch({ league: { ...config.league!, advance_count: v } })}
                    hint="Debe ser un número par. Los cruces se sortean al azar."
                  />
                </>
              )}

              <div className="space-y-3">
                <span className="field-label">Eliminatorias</span>
                {koStages.map((s) => (
                  <Toggle
                    key={s}
                    label={`${STAGE_LABEL[s]} a ida y vuelta`}
                    description={
                      config.knockout.two_legged[s]
                        ? 'Dos partidos: ida y vuelta.'
                        : 'Partido único.'
                    }
                    checked={Boolean(config.knockout.two_legged[s])}
                    onChange={(v) =>
                      patch({
                        knockout: {
                          ...config.knockout,
                          two_legged: { ...config.knockout.two_legged, [s]: v },
                        },
                      })
                    }
                  />
                ))}
                {hasSemis && (
                  <Toggle
                    label="Partido por el tercer puesto"
                    description="Se juega entre los perdedores de las semifinales."
                    checked={config.knockout.third_place}
                    onChange={(v) => patch({ knockout: { ...config.knockout, third_place: v } })}
                  />
                )}
              </div>

              {validation && (
                <p role="alert" className="rounded-lg border border-loss/40 bg-loss/10 px-3 py-2 text-sm text-loss">
                  {validation}
                </p>
              )}

              <button
                type="button"
                className="btn btn-gold w-full"
                disabled={!nameOk || Boolean(validation)}
                onClick={() => setStep(2)}
              >
                Continuar <ArrowRight size={20} />
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="card card-gold space-y-5">
              <div>
                <p className="field-label">Resumen</p>
                <h2 className="text-4xl font-extrabold text-gold-300 uppercase">{name.trim()}</h2>
                <p className="text-slate-400">
                  {type === 'league' ? 'Liga / Liguilla' : 'Copa'} · {config.size} {type === 'league' ? 'jugadores' : 'participantes'}
                </p>
              </div>

              <ul className="space-y-2 text-slate-200">
                {type === 'league' && finalConfig.league && (
                  <>
                    <Fact>
                      Fase de liga: todos contra todos{finalConfig.league.double_leg ? ', ida y vuelta' : ', una vuelta'} (
                      {expectedLeagueMatches(finalConfig.size, finalConfig.league.double_leg)} partidos).
                    </Fact>
                    <Fact>
                      Desempate: diferencia de goles, enfrentamiento directo y, si hace falta, partido de desempate.
                    </Fact>
                    <Fact>Avanzan {finalConfig.league.advance_count} jugadores a eliminatorias (cruces al azar).</Fact>
                  </>
                )}
                {type === 'cup' && <Fact>Eliminación directa con sorteo aleatorio.</Fact>}
                {allStages.map((s) => (
                  <Fact key={s}>
                    {STAGE_LABEL[s]}:{' '}
                    {s === 'third_place'
                      ? 'partido único'
                      : finalConfig.knockout.two_legged[s as KnockoutStage]
                        ? 'ida y vuelta'
                        : 'partido único'}
                    .
                  </Fact>
                ))}
                <Fact>
                  Recibirás un código de 6 dígitos y un enlace para invitar a tus amigos. Tú serás el administrador.
                </Fact>
              </ul>

              <button
                type="button"
                className="btn btn-gold w-full"
                disabled={create.isPending}
                onClick={() => void submit()}
              >
                {create.isPending ? (
                  <Spinner className="h-5 w-5 border-night-950/30 border-t-night-950" />
                ) : (
                  <Trophy size={20} />
                )}
                Crear torneo
              </button>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

function Fact({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2 text-sm">
      <Check size={16} className="mt-0.5 shrink-0 text-neon-400" />
      <span>{children}</span>
    </li>
  )
}

interface TypeCardProps {
  icon: typeof Trophy
  title: string
  text: string
  accent: 'gold' | 'neon'
  onClick: () => void
}

function TypeCard({ icon: Icon, title, text, accent, onClick }: TypeCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'card group text-left transition hover:-translate-y-1',
        accent === 'gold' ? 'hover:border-gold-500/60 hover:shadow-glow-gold' : 'hover:border-neon-400/60 hover:shadow-glow-neon',
      )}
    >
      <span
        className={cn(
          'mb-4 flex h-16 w-16 items-center justify-center rounded-2xl',
          accent === 'gold' ? 'bg-gold-500/15 text-gold-400' : 'bg-neon-400/15 text-neon-300',
        )}
      >
        <Icon size={34} />
      </span>
      <h2 className="text-3xl font-extrabold text-white uppercase">{title}</h2>
      <p className="mt-1 text-sm text-slate-400">{text}</p>
    </button>
  )
}
