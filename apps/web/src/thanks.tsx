import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import "@wkc/ui/styles.css";
import "./styles.css";
import { BRAND, formatCareDay, formatMoney } from "@wkc/shared";
import { Button, Logo, Notice } from "@wkc/ui";
import { ApiError, api, type PublicOrder } from "./lib/api.ts";
import { EVENTS, initAnalytics, track } from "./lib/analytics.ts";
import { describeUnpaidStatus } from "./lib/order-status.ts";
import { loadSession } from "./lib/session.ts";

const session = loadSession();
initAnalytics(session);
track(EVENTS.page_view);

/** Stripe's webhook normally lands within a couple of seconds; 10 polls x 2s covers slow ones. */
const MAX_POLLS = 10;

const params = new URLSearchParams(window.location.search);
const orderId = params.get("order");
const askFeedback = params.get("feedback") === "1";

function ThanksPage() {
  const [order, setOrder] = useState<PublicOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [gaveUp, setGaveUp] = useState(false);

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
        // Stripe's webhook can land a second or two after the redirect.
        if (result.payment_status === "pending") {
          if (attempts < MAX_POLLS) timer = setTimeout(() => setAttempts((n) => n + 1), 2000);
          else setGaveUp(true);
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
    if (!order) return;
    try {
      setOrder(await api.sendFeedback(order.id, repeat_intent));
      setFeedbackSent(true);
    } catch {
      setError("We could not save your answer, but thank you anyway.");
    }
  }

  const paid = order?.payment_status === "paid";
  // Anything other than paid or pending is a terminal state that must not read like progress.
  const unpaid =
    order && !paid && order.payment_status !== "pending"
      ? describeUnpaidStatus(order.payment_status, BRAND.support_email)
      : undefined;
  const showFeedback =
    order &&
    paid &&
    !feedbackSent &&
    order.repeat_intent === "unknown" &&
    (askFeedback || order.return_status === "returned");

  return (
    <main class="container thanks">
      <Logo name={BRAND.name} />
      {error && <Notice tone="error">{error}</Notice>}
      {!error && !order && (
        <p class="muted" role="status">
          Loading your order…
        </p>
      )}
      {order && (
        <>
          <h1>
            {paid
              ? `Thank you${order.first_name ? `, ${order.first_name}` : ""}!`
              : (unpaid?.heading ?? "Almost there")}
          </h1>
          {paid ? (
            <p role="status">
              Your {order.number_of_knives}{" "}
              {order.number_of_knives === 1 ? "knife is" : "knives are"} booked for pickup on{" "}
              <strong>{formatCareDay(order.care_day)}</strong>. Leave them wrapped in a bag at your
              door in the morning and we will text you when they are on their way back.
            </p>
          ) : order.payment_status === "pending" && gaveUp ? (
            <>
              <Notice>
                We have not received confirmation of your payment yet. If you finished checkout this
                can take a few minutes, so please check again shortly and do not pay twice. If it
                still shows pending, email {BRAND.support_email} and quote the order number below.
              </Notice>
              <p>
                <Button variant="secondary" onClick={checkAgain}>
                  Check again
                </Button>
              </p>
            </>
          ) : order.payment_status === "pending" ? (
            <p class="muted" role="status">
              Confirming your payment…
            </p>
          ) : (
            <Notice tone="error">{unpaid?.message}</Notice>
          )}
          <dl class="summary">
            <dt>Order</dt>
            <dd>{order.id}</dd>
            <dt>Total</dt>
            <dd>{formatMoney(order.total_cents, order.currency)}</dd>
            <dt>Status</dt>
            <dd>{order.payment_status}</dd>
          </dl>
          {showFeedback && (
            <section class="feedback">
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
        </>
      )}
      <p>
        <a href="/">Back to the home page</a>
      </p>
    </main>
  );
}

render(<ThanksPage />, document.getElementById("app")!);
