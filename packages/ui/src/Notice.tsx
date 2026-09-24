import type { ComponentChildren } from "preact";

export interface NoticeProps {
  tone?: "info" | "success" | "error";
  children: ComponentChildren;
}

export function Notice({ tone = "info", children }: NoticeProps) {
  return (
    <div class={`notice notice-${tone}`} role={tone === "error" ? "alert" : "status"}>
      {children}
    </div>
  );
}
