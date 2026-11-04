import type { BankTransaction } from "./types";

/**
 * Split transactions. A split row's own `category_id` is null; its pieces are
 * what count. Anything that totals or filters by category must read
 * transactions through `piecesOf` or `inCategory`, or a split purchase would
 * look uncategorised.
 *
 * The pieces are stored apart from the bank's row (`bank_transaction_splits`),
 * so a sync updates that one row and never touches or duplicates them. Where
 * transactions are listed, `expandSplits` turns a split row into one row per
 * piece, each with its own amount and category; those rows are what the list,
 * the category filter and Search show, so a split part counts on its own.
 */

export interface Piece {
  category_id: number | null;
  amount: number;
  /** Set on the piece `piecesOf` adds for what the pieces no longer cover after a later sync changed the amount. */
  remainder?: true;
}

// Rounds half a cent away from zero, as Rust's f64::round does (Math.round
// takes -0.125 * 100 to -12, Rust to -13), so these checks agree with set_splits.
const cents = (x: number) => Math.sign(x) * Math.round(Math.abs(x) * 100);

/**
 * What the pieces no longer cover, with the transaction's sign: 0 unless a
 * later sync changed the amount after the owner split it (a pending tip
 * settling, say). Compared in cents, so a float crumb is never a remainder.
 */
export function splitRemainder(t: BankTransaction): number {
  if (t.splits.length === 0) return 0;
  const left = cents(t.amount) - t.splits.reduce((s, p) => s + cents(p.amount), 0);
  return left === 0 ? 0 : left / 100;
}

/**
 * The pieces a transaction counts as: the whole of it when it is not split;
 * otherwise its pieces, plus an uncategorised piece for anything they no
 * longer cover, so the month's totals always add up to what the bank says.
 */
export function piecesOf(t: BankTransaction): Piece[] {
  // One part of an expanded split is a piece already.
  const part = partOf(t);
  if (part) return [{ category_id: t.category_id, amount: t.amount, ...(part.remainder ? { remainder: true as const } : {}) }];
  if (t.splits.length === 0) return [{ category_id: t.category_id, amount: t.amount }];
  const pieces: Piece[] = t.splits.map((s) => ({ category_id: s.category_id, amount: s.amount }));
  const left = splitRemainder(t);
  if (left !== 0) pieces.push({ category_id: null, amount: left, remainder: true });
  return pieces;
}

const pieceIn = (p: Piece, category: number | "uncategorised") =>
  category === "uncategorised" ? p.category_id == null : p.category_id === category;

/** Whether any piece of the transaction is in that category. */
export function inCategory(t: BankTransaction, category: number | "uncategorised"): boolean {
  return piecesOf(t).some((p) => pieceIn(p, category));
}

/**
 * How much of the transaction is in that category, with its sign: the sum of
 * the matching pieces (0 when none match). A search filtered to one category
 * totals this rather than the whole amount of a split purchase.
 */
export function amountInCategory(t: BankTransaction, category: number | "uncategorised"): number {
  return piecesOf(t).reduce((s, p) => (pieceIn(p, category) ? s + p.amount : s), 0);
}

/** Why a split cannot be saved yet. "short": some of it is not assigned;
 *  "over": the pieces come to more than the transaction. */
export type SplitProblem = "too-few" | "no-amount" | "short" | "over";

export interface SplitCheck {
  /** Still to assign, with the transaction's sign; 0 when it adds up. */
  left: number;
  problem: SplitProblem | null;
}

/**
 * The rules `store::set_splits` enforces in Rust, checked as the owner types
 * so Save can stay disabled until they hold: at least two pieces, none zero,
 * adding up to the transaction to the cent. An empty list is "too-few" here:
 * unsplitting is a separate action, though Rust accepts `[]` as unsplit. An
 * amount that is not a number (an empty or unparsable field) counts as missing.
 */
export function validateSplits(total: number, pieces: Piece[]): SplitCheck {
  const totalCents = cents(total);
  const leftCents = totalCents
    - pieces.reduce((s, p) => s + (Number.isFinite(p.amount) ? cents(p.amount) : 0), 0);
  // Never -0: it reads as zero to a person but not to toEqual.
  const left = leftCents === 0 ? 0 : leftCents / 100;
  if (pieces.length < 2) return { left, problem: "too-few" };
  // Over is over, even with a piece still empty: say that first.
  if (leftCents !== 0 && Math.sign(leftCents) !== Math.sign(totalCents)) return { left, problem: "over" };
  if (pieces.some((p) => !Number.isFinite(p.amount) || cents(p.amount) === 0)) return { left, problem: "no-amount" };
  if (leftCents === 0) return { left, problem: null };
  return { left, problem: Math.sign(leftCents) === Math.sign(totalCents) ? "short" : "over" };
}

/** Where a row from `expandSplits` came from, when it is one part of a split. */
export interface SplitPart {
  /** The transaction as stored, whole: what editing, unsplitting, removing
   *  and Undo act on. */
  parent: BankTransaction;
  /** 1-based position among the parts, and how many there are. */
  index: number;
  of: number;
  /** The stored piece's note. */
  note: string | null;
  /** The part for what the pieces no longer cover after the bank changed the
   *  amount. It is not a stored piece: giving it a category adds one. */
  remainder?: true;
}

/** A row as a list shows it: a whole transaction, or one part of a split. */
export interface TxnRow extends BankTransaction {
  /** Unique within a list; a part's `id` is its transaction's. */
  key: string;
  part?: SplitPart;
}

export function partOf(t: BankTransaction): SplitPart | undefined {
  return (t as TxnRow).part;
}

/** The transaction a row stands for: the whole one, for a part of a split. */
export function wholeOf(t: BankTransaction): BankTransaction {
  return partOf(t)?.parent ?? t;
}

/**
 * Every split transaction as one row per piece, in its place: each part has
 * its piece's amount and category, no pieces of its own, and the
 * transaction's date, description, account and id. A transaction that is not
 * split is one row, as it is. The parts add up to the transaction, so totals
 * over the rows equal totals over the transactions: nothing is counted twice
 * or lost. Rows already expanded pass through unchanged.
 */
export function expandSplits(txns: BankTransaction[]): TxnRow[] {
  const rows: TxnRow[] = [];
  for (const t of txns) {
    if ((t as TxnRow).key !== undefined) { rows.push(t as TxnRow); continue; }
    if (t.splits.length === 0) { rows.push({ ...t, key: String(t.id) }); continue; }
    const pieces = piecesOf(t);
    pieces.forEach((p, i) => {
      rows.push({
        ...t,
        key: `${t.id}:${i + 1}`,
        amount: p.amount,
        category_id: p.category_id,
        splits: [],
        part: {
          parent: t, index: i + 1, of: pieces.length,
          note: p.remainder ? null : t.splits[i].note,
          ...(p.remainder ? { remainder: true as const } : {}),
        },
      });
    });
  }
  return rows;
}

/**
 * The pieces to save when one part of a split moves to another category: the
 * stored pieces with that one changed. Giving the remainder part a category
 * adds it as a piece, so the pieces add up to the bank's amount again.
 */
export function piecesWithCategory(part: SplitPart, categoryId: number | null): Piece[] {
  const pieces: Piece[] = part.parent.splits.map((s) => ({ category_id: s.category_id, amount: s.amount }));
  if (part.remainder) return [...pieces, { category_id: categoryId, amount: splitRemainder(part.parent) }];
  return pieces.map((p, i) => (i === part.index - 1 ? { ...p, category_id: categoryId } : p));
}

/** A typed amount in dollars, as a size: the transaction gives it its sign.
 *  Blank or nonsense is NaN, which the check reports as a piece with no amount. */
export function dollarsOf(text: string): number {
  const cleaned = text.replace(/[$,\s]/g, "");
  if (cleaned === "") return NaN;
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.abs(n) : NaN;
}

/**
 * Fill in the remainder as the owner types. After piece `changed` is typed
 * into, one piece they have not typed into themselves takes whatever the
 * others leave of the total, so the pieces add up: a $29 split with 10 typed
 * into one piece puts 19.00 in the other. That piece is the last untouched one
 * holding an amount (the one already carrying the remainder, or the whole
 * amount a new split starts with), else the last untouched one. Amounts are
 * sizes (the editor's text), whichever way the money moved; the transaction
 * gives them their sign. With every other piece typed into, nothing changes
 * and the check says what is left. When the others already come to the whole
 * or more, the remainder is 0.00 and the check says the pieces are over. A
 * `changed` of -1 (a piece was removed) refills from all the rest.
 */
export function fillRemainder(total: number, amounts: string[], edited: boolean[], changed: number): string[] {
  const untouched = amounts.map((_, i) => i).filter((i) => i !== changed && !edited[i]);
  if (untouched.length === 0) return amounts;
  const holding = untouched.filter((i) => amounts[i].trim() !== "");
  const from = holding.length > 0 ? holding : untouched;
  const target = from[from.length - 1];
  const others = amounts.reduce((s, a, i) => {
    if (i === target) return s;
    const n = dollarsOf(a);
    return s + (Number.isFinite(n) ? Math.round(n * 100) : 0);
  }, 0);
  const rest = Math.max(0, Math.round(Math.abs(total) * 100) - others);
  return amounts.map((a, i) => (i === target ? (rest / 100).toFixed(2) : a));
}
