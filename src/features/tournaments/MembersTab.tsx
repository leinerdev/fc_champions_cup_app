import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Crown, Ghost, ShieldCheck, ShieldOff, UserMinus, UserPlus } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Spinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { friendlyError } from '@/lib/supabase'
import type { Member } from '@/lib/types'
import { memberLabel, useAddGhost, useRemoveMember, useSetMemberRole } from './api'
import { InvitePanel } from './InvitePanel'
import type { TournamentView } from './view'

export function MembersTab({ view }: { view: TournamentView }) {
  const { t, members, isAdmin, me } = view
  const toast = useToast()
  const navigate = useNavigate()
  const addGhost = useAddGhost(t.id)
  const setRole = useSetMemberRole(t.id)
  const removeMember = useRemoveMember(t.id)
  const [ghostName, setGhostName] = useState('')
  const [toRemove, setToRemove] = useState<Member | null>(null)

  const draft = t.status === 'draft'
  const full = members.length >= t.config.size

  async function onAddGhost(e: FormEvent) {
    e.preventDefault()
    const name = ghostName.trim()
    if (!name) return
    try {
      await addGhost.mutateAsync(name)
      setGhostName('')
      toast.success(`${name} se agregó al torneo`)
    } catch (err) {
      toast.error(friendlyError(err))
    }
  }

  async function onToggleRole(m: Member) {
    try {
      await setRole.mutateAsync({ memberId: m.id, role: m.role === 'admin' ? 'guest' : 'admin' })
      toast.success(m.role === 'admin' ? 'Ya no es administrador' : `${memberLabel(m)} ahora es administrador`)
    } catch (err) {
      toast.error(friendlyError(err))
    }
  }

  async function onRemove(m: Member) {
    try {
      await removeMember.mutateAsync(m.id)
      toast.success(m.id === me?.id ? 'Saliste del torneo' : `${memberLabel(m)} fue quitado`)
      if (m.id === me?.id) navigate('/', { replace: true })
    } catch (err) {
      toast.error(friendlyError(err))
      throw err
    }
  }

  return (
    <div className="space-y-5">
      {draft && <InvitePanel t={t} />}

      <section className="space-y-2">
        <h3 className="flex items-center gap-3 text-2xl font-bold tracking-wider text-slate-300 uppercase">
          Jugadores
          <span className="chip chip-neon">
            {members.length}/{t.config.size}
          </span>
        </h3>

        <ul className="space-y-2">
          {members.map((m) => {
            const name = memberLabel(m)
            const isCreator = m.user_id === t.created_by
            const isGhost = !m.user_id
            const isMe = m.id === me?.id
            const canLeave = draft && isMe && !isCreator
            return (
              <li key={m.id} className="card flex items-center gap-3 !p-3">
                <Avatar name={name} url={m.profile?.avatar_url} size={46} ring={isMe} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 truncate text-xl font-semibold text-white">
                    <span className="truncate">{name}</span>
                    {isMe && <span className="text-xs font-normal text-neon-400">(tú)</span>}
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {isCreator ? (
                      <span className="chip chip-gold">
                        <Crown size={12} /> Creador
                      </span>
                    ) : m.role === 'admin' ? (
                      <span className="chip chip-gold">
                        <ShieldCheck size={12} /> Admin
                      </span>
                    ) : (
                      <span className="chip">Invitado</span>
                    )}
                    {isGhost && (
                      <span className="chip" title="Jugador agregado solo con nombre">
                        <Ghost size={12} /> Sin cuenta
                      </span>
                    )}
                    {m.profile && <span className="text-xs text-slate-500">@{m.profile.username}</span>}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  {isAdmin && !isCreator && !isGhost && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm !px-2.5"
                      onClick={() => void onToggleRole(m)}
                      disabled={setRole.isPending}
                      title={m.role === 'admin' ? 'Quitar rol de administrador' : 'Hacer administrador'}
                      aria-label={m.role === 'admin' ? `Quitar admin a ${name}` : `Hacer admin a ${name}`}
                    >
                      {m.role === 'admin' ? <ShieldOff size={16} /> : <ShieldCheck size={16} />}
                    </button>
                  )}
                  {draft && ((isAdmin && !isCreator) || canLeave) && (
                    <button
                      type="button"
                      className="btn btn-danger btn-sm !px-2.5"
                      onClick={() => setToRemove(m)}
                      aria-label={isMe ? 'Salir del torneo' : `Quitar a ${name}`}
                      title={isMe ? 'Salir del torneo' : 'Quitar del torneo'}
                    >
                      <UserMinus size={16} />
                    </button>
                  )}
                </div>
              </li>
            )
          })}
          {Array.from({ length: Math.max(0, t.config.size - members.length) }, (_, i) => (
            <li
              key={`empty-${i}`}
              className="flex items-center gap-3 rounded-2xl border border-dashed border-white/10 p-3 text-slate-600"
            >
              <span className="flex h-[46px] w-[46px] items-center justify-center rounded-full border border-dashed border-white/10">
                <UserPlus size={18} />
              </span>
              <span className="font-display text-lg tracking-wider uppercase">Plaza libre</span>
            </li>
          ))}
        </ul>
      </section>

      {isAdmin && draft && !full && (
        <form onSubmit={onAddGhost} className="card space-y-3">
          <div>
            <h3 className="text-xl font-bold tracking-wider text-white uppercase">Agregar jugador sin cuenta</h3>
            <p className="text-sm text-slate-400">
              Para amigos que no usarán la app: solo se registra su nombre y tú cargas sus resultados.
            </p>
          </div>
          <div className="flex gap-2">
            <input
              className="input"
              placeholder="Nombre del jugador"
              maxLength={40}
              value={ghostName}
              onChange={(e) => setGhostName(e.target.value)}
              aria-label="Nombre del jugador"
            />
            <button type="submit" className="btn btn-neon !px-4" disabled={!ghostName.trim() || addGhost.isPending}>
              {addGhost.isPending ? <Spinner className="h-5 w-5" /> : <UserPlus size={20} />}
              <span className="hidden sm:inline">Agregar</span>
            </button>
          </div>
        </form>
      )}

      <ConfirmDialog
        open={Boolean(toRemove)}
        danger
        title={toRemove?.id === me?.id ? 'Salir del torneo' : 'Quitar jugador'}
        message={
          toRemove?.id === me?.id
            ? '¿Seguro que quieres salir de este torneo?'
            : `¿Quitar a ${toRemove ? memberLabel(toRemove) : ''} del torneo?`
        }
        confirmLabel={toRemove?.id === me?.id ? 'Salir' : 'Quitar'}
        onConfirm={() => onRemove(toRemove!)}
        onClose={() => setToRemove(null)}
      />
    </div>
  )
}
