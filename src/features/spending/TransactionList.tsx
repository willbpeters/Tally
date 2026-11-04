import { Fragment, useEffect, useState } from "react";
import { useSetTransactionCategory, useSetNote, useSetDate, useDeleteBankTransaction, useSetSplits } from "../../data/queries";
import { useOfferUndo, useOfferSplitUndo } from "../../data/undo";
import { useToast } from "../../ui/toast";
import { askToConfirm } from "../../ui/confirm";
import { expandSplits, piecesWithCategory, wholeOf, type TxnRow } from "../../domain/splits";
import { monthLabel } from "../../domain/spending";
import { money, fmtDate } from "../../ui/format";
import { Badge } from "../../ui/components";
import { CategorySelect } from "../../ui/CategoryPill";
import { SplitEditor } from "./SplitEditor";
import { BulkBar } from "./BulkBar";
import type { Account, BankTransaction, Category } from "../../domain/types";

/** Added by the owner in Tally (cash, say), not by a bank or Copilot. */
const isOwn = (t: BankTransaction) => t.external_id.startsWith("manual:");
const signed = (amount: number) => `${amount > 0 ? "+" : ""}${money(amount)}`;

/**
 * The month's transactions with an inline category picker. Changing a category
 * marks that row as chosen by hand, and can teach Tally to do the same for
 * everything else from that payee. Split opens an editor beneath a row that
 * divides it into separate transactions: a split transaction lists as one row
 * per piece, each with its own amount and category picker, marked "Split 1 of
 * 2" with a link back to the split. Date, note, removing and approving act on
 * the whole transaction, since its parts share them. Clicking a row's date
 * moves it to another day.
 *
 * With `selectable`, each row has a box (shown on hover until one is ticked,
 * then on every row); ticked rows get a bar along the bottom to change them
 * all at once. Shift-click ticks a run of rows; Esc clears. With
 * `monthHeaders`, a header row starts each month (rows come newest first).
 */
export function TransactionList({ transactions, categories, accounts, onApprove, onRemove, onRestore,
  selectable = false, monthHeaders = false }: {
  /** Whole transactions, or rows from `expandSplits`: a split one shows one row per piece either way. */
  transactions: BankTransaction[];
  categories: Category[];
  accounts: Account[];
  selectable?: boolean;
  monthHeaders?: boolean;
  /** Offered on the To review list: accept a row as it is. */
  onApprove?: (id: number) => void;
  /** Take a row out of Spending — the owner was paid back. Restorable. */
  onRemove?: (id: number) => void;
  /** Put a removed row back. */
  onRestore?: (id: number) => void;
}) {
  const rows = expandSplits(transactions);
  const setCategory = useSetTransactionCategory();
  const setSplits = useSetSplits();
  const offerUndo = useOfferUndo();
  const offerSplitUndo = useOfferSplitUndo();
  const toast = useToast();
  // Each editor belongs to one row, by its key: the parts of a split share an id.
  const [teaching, setTeaching] = useState<string | null>(null);
  const [splitting, setSplitting] = useState<string | null>(null);
  // The row whose note is being written, and the text so far.
  const [noting, setNoting] = useState<{ key: string; id: number; text: string } | null>(null);
  const setNote = useSetNote();
  // The row whose date is being changed, and the date picked so far.
  const [dating, setDating] = useState<{ key: string; id: number; posted: string } | null>(null);
  const setDate = useSetDate();
  const deleteTxn = useDeleteBankTransaction();
  const byId = new Map(categories.map((c) => [c.id, c]));
  const accountName = (id: number) => accounts.find((a) => a.id === id)?.name ?? "—";
  const keys = rows.map((r) => r.key).join("|");
  // An editor must not outlive its row: the list changes under it on a month
  // change or a sync, and the row could come back with the editor still open.
  useEffect(() => {
    const present = new Set(keys.split("|"));
    if (splitting != null && !present.has(splitting)) setSplitting(null);
    if (noting != null && !present.has(noting.key)) setNoting(null);
    if (dating != null && !present.has(dating.key)) setDating(null);
  }, [keys, splitting, noting, dating]);
  const openSplit = (key: string) => { setTeaching(null); setSplitting(key); };

  // Ticked rows, by key, and the last one clicked: the start of a shift-click run.
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [anchor, setAnchor] = useState<string | null>(null);
  // Only rows still in the list count: one can leave it on a month change, a
  // sync, or by being reviewed or removed.
  const chosen = rows.filter((t) => picked.has(t.key));
  const selecting = chosen.length > 0;
  const clearPicked = () => { setPicked(new Set()); setAnchor(null); };
  // None left in the list (another month, say): start afresh rather than
  // ticking them again on the way back.
  useEffect(() => { if (picked.size > 0 && !selecting) clearPicked(); }, [picked, selecting]);
  useEffect(() => {
    if (!selecting) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") clearPicked(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selecting]);

  function pick(key: string, on: boolean, run: boolean) {
    const next = new Set(picked);
    const from = rows.findIndex((t) => t.key === anchor);
    const to = rows.findIndex((t) => t.key === key);
    const ks = run && from >= 0 && to >= 0
      ? rows.slice(Math.min(from, to), Math.max(from, to) + 1).map((t) => t.key)
      : [key];
    for (const k of ks) { if (on) next.add(k); else next.delete(k); }
    setPicked(next);
    setAnchor(key);
  }
  const allPicked = selecting && chosen.length === rows.length;

  async function deleteOwn(t: BankTransaction, name: string) {
    const pieces = t.splits.length > 0 ? " Every piece of its split goes with it." : "";
    if (!(await askToConfirm(`Delete "${name}", ${money(t.amount)} on ${fmtDate(t.posted)}?${pieces} You added it, so this can't be undone.`,
      { okLabel: "Delete" }))) return;
    deleteTxn.mutate(t.id, { onError: (e) => toast.push({ tone: "neg", title: "Not deleted", body: String(e) }) });
  }

  function saveNote() {
    if (!noting) return;
    setNote.mutate({ id: noting.id, note: noting.text }, {
      onSuccess: () => setNoting(null),
      onError: (e) => toast.push({ tone: "neg", title: "Note not saved", body: String(e) }),
    });
  }

  function saveDate(t: BankTransaction) {
    if (!dating) return;
    // Cleared, or picked the day it already has: nothing to save.
    if (!dating.posted || dating.posted === t.posted) { setDating(null); return; }
    setDate.mutate({ id: dating.id, posted: dating.posted }, {
      onSuccess: () => setDating(null),
      onError: (e) => toast.push({ tone: "neg", title: "Date not changed", body: String(e) }),
    });
  }
  const columns = 5 + (selectable ? 1 : 0) + (onApprove ? 1 : 0) + (onRemove || onRestore ? 1 : 0);

  function choose(t: TxnRow, categoryId: number | null) {
    if (t.part) {
      // One part of a split: the split is saved again with this piece moved.
      const before = t.part.parent;
      const pieces = piecesWithCategory(t.part, categoryId);
      setSplits.mutate(
        { id: before.id, splits: pieces.map((p, i) => ({ ...p, note: before.splits[i]?.note ?? null })) },
        {
          onSuccess: () => offerSplitUndo("Category changed", before),
          onError: (e) => toast.push({ tone: "neg", title: "Category not changed", body: String(e) }),
        },
      );
      return;
    }
    const payee = t.payee?.trim();
    // Offering to learn only makes sense when there is a payee to key off.
    if (categoryId != null && payee) {
      setTeaching(t.key);
    }
    // t is the row as it was before the change: exactly what Undo puts back.
    setCategory.mutate(
      { id: t.id, categoryId, applyToPayee: false },
      { onSuccess: () => offerUndo("Category changed", [t]) },
    );
  }

  const toReviewDot = (
    <span title="To review" aria-label="To review" style={{
      width: 6, height: 6, borderRadius: 3, background: "var(--accent)", flexShrink: 0,
    }} />
  );

  return (
    <div className="table-wrap">
      <table className={selecting ? "selecting" : undefined}>
        <thead>
          <tr>
            {selectable && (
              <th className="select-cell">
                {selecting && (
                  <input type="checkbox" aria-label="Select all" checked={allPicked}
                    onChange={() => (allPicked ? clearPicked() : setPicked(new Set(rows.map((t) => t.key))))} />
                )}
              </th>
            )}
            <th className="left">Date</th>
            <th className="left">Description</th>
            <th className="left">Account</th>
            <th className="left">Category</th>
            <th>Amount</th>
            {onApprove && <th />}
            {(onRemove || onRestore) && <th />}
          </tr>
        </thead>
        <tbody>
          {rows.map((t, i) => {
            const month = t.posted.slice(0, 7);
            const startsMonth = monthHeaders && (i === 0 || rows[i - 1].posted.slice(0, 7) !== month);
            const category = t.category_id == null ? null : byId.get(t.category_id) ?? null;
            const incoming = t.amount > 0;
            const name = t.payee ?? t.description;
            const part = t.part;
            const whole = wholeOf(t);
            const label = part ? `${name}, part ${part.index} of ${part.of}` : name;
            // What the pieces overshoot the bank's amount by is not money any
            // category should hold: the split needs fixing instead.
            const overshoot = part?.remainder === true && Math.sign(t.amount) !== Math.sign(whole.amount);
            const rowClass = [picked.has(t.key) ? "picked" : "", part ? "split-part" : ""].filter(Boolean).join(" ");
            return (
              <Fragment key={t.key}>
                {startsMonth && (
                  <tr className="month-row">
                    <th className="left" colSpan={columns} scope="colgroup">{monthLabel(month)}</th>
                  </tr>
                )}
                <tr className={rowClass || undefined}>
                  {selectable && (
                    <td className="select-cell">
                      <input type="checkbox" aria-label={`Select ${label}`} checked={picked.has(t.key)}
                        onChange={(e) => pick(t.key, e.target.checked, (e.nativeEvent as MouseEvent).shiftKey)} />
                    </td>
                  )}
                  <td className="left">
                    {dating?.key === t.key ? (
                      <div className="row center" style={{ gap: 6 }}>
                        <input type="date" autoFocus value={dating.posted} aria-label={`Date for ${name}`}
                          onChange={(e) => setDating({ ...dating, posted: e.target.value })}
                          onKeyDown={(e) => { if (e.key === "Enter") saveDate(t); if (e.key === "Escape") setDating(null); }} />
                        <button className="btn btn-secondary btn-sm" onClick={() => saveDate(t)}>Save</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setDating(null)}>Cancel</button>
                      </div>
                    ) : (
                      <button className="note-text" aria-label={`Change date for ${label}: ${fmtDate(t.posted)}`}
                        title={part ? "Change date (every part of the split moves with it)" : "Change date"}
                        style={{ fontStyle: "normal", cursor: "pointer", whiteSpace: "nowrap" }}
                        onClick={() => setDating({ key: t.key, id: t.id, posted: t.posted })}>{fmtDate(t.posted)}</button>
                    )}
                  </td>
                  <td className="left">
                    <div className="cell-primary">{name}</div>
                    {t.payee && t.description !== t.payee && (
                      <div className="cell-secondary">{t.description}</div>
                    )}
                    {noting?.key === t.key ? (
                      <div className="row center" style={{ gap: 6, marginTop: 4 }}>
                        <input autoFocus value={noting.text} aria-label={`Note for ${name}`} placeholder="Add a note"
                          onChange={(e) => setNoting({ ...noting, text: e.target.value })}
                          onKeyDown={(e) => { if (e.key === "Enter") saveNote(); if (e.key === "Escape") setNoting(null); }}
                          style={{ flex: 1, minWidth: 140 }} />
                        <button className="btn btn-secondary btn-sm" onClick={saveNote}>Save</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setNoting(null)}>Cancel</button>
                      </div>
                    ) : t.note ? (
                      <button className="note-text cell-secondary" aria-label={`Edit note for ${label}: ${t.note}`}
                        title="Edit note" onClick={() => setNoting({ key: t.key, id: t.id, text: t.note ?? "" })}>{t.note}</button>
                    ) : !t.removed && (
                      <button className="btn btn-ghost btn-sm note-add" aria-label={`Add a note to ${label}`}
                        onClick={() => setNoting({ key: t.key, id: t.id, text: "" })}>+ Note</button>
                    )}
                    {part?.note && <div className="cell-secondary">{part.note}</div>}
                    {isOwn(t) && <div className="cell-secondary">Added by you</div>}
                    {t.pending && <Badge tone="warn">Pending</Badge>}
                  </td>
                  <td className="left cell-secondary">{accountName(t.account_id)}</td>
                  <td className="left">
                    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      {overshoot ? (
                        <span className="cell-secondary">Over the bank's amount</span>
                      ) : (
                        <CategorySelect
                          categories={categories}
                          value={category ? category.id : null}
                          onChange={(categoryId) => choose(t, categoryId)}
                          aria-label={`Category for ${label}`}
                        />
                      )}
                      {!part && t.category_source === "manual" && (
                        <span className="muted" style={{ fontSize: 10 }} title="You chose this category">·</span>
                      )}
                      {!t.reviewed && toReviewDot}
                      {!part && !t.removed && (
                        <button className="btn btn-ghost btn-sm" aria-label={`Split ${name}`} aria-expanded={splitting === t.key}
                          title="Split into separate transactions" onClick={() => openSplit(t.key)}>Split</button>
                      )}
                    </div>
                    {part && (
                      <div className="cell-secondary row center" style={{ gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                        <Badge>Split {part.index} of {part.of}</Badge>
                        <span className="n">of {signed(whole.amount)}</span>
                        {!t.removed && (
                          <button className="btn btn-ghost btn-sm" style={{ padding: "2px 0" }}
                            aria-label={`Edit split for ${label}`} aria-expanded={splitting === t.key}
                            title="Change the pieces, or unsplit them back into one transaction"
                            onClick={() => openSplit(t.key)}>
                            Edit split
                          </button>
                        )}
                      </div>
                    )}
                    {part?.remainder && (
                      <div className="cell-secondary">
                        {overshoot
                          ? `The pieces are ${money(Math.abs(t.amount))} more than the bank's amount — edit the split`
                          : `${money(Math.abs(t.amount))} not assigned — the bank changed the amount`}
                      </div>
                    )}
                    {teaching === t.key && t.payee && (
                      <div className="row center" style={{ gap: 8, marginTop: 6 }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => {
                          setCategory.mutate({ id: t.id, categoryId: t.category_id, applyToPayee: true });
                          setTeaching(null);
                        }}>
                          Apply to all “{t.payee}”
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setTeaching(null)}>Just this one</button>
                      </div>
                    )}
                  </td>
                  <td className={incoming ? "pos" : undefined} style={{ fontWeight: 600 }}>
                    {signed(t.amount)}
                  </td>
                  {onApprove && (
                    <td>
                      <button className="btn btn-ghost btn-sm" aria-label={`Approve ${label}`}
                        title={part ? "Looks right (the whole split)" : "Looks right"} onClick={() => onApprove(t.id)}>✓</button>
                    </td>
                  )}
                  {(onRemove || onRestore) && (
                    <td>
                      {t.removed ? (
                        onRestore && (
                          <button className="btn btn-ghost btn-sm" aria-label={`Restore ${label}`}
                            title={part ? "Restore every part of the split" : undefined}
                            onClick={() => onRestore(t.id)}>Restore</button>
                        )
                      ) : isOwn(t) ? (
                        // One the owner added: no sync would bring it back, so
                        // it is deleted outright rather than removed.
                        <button className="btn btn-ghost btn-sm" aria-label={`Delete ${label}`}
                          title={part ? "Delete (you added this): every part of the split goes" : "Delete (you added this)"}
                          onClick={() => deleteOwn(whole, name)}>×</button>
                      ) : (
                        onRemove && (
                          <button className="btn btn-ghost btn-sm" aria-label={`Remove ${label}`}
                            title={part ? "Remove from spending (paid back): every part of the split" : "Remove from spending (paid back)"}
                            onClick={() => onRemove(t.id)}>×</button>
                        )
                      )}
                    </td>
                  )}
                </tr>
                {splitting === t.key && (
                  <tr>
                    <td className="left" colSpan={columns}>
                      <SplitEditor txn={whole} categories={categories} onDone={() => setSplitting(null)} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
      {selecting && (
        <>
          {/* Room to scroll the last rows out from under the bar. */}
          <div style={{ height: 72 }} />
          <BulkBar selected={chosen} categories={categories} onClear={clearPicked} />
        </>
      )}
    </div>
  );
}
