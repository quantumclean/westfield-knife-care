import { BRAND } from "@wkc/shared";
import { Logo } from "@wkc/ui";

export interface HeaderProps {
  ctaLabel: string;
  onBook: () => void;
  onIntent: () => void;
}

const LINKS = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#pricing", label: "Pricing" },
  { href: "#gift", label: "Gift" },
  { href: "#faq", label: "FAQ" },
] as const;

/**
 * Logo, section links and the booking button. On phones the four links
 * drop to a second row instead of hiding behind a menu: there are only
 * four, and visible links are found more often than a menu button. "Gift"
 * leads to the gift-interest band, which only collects interest.
 */
export function Header({ ctaLabel, onBook, onIntent }: HeaderProps) {
  return (
    <header class="site-header">
      <div class="container site-header-inner">
        <Logo name={BRAND.name} />
        <nav class="site-nav" aria-label="Primary">
          {LINKS.map((l) => (
            <a href={l.href} key={l.href}>
              {l.label}
            </a>
          ))}
        </nav>
        <button
          type="button"
          class="btn btn-primary btn-md header-cta"
          onClick={onBook}
          onPointerEnter={onIntent}
          onFocus={onIntent}
        >
          {ctaLabel}
        </button>
      </div>
    </header>
  );
}
