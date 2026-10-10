import type { ComponentType } from "preact";
import { useCallback, useEffect, useMemo, useState } from "preact/hooks";
import { Modal } from "@wkc/ui";
import type { BookingDialogProps } from "./forms/BookingForm.tsx";
import { EVENTS, track } from "./lib/analytics.ts";
import { resolveAvailability } from "./lib/booking.ts";
import { useSiteConfig } from "./lib/config.ts";
import type { Session } from "./lib/session.ts";
import { Faq } from "./sections/Faq.tsx";
import { Footer } from "./sections/Footer.tsx";
import { Header } from "./sections/Header.tsx";
import { Hero } from "./sections/Hero.tsx";
import { HowItWorks } from "./sections/HowItWorks.tsx";
import { LaunchVideo } from "./sections/LaunchVideo.tsx";
import { Pricing } from "./sections/Pricing.tsx";
import { StickyCta } from "./sections/StickyCta.tsx";

type Dialog = "none" | "book" | "pilot";
type PilotFormComponent = ComponentType<{ session: Session }>;

// The forms (and the validation library they need) stay out of the first
// load. They are fetched when the visitor shows intent, or when idle.
let bookingModule: Promise<typeof import("./forms/BookingForm.tsx")> | undefined;
let pilotModule: Promise<typeof import("./forms/PilotForm.tsx")> | undefined;
const loadBooking = () => (bookingModule ??= import("./forms/BookingForm.tsx"));
const loadPilot = () => (pilotModule ??= import("./forms/PilotForm.tsx"));

export function App({ session }: { session: Session }) {
  const { experiment } = session;
  const { state: config, retry } = useSiteConfig();
  const [dialog, setDialog] = useState<Dialog>("none");
  const [Booking, setBooking] = useState<ComponentType<BookingDialogProps> | null>(null);
  const [Pilot, setPilot] = useState<PilotFormComponent | null>(null);
  const resumed = useMemo(
    () => new URLSearchParams(window.location.search).get("cancelled") === "1",
    [],
  );

  const prefetchBooking = useCallback(() => {
    loadBooking()
      .then((m) => setBooking(() => m.BookingDialog))
      .catch(() => {
        bookingModule = undefined; // let the next intent retry
      });
  }, []);

  const openBooking = (location: string, countAsClick = true) => {
    if (countAsClick) track(EVENTS.cta_click, { cta: "sharpen", location });
    track(EVENTS.booking_opened, { location });
    prefetchBooking();
    setDialog("book");
  };
  const openPilot = (location: string) => {
    track(EVENTS.cta_click, { cta: "pilot", location });
    track(EVENTS.pilot_opened, { location });
    loadPilot()
      .then((m) => setPilot(() => m.PilotForm))
      .catch(() => {
        pilotModule = undefined;
      });
    setDialog("pilot");
  };

  useEffect(() => {
    // Deep links: /#book and /#pilot open the dialogs (used by flyers and emails).
    const fromHash = () => {
      const hash = window.location.hash.replace("#", "");
      if (hash === "book") openBooking("deep-link");
      if (hash === "pilot") openPilot("deep-link");
    };
    // Back from a cancelled Stripe checkout: reopen the sheet with the draft.
    if (resumed) openBooking("checkout-cancelled", false);
    else fromHash();
    window.addEventListener("hashchange", fromHash);

    const idle =
      typeof requestIdleCallback === "function"
        ? requestIdleCallback(prefetchBooking, { timeout: 4000 })
        : window.setTimeout(prefetchBooking, 2500);
    return () => {
      window.removeEventListener("hashchange", fromHash);
      if (typeof cancelIdleCallback === "function") cancelIdleCallback(idle);
      clearTimeout(idle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = () => {
    setDialog("none");
    if (window.location.hash || resumed) history.replaceState(null, "", window.location.pathname);
  };

  const availability = resolveAvailability(config, { dev: import.meta.env.DEV });
  const nextPickup =
    availability.status === "open" && config.status === "ready"
      ? (config.config.care_days[0] ?? null)
      : null;

  return (
    <>
      <a class="skip-link" href="#main-content">
        Skip to content
      </a>
      <Header
        ctaLabel={experiment.offer.cta_primary}
        onBook={() => openBooking("nav")}
        onIntent={prefetchBooking}
      />
      <main id="main-content" tabIndex={-1}>
        <Hero
          offer={experiment.offer}
          price={experiment.price}
          nextPickup={nextPickup}
          onBook={() => openBooking("hero")}
          onPilot={() => openPilot("hero")}
          onIntent={prefetchBooking}
        />
        <HowItWorks>
          <LaunchVideo />
        </HowItWorks>
        <Pricing
          experiment={experiment}
          onBook={() => openBooking("pricing")}
          onPilot={() => openPilot("pricing")}
        />
        <Faq />
      </main>
      <Footer experimentId={experiment.experiment.id} />
      <StickyCta
        label={experiment.offer.cta_primary}
        price={experiment.price}
        hidden={dialog !== "none"}
        onBook={() => openBooking("sticky")}
        onIntent={prefetchBooking}
      />

      {Booking && (
        <Booking
          open={dialog === "book"}
          onClose={close}
          session={session}
          experiment={experiment}
          config={config}
          onRetryConfig={retry}
          resumed={resumed}
        />
      )}
      <Modal open={dialog === "pilot"} title="Join the Always Sharp Pilot" onClose={close}>
        {Pilot ? <Pilot session={session} /> : <p class="muted">Loading…</p>}
      </Modal>
    </>
  );
}
