import { Bell, BellOff, BellRing, Share } from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { showTestNotification } from '@/lib/push'
import { friendlyError } from '@/lib/supabase'
import { usePush } from './usePush'

/** Activar / desactivar las notificaciones push en este dispositivo (pantalla de perfil). */
export function NotificationsCard() {
  const push = usePush()
  const toast = useToast()

  // Sin claves VAPID configuradas la función no existe: no se muestra nada.
  if (push.support === 'unconfigured') return null

  async function toggle() {
    try {
      if (push.subscribed) {
        await push.disable()
        toast.success('Notificaciones desactivadas en este dispositivo')
      } else {
        await push.enable()
        toast.success('¡Notificaciones activadas!')
        await showTestNotification().catch(() => undefined)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : friendlyError(err))
    }
  }

  const denied = push.permission === 'denied'

  return (
    <section className="card space-y-4">
      <h2 className="flex items-center gap-2 text-2xl font-bold text-white uppercase">
        <BellRing size={20} className="text-gold-400" /> Notificaciones
      </h2>
      <p className="text-sm text-slate-400">
        Entérate al instante cuando se registra un resultado, cuando te toca jugar una nueva ronda o cuando alguien se une a
        tu torneo.
      </p>

      {push.support === 'needs-install' && (
        <p className="flex items-start gap-2 rounded-lg border border-gold-500/30 bg-gold-500/10 px-3 py-2 text-sm text-gold-200">
          <Share size={18} className="mt-0.5 shrink-0" />
          <span>
            En iPhone y iPad primero instala la app: en Safari toca <strong>Compartir</strong> y luego{' '}
            <strong>Añadir a pantalla de inicio</strong>. Ábrela desde ahí y vuelve a esta pantalla.
          </span>
        </p>
      )}

      {push.support === 'unsupported' && (
        <p className="text-sm text-slate-500">Este navegador no admite notificaciones push.</p>
      )}

      {push.support === 'ok' && denied && !push.subscribed && (
        <p className="flex items-start gap-2 rounded-lg border border-loss/40 bg-loss/10 px-3 py-2 text-sm text-loss">
          <BellOff size={18} className="mt-0.5 shrink-0" />
          <span>
            Bloqueaste las notificaciones para esta app. Actívalas en los ajustes del navegador o del sistema y vuelve
            aquí.
          </span>
        </p>
      )}

      {push.support === 'ok' && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => void toggle()}
            disabled={push.busy || !push.ready || (denied && !push.subscribed)}
            className={push.subscribed ? 'btn btn-ghost flex-1' : 'btn btn-gold flex-1'}
          >
            {push.busy ? (
              <Spinner className="h-5 w-5" />
            ) : push.subscribed ? (
              <BellOff size={20} />
            ) : (
              <Bell size={20} />
            )}
            {push.subscribed ? 'Desactivar en este dispositivo' : 'Activar notificaciones'}
          </button>
          {push.subscribed && (
            <button
              type="button"
              className="btn btn-neon"
              onClick={() => void showTestNotification().catch((e: unknown) => toast.error(friendlyError(e)))}
            >
              Probar
            </button>
          )}
        </div>
      )}
      {push.subscribed && (
        <p className="text-xs text-slate-500">
          Activadas en este dispositivo. Si usas la app en otro móvil u ordenador, actívalas también allí.
        </p>
      )}
    </section>
  )
}
