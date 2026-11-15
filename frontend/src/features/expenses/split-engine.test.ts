import { describe, expect, it } from "vitest";
import { computeEqualPreview, computePercentagePreview } from "./split-engine";

describe("Client-side Split Engine Preview", () => {
  it("computes equal splits with deterministic remainder distribution", () => {
    // $10.00 (1000 minor units) split across 3 users (A, B, C)
    // 1000 / 3 = 333 remainder 1. First sorted user gets 334, others 333.
    const splits = computeEqualPreview(1000n, ["user-c", "user-a", "user-b"]);

    expect(splits.get("user-a")).toBe(334n);
    expect(splits.get("user-b")).toBe(333n);
    expect(splits.get("user-c")).toBe(333n);

    // Sum matches exactly
    const sum = Array.from(splits.values()).reduce((a, b) => a + b, 0n);
    expect(sum).toBe(1000n);
  });

  it("handles equal split with 2 remainder units across 4 users", () => {
    // 1002 minor units across 4 users -> base 250, remainder 2.
    // First 2 sorted users get 251, next 2 get 250.
    const splits = computeEqualPreview(1002n, [
      "user-4",
      "user-1",
      "user-3",
      "user-2",
    ]);

    expect(splits.get("user-1")).toBe(251n);
    expect(splits.get("user-2")).toBe(251n);
    expect(splits.get("user-3")).toBe(250n);
    expect(splits.get("user-4")).toBe(250n);
  });

  it("computes percentage splits using deterministic largest-remainder rounding", () => {
    // $10.01 (1001 minor units) split 33.333333% and 66.666667%
    // Exactly matches backend test:
    // user-1: 334 minor units
    // user-2: 667 minor units
    const participants = [
      { userId: "user-1", percentUnits: 33_333_333n },
      { userId: "user-2", percentUnits: 66_666_667n },
    ];

    const splits = computePercentagePreview(1001n, participants);
    expect(splits.get("user-1")).toBe(334n);
    expect(splits.get("user-2")).toBe(667n);
    expect(splits.get("user-1")! + splits.get("user-2")!).toBe(1001n);
  });
});

