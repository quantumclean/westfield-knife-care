import { BRAND } from "@wkc/shared";
import { Logo } from "@wkc/ui";

export function Footer({ experimentId }: { experimentId: string }) {
  return (
    <footer class="site-footer">
      <div class="container site-footer-inner">
        <div>
          <Logo name={BRAND.name} />
          <p class="muted">{BRAND.tagline}</p>
        </div>
        <div class="muted">
          <p>
            Serving {BRAND.service_area} and nearby.
            <br />
            <a href={`mailto:${BRAND.support_email}`}>{BRAND.support_email}</a>
          </p>
          <p class="footnote" data-experiment={experimentId}>
            © {new Date().getFullYear()} {BRAND.name}
          </p>
        </div>
      </div>
    </footer>
  );
}
