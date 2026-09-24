import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import "@wkc/ui/styles.css";
import "./styles.css";
import { BRAND, formatCareDay, formatMoney } from "@wkc/shared";
import { Button, Logo, Notice } from "@wkc/ui";
import { api, type PublicOrder } from "./lib/api.ts";
import { EVENTS, initAnalytics, track } from "./lib/analytics.ts";
import { loadSession } from "./lib/session.ts";

const session = loadSession();
initAnalytics(session);
track(EVENTS.page_view);

const params = new URLSearchParams(window.location.search);
const orderId = params.get("order");
const askFeedback = params.get("feedback") === "1";

function ThanksPage() {
  const [order, setOrder] = useState<PublicOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [feedbackSent, setFeedbackSent] = useState(false);

  useEffect(() => {
    if (!orderId) {
      setError("We could not find that order.");
      return;
    }
    let cancelled = false;
    api
      .getOrder(orderId)
      .then((result) => {
        if (cancelled) return;
        setOrder(result);
        // Stripe's webhook can land a second or two after the redirect.
        if (result.payment_status === "pending" && attempts < 10) {
          setTimeout(() => setAttempts((n) => n + 1), 2000);
        }
      })
      .catch(
        () =>
          !cancelled && setError("We could not load your order. Check your email for the receipt."),
      );
    return () => {
      cancelled = true;
    };
  }, [attempts]);

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
      {!error && !order && <p class="muted">Loading your order…</p>}
      {order && (
        <>
          <h1>
            {paid ? `Thank you${order.first_name ? `, ${order.first_name}` : ""}!` : "Almost there"}
          </h1>
          {paid ? (
            <p>
              Your {order.number_of_knives}{" "}
              {order.number_of_knives === 1 ? "knife is" : "knives are"} booked for pickup on{" "}
              <strong>{formatCareDay(order.care_day)}</strong>. Leave them wrapped in a bag at your
              door in the morning and we will text you when they are on their way back.
            </p>
          ) : order.payment_status === "pending" ? (
            <p class="muted">Confirming your payment…</p>
          ) : (
            <Notice tone="error">
              This booking was not paid ({order.payment_status}). Start again from the home page.
            </Notice>
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
