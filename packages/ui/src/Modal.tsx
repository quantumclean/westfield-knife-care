import type { ComponentChildren } from "preact";
import { useEffect, useRef } from "preact/hooks";

export interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ComponentChildren;
}

/** Dialog built on the native <dialog> element for focus trapping and Escape. */
export function Modal({ open, title, onClose, children }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      class="modal"
      aria-labelledby="modal-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div class="modal-body">
        <header class="modal-header">
          <h2 id="modal-title">{title}</h2>
          <button type="button" class="modal-close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </header>
        {open && children}
      </div>
    </dialog>
  );
}
