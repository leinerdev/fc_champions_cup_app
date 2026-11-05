import { useState } from 'react'
import { Modal } from './Modal'
import { Spinner } from './Spinner'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => Promise<void> | void
  onClose: () => void
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirmar',
  danger,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false)

  async function run() {
    setBusy(true)
    try {
      await onConfirm()
      onClose()
    } catch {
      // quien llama ya informó el error; el diálogo permanece abierto
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={busy ? () => {} : onClose} title={title}>
      <p className="mb-5 text-slate-300">{message}</p>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
          Cancelar
        </button>
        <button
          type="button"
          className={danger ? 'btn btn-danger' : 'btn btn-gold'}
          onClick={() => void run()}
          disabled={busy}
        >
          {busy && <Spinner className="h-5 w-5" />}
          {confirmLabel}
        </button>
      </div>
    </Modal>
  )
}
