import type { ComponentChildren } from "preact";
import { useEffect, useId, useRef } from "preact/hooks";

export interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ComponentChildren;
  /** "sheet": bottom sheet on phones, right-hand drawer on wider screens. */
  variant?: "card" | "sheet";
  /** Rendered below the scrolling body and always visible (totals, actions). */
  footer?: ComponentChildren;
  /** Small line above the title, e.g. "Step 1 of 2". */
  eyebrow?: ComponentChildren;
}

/** Dialog built on the native <dialog> element for focus trapping and Escape. */
export function Modal({
  open,
  title,
  onClose,
  children,
  variant = "card",
  footer,
  eyebrow,
}: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  // Each dialog needs its own id: with two on the page a shared id gives both the first one's name.
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      class={variant === "sheet" ? "modal modal-sheet" : "modal"}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div class="modal-body">
        <header class="modal-header">
          <div>
            {eyebrow && <p class="modal-eyebrow">{eyebrow}</p>}
            <h2 id={titleId}>{title}</h2>
          </div>
          <button type="button" class="modal-close" aria-label="Close" onClick={onClose} autofocus>
            ×
          </button>
        </header>
        {open && children}
      </div>
      {open && footer && <div class="modal-footer">{footer}</div>}
    </dialog>
  );
}
