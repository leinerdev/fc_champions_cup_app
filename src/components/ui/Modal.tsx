import { useEffect, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { X } from 'lucide-react'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}

// Pila de modales abiertos: Escape solo cierra el de arriba y el scroll se
// desbloquea cuando se cierra el último.
const openStack: symbol[] = []

export function Modal({ open, onClose, title, children }: ModalProps) {
  useEffect(() => {
    if (!open) return
    const id = Symbol('modal')
    openStack.push(id)
    document.body.style.overflow = 'hidden'
    document.getElementById('app-scroll')?.classList.add('scroll-locked')
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && openStack[openStack.length - 1] === id) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      openStack.splice(openStack.indexOf(id), 1)
      if (openStack.length === 0) {
        document.body.style.overflow = ''
        document.getElementById('app-scroll')?.classList.remove('scroll-locked')
      }
    }
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center bg-night-950/80 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="card card-gold max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-b-none p-5 sm:rounded-2xl"
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-2xl font-bold text-gold-300 uppercase">{title}</h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
