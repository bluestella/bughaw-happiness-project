import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  BUYER_SEGMENTS,
  BUYER_SEGMENT_LABELS,
  LEAD_STATUSES,
  LOST_REASONS,
  LOST_REASON_LABELS,
  NEXT_ACTION_MAX,
  STAGE_WEIGHTS,
  addDays,
  dealDraftFrom,
  describeDealChange,
  followUpBuckets,
  isOpenLead,
  isOverdue,
  leadsToCsv,
  manilaDate,
  openPipelineValue,
  validateDeal,
  weightedPipelineValue,
  type CrmLeadRow,
  type DealDraft,
  type DealPatch,
  type LeadStatus,
} from "@/lib/crm";

// docs/specs/crm-deal-fields.md

const TODAY = "2026-11-12";

type L = { status: LeadStatus; deal_value: number | null; next_action: string | null; next_action_due_on: string | null };
const lead = (over: Partial<L> = {}): L => ({
  status: "Qualified",
  deal_value: null,
  next_action: null,
  next_action_due_on: null,
  ...over,
});

const blank: DealDraft = {
  deal_value: "",
  expected_close_on: "",
  next_action: "",
  next_action_due_on: "",
  sample_sent_on: "",
  sample_feedback_on: "",
};

describe("vocabularies mirror 0014_crm_deal_fields.sql", () => {
  const sql = readFileSync(
    path.join(process.cwd(), "supabase/migrations/0014_crm_deal_fields.sql"),
    "utf8",
  );
  const listIn = (column: string): string[] => {
    const m = sql.match(new RegExp(`check \\(${column} in \\(([^)]*)\\)\\)`));
    if (!m) throw new Error(`no CHECK list found for ${column}`);
    return m[1].split(",").map((v) => v.trim().replace(/'/g, ""));
  };

  it("buyer segments", () => {
    expect(listIn("segment")).toEqual([...BUYER_SEGMENTS]);
    expect(Object.keys(BUYER_SEGMENT_LABELS).sort()).toEqual([...BUYER_SEGMENTS].sort());
  });
  it("lost reasons", () => {
    expect(listIn("lost_reason")).toEqual([...LOST_REASONS]);
    expect(Object.keys(LOST_REASON_LABELS).sort()).toEqual([...LOST_REASONS].sort());
  });
  it("next action length", () => {
    expect(sql).toContain(`char_length(next_action) <= ${NEXT_ACTION_MAX}`);
  });
  it("every stage has a weight between 0 and 1", () => {
    for (const s of LEAD_STATUSES) {
      expect(STAGE_WEIGHTS[s]).toBeGreaterThanOrEqual(0);
      expect(STAGE_WEIGHTS[s]).toBeLessThanOrEqual(1);
    }
  });
});

describe("dates", () => {
  it("manilaDate uses the Manila calendar day, not UTC", () => {
    // 17:30 UTC on the 12th is 01:30 on the 13th in Manila (UTC+8).
    expect(manilaDate(new Date("2026-11-12T17:30:00Z"))).toBe("2026-11-13");
    expect(manilaDate(new Date("2026-11-12T03:00:00Z"))).toBe("2026-11-12");
    expect(manilaDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it("addDays crosses month and year ends", () => {
    expect(addDays("2026-11-28", 7)).toBe("2026-12-05");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("open and overdue", () => {
  it("closed leads are not open", () => {
    expect(isOpenLead({ status: "New" })).toBe(true);
    expect(isOpenLead({ status: "Pilot Scoping" })).toBe(true);
    expect(isOpenLead({ status: "Closed Won" })).toBe(false);
    expect(isOpenLead({ status: "Closed Lost" })).toBe(false);
  });
  it("overdue means due before today on an open lead", () => {
    expect(isOverdue(lead({ next_action_due_on: "2026-11-11" }), TODAY)).toBe(true);
    expect(isOverdue(lead({ next_action_due_on: TODAY }), TODAY)).toBe(false);
    expect(isOverdue(lead({ next_action_due_on: "2026-11-13" }), TODAY)).toBe(false);
    expect(isOverdue(lead(), TODAY)).toBe(false);
    expect(isOverdue(lead({ status: "Closed Won", next_action_due_on: "2026-01-01" }), TODAY)).toBe(false);
  });
});

describe("followUpBuckets", () => {
  it("groups by due date, oldest first, and skips closed or undated leads", () => {
    const leads = [
      lead({ next_action: "later", next_action_due_on: "2026-11-20" }),
      lead({ next_action: "week edge", next_action_due_on: "2026-11-19" }),
      lead({ next_action: "today", next_action_due_on: TODAY }),
      lead({ next_action: "old", next_action_due_on: "2026-11-01" }),
      lead({ next_action: "older", next_action_due_on: "2026-10-01" }),
      lead({ next_action: "tomorrow", next_action_due_on: "2026-11-13" }),
      lead({ status: "Closed Lost", next_action: "ignored", next_action_due_on: "2026-11-01" }),
      lead(),
    ];
    const b = followUpBuckets(leads, TODAY);
    expect(b.overdue.map((l) => l.next_action)).toEqual(["older", "old"]);
    expect(b.today.map((l) => l.next_action)).toEqual(["today"]);
    expect(b.thisWeek.map((l) => l.next_action)).toEqual(["tomorrow", "week edge"]);
    expect(b.later.map((l) => l.next_action)).toEqual(["later"]);
  });
  it("returns empty buckets for no leads", () => {
    expect(followUpBuckets([], TODAY)).toEqual({ overdue: [], today: [], thisWeek: [], later: [] });
  });
});

describe("pipeline totals", () => {
  const leads = [
    lead({ status: "New", deal_value: 100_000 }),
    lead({ status: "Qualified", deal_value: 50_000 }),
    lead({ status: "Pilot Scoping", deal_value: 200_000 }),
    lead({ status: "Closed Won", deal_value: 999_999 }),
    lead({ status: "Closed Lost", deal_value: 999_999 }),
    lead({ status: "Qualified", deal_value: null }),
  ];
  it("open value sums open leads only", () => {
    expect(openPipelineValue(leads)).toBe(350_000);
  });
  it("weighted value applies the stage weights", () => {
    // 100k*0.05 + 50k*0.3 + 200k*0.6
    expect(weightedPipelineValue(leads)).toBeCloseTo(140_000, 6);
  });
  it("accepts custom weights", () => {
    const flat = Object.fromEntries(LEAD_STATUSES.map((s) => [s, 0.5])) as Record<LeadStatus, number>;
    expect(weightedPipelineValue(leads, flat)).toBe(175_000);
  });
  it("returns 0, never NaN or Infinity, for empty or bad input", () => {
    expect(openPipelineValue([])).toBe(0);
    expect(weightedPipelineValue([])).toBe(0);
    const bad = [
      lead({ deal_value: Number.NaN }),
      lead({ deal_value: Number.POSITIVE_INFINITY }),
      lead({ deal_value: -5 }),
    ];
    expect(openPipelineValue(bad)).toBe(0);
    expect(weightedPipelineValue(bad)).toBe(0);
    const brokenWeights = Object.fromEntries(
      LEAD_STATUSES.map((s) => [s, Number.NaN]),
    ) as Record<LeadStatus, number>;
    expect(weightedPipelineValue(leads, brokenWeights)).toBe(0);
  });
});

describe("validateDeal", () => {
  it("turns a blank form into all NULLs", () => {
    const r = validateDeal(blank);
    expect(r).toEqual({
      ok: true,
      patch: {
        deal_value: null,
        expected_close_on: null,
        next_action: null,
        next_action_due_on: null,
        sample_sent_on: null,
        sample_feedback_on: null,
      },
    });
  });
  it("accepts a full, valid form and trims it", () => {
    const r = validateDeal({
      deal_value: " 125,000.456 ",
      expected_close_on: "2026-12-15",
      next_action: "  Send revised quote ",
      next_action_due_on: "2026-11-14",
      sample_sent_on: "2026-11-01",
      sample_feedback_on: "2026-11-01",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.patch.deal_value).toBe(125000.46);
    expect(r.patch.next_action).toBe("Send revised quote");
    expect(r.patch.sample_feedback_on).toBe("2026-11-01");
  });
  const errorsOf = (over: Partial<DealDraft>) => {
    const r = validateDeal({ ...blank, ...over });
    return r.ok ? {} : r.errors;
  };
  it("refuses a negative, non-numeric or absurd amount", () => {
    expect(errorsOf({ deal_value: "-1" }).deal_value).toBeDefined();
    expect(errorsOf({ deal_value: "abc" }).deal_value).toBeDefined();
    expect(errorsOf({ deal_value: "1e12" }).deal_value).toBeDefined();
    expect(errorsOf({ deal_value: "0" })).toEqual({});
  });
  it("requires a due date with a next action", () => {
    expect(errorsOf({ next_action: "Call" }).next_action_due_on).toBeDefined();
    expect(errorsOf({ next_action: "Call", next_action_due_on: "2026-11-14" })).toEqual({});
    // A due date alone is allowed by the database, so it is allowed here.
    expect(errorsOf({ next_action_due_on: "2026-11-14" })).toEqual({});
  });
  it("limits the next action length", () => {
    expect(
      errorsOf({ next_action: "x".repeat(NEXT_ACTION_MAX + 1), next_action_due_on: "2026-11-14" }).next_action,
    ).toBeDefined();
    expect(
      errorsOf({ next_action: "x".repeat(NEXT_ACTION_MAX), next_action_due_on: "2026-11-14" }),
    ).toEqual({});
  });
  it("refuses malformed dates", () => {
    expect(errorsOf({ expected_close_on: "12/15/2026" }).expected_close_on).toBeDefined();
    expect(errorsOf({ next_action: "Call", next_action_due_on: "soon" }).next_action_due_on).toBe(
      "Enter a valid date.",
    );
    expect(errorsOf({ sample_sent_on: "2026-13-45" }).sample_sent_on).toBeDefined();
  });
  it("needs a sent date before feedback, and feedback not earlier than sent", () => {
    expect(errorsOf({ sample_feedback_on: "2026-11-05" }).sample_feedback_on).toBeDefined();
    expect(
      errorsOf({ sample_sent_on: "2026-11-05", sample_feedback_on: "2026-11-04" }).sample_feedback_on,
    ).toBeDefined();
    // A bad sent date reports that error, not a second one about feedback.
    const e = errorsOf({ sample_sent_on: "nope", sample_feedback_on: "2026-11-05" });
    expect(e.sample_sent_on).toBeDefined();
    expect(e.sample_feedback_on).toBeUndefined();
  });
});

describe("dealDraftFrom and describeDealChange", () => {
  const empty: DealPatch = {
    deal_value: null,
    expected_close_on: null,
    next_action: null,
    next_action_due_on: null,
    sample_sent_on: null,
    sample_feedback_on: null,
  };
  it("round-trips a row through the form", () => {
    expect(dealDraftFrom(empty)).toEqual(blank);
    const row: DealPatch = { ...empty, deal_value: 0, next_action: "Call", next_action_due_on: "2026-11-14" };
    const draft = dealDraftFrom(row);
    expect(draft.deal_value).toBe("0");
    const back = validateDeal(draft);
    expect(back.ok && back.patch).toEqual(row);
  });
  it("describes only what changed", () => {
    expect(describeDealChange(empty, empty)).toBe("");
    expect(
      describeDealChange(empty, { ...empty, deal_value: 5000, next_action: "Call", next_action_due_on: "2026-11-14" }),
    ).toBe("Deal value: none → 5000; Next action: none → Call; Next action due: none → 2026-11-14");
    expect(describeDealChange({ ...empty, sample_sent_on: "2026-11-01" }, empty)).toBe(
      "Sample sent: 2026-11-01 → none",
    );
  });
});

describe("CSV export includes deal fields", () => {
  it("adds the new columns in header order", () => {
    const row = {
      id: "1",
      status: "Closed Lost",
      origin_form: "manual",
      lead_type: "general",
      product_interests: [],
      submitted_at: "2026-11-01T00:00:00Z",
      deal_value: 125000,
      expected_close_on: "2026-12-15",
      next_action: "Call, then email",
      next_action_due_on: "2026-11-14",
      sample_sent_on: "2026-11-01",
      sample_feedback_on: null,
      lost_reason: "price",
      crm_contacts: null,
      crm_accounts: { id: "a", name: "Azure Spa", kind: "company", segment: "spa" },
    } as unknown as CrmLeadRow;
    const [header, line] = leadsToCsv([row]).split("\r\n");
    expect(header.endsWith(
      "segment,deal_value,expected_close_on,next_action,next_action_due_on,sample_sent_on,sample_feedback_on,lost_reason",
    )).toBe(true);
    expect(line.endsWith('spa,125000,2026-12-15,"Call, then email",2026-11-14,2026-11-01,,price')).toBe(true);
  });
});
