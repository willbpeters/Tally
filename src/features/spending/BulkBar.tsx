import { useApproveTransactions, useSetCategoryMany, useSetRemoved } from "../../data/queries";
import { useOfferUndo, askBeforeRemove } from "../../data/undo";
import { useToast } from "../../ui/toast";
import { askToConfirm } from "../../ui/confirm";
import { money } from "../../ui/format";
import type { BankTransaction, Category } from "../../domain/types";

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/**
 * What can be done to every selected row at once, in a bar along the bottom
 * of the window: mark them reviewed, give them one category, or remove them
 * from spending. Each offers Undo. A split row keeps its pieces when the rest
 * take a category.
 */
export function BulkBar({ selected, categories, onClear }: {
  selected: BankTransaction[];
  categories: Category[];
  onClear: () => void;
}) {
  const approve = useApproveTransactions();
  const setCategory = useSetCategoryMany();
  const setRemoved = useSetRemoved();
  const offerUndo = useOfferUndo();
  const toast = useToast();
  const fail = (title: string) => (e: unknown) => toast.push({ tone: "neg", title, body: String(e) });

  // Approving a reviewed row would only pin its category, so leave those be.
  const unreviewed = selected.filter((t) => !t.reviewed);
  const whole = selected.filter((t) => t.splits.length === 0);
  const removable = selected.filter((t) => !t.removed);
  const net = selected.reduce((s, t) => s + t.amount, 0);
  const busy = approve.isPending || setCategory.isPending || setRemoved.isPending;

  function reviewAll() {
    approve.mutate(unreviewed.map((t) => t.id), {
      onSuccess: () => { offerUndo(`Marked ${plural(unreviewed.length, "transaction")} reviewed`, unreviewed); onClear(); },
      onError: fail("Not marked reviewed"),
    });
  }

  function categoriseAll(categoryId: number | null) {
    const kept = selected.length - whole.length;
    const name = categoryId == null ? "Uncategorised" : categories.find((c) => c.id === categoryId)?.name ?? "that category";
    setCategory.mutate({ ids: whole.map((t) => t.id), categoryId }, {
      onSuccess: () => {
        offerUndo(`${plural(whole.length, "transaction")} moved to ${name}`
          + (kept > 0 ? ` · ${plural(kept, "split")} kept ${kept === 1 ? "its" : "their"} pieces` : ""), whole);
        onClear();
      },
      onError: fail("Category not changed"),
    });
  }

  async function removeAll() {
    if (askBeforeRemove() && !(await askToConfirm(
      `Remove ${plural(removable.length, "transaction")} from spending? Restore puts any of them back.`,
      { okLabel: "Remove" },
    ))) return;
    setRemoved.mutate({ ids: removable.map((t) => t.id), removed: true }, {
      onSuccess: () => { offerUndo(`Removed ${plural(removable.length, "transaction")} from spending`, removable); onClear(); },
      onError: fail("Not removed"),
    });
  }

  return (
    <div className="bulk-bar" role="toolbar" aria-label="Selected transactions">
      <span style={{ fontWeight: 600 }}>{selected.length} selected</span>
      <span className="muted n" style={{ fontSize: 12 }}>{net > 0 ? "+" : ""}{money(net)}</span>
      <span className="bulk-bar-gap" />
      <button className="btn btn-secondary btn-sm" disabled={busy || unreviewed.length === 0} onClick={reviewAll}
        title={unreviewed.length === 0 ? "All of these are already reviewed" : undefined}>
        Mark reviewed{unreviewed.length > 0 && unreviewed.length < selected.length ? ` (${unreviewed.length})` : ""}
      </button>
      <select aria-label="Categorize selected" value="" disabled={busy || whole.length === 0}
        onChange={(e) => categoriseAll(e.target.value === "none" ? null : Number(e.target.value))}>
        <option value="" disabled>Categorize as…</option>
        {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        <option value="none">Uncategorised</option>
      </select>
      <button className="btn btn-secondary btn-sm" disabled={busy || removable.length === 0} onClick={removeAll}>
        Remove from spending
      </button>
      <button className="btn btn-ghost btn-sm" onClick={onClear} aria-label="Clear selection" title="Clear selection (Esc)">✕</button>
    </div>
  );
}
