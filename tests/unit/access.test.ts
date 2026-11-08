import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  SECTIONS,
  SECTION_KEYS,
  NO_ACCESS,
  canSee,
  decideSection,
  hasWorkspace,
  landingPath,
  parseAccess,
  resolveSections,
  routeRedirect,
  sectionForPath,
  toolSection,
  type Access,
  type RoleDefault,
  type SectionKey,
  type UserOverride,
} from "@/lib/access";
import { TOOLS } from "@/lib/tools";

const MIGRATION = readFileSync(
  join(__dirname, "../../supabase/migrations/0010_section_access.sql"),
  "utf8"
);

// The seeded defaults in 0010 (member = all, contractor = tasks only).
const SEED_DEFAULTS: RoleDefault[] = [
  ...SECTION_KEYS.map((section) => ({ role: "member" as const, section, allowed: true })),
  ...SECTION_KEYS.map((section) => ({
    role: "contractor" as const,
    section,
    allowed: section === "tasks",
  })),
];

function access(role: Access["role"], sections: SectionKey[]): Access {
  return { role, sections: new Set(sections) };
}

describe("section registry stays in sync", () => {
  it("every key in SECTIONS is seeded in app_sections by 0010, in the same order", () => {
    const seeded = Array.from(MIGRATION.matchAll(/^\s*\('([a-z:-]+)',\s+'[^']*',\s+'(Sections|Tools)'/gm)).map(
      (m) => m[1]
    );
    expect(seeded).toEqual(SECTION_KEYS);
  });

  it("every tool in TOOLS has a section and owns its route", () => {
    for (const t of TOOLS) {
      const key = toolSection(t.id);
      expect(key, t.id).not.toBeNull();
      expect(sectionForPath(t.path)).toBe(key);
    }
  });

  it("section keys are unique", () => {
    expect(new Set(SECTION_KEYS).size).toBe(SECTIONS.length);
  });
});

describe("decideSection (mirrors has_section)", () => {
  it("super_admin always sees everything, ignoring overrides", () => {
    const overrides: UserOverride[] = [{ email: "a@x.ph", section: "crm", allowed: false }];
    const d = decideSection("super_admin", "a@x.ph", "crm", [], overrides);
    expect(d).toEqual({ allowed: true, source: "super_admin", roleDefault: true });
  });

  it("no role sees nothing", () => {
    expect(decideSection(null, "a@x.ph", "tasks", SEED_DEFAULTS, []).allowed).toBe(false);
  });

  it("falls back to the role default", () => {
    expect(decideSection("member", "a@x.ph", "crm", SEED_DEFAULTS, [])).toEqual({
      allowed: true,
      source: "role_default",
      roleDefault: true,
    });
    expect(decideSection("contractor", "a@x.ph", "crm", SEED_DEFAULTS, []).allowed).toBe(false);
  });

  it("an override beats the role default in both directions", () => {
    const overrides: UserOverride[] = [
      { email: "m@x.ph", section: "crm", allowed: false },
      { email: "c@x.ph", section: "tool:pnl", allowed: true },
    ];
    expect(decideSection("member", "m@x.ph", "crm", SEED_DEFAULTS, overrides)).toEqual({
      allowed: false,
      source: "override",
      roleDefault: true,
    });
    expect(decideSection("contractor", "c@x.ph", "tool:pnl", SEED_DEFAULTS, overrides).allowed).toBe(true);
  });

  it("matches override emails case-insensitively", () => {
    const overrides: UserOverride[] = [{ email: "Mixed@X.ph", section: "crm", allowed: false }];
    expect(decideSection("member", " mixed@x.PH ", "crm", SEED_DEFAULTS, overrides).allowed).toBe(false);
  });

  it("another person's override does not leak", () => {
    const overrides: UserOverride[] = [{ email: "other@x.ph", section: "crm", allowed: false }];
    expect(decideSection("member", "me@x.ph", "crm", SEED_DEFAULTS, overrides).allowed).toBe(true);
  });

  it("a missing default means no access", () => {
    expect(decideSection("member", "a@x.ph", "crm", [], [])).toEqual({
      allowed: false,
      source: "none",
      roleDefault: false,
    });
  });
});

describe("resolveSections", () => {
  it("seed defaults reproduce the pre-0010 behaviour", () => {
    expect(resolveSections("member", "m@x.ph", SEED_DEFAULTS, []).size).toBe(SECTION_KEYS.length);
    expect(Array.from(resolveSections("contractor", "c@x.ph", SEED_DEFAULTS, []))).toEqual(["tasks"]);
    expect(resolveSections(null, "n@x.ph", SEED_DEFAULTS, []).size).toBe(0);
  });
});

describe("parseAccess", () => {
  it("parses the current_user_access() payload", () => {
    const a = parseAccess({ role: "member", sections: ["crm", "tasks"] });
    expect(a.role).toBe("member");
    expect(Array.from(a.sections)).toEqual(["crm", "tasks"]);
  });

  it("drops unknown section keys", () => {
    const a = parseAccess({ role: "member", sections: ["crm", "admin", 42] });
    expect(Array.from(a.sections)).toEqual(["crm"]);
  });

  it("treats junk, a missing role, or an unknown role as no access", () => {
    expect(parseAccess(null)).toBe(NO_ACCESS);
    expect(parseAccess("member")).toBe(NO_ACCESS);
    expect(parseAccess({ sections: ["crm"] })).toBe(NO_ACCESS);
    expect(parseAccess({ role: "owner", sections: ["crm"] })).toBe(NO_ACCESS);
  });

  it("gives super_admin every section even if the list is short", () => {
    expect(parseAccess({ role: "super_admin", sections: [] }).sections.size).toBe(SECTION_KEYS.length);
  });
});

describe("sectionForPath", () => {
  it.each([
    ["/crm", "crm"],
    ["/crm/import", "crm"],
    ["/tasks", "tasks"],
    ["/tasks/abc/def", "tasks"],
    ["/calculators", "calculators"],
    ["/calculators/unit-economics/cogs", "calculators"],
    ["/saved", "saved"],
    ["/tools/pnl", "tool:pnl"],
    ["/tools/cost-calculator/report", "tool:cost-calculator"],
  ])("%s → %s", (path, key) => {
    expect(sectionForPath(path)).toBe(key);
  });

  it.each(["/", "/admin/access", "/admin/allowlist", "/tools", "/crmx", "/tools/pnl-old"])(
    "%s is not owned by a section",
    (path) => {
      expect(sectionForPath(path)).toBeNull();
    }
  );
});

describe("routing", () => {
  const contractor = access("contractor", ["tasks"]);
  const member = access("member", SECTION_KEYS);
  const crmOnly = access("member", ["crm"]);
  const nothing = access("member", []);
  const oneTool = access("contractor", ["tasks", "tool:qr-studio"]);

  it("hasWorkspace is true for calculators or any tool, not for CRM/tasks/saved", () => {
    expect(hasWorkspace(member)).toBe(true);
    expect(hasWorkspace(oneTool)).toBe(true);
    expect(hasWorkspace(access("member", ["calculators"]))).toBe(true);
    expect(hasWorkspace(access("member", ["crm", "tasks", "saved"]))).toBe(false);
  });

  it("landingPath picks the most useful page", () => {
    expect(landingPath(member)).toBe("/");
    expect(landingPath(contractor)).toBe("/tasks");
    expect(landingPath(crmOnly)).toBe("/crm");
    expect(landingPath(nothing)).toBe("/");
    expect(landingPath(oneTool)).toBe("/");
  });

  it("keeps today's contractor behaviour", () => {
    expect(routeRedirect("/", contractor)).toBe("/tasks");
    expect(routeRedirect("/crm", contractor)).toBe("/tasks");
    expect(routeRedirect("/tools/pipeline", contractor)).toBe("/tasks");
    expect(routeRedirect("/calculators/x/y", contractor)).toBe("/tasks");
    expect(routeRedirect("/tasks/p/m", contractor)).toBeNull();
  });

  it("lets a granted contractor into exactly the granted tool", () => {
    expect(routeRedirect("/tools/qr-studio", oneTool)).toBeNull();
    expect(routeRedirect("/tools/pnl", oneTool)).toBe("/");
  });

  it("blocks a member from a denied section", () => {
    const noCrm = access("member", SECTION_KEYS.filter((k) => k !== "crm"));
    expect(routeRedirect("/crm/import", noCrm)).toBe("/");
    expect(routeRedirect("/tools/pnl", noCrm)).toBeNull();
  });

  it("never redirects to a page it would redirect again", () => {
    const cases = [member, contractor, crmOnly, nothing, oneTool, NO_ACCESS];
    const paths = ["/", "/crm", "/tasks", "/saved", "/calculators", ...TOOLS.map((t) => t.path)];
    for (const a of cases) {
      for (const p of paths) {
        const to = routeRedirect(p, a);
        if (to !== null) expect(routeRedirect(to, a), `${p} → ${to}`).toBeNull();
      }
    }
  });

  it("canSee follows the set, with super_admin and null short-circuits", () => {
    expect(canSee(access("super_admin", []), "crm")).toBe(true);
    expect(canSee(access(null, ["crm"]), "crm")).toBe(false);
    expect(canSee(crmOnly, "crm")).toBe(true);
    expect(canSee(crmOnly, "tasks")).toBe(false);
  });
});
