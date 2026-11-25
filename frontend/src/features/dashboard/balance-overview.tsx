import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGroupsBalances } from "@/features/balances/balances.queries";
import { formatMoneyDisplay } from "@/features/expenses/money";
import type { GroupSummary } from "@/types/api";

export function BalanceOverview({ groups, userId }: { groups: GroupSummary[]; userId: string }) {
  const queries = useGroupsBalances(groups.map((group) => group.id));

  if (queries.some((query) => query.isPending)) {
    return <p role="status" className="rounded-xl bg-panel p-5 text-sm text-ink-secondary">Loading balances…</p>;
  }

  if (queries.some((query) => query.isError)) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-panel p-5">
        <p className="text-sm text-ink-secondary">The balance overview couldn’t load. Group balances are available from each group.</p>
        <Button variant="outline" size="sm" onClick={() => {
          for (const query of queries) if (query.isError) void query.refetch();
        }}>Retry balances</Button>
      </div>
    );
  }

  const byCurrency = new Map<string, { owed: bigint; owes: bigint; openGroups: number }>();
  for (const query of queries) {
    if (!query.data) continue;
    const { currency, members } = query.data;
    const balance = BigInt(members.find((member) => member.userId === userId)?.balanceMinor ?? 0);
    const totals = byCurrency.get(currency) ?? { owed: 0n, owes: 0n, openGroups: 0 };
    if (balance > 0n) totals.owed += balance;
    if (balance < 0n) totals.owes -= balance;
    if (balance !== 0n) totals.openGroups++;
    byCurrency.set(currency, totals);
  }
  if (!byCurrency.size) return null;

  return (
    <section aria-label="Balances by currency" className="grid gap-3 md:grid-cols-2">
      {[...byCurrency].sort(([a], [b]) => a.localeCompare(b)).map(([currency, { owed, owes, openGroups }]) => (
        <div key={currency} className="min-w-0 rounded-xl bg-highlight p-5 text-on-highlight sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-bold">Net balance</h2>
            <span className="text-xs font-semibold">{currency}</span>
          </div>
          <p className="mt-2 font-display text-3xl font-extrabold tracking-tight tabular-nums [overflow-wrap:anywhere]">
            {owed < owes ? "−" : ""}{formatMoneyDisplay(owed < owes ? owes - owed : owed - owes, currency)}
          </p>
          <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-current/20 pt-4 text-sm">
            <div className="min-w-0">
              <dt className="flex items-center gap-1.5"><ArrowDownLeft className="size-4 shrink-0" aria-hidden="true" /> You’re owed</dt>
              <dd className="mt-1 font-semibold tabular-nums [overflow-wrap:anywhere]">{formatMoneyDisplay(owed, currency)}</dd>
            </div>
            <div className="min-w-0">
              <dt className="flex items-center gap-1.5"><ArrowUpRight className="size-4 shrink-0" aria-hidden="true" /> You owe</dt>
              <dd className="mt-1 font-semibold tabular-nums [overflow-wrap:anywhere]">{formatMoneyDisplay(owes, currency)}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs font-medium">
            {openGroups ? `${openGroups} ${openGroups === 1 ? "group" : "groups"} with an open balance` : "All your groups are settled up"}
          </p>
        </div>
      ))}
    </section>
  );
}
