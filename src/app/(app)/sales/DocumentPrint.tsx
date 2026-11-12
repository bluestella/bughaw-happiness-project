import { peso } from "@/lib/format";
import { NOT_AN_INVOICE_LINE, type DocLineRow } from "@/lib/sales";
import { PrintButton } from "./SalesShell";

export type PrintFact = [label: string, value: string | null | undefined];

/**
 * A sales document laid out for paper. The app chrome is hidden when printing
 * (print: classes in the layout and sidebar), so this is what comes out.
 */
export function DocumentPrint({
  kind,
  number,
  customer,
  facts,
  lines,
  subtotal,
  discount,
  total,
  notes,
  taxNote,
  extra,
}: {
  kind: "Quotation" | "Sales order";
  number: string;
  customer: string;
  facts: PrintFact[];
  lines: DocLineRow[];
  subtotal: number;
  discount: number;
  total: number;
  notes?: string | null;
  taxNote?: string | null;
  extra?: React.ReactNode;
}) {
  return (
    <article className="mx-auto max-w-3xl bg-white p-6 text-ink print:p-0">
      <div className="mb-4 flex justify-end print:hidden">
        <PrintButton />
      </div>
      <header className="flex items-start justify-between border-b-2 border-ink pb-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">Bughaw Innovations</p>
          <h1 className="font-display text-2xl">{kind}</h1>
        </div>
        <p className="font-mono text-sm">{number}</p>
      </header>

      <section className="mt-4 grid grid-cols-2 gap-x-8 gap-y-1 text-[13px]">
        <p className="col-span-2 text-[15px] font-semibold">{customer}</p>
        {facts
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <p key={k}>
              <span className="text-ink-soft">{k}: </span>
              {v}
            </p>
          ))}
      </section>

      <table className="mt-5 w-full text-left text-[13px]">
        <thead>
          <tr className="border-b border-ink">
            <th className="py-1.5 pr-2 font-semibold">Item</th>
            <th className="py-1.5 pr-2 text-right font-semibold">Qty</th>
            <th className="py-1.5 pr-2 text-right font-semibold">Price</th>
            <th className="py-1.5 text-right font-semibold">Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id} className="border-b border-line">
              <td className="py-1.5 pr-2">{l.product_name_snapshot}</td>
              <td className="py-1.5 pr-2 text-right">{l.qty}</td>
              <td className="py-1.5 pr-2 text-right">{peso(Number(l.unit_price))}</td>
              <td className="py-1.5 text-right">{peso(Number(l.line_total))}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="mt-3 ml-auto w-64 space-y-1 text-[13px]">
        <div className="flex justify-between">
          <dt>Subtotal</dt>
          <dd>{peso(subtotal)}</dd>
        </div>
        {discount > 0 && (
          <div className="flex justify-between">
            <dt>Discount</dt>
            <dd>−{peso(discount)}</dd>
          </div>
        )}
        <div className="flex justify-between border-t border-ink pt-1 text-[15px] font-semibold">
          <dt>Total</dt>
          <dd>{peso(total)}</dd>
        </div>
      </dl>

      {taxNote && <p className="mt-4 text-[12px]">{taxNote}</p>}
      {notes && <p className="mt-3 whitespace-pre-wrap text-[12px]">{notes}</p>}
      {extra}
      <p className="mt-8 border-t border-line pt-2 text-[11px] text-ink-soft">{NOT_AN_INVOICE_LINE}</p>
    </article>
  );
}
