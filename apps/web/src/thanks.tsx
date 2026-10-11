import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import "@fontsource/instrument-serif/latin-400.css";
import "@fontsource/instrument-serif/latin-400-italic.css";
import "@wkc/ui/styles.css";
import "./styles.css";
import { BRAND, formatCareDay, formatMoney } from "@wkc/shared";
import { Button, Logo, Notice } from "@wkc/ui";
import { FRUITS } from "./art/fruit.ts";
import { READY_ART } from "./art/ready.ts";
import { ApiError, api, type PublicOrder } from "./lib/api.ts";
import { EVENTS, initAnalytics, track } from "./lib/analytics.ts";
import { pollDelay } from "./lib/backoff.ts";
import { clearDraft } from "./lib/draft.ts";
import { pickupIcs } from "./lib/ics.ts";
import { describeUnpaidStatus, stampFor } from "./lib/order-status.ts";
import { takeFeedbackToken } from "./lib/feedback-token.ts";
import { loadSession } from "./lib/session.ts";

// Must run before any analytics: strip the bearer token from the URL so it never reaches GA4,
// our first-party /events, page_location, a history entry or a later Referer. Kept in memory only.
const feedbackToken = takeFeedbackToken(window.location, window.history);

const session = loadSession();
initAnalytics(session);
track(EVENTS.page_view);

const params = new URLSearchParams(window.location.search);
const orderId = params.get("order");
const askFeedback = params.get("feedback") === "1";

/** Short, readable reference for the stamp; the full number is shown too, for support. */
const shortRef = (id: string) =>
  id
    .replace(/[^a-z0-9]/gi, "")
    .slice(0, 8)
    .toUpperCase();

function downloadIcs(order: PublicOrder) {
  const ics = pickupIcs({
    orderId: order.id,
    careDay: order.care_day,
    knives: order.number_of_knives,
    name: BRAND.name,
  });
  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `knife-pickup-${order.care_day}.ics`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** A lemon sliced over and over: the "confirming" state. */
function LemonLoader() {
  return (
    <svg class="lemon-loader" viewBox="-75 -55 150 110" aria-hidden="true">
      <defs>
        <clipPath id="ll-top">
          <rect x="-120" y="-120" width="240" height="120" />
        </clipPath>
        <clipPath id="ll-bot">
          <rect x="-120" y="0" width="240" height="120" />
        </clipPath>
      </defs>
      <g
        class="ll-top"
        clip-path="url(#ll-top)"
        dangerouslySetInnerHTML={{ __html: FRUITS.lemon.whole }}
      />
      <g
        class="ll-bot"
        clip-path="url(#ll-bot)"
        dangerouslySetInnerHTML={{ __html: FRUITS.lemon.whole }}
      />
      <line class="ll-blade" x1="-74" y1="0" x2="74" y2="0" />
    </svg>
  );
}

/** Tomato half and lemon slice that drop in beside the BOOKED stamp. */
function Garnish() {
  return (
    <svg class="pass-garnish" viewBox="-70 -60 220 130" aria-hidden="true">
      <defs>
        <clipPath id="g-half">
          <rect x="-120" y="-120" width="240" height="120" />
        </clipPath>
      </defs>
      <g class="g-tomato" transform="translate(0 20) rotate(-12)">
        <g clip-path="url(#g-half)" dangerouslySetInnerHTML={{ __html: FRUITS.tomato.face }} />
      </g>
      <g
        class="g-lemon"
        transform="translate(95 4) rotate(18) scale(.8)"
        dangerouslySetInnerHTML={{ __html: FRUITS.lemon.face }}
      />
    </svg>
  );
}

function ThanksPage() {
  const [order, setOrder] = useState<PublicOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [gaveUp, setGaveUp] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!orderId) {
      setError("We could not find that order.");
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    api
      .getOrder(orderId)
      .then((result) => {
        if (cancelled) return;
        setOrder(result);
        setError(null);
        // Stripe's webhook can land a little after the redirect: check again, backing off.
        if (result.payment_status === "pending") {
          const delay = pollDelay(attempts);
          if (delay === null) setGaveUp(true);
          else timer = setTimeout(() => setAttempts((n) => n + 1), delay);
        } else {
          setGaveUp(false);
        }
      })
      .catch((error) => {
        if (cancelled) return;
        setError(
          error instanceof ApiError && error.status === 404
            ? error.message
            : `We could not load your order right now. Please refresh in a minute, or email ${BRAND.support_email}.`,
        );
      });
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [attempts]);

  function checkAgain() {
    setGaveUp(false);
    setAttempts(0);
  }

  useEffect(() => {
    if (!order || order.payment_status !== "paid") return;
    clearDraft(); // the booking is made; nothing to restore any more
    const key = `wkc.completed.${order.id}`;
    try {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, "1");
    } catch {
      // ignore
    }
    track(EVENTS.checkout_completed, { order_id: order.id, total_cents: order.total_cents });
  }, [order]);

  async function sendFeedback(repeat_intent: "yes" | "maybe" | "no") {
    if (!order || !feedbackToken) return;
    try {
      setOrder(await api.sendFeedback(order.id, repeat_intent, feedbackToken));
      setFeedbackSent(true);
    } catch {
      setError("We could not save your answer, but thank you anyway.");
    }
  }

  async function copyOrderNumber() {
    if (!order) return;
    try {
      await navigator.clipboard.writeText(order.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the full number is on screen to select by hand.
    }
  }

  const paid = order?.payment_status === "paid";
  const pending = order?.payment_status === "pending";
  // Anything other than paid or pending is a terminal state that must not read like progress.
  const unpaid =
    order && !paid && !pending
      ? describeUnpaidStatus(order.payment_status, BRAND.support_email)
      : undefined;
  const stamp = order ? stampFor(order.payment_status) : "";
  const showFeedback =
    order &&
    paid &&
    feedbackToken &&
    !feedbackSent &&
    order.repeat_intent === "unknown" &&
    (askFeedback || order.return_status === "returned");

  return (
    <main class="container pass-page">
      <Logo name={BRAND.name} />
      {error && <Notice tone="error">{error}</Notice>}
      {!error && !order && (
        <div class="pass-loading" role="status">
          <LemonLoader />
          <p class="muted">Loading your order…</p>
        </div>
      )}
      {order && (
        <article class={`pass ticket${paid ? " is-paid" : ""}`} aria-labelledby="pass-title">
          <header class="pass-head">
            {paid && <Garnish />}
            <span class={`stamp pass-stamp${paid || pending ? "" : " stamp-tomato"}`}>{stamp}</span>
            <h1 id="pass-title">
              {paid
                ? `Thank you${order.first_name ? `, ${order.first_name}` : ""}!`
                : pending && !gaveUp
                  ? "Confirming your payment…"
                  : (unpaid?.heading ?? "Almost there")}
            </h1>
            {paid ? (
              <p class="pass-lede" role="status">
                Your {order.number_of_knives}{" "}
                {order.number_of_knives === 1 ? "knife is" : "knives are"} booked for pickup on{" "}
                <strong>{formatCareDay(order.care_day)}</strong>. Leave them wrapped in a bag at
                your door in the morning.
              </p>
            ) : pending && gaveUp ? (
              <>
                <Notice>
                  We have not received confirmation of your payment yet. If you finished checkout
                  this can take a few minutes, so please check again shortly and do not pay twice.
                  If it still shows pending, email {BRAND.support_email} and quote the order number
                  below.
                </Notice>
                <p class="pass-actions">
                  <Button variant="secondary" onClick={checkAgain}>
                    Check again
                  </Button>
                </p>
              </>
            ) : pending ? (
              <div class="pass-confirming" role="status">
                <LemonLoader />
                <p class="muted">This usually takes a few seconds. Please keep this page open.</p>
              </div>
            ) : (
              <Notice tone="error">{unpaid?.message}</Notice>
            )}
          </header>

          <div class="ticket-tear" aria-hidden="true" />
          <dl class="pass-details">
            <div>
              <dt>Pickup</dt>
              <dd>
                {formatCareDay(order.care_day)}
                <span class="muted">8am – 12pm</span>
              </dd>
            </div>
            <div>
              <dt>Knives</dt>
              <dd>{order.number_of_knives}</dd>
            </div>
            <div>
              <dt>Total</dt>
              <dd>{formatMoney(order.total_cents, order.currency)}</dd>
            </div>
            <div>
              <dt>Order</dt>
              <dd>
                <span class="pass-ref">{shortRef(order.id)}</span>
                <button type="button" class="pass-copy" onClick={copyOrderNumber}>
                  {copied ? "Copied" : "Copy number"}
                </button>
              </dd>
            </div>
          </dl>
          <p class="pass-full muted">
            Order number: <span>{order.id}</span>
          </p>

          {paid && (
            <>
              <div class="ticket-tear" aria-hidden="true" />
              <ol class="timeline">
                <li class="is-done">
                  <strong>Booked</strong>
                  <span>Payment received.</span>
                </li>
                <li>
                  <strong>Pickup morning</strong>
                  <span>
                    {formatCareDay(order.care_day)}, between 8am and 12pm. Bag by the door.
                  </span>
                </li>
                <li>
                  <strong>Sharpened</strong>
                  <span>We sharpen your knives.</span>
                </li>
                <li>
                  <strong>Back on your doorstep</strong>
                  <span>Return timing is confirmed separately.</span>
                </li>
              </ol>
              <div class="ticket-tear" aria-hidden="true" />
              <section class="ready" aria-labelledby="ready-title">
                <h2 id="ready-title">Get ready the night before</h2>
                <ol class="ready-steps">
                  {(
                    [
                      ["wrap", "Wrap each blade in a kitchen towel or a cardboard sleeve."],
                      ["bag", "Put them together in a bag."],
                      ["door", "Leave the bag by your door before 8am."],
                    ] as const
                  ).map(([art, text]) => (
                    <li key={art}>
                      <svg
                        viewBox="0 0 48 48"
                        aria-hidden="true"
                        dangerouslySetInnerHTML={{ __html: READY_ART[art] }}
                      />
                      <span>{text}</span>
                    </li>
                  ))}
                </ol>
              </section>
              <div class="pass-actions">
                <Button onClick={() => downloadIcs(order)} arrow>
                  Add pickup to calendar
                </Button>
              </div>
            </>
          )}
          <p class="pass-help">
            Need to change something?{" "}
            <a
              href={`mailto:${BRAND.support_email}?subject=${encodeURIComponent(
                `Order ${shortRef(order.id)}`,
              )}&body=${encodeURIComponent(`Order number: ${order.id}\n\n`)}`}
            >
              Email {BRAND.support_email}
            </a>
            {paid && (
              <>
                {" "}
                · <a href="/#pilot">Want this on repeat? Join the Always Sharp pilot</a>
              </>
            )}
          </p>
        </article>
      )}

      {showFeedback && (
        <section class="feedback ticket">
          <h2>Would you use Westfield Knife Care again?</h2>
          <div class="feedback-actions">
            <Button onClick={() => sendFeedback("yes")}>Yes</Button>
            <Button variant="secondary" onClick={() => sendFeedback("maybe")}>
              Maybe
            </Button>
            <Button variant="ghost" onClick={() => sendFeedback("no")}>
              No
            </Button>
          </div>
        </section>
      )}
      {feedbackSent && (
        <Notice tone="success">Thanks, that helps us decide what to build next.</Notice>
      )}
      <p class="pass-home">
        <a href="/">Back to the home page</a>
      </p>
    </main>
  );
}

render(<ThanksPage />, document.getElementById("app")!);
