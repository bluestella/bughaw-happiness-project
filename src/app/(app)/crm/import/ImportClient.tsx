"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { createLeadFromSubmission, findExistingContactEmails } from "@/lib/crmClient";
import {
  csvToBodies,
  emailKey,
  isHoneypotHit,
  validateSubmission,
  type SubmissionBody,
  type SubmissionForm,
} from "@/lib/crm";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const FORM_LABELS: Record<SubmissionForm, string> = {
  contact: "General contact",
  for_hotels: "Hotel pilot",
  inquiry: "Product inquiry",
};

// The header row each form expects (FORMS_AUDIT §6). `interests` accepts
// pipe- or semicolon-separated product ids.
const TEMPLATES: Record<SubmissionForm, string> = {
  contact: "name,email,company,role,message",
  for_hotels: "fullName,email,hotelName,starRating,roomCount,interests,source,message",
  inquiry: "name,email,product,quantity,additionalInfo",
};

type PreviewRow = {
  index: number;
  body: SubmissionBody;
  email: string;
  label: string;
  verdict: "new" | "existing" | "invalid";
  reason: string;
};

export function ImportClient() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [form, setForm] = useState<SubmissionForm>("contact");
  const [text, setText] = useState("");
  const [rows, setRows] = useState<PreviewRow[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [importing, setImporting] = useState(false);

  function parse(raw: string): SubmissionBody[] {
    const trimmed = raw.trim();
    if (trimmed === "") return [];
    if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
      const parsed: unknown = JSON.parse(trimmed);
      const list = Array.isArray(parsed) ? parsed : [parsed];
      return list.filter(
        (x): x is SubmissionBody => !!x && typeof x === "object" && !Array.isArray(x)
      );
    }
    return csvToBodies(trimmed);
  }

  async function preview() {
    setChecking(true);
    try {
      const bodies = parse(text);
      if (bodies.length === 0) {
        toast.error("Nothing to import — paste CSV with a header row, or a JSON array.");
        setRows(null);
        return;
      }

      const emails = bodies.map((b) => String(b.email ?? ""));
      const existing = await findExistingContactEmails(supabase, emails);

      setRows(
        bodies.map((body, index) => {
          const email = String(body.email ?? "").trim();
          const label =
            String(body.hotelName ?? body.company ?? body.name ?? body.fullName ?? "") || email;

          if (isHoneypotHit(body)) {
            return {
              index,
              body,
              email,
              label,
              verdict: "invalid",
              reason: "Honeypot filled — treated as a bot, never imported.",
            };
          }
          const result = validateSubmission(form, body);
          if (!result.ok) {
            return {
              index,
              body,
              email,
              label,
              verdict: "invalid",
              reason: Object.values(result.details).join(" "),
            };
          }
          return existing.has(emailKey(email))
            ? { index, body, email, label, verdict: "existing", reason: "Matches an existing contact — a new lead is added under it." }
            : { index, body, email, label, verdict: "new", reason: "New contact." };
        })
      );
    } catch (err) {
      setRows(null);
      toast.error(err instanceof Error ? `Could not parse: ${err.message}` : "Could not parse the input.");
    } finally {
      setChecking(false);
    }
  }

  async function runImport() {
    if (!rows) return;
    const valid = rows.filter((r) => r.verdict !== "invalid");
    if (valid.length === 0) {
      toast.error("No valid rows to import.");
      return;
    }
    setImporting(true);
    let ok = 0;
    const failures: string[] = [];
    for (const row of valid) {
      try {
        await createLeadFromSubmission(supabase, form, row.body, "import");
        ok++;
      } catch (err) {
        failures.push(
          `Row ${row.index + 1}: ${err instanceof Error ? err.message : "unknown error"}`
        );
      }
    }
    setImporting(false);

    if (ok > 0) toast.success(`Imported ${ok} lead${ok === 1 ? "" : "s"}.`);
    if (failures.length > 0) toast.error(`${failures.length} row(s) failed. ${failures[0]}`);
    if (ok > 0) {
      setText("");
      setRows(null);
      router.refresh();
    }
  }

  const counts = rows
    ? {
        new: rows.filter((r) => r.verdict === "new").length,
        existing: rows.filter((r) => r.verdict === "existing").length,
        invalid: rows.filter((r) => r.verdict === "invalid").length,
      }
    : null;

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-line bg-white p-5 shadow-card">
        <label className="block max-w-xs">
          <span className="font-mono text-[10px] uppercase tracking-wide text-ink-soft">
            These rows came from
          </span>
          <Select
            value={form}
            onChange={(e) => {
              setForm(e.target.value as SubmissionForm);
              setRows(null);
            }}
          >
            {(Object.keys(FORM_LABELS) as SubmissionForm[]).map((f) => (
              <option key={f} value={f}>
                {FORM_LABELS[f]}
              </option>
            ))}
          </Select>
        </label>

        <p className="mt-3 font-mono text-[10px] uppercase tracking-wide text-ink-soft">
          Expected CSV header
        </p>
        <pre className="mt-1 overflow-x-auto rounded-lg border border-line bg-paper p-2 text-[11px] text-ink">
          {TEMPLATES[form]}
        </pre>

        <Textarea
          className="mt-3 font-mono text-[12px]"
          rows={10}
          placeholder="Paste CSV (with the header row) or a JSON array of submissions…"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setRows(null);
          }}
        />

        <div className="mt-3 flex items-center gap-2">
          <Button
            intent="secondary"
            size="sm"
            onClick={preview}
            disabled={checking || text.trim() === ""}
          >
            {checking ? "Checking…" : "Check rows"}
          </Button>
          {rows && (
            <Button
              intent="primary"
              size="sm"
              onClick={runImport}
              disabled={importing || rows.every((r) => r.verdict === "invalid")}
            >
              {importing ? "Importing…" : `Import ${counts!.new + counts!.existing} row(s)`}
            </Button>
          )}
        </div>
      </div>

      {rows && (
        <div className="rounded-xl border border-line bg-white shadow-card">
          <div className="flex flex-wrap gap-3 border-b border-line px-4 py-3 font-mono text-[10px] uppercase tracking-wide text-ink-soft">
            <span>{counts!.new} new</span>
            <span>{counts!.existing} existing contact</span>
            <span className={counts!.invalid > 0 ? "text-danger" : undefined}>
              {counts!.invalid} invalid
            </span>
          </div>
          <ul className="divide-y divide-line/60">
            {rows.map((r) => (
              <li key={r.index} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2.5">
                <span className="font-mono text-[10px] text-ink-soft">#{r.index + 1}</span>
                <span className="text-[13px] font-medium text-ink">{r.label || "—"}</span>
                <span className="text-[12px] text-ink-soft">{r.email}</span>
                <span
                  className={`ml-auto rounded-full border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide ${
                    r.verdict === "invalid"
                      ? "border-danger/50 text-danger"
                      : r.verdict === "existing"
                        ? "border-clay/50 text-clay"
                        : "border-coir/50 text-coir-dark"
                  }`}
                >
                  {r.verdict}
                </span>
                <span className="w-full text-[11px] text-ink-soft">{r.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
