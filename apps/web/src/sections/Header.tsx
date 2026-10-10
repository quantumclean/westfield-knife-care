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
  { href: "#faq", label: "FAQ" },
] as const;

function closeMenu() {
  const menu = document.getElementById("site-menu") as
    (HTMLElement & { hidePopover?: () => void }) | null;
  try {
    menu?.hidePopover?.();
  } catch {
    // already closed
  }
}

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
        <div class="site-header-actions">
          <button
            type="button"
            class="btn btn-primary btn-md header-cta"
            onClick={onBook}
            onPointerEnter={onIntent}
            onFocus={onIntent}
          >
            {ctaLabel}
          </button>
          {/* Native popover: light-dismiss, Escape and focus return without script. */}
          <button
            type="button"
            class="menu-button"
            aria-label="Menu"
            {...{ popovertarget: "site-menu" }}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M4 7.5c5.4-.4 10.6.3 16-.2M4 12.2c5.4.2 10.6-.3 16 0M4 16.8c5.4-.3 10.6.2 16-.1"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                fill="none"
              />
            </svg>
          </button>
        </div>
      </div>
      <nav id="site-menu" class="site-menu" aria-label="Menu" {...{ popover: "auto" }}>
        {LINKS.map((l) => (
          <a href={l.href} key={l.href} onClick={closeMenu}>
            {l.label}
          </a>
        ))}
        <button
          type="button"
          class="btn btn-primary btn-lg"
          onClick={() => {
            closeMenu();
            onBook();
          }}
        >
          {ctaLabel}
        </button>
      </nav>
    </header>
  );
}
