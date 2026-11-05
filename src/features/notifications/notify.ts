import { VAPID_PUBLIC_KEY } from '@/lib/push'
import { supabase } from '@/lib/supabase'

/** Eventos que dispara la app; la Edge Function `notify` los valida y decide a quién avisar. */
export type NotifyEvent =
  | { type: 'result'; tournament_id: string; match_id: string; corrected?: boolean }
  | { type: 'next'; tournament_id: string; match_ids: string[] }
  | { type: 'started'; tournament_id: string }
  | { type: 'knockout'; tournament_id: string }
  | { type: 'champion'; tournament_id: string }
  | { type: 'joined'; tournament_id: string }

/**
 * Avisa al servidor de que pasó algo para que envíe las notificaciones push.
 * Es "dispara y olvida": nunca debe romper ni retrasar la acción del usuario.
 */
export function notify(event: NotifyEvent): void {
  if (!VAPID_PUBLIC_KEY) return // push no configurado
  void supabase.functions
    .invoke('notify', { body: event })
    .then(({ error }) => {
      if (error) console.warn('[notify]', error.message)
    })
    .catch((err: unknown) => console.warn('[notify]', err))
}
