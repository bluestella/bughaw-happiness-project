import { describe, expect, it } from "vitest";
import {
  accountKey,
  csvEscape,
  csvToBodies,
  emailKey,
  isHoneypotHit,
  isSubmissionForm,
  leadsToCsv,
  normalizeInterests,
  normalizeSubmission,
  parseCsv,
  productLabel,
  validateSubmission,
  type CrmLeadRow,
} from "@/lib/crm";

// Every expectation below is traceable to FORMS_AUDIT.md.

const validContact = {
  name: "Denise Samson",
  email: "denise@hotel.com",
  company: "Grand Hyatt Manila",
  role: "Sustainability Manager",
  message: "We would like to discuss the slipper program for our property.",
};

const validHotel = {
  fullName: "Alain Cruz",
  email: "alain@marsham.ph",
  hotelName: "Marsham Hotel",
  starRating: "4-Star",
  roomCount: "50–100",
  interests: ["P1", "P2"],
  source: "Referral",
  message: "Rollout targeted for Q1.",
};

const validInquiry = {
  name: "Acme Hospitality",
  email: "buyer@acme.com",
  product: "Coconut-Husk Slippers",
  quantity: "5000",
  additionalInfo: "Need a quote.",
};

describe("validateSubmission — contact form (audit §6.1)", () => {
  it("accepts a complete submission", () => {
    expect(validateSubmission("contact", validContact)).toEqual({ ok: true });
  });

  it("requires every field", () => {
    const result = validateSubmission("contact", {});
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.details).sort()).toEqual([
      "company",
      "email",
      "message",
      "name",
      "role",
    ]);
  });

  it("enforces the name length band (2–100)", () => {
    const short = validateSubmission("contact", { ...validContact, name: "A" });
    expect(short.ok).toBe(false);
    const long = validateSubmission("contact", { ...validContact, name: "a".repeat(101) });
    expect(long.ok).toBe(false);
    expect(validateSubmission("contact", { ...validContact, name: "Al" }).ok).toBe(true);
    expect(validateSubmission("contact", { ...validContact, name: "a".repeat(100) }).ok).toBe(true);
  });

  it("enforces the message length band (10–5000)", () => {
    expect(validateSubmission("contact", { ...validContact, message: "too short" }).ok).toBe(false);
    expect(validateSubmission("contact", { ...validContact, message: "a".repeat(10) }).ok).toBe(true);
    expect(validateSubmission("contact", { ...validContact, message: "a".repeat(5001) }).ok).toBe(
      false
    );
  });

  it("enforces the company cap at 150 and role cap at 100", () => {
    expect(validateSubmission("contact", { ...validContact, company: "a".repeat(151) }).ok).toBe(
      false
    );
    expect(validateSubmission("contact", { ...validContact, role: "a".repeat(101) }).ok).toBe(false);
  });

  it("rejects malformed emails", () => {
    for (const email of ["nope", "a@b", "a b@c.com", "@c.com", "a@.com"]) {
      const result = validateSubmission("contact", { ...validContact, email });
      expect(result.ok, email).toBe(false);
    }
    expect(validateSubmission("contact", { ...validContact, email: "a@b.co" }).ok).toBe(true);
  });

  it("trims before measuring", () => {
    expect(validateSubmission("contact", { ...validContact, name: "   " }).ok).toBe(false);
  });
});

describe("validateSubmission — hotel pilot (audit §6.2)", () => {
  it("accepts a complete submission", () => {
    expect(validateSubmission("for_hotels", validHotel)).toEqual({ ok: true });
  });

  it("accepts one with every optional field omitted", () => {
    expect(
      validateSubmission("for_hotels", {
        fullName: "Alain Cruz",
        email: "alain@marsham.ph",
        hotelName: "Marsham Hotel",
      })
    ).toEqual({ ok: true });
  });

  it("requires the three mandatory fields", () => {
    const result = validateSubmission("for_hotels", {});
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.details).sort()).toEqual(["email", "fullName", "hotelName"]);
  });

  it("caps the optional fields", () => {
    expect(validateSubmission("for_hotels", { ...validHotel, starRating: "a".repeat(51) }).ok).toBe(
      false
    );
    expect(validateSubmission("for_hotels", { ...validHotel, roomCount: "a".repeat(51) }).ok).toBe(
      false
    );
    expect(validateSubmission("for_hotels", { ...validHotel, source: "a".repeat(101) }).ok).toBe(
      false
    );
    expect(validateSubmission("for_hotels", { ...validHotel, message: "a".repeat(3001) }).ok).toBe(
      false
    );
    expect(validateSubmission("for_hotels", { ...validHotel, message: "a".repeat(3000) }).ok).toBe(
      true
    );
  });
});

describe("validateSubmission — product inquiry (audit §6.3)", () => {
  it("accepts a complete submission", () => {
    expect(validateSubmission("inquiry", validInquiry)).toEqual({ ok: true });
  });

  it("requires name, email, product and quantity", () => {
    const result = validateSubmission("inquiry", {});
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.details).sort()).toEqual(["email", "name", "product", "quantity"]);
  });

  it("accepts a single-character quantity but caps it at 50", () => {
    expect(validateSubmission("inquiry", { ...validInquiry, quantity: "1" }).ok).toBe(true);
    expect(validateSubmission("inquiry", { ...validInquiry, quantity: "1".repeat(51) }).ok).toBe(
      false
    );
  });

  it("caps additionalInfo at 2000", () => {
    expect(
      validateSubmission("inquiry", { ...validInquiry, additionalInfo: "a".repeat(2001) }).ok
    ).toBe(false);
  });
});

describe("honeypot (audit §5.1)", () => {
  it("flags a filled honeypot", () => {
    expect(isHoneypotHit({ website_field_hp: "http://spam" })).toBe(true);
  });

  it("treats empty and whitespace-only as human", () => {
    expect(isHoneypotHit({ website_field_hp: "" })).toBe(false);
    expect(isHoneypotHit({ website_field_hp: "   " })).toBe(false);
    expect(isHoneypotHit({})).toBe(false);
  });
});

describe("dedupe keys (audit §10.2)", () => {
  it("folds case and surrounding whitespace", () => {
    expect(emailKey("  Denise@Hotel.COM ")).toBe("denise@hotel.com");
    expect(accountKey("  Grand Hyatt Manila ")).toBe("grand hyatt manila");
  });

  it("handles null and undefined", () => {
    expect(emailKey(null)).toBe("");
    expect(accountKey(undefined)).toBe("");
  });
});

describe("normalizeInterests (audit §3.6)", () => {
  it("drops empty and whitespace-only entries and trims the rest", () => {
    expect(normalizeInterests(["P1", " ", "", " P3 "])).toEqual(["P1", "P3"]);
  });

  it("returns an empty array for non-arrays", () => {
    expect(normalizeInterests(undefined)).toEqual([]);
    expect(normalizeInterests("P1")).toEqual([]);
    expect(normalizeInterests(null)).toEqual([]);
  });
});

describe("normalizeSubmission (audit §10.1)", () => {
  it("maps the contact form onto account / contact / lead", () => {
    const out = normalizeSubmission("contact", validContact);
    expect(out.account).toEqual({
      name: "Grand Hyatt Manila",
      kind: "company",
      industry: "",
      hotel_star_rating: "",
      hotel_room_count_band: "",
    });
    expect(out.contact).toEqual({
      full_name: "Denise Samson",
      email: "denise@hotel.com",
      job_title: "Sustainability Manager",
    });
    expect(out.lead.origin_form).toBe("contact");
    expect(out.lead.lead_type).toBe("general");
    expect(out.lead.description).toBe(validContact.message);
  });

  it("maps the hotel form, marking the account as a hospitality property", () => {
    const out = normalizeSubmission("for_hotels", validHotel);
    expect(out.account).toEqual({
      name: "Marsham Hotel",
      kind: "hotel",
      industry: "Hospitality",
      hotel_star_rating: "4-Star",
      hotel_room_count_band: "50–100",
    });
    expect(out.lead.lead_type).toBe("hotel_pilot");
    expect(out.lead.product_interests).toEqual(["P1", "P2"]);
    expect(out.lead.source).toBe("Referral");
  });

  it("maps the inquiry form to product + volume", () => {
    const out = normalizeSubmission("inquiry", validInquiry);
    expect(out.lead.origin_form).toBe("inquiry_api");
    expect(out.lead.lead_type).toBe("inquiry");
    expect(out.lead.product_of_interest).toBe("Coconut-Husk Slippers");
    expect(out.lead.estimated_volume).toBe("5000");
    expect(out.lead.description).toBe("Need a quote.");
  });

  it("records the real origin when overridden (manual entry / import)", () => {
    expect(normalizeSubmission("contact", validContact, "manual").lead.origin_form).toBe("manual");
    expect(normalizeSubmission("for_hotels", validHotel, "import").lead.origin_form).toBe("import");
  });

  it("carries the hidden metadata fields through (audit §7)", () => {
    const out = normalizeSubmission("contact", {
      ...validContact,
      _attribution: { utm_source: "linkedin" },
      _analytics: { gaClientId: "GA1.2.3" },
      _engagement: { tier: "tier_3", pageCount: 9 },
    });
    expect(out.lead.attribution).toEqual({ utm_source: "linkedin" });
    expect(out.lead.ga_client_id).toBe("GA1.2.3");
    expect(out.lead.engagement_tier).toBe("tier_3");
  });

  it("nulls the metadata when it is absent", () => {
    const out = normalizeSubmission("contact", validContact);
    expect(out.lead.attribution).toBeNull();
    expect(out.lead.engagement).toBeNull();
    expect(out.lead.ga_client_id).toBeNull();
    expect(out.lead.engagement_tier).toBe("");
  });

  it("leaves the account null when the company field is blank", () => {
    expect(normalizeSubmission("contact", { ...validContact, company: "  " }).account).toBeNull();
  });
});

describe("isSubmissionForm", () => {
  it("accepts the three real forms and nothing else", () => {
    expect(isSubmissionForm("contact")).toBe(true);
    expect(isSubmissionForm("for_hotels")).toBe(true);
    expect(isSubmissionForm("inquiry")).toBe(true);
    expect(isSubmissionForm("manual")).toBe(false);
    expect(isSubmissionForm(undefined)).toBe(false);
    expect(isSubmissionForm(7)).toBe(false);
  });
});

describe("productLabel (audit §3.6)", () => {
  it("resolves known ids and passes unknown ones through", () => {
    expect(productLabel("P2")).toBe("Coconut-Husk Slippers");
    expect(productLabel("P9")).toBe("P9");
  });
});

describe("CSV export", () => {
  it("quotes fields containing commas, quotes or newlines", () => {
    expect(csvEscape("plain")).toBe("plain");
    expect(csvEscape("a,b")).toBe('"a,b"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
    expect(csvEscape("line1\nline2")).toBe('"line1\nline2"');
    expect(csvEscape(null)).toBe("");
  });

  it("writes a header row plus one row per lead", () => {
    const lead = {
      id: "1",
      status: "New",
      origin_form: "for_hotels",
      lead_type: "hotel_pilot",
      source: "Referral",
      product_interests: ["P1"],
      product_of_interest: "",
      estimated_volume: "",
      description: "Interested, with a comma",
      engagement_tier: "tier_2",
      submitted_at: "2026-09-10T00:00:00Z",
      crm_contacts: { id: "c", full_name: "Alain", email: "alain@marsham.ph", job_title: "Owner" },
      crm_accounts: {
        id: "a",
        name: "Marsham Hotel",
        kind: "hotel",
        hotel_star_rating: "4-Star",
        hotel_room_count_band: "50–100",
      },
    } as unknown as CrmLeadRow;

    const csv = leadsToCsv([lead]);
    const lines = csv.split("\r\n");
    expect(lines).toHaveLength(2);
    expect(lines[0].startsWith("submitted_at,status,origin_form")).toBe(true);
    expect(lines[1]).toContain("Marsham Hotel");
    expect(lines[1]).toContain("Biodegradable Razor");
    expect(lines[1]).toContain('"Interested, with a comma"');
  });

  it("renders a header-only file for an empty list", () => {
    expect(leadsToCsv([]).split("\r\n")).toHaveLength(1);
  });
});

describe("CSV parsing (import screen)", () => {
  it("parses quoted fields, escaped quotes and embedded newlines", () => {
    const rows = parseCsv('a,b\n"x,1","he said ""hi""\nsecond line"');
    expect(rows).toEqual([
      ["a", "b"],
      ["x,1", 'he said "hi"\nsecond line'],
    ]);
  });

  it("skips fully blank lines and tolerates CRLF", () => {
    expect(parseCsv("a,b\r\n1,2\r\n\r\n3,4")).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  it("turns a header row into submission bodies", () => {
    const bodies = csvToBodies("name,email,company\nDenise, denise@hotel.com ,Hyatt");
    expect(bodies).toEqual([
      { name: "Denise", email: "denise@hotel.com", company: "Hyatt" },
    ]);
  });

  it("splits the interests column on pipes or semicolons", () => {
    const bodies = csvToBodies("email,interests\na@b.com,P1 | P3");
    expect(bodies[0].interests).toEqual(["P1", "P3"]);
  });

  it("returns nothing for a header-only or empty input", () => {
    expect(csvToBodies("name,email")).toEqual([]);
    expect(csvToBodies("")).toEqual([]);
  });
});
