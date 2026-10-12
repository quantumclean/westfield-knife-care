import type { ComponentType } from "preact";
import { useState } from "preact/hooks";
import { BRAND } from "@wkc/shared";
import { Logo, Modal } from "@wkc/ui";

export function Footer({ experimentId }: { experimentId: string }) {
  const [privacyOpen, setPrivacyOpen] = useState(false);
  // The privacy panel is only downloaded when someone opens it.
  const [Panel, setPanel] = useState<ComponentType | null>(null);
  const [panelFailed, setPanelFailed] = useState(false);
  const openPrivacy = () => {
    setPrivacyOpen(true);
    import("./PrivacyPanel.tsx")
      .then((m) => setPanel(() => m.PrivacyPanel))
      .catch(() => setPanelFailed(true));
  };
  return (
    <>
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
              © {new Date().getFullYear()} {BRAND.name} ·{" "}
              <button type="button" class="footer-link" onClick={openPrivacy}>
                Privacy &amp; analytics
              </button>
            </p>
          </div>
        </div>
      </footer>
      {/* Outside <footer> so the dialog does not inherit the footer's colours. */}
      <Modal open={privacyOpen} title="Privacy & analytics" onClose={() => setPrivacyOpen(false)}>
        {Panel ? (
          <Panel />
        ) : (
          <p class="muted" role="status">
            {panelFailed
              ? `This panel could not be loaded. Please try again, or email ${BRAND.support_email}.`
              : "Loading…"}
          </p>
        )}
      </Modal>
    </>
  );
}
