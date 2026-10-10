import { BRAND } from "@wkc/shared";
import { Button, Logo } from "@wkc/ui";

export interface HeaderProps {
  ctaLabel: string;
  onBook: () => void;
}

export function Header({ ctaLabel, onBook }: HeaderProps) {
  return (
    <header class="site-header">
      <a class="skip-link" href="#main-content">
        Skip to content
      </a>
      <div class="container site-header-inner">
        <Logo name={BRAND.name} />
        <nav class="site-nav" aria-label="Primary">
          <a href="#how-it-works">How it works</a>
          <a href="#pricing">Pricing</a>
          <a href="#faq">FAQ</a>
        </nav>
        <Button onClick={onBook}>{ctaLabel}</Button>
      </div>
    </header>
  );
}
