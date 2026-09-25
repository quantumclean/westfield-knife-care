import { useEffect, useState } from "preact/hooks";
import { Modal, Notice } from "@wkc/ui";
import { BookingForm } from "./forms/BookingForm.tsx";
import { PilotForm } from "./forms/PilotForm.tsx";
import { EVENTS, track } from "./lib/analytics.ts";
import type { Session } from "./lib/session.ts";
import { Faq } from "./sections/Faq.tsx";
import { Footer } from "./sections/Footer.tsx";
import { Header } from "./sections/Header.tsx";
import { Hero } from "./sections/Hero.tsx";
import { HowItWorks } from "./sections/HowItWorks.tsx";
import { LaunchVideo } from "./sections/LaunchVideo.tsx";
import { Pricing } from "./sections/Pricing.tsx";

type Dialog = "none" | "book" | "pilot";

export function App({ session }: { session: Session }) {
  const { experiment } = session;
  const [dialog, setDialog] = useState<Dialog>("none");
  const cancelled = new URLSearchParams(window.location.search).get("cancelled") === "1";

  const openBooking = (location: string) => {
    track(EVENTS.cta_click, { cta: "sharpen", location });
    track(EVENTS.booking_opened, { location });
    setDialog("book");
  };
  const openPilot = (location: string) => {
    track(EVENTS.cta_click, { cta: "pilot", location });
    track(EVENTS.pilot_opened, { location });
    setDialog("pilot");
  };

  // Deep links: /#book and /#pilot open the dialogs (used by flyers and emails).
  useEffect(() => {
    const fromHash = () => {
      const hash = window.location.hash.replace("#", "");
      if (hash === "book") openBooking("deep-link");
      if (hash === "pilot") openPilot("deep-link");
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = () => {
    setDialog("none");
    if (window.location.hash)
      history.replaceState(null, "", window.location.pathname + window.location.search);
  };

  return (
    <>
      <Header ctaLabel={experiment.offer.cta_primary} onBook={() => openBooking("nav")} />
      <main>
        {cancelled && (
          <div class="container banner">
            <Notice>
              Your checkout was cancelled. Your knives are still waiting, pick up where you left
              off.
            </Notice>
          </div>
        )}
        <Hero
          offer={experiment.offer}
          onBook={() => openBooking("hero")}
          onPilot={() => openPilot("hero")}
        />
        <LaunchVideo offerId={experiment.offer.id} />
        <HowItWorks />
        <Pricing
          experiment={experiment}
          onBook={() => openBooking("pricing")}
          onPilot={() => openPilot("pricing")}
        />
        <Faq />
      </main>
      <Footer experimentId={experiment.experiment.id} />

      <Modal open={dialog === "book"} title={experiment.offer.cta_primary} onClose={close}>
        <BookingForm session={session} experiment={experiment} />
      </Modal>
      <Modal open={dialog === "pilot"} title="Join the Always Sharp Pilot" onClose={close}>
        <PilotForm session={session} />
      </Modal>
    </>
  );
}
