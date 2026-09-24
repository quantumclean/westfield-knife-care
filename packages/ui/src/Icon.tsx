export type IconName = "truck" | "knife" | "home" | "check" | "arrow";

const PATHS: Record<IconName, string> = {
  truck:
    "M3 7h10v8H3zM13 10h4l3 3v2h-7zM6 18a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm11 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  knife: "M4 20l8-8m0 0l7.5-7.5c1.5-1.5 3 0 2 2L13 15l-1-3z",
  home: "M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  check: "M5 12l4 4L19 6",
  arrow: "M5 12h14m-6-6l6 6-6 6",
};

export interface IconProps {
  name: IconName;
  class?: string;
  size?: number;
}

/** Inline SVG icons; stroked so they inherit currentColor. */
export function Icon({ name, class: className, size = 28 }: IconProps) {
  return (
    <svg
      class={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
