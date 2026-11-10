import { getDiscountForCountry } from "~/lib/ppp";

// ─── Refund Eligibility ───
// The one place that decides whether a learner may raise a Refund Request,
// and what the Refund would be worth. See GLOSSARY.md for the terms.

export const REFUND_WINDOW_DAYS = 14;
export const REFUND_WATCH_LIMIT_SECONDS = 2 * 60 * 60;
export const REFUND_COMPLETION_LIMIT = 0.5;

/** Everything the policy needs to know about one purchase. */
export type RefundFacts = {
  purchasedAt: string;
  amountPaid: number;
  listPrice: number;
  country: string | null;
  hasOpenRequest: boolean;
  isClaimedTeamSeat: boolean;
  lessonCount: number;
  completedLessonCount: number;
  secondsWatched: number;
};

export type RefundIneligibleReason =
  | "open_request"
  | "claimed_team_seat"
  | "window_closed"
  | "too_much_completed"
  | "too_much_watched";

export type RefundEligibility =
  | { eligible: true; amount: number; lastDayInWindow: string }
  | { eligible: false; reason: RefundIneligibleReason };

// Compare whole calendar days, not hours — a purchase at 23:00 still gets the
// whole of its fourteenth day.
function calendarDay(when: Date): string {
  const year = when.getFullYear();
  const month = String(when.getMonth() + 1).padStart(2, "0");
  const day = String(when.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function refundAmount(facts: RefundFacts): number {
  // A purchasing-power price is given back at the price that was paid, not
  // at the list price of the course.
  return getDiscountForCountry(facts.country) > 0
    ? facts.amountPaid
    : facts.listPrice;
}

export function evaluateRefundEligibility(
  facts: RefundFacts,
  now: Date
): RefundEligibility {
  if (facts.hasOpenRequest) return { eligible: false, reason: "open_request" };

  if (facts.isClaimedTeamSeat) {
    return { eligible: false, reason: "claimed_team_seat" };
  }

  const purchasedAt = new Date(facts.purchasedAt);
  const windowEnd = new Date(purchasedAt);
  windowEnd.setDate(windowEnd.getDate() + REFUND_WINDOW_DAYS);
  const lastDayInWindow = calendarDay(windowEnd);
  const today = calendarDay(now);

  if (today < calendarDay(purchasedAt) || today > lastDayInWindow) {
    return { eligible: false, reason: "window_closed" };
  }

  if (
    facts.lessonCount > 0 &&
    facts.completedLessonCount / facts.lessonCount >= REFUND_COMPLETION_LIMIT
  ) {
    return { eligible: false, reason: "too_much_completed" };
  }

  if (facts.secondsWatched >= REFUND_WATCH_LIMIT_SECONDS) {
    return { eligible: false, reason: "too_much_watched" };
  }

  return { eligible: true, amount: refundAmount(facts), lastDayInWindow };
}
