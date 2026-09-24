export interface LogoProps {
  name: string;
  href?: string;
}

export function Logo({ name, href = "/" }: LogoProps) {
  const [first, ...rest] = name.split(" ");
  return (
    <a class="logo" href={href} aria-label={name}>
      <span class="logo-primary">{first}</span>
      <span class="logo-secondary">{rest.join(" ")}</span>
    </a>
  );
}
