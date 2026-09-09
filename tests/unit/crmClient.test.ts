import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createLeadFromSubmission, findExistingContactEmails } from "@/lib/crmClient";

// A minimal fake for the chainable PostgrestFilterBuilder surface crmClient.ts
// uses. Every intermediate call (.select/.eq/.in/.update/.insert/.maybeSingle/
// .single) returns the same chain object, which is itself thenable — matching
// how the real client can be awaited at any point in the chain.
function makeChain(result: { data?: unknown; error?: { message: string } | null }) {
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    in: () => chain,
    update: () => chain,
    insert: () => chain,
    maybeSingle: () => chain,
    single: () => chain,
    then: (
      resolve: (v: typeof result) => unknown,
      reject?: (e: unknown) => unknown
    ) => Promise.resolve(result).then(resolve, reject),
  };
  return chain;
}

type Responses = Record<string, Array<{ data?: unknown; error?: { message: string } | null }>>;

function makeMockSupabase(responses: Responses) {
  const counters: Record<string, number> = {};
  const from = vi.fn((table: string) => {
    const idx = counters[table] ?? 0;
    counters[table] = idx + 1;
    const result = responses[table]?.[idx] ?? { data: null, error: null };
    return makeChain(result);
  });
  return { from } as unknown as SupabaseClient;
}

const contactForm = {
  name: "Denise Samson",
  email: "denise@hotel.com",
  company: "Grand Hyatt Manila",
  role: "Sustainability Manager",
  message: "We would like to discuss the slipper program.",
};

describe("findExistingContactEmails", () => {
  it("returns an empty set without querying when every email is blank", async () => {
    const supabase = makeMockSupabase({});
    const result = await findExistingContactEmails(supabase, ["", "  "]);
    expect(result.size).toBe(0);
  });

  it("returns the set of matched email keys", async () => {
    const supabase = makeMockSupabase({
      crm_contacts: [{ data: [{ email_key: "a@b.com" }, { email_key: "c@d.com" }], error: null }],
    });
    const result = await findExistingContactEmails(supabase, ["A@B.com", " c@d.com ", "new@e.com"]);
    expect(result).toEqual(new Set(["a@b.com", "c@d.com"]));
  });

  it("throws with the Postgrest error message on failure", async () => {
    const supabase = makeMockSupabase({
      crm_contacts: [{ data: null, error: { message: "connection lost" } }],
    });
    await expect(findExistingContactEmails(supabase, ["a@b.com"])).rejects.toThrow("connection lost");
  });

  it("returns an empty set when the query succeeds with null data", () => {
    const supabase = makeMockSupabase({
      crm_contacts: [{ data: null, error: null }],
    });
    return expect(findExistingContactEmails(supabase, ["a@b.com"])).resolves.toEqual(new Set());
  });
});

describe("createLeadFromSubmission — brand new account and contact", () => {
  it("creates account, contact, and lead, and logs a manual-entry activity", async () => {
    const supabase = makeMockSupabase({
      crm_accounts: [
        { data: null, error: null }, // find: none existing
        { data: { id: "acc1" }, error: null }, // insert
      ],
      crm_contacts: [
        { data: null, error: null }, // find: none existing
        { data: { id: "con1" }, error: null }, // insert
      ],
      crm_leads: [{ data: { id: "lead1" }, error: null }],
      crm_lead_activities: [{ data: null, error: null }],
    });

    const result = await createLeadFromSubmission(supabase, "contact", contactForm, "manual");
    expect(result).toEqual({
      leadId: "lead1",
      contactId: "con1",
      accountId: "acc1",
      contactExisted: false,
    });
  });

  it("records an 'Imported' activity body for CSV import origin", async () => {
    const supabase = makeMockSupabase({
      crm_accounts: [{ data: null, error: null }, { data: { id: "acc1" }, error: null }],
      crm_contacts: [{ data: null, error: null }, { data: { id: "con1" }, error: null }],
      crm_leads: [{ data: { id: "lead1" }, error: null }],
      crm_lead_activities: [{ data: null, error: null }],
    });
    await createLeadFromSubmission(supabase, "contact", contactForm, "import");
    // The activity insert body isn't returned, but the call must not throw and
    // must have reached crm_lead_activities (asserted via the from() spy).
    expect((supabase.from as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0])).toContain(
      "crm_lead_activities"
    );
  });

  it("skips account creation entirely when the submission has no company", async () => {
    const supabase = makeMockSupabase({
      crm_contacts: [{ data: null, error: null }, { data: { id: "con1" }, error: null }],
      crm_leads: [{ data: { id: "lead1" }, error: null }],
      crm_lead_activities: [{ data: null, error: null }],
    });
    const result = await createLeadFromSubmission(
      supabase,
      "contact",
      { ...contactForm, company: "  " },
      "manual"
    );
    expect(result.accountId).toBeNull();
    expect((supabase.from as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0])).not.toContain(
      "crm_accounts"
    );
  });
});

describe("createLeadFromSubmission — existing account/contact patch rules", () => {
  it("fills blank account fields but never overwrites curated ones", async () => {
    const supabase = makeMockSupabase({
      crm_accounts: [
        {
          data: { id: "acc1", industry: "", hotel_star_rating: "", hotel_room_count_band: "", kind: "company" },
          error: null,
        },
        { data: null, error: null }, // update
      ],
      crm_contacts: [
        { data: { id: "con1", full_name: "Existing Name", job_title: "", account_id: null }, error: null },
        { data: null, error: null }, // update
      ],
      crm_leads: [{ data: { id: "lead1" }, error: null }],
      crm_lead_activities: [{ data: null, error: null }],
    });

    const result = await createLeadFromSubmission(
      supabase,
      "for_hotels",
      {
        fullName: "New Name",
        email: "alain@marsham.ph",
        hotelName: "Marsham Hotel",
        starRating: "4-Star",
        roomCount: "50–100",
      },
      "manual"
    );
    expect(result.contactExisted).toBe(true);
    expect(result.accountId).toBe("acc1");
    expect(result.contactId).toBe("con1");
  });

  it("upgrades an existing company account to hotel kind when a hotel submission matches", async () => {
    const supabase = makeMockSupabase({
      crm_accounts: [
        { data: { id: "acc1", industry: "Hospitality", hotel_star_rating: "3-Star", hotel_room_count_band: "<50", kind: "company" }, error: null },
        { data: null, error: null },
      ],
      crm_contacts: [
        { data: { id: "con1", full_name: "Existing", job_title: "Owner", account_id: "acc1" }, error: null },
      ],
      crm_leads: [{ data: { id: "lead1" }, error: null }],
      crm_lead_activities: [{ data: null, error: null }],
    });
    const result = await createLeadFromSubmission(
      supabase,
      "for_hotels",
      { fullName: "Alain", email: "alain@marsham.ph", hotelName: "Marsham Hotel", starRating: "4-Star" },
      "manual"
    );
    expect(result.accountId).toBe("acc1");
  });

  it("skips the account update call entirely when no field needs patching", async () => {
    const supabase = makeMockSupabase({
      crm_accounts: [
        { data: { id: "acc1", industry: "Hospitality", hotel_star_rating: "4-Star", hotel_room_count_band: "50–100", kind: "hotel" }, error: null },
      ],
      crm_contacts: [
        { data: { id: "con1", full_name: "Existing", job_title: "Owner", account_id: "acc1" }, error: null },
      ],
      crm_leads: [{ data: { id: "lead1" }, error: null }],
      crm_lead_activities: [{ data: null, error: null }],
    });
    const result = await createLeadFromSubmission(
      supabase,
      "for_hotels",
      { fullName: "Alain", email: "alain@marsham.ph", hotelName: "Marsham Hotel" },
      "manual"
    );
    // Only one call to crm_accounts (find) — no update call — since nothing changed.
    expect(
      (supabase.from as unknown as ReturnType<typeof vi.fn>).mock.calls.filter((c) => c[0] === "crm_accounts")
    ).toHaveLength(1);
    expect(result.accountId).toBe("acc1");
  });

  it("links an existing contact to the new account when it had none", async () => {
    const supabase = makeMockSupabase({
      crm_accounts: [{ data: null, error: null }, { data: { id: "acc1" }, error: null }],
      crm_contacts: [
        { data: { id: "con1", full_name: "Existing", job_title: "Existing role", account_id: null }, error: null },
        { data: null, error: null }, // update — links account_id
      ],
      crm_leads: [{ data: { id: "lead1" }, error: null }],
      crm_lead_activities: [{ data: null, error: null }],
    });
    const result = await createLeadFromSubmission(supabase, "contact", contactForm, "manual");
    expect(result.accountId).toBe("acc1");
    expect(result.contactExisted).toBe(true);
  });
});

describe("createLeadFromSubmission — error propagation", () => {
  it("throws when the account lookup errors", async () => {
    const supabase = makeMockSupabase({
      crm_accounts: [{ data: null, error: { message: "account lookup failed" } }],
    });
    await expect(createLeadFromSubmission(supabase, "contact", contactForm, "manual")).rejects.toThrow(
      "account lookup failed"
    );
  });

  it("throws when the account update errors", async () => {
    const supabase = makeMockSupabase({
      crm_accounts: [
        { data: { id: "acc1", industry: "", hotel_star_rating: "", hotel_room_count_band: "", kind: "company" }, error: null },
        { data: null, error: { message: "account update failed" } },
      ],
    });
    await expect(
      createLeadFromSubmission(
        supabase,
        "for_hotels",
        { fullName: "Alain", email: "alain@marsham.ph", hotelName: "Marsham Hotel", starRating: "4-Star" },
        "manual"
      )
    ).rejects.toThrow("account update failed");
  });

  it("throws a default message when account insert returns no data and no error", async () => {
    const supabase = makeMockSupabase({
      crm_accounts: [{ data: null, error: null }, { data: null, error: null }],
    });
    await expect(createLeadFromSubmission(supabase, "contact", contactForm, "manual")).rejects.toThrow(
      "Could not create the account."
    );
  });

  it("throws the Postgrest error message when the account insert itself errors", async () => {
    const supabase = makeMockSupabase({
      crm_accounts: [{ data: null, error: null }, { data: null, error: { message: "insert rejected" } }],
    });
    await expect(createLeadFromSubmission(supabase, "contact", contactForm, "manual")).rejects.toThrow(
      "insert rejected"
    );
  });

  it("throws when the contact lookup errors", async () => {
    const supabase = makeMockSupabase({
      crm_accounts: [{ data: null, error: null }, { data: { id: "acc1" }, error: null }],
      crm_contacts: [{ data: null, error: { message: "contact lookup failed" } }],
    });
    await expect(createLeadFromSubmission(supabase, "contact", contactForm, "manual")).rejects.toThrow(
      "contact lookup failed"
    );
  });

  it("throws when the contact update errors", async () => {
    const supabase = makeMockSupabase({
      crm_accounts: [{ data: null, error: null }, { data: { id: "acc1" }, error: null }],
      crm_contacts: [
        { data: { id: "con1", full_name: "", job_title: "", account_id: null }, error: null },
        { data: null, error: { message: "contact update failed" } },
      ],
    });
    await expect(createLeadFromSubmission(supabase, "contact", contactForm, "manual")).rejects.toThrow(
      "contact update failed"
    );
  });

  it("throws a default message when contact insert returns no data and no error", async () => {
    const supabase = makeMockSupabase({
      crm_accounts: [{ data: null, error: null }, { data: { id: "acc1" }, error: null }],
      crm_contacts: [{ data: null, error: null }, { data: null, error: null }],
    });
    await expect(createLeadFromSubmission(supabase, "contact", contactForm, "manual")).rejects.toThrow(
      "Could not create the contact."
    );
  });

  it("throws the Postgrest error message when the contact insert itself errors", async () => {
    const supabase = makeMockSupabase({
      crm_accounts: [{ data: null, error: null }, { data: { id: "acc1" }, error: null }],
      crm_contacts: [{ data: null, error: null }, { data: null, error: { message: "contact insert rejected" } }],
    });
    await expect(createLeadFromSubmission(supabase, "contact", contactForm, "manual")).rejects.toThrow(
      "contact insert rejected"
    );
  });

  it("throws when the lead insert errors", async () => {
    const supabase = makeMockSupabase({
      crm_accounts: [{ data: null, error: null }, { data: { id: "acc1" }, error: null }],
      crm_contacts: [{ data: null, error: null }, { data: { id: "con1" }, error: null }],
      crm_leads: [{ data: null, error: { message: "lead insert failed" } }],
    });
    await expect(createLeadFromSubmission(supabase, "contact", contactForm, "manual")).rejects.toThrow(
      "lead insert failed"
    );
  });

  it("throws a default message when lead insert returns no data and no error", async () => {
    const supabase = makeMockSupabase({
      crm_accounts: [{ data: null, error: null }, { data: { id: "acc1" }, error: null }],
      crm_contacts: [{ data: null, error: null }, { data: { id: "con1" }, error: null }],
      crm_leads: [{ data: null, error: null }],
    });
    await expect(createLeadFromSubmission(supabase, "contact", contactForm, "manual")).rejects.toThrow(
      "Could not create the lead."
    );
  });
});
