import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { BellRing, X } from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { friendlyError } from '@/lib/supabase'
import { usePush } from './usePush'

const DISMISS_KEY = 'fccc-push-dismissed'
const DISMISS_DAYS = 10

function recentlyDismissed(): boolean {
  const at = Number(localStorage.getItem(DISMISS_KEY) ?? 0)
  return Date.now() - at < DISMISS_DAYS * 86_400_000
}

/** Invitación (en la pantalla de inicio) a activar las notificaciones. */
export function NotificationsPrompt() {
  const push = usePush()
  const toast = useToast()
  const [dismissed, setDismissed] = useState(recentlyDismissed)

  // Solo si se puede activar con un toque; en iOS sin instalar y otros casos se explica en el perfil.
  const visible = push.support === 'ok' && push.ready && !push.subscribed && push.permission === 'default' && !dismissed

  async function onEnable() {
    try {
      await push.enable()
      toast.success('¡Notificaciones activadas!')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : friendlyError(err))
    }
  }

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
    setDismissed(true)
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, height: 0 }}
          className="card card-gold flex items-center gap-3 !p-3"
          role="region"
          aria-label="Activar notificaciones"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gold-500/15 text-gold-400">
            <BellRing size={22} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-xl leading-tight font-semibold text-white">No te pierdas ningún partido</p>
            <p className="text-xs text-slate-400">
              Avisos de resultados y de cuándo te toca jugar.{' '}
              <Link to="/perfil" className="text-neon-300 underline-offset-2 hover:underline">
                Más info
              </Link>
            </p>
          </div>
          <button type="button" className="btn btn-gold btn-sm shrink-0" onClick={() => void onEnable()} disabled={push.busy}>
            {push.busy ? <Spinner className="h-4 w-4 border-night-950/30 border-t-night-950" /> : 'Activar'}
          </button>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Ahora no"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-white/10 hover:text-white"
          >
            <X size={18} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
