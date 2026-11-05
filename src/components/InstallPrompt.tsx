import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Download, Share, X } from 'lucide-react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'fccc-install-dismissed'
const DISMISS_DAYS = 14

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

function recentlyDismissed(): boolean {
  const at = Number(localStorage.getItem(DISMISS_KEY) ?? 0)
  return Date.now() - at < DISMISS_DAYS * 86_400_000
}

/** Invita a instalar la PWA: prompt nativo en Android/Chrome, instrucciones en iOS. */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [iosHint, setIosHint] = useState(false)
  const [hidden, setHidden] = useState(true)

  useEffect(() => {
    if (isStandalone() || recentlyDismissed()) return

    const onPrompt = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
      setHidden(false)
    }
    const onInstalled = () => setHidden(true)
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)

    if (isIos()) {
      setIosHint(true)
      setHidden(false)
    }
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
    setHidden(true)
  }

  async function install() {
    if (!deferred) return
    await deferred.prompt()
    const { outcome } = await deferred.userChoice
    setDeferred(null)
    if (outcome === 'accepted') setHidden(true)
    else dismiss()
  }

  return (
    <AnimatePresence>
      {!hidden && (deferred || iosHint) && (
        <motion.aside
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: 'spring', damping: 24, stiffness: 260 }}
          className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] z-40 mx-auto max-w-md sm:bottom-6 sm:left-auto sm:mx-0"
          role="complementary"
          aria-label="Instalar aplicación"
        >
          <div className="card card-gold flex items-center gap-3 !p-3 shadow-2xl">
            <img src="/icons/icon-192.png" alt="" width={44} height={44} className="rounded-xl" />
            <div className="min-w-0 flex-1">
              <p className="font-display text-lg leading-tight font-bold text-white uppercase">
                Instala FC Champions
              </p>
              {iosHint && !deferred ? (
                <p className="text-xs text-slate-400">
                  Toca <Share size={12} className="inline -translate-y-px" /> y luego «Añadir a pantalla de inicio».
                </p>
              ) : (
                <p className="text-xs text-slate-400">Acceso directo, pantalla completa y más rápida.</p>
              )}
            </div>
            {deferred && (
              <button type="button" className="btn btn-gold btn-sm shrink-0" onClick={() => void install()}>
                <Download size={16} /> Instalar
              </button>
            )}
            <button
              type="button"
              onClick={dismiss}
              className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
              aria-label="Cerrar"
            >
              <X size={18} />
            </button>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  )
}
