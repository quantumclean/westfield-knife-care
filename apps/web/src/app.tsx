import type { ComponentType } from "preact";
import { useCallback, useEffect, useMemo, useState } from "preact/hooks";
import { Button, Modal, Notice } from "@wkc/ui";
import type { BookingDialogProps } from "./forms/BookingForm.tsx";
import type { PilotFormProps, WaitlistPrefill } from "./forms/PilotForm.tsx";
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
type PilotFormComponent = ComponentType<PilotFormProps>;

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
  // Set when the waitlist is opened from booking (out of area, booking closed).
  const [pilotPrefill, setPilotPrefill] = useState<WaitlistPrefill | undefined>(undefined);
  // A lazily loaded form that failed to arrive (offline, deploy mid-visit):
  // say so and offer a retry instead of a button that seems to do nothing.
  const [loadFailed, setLoadFailed] = useState<"none" | "book" | "pilot">("none");
  const resumed = useMemo(
    () => new URLSearchParams(window.location.search).get("cancelled") === "1",
    [],
  );

  const prefetchBooking = useCallback((reportFailure = false) => {
    loadBooking()
      .then((m) => {
        setBooking(() => m.BookingDialog);
        setLoadFailed("none");
      })
      .catch(() => {
        bookingModule = undefined; // let the next intent retry
        if (reportFailure) setLoadFailed("book");
      });
  }, []);
  // Intent and idle prefetches stay quiet; only an explicit open reports failure.
  const prefetchQuietly = useCallback(() => prefetchBooking(false), [prefetchBooking]);
  const loadPilotForm = () => {
    loadPilot()
      .then((m) => {
        setPilot(() => m.PilotForm);
        setLoadFailed("none");
      })
      .catch(() => {
        pilotModule = undefined;
        setLoadFailed("pilot");
      });
  };

  const openBooking = (location: string, countAsClick = true) => {
    if (countAsClick) track(EVENTS.cta_click, { cta: "sharpen", location });
    track(EVENTS.booking_opened, { location });
    prefetchBooking(true);
    setDialog("book");
  };
  const openPilot = (location: string, prefill?: WaitlistPrefill) => {
    setPilotPrefill(prefill);
    track(EVENTS.cta_click, { cta: "pilot", location });
    track(EVENTS.pilot_opened, { location });
    loadPilotForm();
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
        ? requestIdleCallback(prefetchQuietly, { timeout: 4000 })
        : window.setTimeout(prefetchQuietly, 2500);
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
        onIntent={prefetchQuietly}
      />
      <main id="main-content" tabIndex={-1}>
        <Hero
          offer={experiment.offer}
          price={experiment.price}
          nextPickup={nextPickup}
          onBook={() => openBooking("hero")}
          onPilot={() => openPilot("hero")}
          onIntent={prefetchQuietly}
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
        onIntent={prefetchQuietly}
      />

      {Booking ? (
        <Booking
          open={dialog === "book"}
          onClose={close}
          session={session}
          experiment={experiment}
          config={config}
          onRetryConfig={retry}
          resumed={resumed}
          onWaitlist={(location, prefill) => openPilot(location, prefill)}
        />
      ) : (
        <Modal
          open={dialog === "book"}
          variant="sheet"
          title={experiment.offer.cta_primary}
          onClose={close}
        >
          <LoadState failed={loadFailed === "book"} reopen="book" />
        </Modal>
      )}
      <Modal
        open={dialog === "pilot"}
        title={pilotPrefill ? "Join the waitlist" : "Join the Always Sharp Pilot"}
        onClose={close}
      >
        {Pilot ? (
          <Pilot session={session} prefill={pilotPrefill} key={pilotPrefill?.notes ?? "pilot"} />
        ) : (
          <LoadState failed={loadFailed === "pilot"} reopen="pilot" />
        )}
      </Modal>
    </>
  );
}

/**
 * Shown in a dialog while its form downloads, or if the download failed.
 * Browsers remember a failed dynamic import, so retrying in place cannot
 * succeed; reload straight back into the dialog through its deep link.
 */
function LoadState({ failed, reopen }: { failed: boolean; reopen: "book" | "pilot" }) {
  if (!failed)
    return (
      <p class="muted" role="status">
        Loading…
      </p>
    );
  return (
    <div class="booking-closed">
      <Notice tone="error">
        This form could not be loaded. Check your connection and try again.
      </Notice>
      <Button
        variant="secondary"
        onClick={() => {
          window.location.hash = reopen;
          window.location.reload();
        }}
      >
        Try again
      </Button>
    </div>
  );
}
