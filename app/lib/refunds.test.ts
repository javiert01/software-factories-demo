import { describe, it, expect } from "vitest";
import {
  REFUND_COMPLETION_LIMIT,
  REFUND_WATCH_LIMIT_SECONDS,
  REFUND_WINDOW_DAYS,
  evaluateRefundEligibility,
  type RefundFacts,
} from "./refunds";

// Local-time constructors, because the Refund Window counts calendar days in
// the server's own time zone.
const purchasedAt = new Date(2026, 0, 1, 23, 0).toISOString();
const dayAfterPurchase = new Date(2026, 0, 2, 9, 0);

function facts(overrides: Partial<RefundFacts> = {}): RefundFacts {
  return {
    purchasedAt,
    amountPaid: 4900,
    listPrice: 9900,
    country: "US",
    hasOpenRequest: false,
    isClaimedTeamSeat: false,
    lessonCount: 10,
    completedLessonCount: 0,
    secondsWatched: 0,
    ...overrides,
  };
}

describe("the refund policy", () => {
  it("is a fourteen-day window, two hours of watching and half the course", () => {
    // These figures are the policy stated in GLOSSARY.md. Pin them so a
    // change to one is a deliberate change to the policy.
    expect(REFUND_WINDOW_DAYS).toBe(14);
    expect(REFUND_WATCH_LIMIT_SECONDS).toBe(2 * 60 * 60);
    expect(REFUND_COMPLETION_LIMIT).toBe(0.5);
  });
});

describe("evaluateRefundEligibility", () => {
  it("is eligible for a fresh purchase, and names the last day of the window", () => {
    expect(evaluateRefundEligibility(facts(), dayAfterPurchase)).toEqual({
      eligible: true,
      amount: expect.any(Number),
      lastDayInWindow: "2026-01-15",
    });
  });

  describe("the Refund Window", () => {
    it("still includes the whole fourteenth day, even for a late-night purchase", () => {
      const lastDay = new Date(2026, 0, 15, 23, 59);
      expect(evaluateRefundEligibility(facts(), lastDay).eligible).toBe(true);
    });

    it("has closed on the fifteenth day", () => {
      const dayAfterWindow = new Date(2026, 0, 16, 0, 1);
      expect(evaluateRefundEligibility(facts(), dayAfterWindow)).toEqual({
        eligible: false,
        reason: "window_closed",
      });
    });

    it("has not opened before the purchase day", () => {
      const before = new Date(2025, 11, 31, 12, 0);
      expect(evaluateRefundEligibility(facts(), before)).toEqual({
        eligible: false,
        reason: "window_closed",
      });
    });
  });

  describe("course completion", () => {
    it("is eligible just under half the lessons", () => {
      const result = evaluateRefundEligibility(
        facts({ completedLessonCount: 4 }),
        dayAfterPurchase
      );
      expect(result.eligible).toBe(true);
    });

    it("is not eligible once half the lessons are complete", () => {
      // The /refund endpoint used to skip this rule: only the course page
      // checked it, so a direct POST got past it.
      expect(
        evaluateRefundEligibility(
          facts({ completedLessonCount: 5 }),
          dayAfterPurchase
        )
      ).toEqual({ eligible: false, reason: "too_much_completed" });
    });

    it("ignores completion for a course with no lessons", () => {
      const result = evaluateRefundEligibility(
        facts({ lessonCount: 0, completedLessonCount: 0 }),
        dayAfterPurchase
      );
      expect(result.eligible).toBe(true);
    });
  });

  describe("time watched", () => {
    it("is eligible just under two hours", () => {
      const result = evaluateRefundEligibility(
        facts({ secondsWatched: REFUND_WATCH_LIMIT_SECONDS - 1 }),
        dayAfterPurchase
      );
      expect(result.eligible).toBe(true);
    });

    it("is not eligible at two hours", () => {
      expect(
        evaluateRefundEligibility(
          facts({ secondsWatched: REFUND_WATCH_LIMIT_SECONDS }),
          dayAfterPurchase
        )
      ).toEqual({ eligible: false, reason: "too_much_watched" });
    });
  });

  it("is not eligible while a Refund Request is already open", () => {
    expect(
      evaluateRefundEligibility(facts({ hasOpenRequest: true }), dayAfterPurchase)
    ).toEqual({ eligible: false, reason: "open_request" });
  });

  it("is not eligible for a claimed team seat", () => {
    expect(
      evaluateRefundEligibility(
        facts({ isClaimedTeamSeat: true }),
        dayAfterPurchase
      )
    ).toEqual({ eligible: false, reason: "claimed_team_seat" });
  });
});
