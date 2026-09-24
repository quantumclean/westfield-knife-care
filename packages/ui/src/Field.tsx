import type { ComponentChildren, JSX } from "preact";

export interface FieldProps {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ComponentChildren;
}

export function Field({ label, htmlFor, hint, error, required, children }: FieldProps) {
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
      {children}
      {hint && !error && <p class="field-hint">{hint}</p>}
      {error && (
        <p class="field-message" role="alert">
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
