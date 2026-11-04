import { describe, it, expect } from "vitest";
import { piecesOf, splitRemainder, validateSplits, inCategory, amountInCategory, expandSplits, piecesWithCategory, fillRemainder, wholeOf } from "./splits";
import type { BankTransaction, TxnSplit } from "./types";

const txn = (over: Partial<BankTransaction> = {}): BankTransaction => ({
  id: 1, account_id: 1, external_id: "e1", posted: "2026-10-03", amount: -85.5,
  description: "COSTCO", payee: "Costco", memo: null, mcc: null, pending: false,
  category_id: 1, category_source: "auto", reviewed: true, note: null, removed: false, splits: [],
  ...over,
});
const piece = (id: number, category_id: number | null, amount: number): TxnSplit =>
  ({ id, category_id, amount, note: null });
const costco = txn({ category_id: null, category_source: "manual", splits: [piece(1, 1, -60), piece(2, 2, -25.5)] });

describe("piecesOf", () => {
  it("is the whole transaction when it is not split", () => {
    expect(piecesOf(txn())).toEqual([{ category_id: 1, amount: -85.5 }]);
  });

  it("is the pieces of a split transaction", () => {
    expect(piecesOf(costco)).toEqual([{ category_id: 1, amount: -60 }, { category_id: 2, amount: -25.5 }]);
  });

  it("adds what the pieces no longer cover, uncategorised, after the bank changed the amount", () => {
    expect(piecesOf({ ...costco, amount: -90 })).toEqual([
      { category_id: 1, amount: -60 }, { category_id: 2, amount: -25.5 },
      { category_id: null, amount: -4.5, remainder: true },
    ]);
  });

  it("ignores a difference smaller than half a cent", () => {
    expect(piecesOf({ ...costco, amount: -85.501 })).toHaveLength(2);
  });
});

describe("splitRemainder", () => {
  it("is nothing for a row that is not split, or whose pieces add up", () => {
    expect(splitRemainder(txn())).toBe(0);
    expect(splitRemainder(costco)).toBe(0);
  });

  it("is what the pieces no longer cover", () => {
    expect(splitRemainder({ ...costco, amount: -90 })).toBe(-4.5);
  });
});

describe("validateSplits", () => {
  const p = (category_id: number | null, amount: number) => ({ category_id, amount });

  it("accepts pieces that add up", () => {
    expect(validateSplits(-85.5, [p(1, -60), p(2, -25.5)])).toEqual({ left: 0, problem: null });
  });

  it("says how much is left to assign", () => {
    expect(validateSplits(-85.5, [p(1, -60), p(2, -20)])).toEqual({ left: -5.5, problem: "short" });
  });

  it("says when the pieces come to more than the transaction", () => {
    expect(validateSplits(-85.5, [p(1, -60), p(2, -30)])).toEqual({ left: 4.5, problem: "over" });
  });

  it("works the same way for money in", () => {
    expect(validateSplits(100, [p(1, 70), p(2, 20)])).toEqual({ left: 10, problem: "short" });
  });

  it("needs an amount in every piece", () => {
    expect(validateSplits(-85.5, [p(1, -85.5), p(2, 0)]).problem).toBe("no-amount");
  });

  it("needs at least two pieces", () => {
    expect(validateSplits(-85.5, [p(1, -85.5)]).problem).toBe("too-few");
    expect(validateSplits(-85.5, []).problem).toBe("too-few");
  });

  it("says when a refund is split into more than it was", () => {
    expect(validateSplits(100, [p(1, 70), p(2, 40)])).toEqual({ left: -10, problem: "over" });
  });

  it("rounds half a cent away from zero, as Rust does", () => {
    // Rust: -13 + 13 = 0, not the 1 cent the transaction is. Math.round would say -12 + 13 = 1.
    expect(validateSplits(0.01, [p(1, -0.125), p(2, 0.125)]).problem).toBe("short");
    // -0.005 is one cent, not nothing.
    expect(validateSplits(-0.01, [p(1, -0.005), p(2, -0.005)]).problem).toBe("over");
  });

  it("treats an amount that is not a number as missing", () => {
    expect(validateSplits(-85.5, [p(1, -85.5), p(2, NaN)]).problem).toBe("no-amount");
    expect(validateSplits(-85.5, [p(1, -85.5), p(2, Infinity)]).problem).toBe("no-amount");
  });
});

describe("amountInCategory", () => {
  it("is the whole amount when it is not split and in that category", () => {
    expect(amountInCategory(txn(), 1)).toBe(-85.5);
    expect(amountInCategory(txn(), 2)).toBe(0);
    expect(amountInCategory(txn({ category_id: null }), "uncategorised")).toBe(-85.5);
  });

  it("adds up only the pieces in that category", () => {
    expect(amountInCategory(costco, 1)).toBe(-60);
    expect(amountInCategory(costco, 2)).toBe(-25.5);
    expect(amountInCategory(costco, 3)).toBe(0);
    expect(amountInCategory(costco, "uncategorised")).toBe(0);
  });

  it("sums several pieces in the same category and finds uncategorised ones, remainder included", () => {
    const t = txn({ category_id: null, amount: -90, splits: [piece(1, 1, -20), piece(2, 1, -30), piece(3, null, -10)] });
    expect(amountInCategory(t, 1)).toBe(-50);
    expect(amountInCategory(t, "uncategorised")).toBe(-40); // the -10 piece and the -30 remainder
  });
});

describe("inCategory", () => {
  it("reads the row's own category when it is not split", () => {
    expect(inCategory(txn(), 1)).toBe(true);
    expect(inCategory(txn(), 2)).toBe(false);
    expect(inCategory(txn({ category_id: null }), "uncategorised")).toBe(true);
  });

  it("finds a split transaction under any of its pieces", () => {
    expect(inCategory(costco, 2)).toBe(true);
    expect(inCategory(costco, 3)).toBe(false);
    expect(inCategory(costco, "uncategorised")).toBe(false);
  });

  it("finds a split transaction with an uncategorised piece under uncategorised", () => {
    const t = txn({ category_id: null, splits: [piece(1, 1, -60), piece(2, null, -25.5)] });
    expect(inCategory(t, "uncategorised")).toBe(true);
    expect(inCategory(t, 1)).toBe(true);
  });

  it("counts an uncovered remainder as uncategorised", () => {
    expect(inCategory({ ...costco, amount: -90 }, "uncategorised")).toBe(true);
  });
});

describe("validateSplits, over the total", () => {
  const p = (category_id: number | null, amount: number) => ({ category_id, amount });
  it("says the pieces are over before asking for a missing amount", () => {
    expect(validateSplits(29, [p(1, 40), p(2, 0)])).toEqual({ left: -11, problem: "over" });
    expect(validateSplits(-29, [p(1, -40), p(2, NaN)])).toEqual({ left: 11, problem: "over" });
  });
});

describe("expandSplits", () => {
  // The owner's case: +$29 in, split into "To be paid back" $19 and Gifts $10.
  const payback = 7, gifts = 8;
  const applePay = txn({
    id: 5, amount: 29, payee: "Transfer from Apple Pay", category_id: null, category_source: "manual",
    splits: [piece(11, payback, 19), piece(12, gifts, 10)],
  });

  it("leaves a transaction that is not split as one row", () => {
    const rows = expandSplits([txn()]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 1, key: "1", amount: -85.5, category_id: 1 });
    expect(rows[0].part).toBeUndefined();
  });

  it("makes each piece its own row, with its own amount and category", () => {
    const rows = expandSplits([applePay]);
    expect(rows.map((r) => [r.key, r.amount, r.category_id, r.part?.index, r.part?.of])).toEqual([
      ["5:1", 19, payback, 1, 2],
      ["5:2", 10, gifts, 2, 2],
    ]);
    for (const r of rows) {
      expect(r).toMatchObject({ id: 5, posted: applePay.posted, payee: "Transfer from Apple Pay", account_id: 1, splits: [] });
      expect(wholeOf(r)).toBe(applePay);
    }
  });

  it("filters to a category by part: only the $19 part is To be paid back, at $19", () => {
    const rows = expandSplits([applePay, txn({ id: 6, amount: -4, category_id: gifts })]);
    const paidBack = rows.filter((r) => inCategory(r, payback));
    expect(paidBack.map((r) => r.amount)).toEqual([19]);
    expect(rows.filter((r) => inCategory(r, gifts)).map((r) => r.amount)).toEqual([10, -4]);
  });

  it("adds up to the transaction: nothing counted twice, nothing lost", () => {
    const rows = expandSplits([applePay, costco, { ...costco, id: 9, amount: -90 }]);
    const sum = (xs: { amount: number }[]) => Math.round(xs.reduce((s, x) => s + x.amount, 0) * 100);
    expect(sum(rows)).toBe(sum([applePay, costco, { amount: -90 }]));
    expect(rows.flatMap(piecesOf)).toHaveLength(rows.length);
  });

  it("adds a part for what the pieces no longer cover after the bank changed the amount", () => {
    const rows = expandSplits([{ ...costco, amount: -90 }]);
    expect(rows).toHaveLength(3);
    expect(rows[2]).toMatchObject({ amount: -4.5, category_id: null, part: { index: 3, of: 3, remainder: true } });
    expect(piecesOf(rows[2])).toEqual([{ category_id: null, amount: -4.5, remainder: true }]);
  });

  it("passes rows already expanded through unchanged", () => {
    const once = expandSplits([applePay, txn()]);
    expect(expandSplits(once)).toEqual(once);
  });
});

describe("piecesWithCategory", () => {
  it("moves one part to another category and keeps the rest", () => {
    const [, second] = expandSplits([costco]);
    expect(piecesWithCategory(second.part!, 3)).toEqual([{ category_id: 1, amount: -60 }, { category_id: 3, amount: -25.5 }]);
  });

  it("turns the remainder part into a piece, so the pieces add up again", () => {
    const rows = expandSplits([{ ...costco, amount: -90 }]);
    const pieces = piecesWithCategory(rows[2].part!, 2);
    expect(pieces).toEqual([{ category_id: 1, amount: -60 }, { category_id: 2, amount: -25.5 }, { category_id: 2, amount: -4.5 }]);
    expect(validateSplits(-90, pieces).problem).toBeNull();
  });
});

describe("fillRemainder", () => {
  const none = [false, false];

  it("puts what is left of the total in the other piece: $29 with 10 typed leaves 19", () => {
    expect(fillRemainder(29, ["29.00", "10"], [false, true], 1)).toEqual(["19.00", "10"]);
    expect(fillRemainder(29, ["10", ""], [true, false], 0)).toEqual(["10", "19.00"]);
  });

  it("works in sizes whichever way the money moved", () => {
    expect(fillRemainder(-85.5, ["60", ""], [true, false], 0)).toEqual(["60", "25.50"]);
    expect(fillRemainder(85.5, ["60", ""], [true, false], 0)).toEqual(["60", "25.50"]);
  });

  it("never fills the piece being typed into", () => {
    expect(fillRemainder(29, ["5", "1"], none, 1)).toEqual(["28.00", "1"]);
  });

  it("changes nothing once every other piece has been typed into", () => {
    expect(fillRemainder(29, ["5", "1"], [true, true], 1)).toEqual(["5", "1"]);
  });

  it("with more pieces, fills the last untouched one holding an amount, else the last untouched", () => {
    // A new split: the first piece holds the whole; a third piece was added.
    expect(fillRemainder(85.5, ["85.50", "", "20"], [false, false, true], 2)).toEqual(["65.50", "", "20"]);
    expect(fillRemainder(85.5, ["50", "", ""], [true, false, false], 0)).toEqual(["50", "", "35.50"]);
    expect(fillRemainder(85.5, ["50", "", "30"], [true, false, true], 2)).toEqual(["50", "5.50", "30"]);
  });

  it("stops at zero when the others are already more than the total", () => {
    const filled = fillRemainder(29, ["29.00", "40"], [false, true], 1);
    expect(filled).toEqual(["0.00", "40"]);
    expect(validateSplits(29, filled.map((a) => ({ category_id: null, amount: Number(a) }))).problem).toBe("over");
  });

  it("counts an unreadable amount as nothing", () => {
    expect(fillRemainder(29, ["", "abc"], [false, true], 1)).toEqual(["29.00", "abc"]);
  });

  it("refills from all the rest when a piece was removed", () => {
    expect(fillRemainder(85.5, ["55.50", "20"], [false, true], -1)).toEqual(["65.50", "20"]);
  });

  it("adds up to the cent", () => {
    expect(fillRemainder(0.3, ["0.1", ""], [true, false], 0)).toEqual(["0.1", "0.20"]);
  });
});
