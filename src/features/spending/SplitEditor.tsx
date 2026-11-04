import { useState } from "react";
import { useSetSplits } from "../../data/queries";
import { useOfferSplitUndo } from "../../data/undo";
import { validateSplits, dollarsOf, fillRemainder, type Piece, type SplitProblem } from "../../domain/splits";
import { money } from "../../ui/format";
import { Button } from "../../ui/components";
import type { BankTransaction, Category } from "../../domain/types";

/** `edited`: the owner typed this amount, so the remainder never lands here. */
interface Draft { category_id: number | null; amount: string; edited: boolean }

/** A split row opens on its pieces; any other on its category holding all of
 *  it, beside an empty piece to type into. */
function firstDrafts(t: BankTransaction): Draft[] {
  if (t.splits.length > 0) {
    return t.splits.map((s) => ({ category_id: s.category_id, amount: Math.abs(s.amount).toFixed(2), edited: false }));
  }
  return [
    { category_id: t.category_id, amount: Math.abs(t.amount).toFixed(2), edited: false },
    { category_id: null, amount: "", edited: false },
  ];
}

/** Put the remainder in the last piece not typed into, after piece `changed`
 *  changed (-1: one was removed). */
function refill(total: number, drafts: Draft[], changed: number): Draft[] {
  const amounts = fillRemainder(total, drafts.map((d) => d.amount), drafts.map((d) => d.edited), changed);
  return drafts.map((d, i) => (amounts[i] === d.amount ? d : { ...d, amount: amounts[i] }));
}

function statusLine(problem: SplitProblem | null, left: number, total: number): string {
  switch (problem) {
    case "too-few": return "Split it into at least two pieces.";
    case "no-amount": return "Every piece needs an amount.";
    case "short": return `${money(Math.abs(left))} left to assign.`;
    case "over": return `${money(Math.abs(left))} more than the transaction.`;
    default: return `Adds up to ${money(Math.abs(total))}.`;
  }
}

/**
 * Divide one transaction across categories. Amounts are typed as plain
 * positive numbers and take the transaction's sign, so a refund splits the
 * same way a purchase does. Typing an amount fills the remainder into the last
 * piece not typed into yet, so the pieces add up as you go. Save stays
 * disabled until they do; Rust checks the same rules again.
 */
export function SplitEditor({ txn, categories, onDone }: {
  txn: BankTransaction;
  categories: Category[];
  /** Close the editor: after saving, unsplitting or cancelling. */
  onDone: () => void;
}) {
  const setSplits = useSetSplits();
  const offerUndo = useOfferSplitUndo();
  const [drafts, setDrafts] = useState<Draft[]>(() => firstDrafts(txn));
  const sign = txn.amount < 0 ? -1 : 1;
  const pieces: Piece[] = drafts.map((d) => ({ category_id: d.category_id, amount: sign * dollarsOf(d.amount) }));
  const { left, problem } = validateSplits(txn.amount, pieces);
  // An edit makes an earlier failed save stale. Never reset a save still in
  // flight: that detaches it, and its Undo toast would never appear.
  const edit = (change: (prev: Draft[]) => Draft[]) => { if (setSplits.isError) setSplits.reset(); setDrafts(change); };
  const update = (i: number, change: Partial<Draft>) =>
    edit((prev) => prev.map((d, j) => (j === i ? { ...d, ...change } : d)));
  const typeAmount = (i: number, amount: string) =>
    edit((prev) => refill(txn.amount, prev.map((d, j) => (j === i ? { ...d, amount, edited: true } : d)), i));

  function save(next: Piece[], title: string) {
    // txn is the row as it was before: exactly what Undo puts back.
    // Piece notes are not editable in the app yet, so saving sends none and
    // clears any that were there; Undo restores them from txn.
    setSplits.mutate(
      { id: txn.id, splits: next.map((p) => ({ category_id: p.category_id, amount: p.amount, note: null })) },
      { onSuccess: () => { offerUndo(title, txn); onDone(); } },
    );
  }

  return (
    <div style={{ display: "grid", gap: 8, padding: "6px 0 10px" }}>
      <div className="muted" style={{ fontSize: 12 }}>
        Split {money(Math.abs(txn.amount))} from {txn.payee ?? txn.description} into separate transactions.
        Each piece then shows, filters and counts on its own.
      </div>
      {drafts.map((d, i) => (
        <div key={i} className="row center" style={{ gap: 8 }}>
          <select
            value={d.category_id ?? ""}
            onChange={(e) => update(i, { category_id: e.target.value === "" ? null : Number(e.target.value) })}
            aria-label={`Category for piece ${i + 1}`}
            style={{ padding: "4px 6px", fontSize: 12, maxWidth: 168 }}
          >
            <option value="">Uncategorised</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input
            value={d.amount}
            onChange={(e) => typeAmount(i, e.target.value)}
            inputMode="decimal" placeholder="0.00"
            aria-label={`Amount for piece ${i + 1}`}
            style={{ width: 96 }}
          />
          {drafts.length > 2 && (
            <Button variant="ghost" size="sm" aria-label={`Remove piece ${i + 1}`}
              onClick={() => edit((prev) => refill(txn.amount, prev.filter((_, j) => j !== i), -1))}>×</Button>
          )}
        </div>
      ))}
      <div className="row center" style={{ gap: 10, flexWrap: "wrap" }}>
        <Button variant="ghost" size="sm"
          onClick={() => edit((prev) => [...prev, { category_id: null, amount: "", edited: false }])}>Add piece</Button>
        <span className={problem == null ? "muted" : "neg"} style={{ fontSize: 12 }} aria-live="polite">
          {statusLine(problem, left, txn.amount)}
        </span>
      </div>
      {setSplits.error && <div className="neg" style={{ fontSize: 12 }}>{setSplits.error instanceof Error ? setSplits.error.message : String(setSplits.error)}</div>}
      <div className="row center" style={{ gap: 8 }}>
        <Button size="sm" disabled={problem != null} loading={setSplits.isPending}
          onClick={() => save(pieces, "Split saved")}>Save split</Button>
        {txn.splits.length > 0 && (
          <Button size="sm" variant="secondary" disabled={setSplits.isPending}
            title="Merge the pieces back into one transaction"
            onClick={() => save([], "Split removed")}>Unsplit</Button>
        )}
        <Button size="sm" variant="ghost" disabled={setSplits.isPending} onClick={onDone}>Cancel</Button>
      </div>
    </div>
  );
}
