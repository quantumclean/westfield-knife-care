import { cloneElement, isValidElement, type ComponentChildren, type JSX } from "preact";

export interface FieldProps {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ComponentChildren;
}

export function Field({ label, htmlFor, hint, error, required, children }: FieldProps) {
  // The control is the single child; tie the hint or error to it and flag it invalid.
  const messageId = error ? `${htmlFor}-error` : hint ? `${htmlFor}-hint` : undefined;
  const control = isValidElement(children)
    ? cloneElement(children as JSX.Element, {
        "aria-invalid": error ? "true" : undefined,
        "aria-describedby": messageId,
      })
    : children;
  return (
    <div class={`field${error ? " field-error" : ""}`}>
      <label for={htmlFor}>
        {label}
        {required && (
          <span class="field-required" aria-hidden="true">
            {" "}
            *
          </span>
        )}
      </label>
      {control}
      {hint && !error && (
        <p class="field-hint" id={`${htmlFor}-hint`}>
          {hint}
        </p>
      )}
      {error && (
        <p class="field-message" id={`${htmlFor}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}

export function Input(props: JSX.InputHTMLAttributes<HTMLInputElement>) {
  return <input class="input" {...props} />;
}

export function Select(props: JSX.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select class="input" {...props} />;
}

export function Textarea(props: JSX.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea class="input" rows={3} {...props} />;
}
