export interface LogoProps {
  name: string;
  href?: string;
}

/** Inked chef's knife over a lemon-slice sun, then the name set in the display serif. */
export function Logo({ name, href = "/" }: LogoProps) {
  const [first, ...rest] = name.split(" ");
  return (
    <a class="logo" href={href} aria-label={name}>
      <svg class="logo-mark" viewBox="0 0 40 40" aria-hidden="true">
        <circle cx="25" cy="15" r="10.5" fill="var(--lemon)" />
        <circle cx="25" cy="15" r="7.2" fill="none" stroke="#fff8" stroke-width="1.2" />
        <path
          d="M25 15 L25 7.8 M25 15 L31.2 11.4 M25 15 L31.2 18.6 M25 15 L25 22.2 M25 15 L18.8 18.6 M25 15 L18.8 11.4"
          stroke="#fff9"
          stroke-width="1"
        />
        <path
          d="M5.5 33.2 C11 27.6 17.5 21.8 24.6 16.4 L27 18.9 C20.6 24.7 13.4 30.2 7.4 34.6 Z"
          fill="var(--card)"
          stroke="var(--ink)"
          stroke-width="1.7"
          stroke-linejoin="round"
        />
        <path
          d="M24.6 16.4 L31.8 10.4 C33 9.4 34.6 10.9 33.6 12.1 L27 18.9 Z"
          fill="var(--ink)"
          stroke="var(--ink)"
          stroke-width="1.7"
          stroke-linejoin="round"
        />
        <path d="M8.6 31.3 C13 27.4 18 23.2 23 19.3" stroke="var(--tomato)" stroke-width="1.3" />
      </svg>
      <span class="logo-word">
        {first} <em>{rest.join(" ")}</em>
      </span>
    </a>
  );
}
