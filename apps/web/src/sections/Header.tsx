import { BRAND } from "@wkc/shared";
import { Button, Logo } from "@wkc/ui";

export interface HeaderProps {
  ctaLabel: string;
  onBook: () => void;
}

export function Header({ ctaLabel, onBook }: HeaderProps) {
  return (
    <header class="site-header">
      <div class="container site-header-inner">
        <Logo name={BRAND.name} />
        <nav class="site-nav" aria-label="Primary">
          <a href="#how-it-works">How It Works</a>
          <a href="#pricing">Pricing</a>
          <a href="#faq">FAQ</a>
        </nav>
        <Button onClick={onBook}>{ctaLabel}</Button>
      </div>
    </header>
  );
}
