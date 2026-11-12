// Per-person section/page access — pure helpers.
//
// MIRRORS supabase/migrations/0010_section_access.sql (has_section,
// current_user_access). The database is the security boundary: RLS on the
// crm_*, pipeline_accounts, app_state, saved_calculations and task tables
// calls has_section(). These helpers only decide what the middleware
// redirects and what the sidebar / palette / dashboard show.

import type { Role } from "@/lib/permissions";

export type SectionKey =
  | "crm"
  | "sales"
  | "tasks"
  | "calculators"
  | "saved"
  | "tool:pipeline"
  | "tool:cost-calculator"
  | "tool:unit-economics"
  | "tool:pnl"
  | "tool:funding"
  | "tool:qr-studio";

export interface SectionDef {
  key: SectionKey;
  label: string;
  group: "Sections" | "Tools";
  /** Route prefixes this section owns. A path matches `p` or `p/...`. */
  paths: string[];
}

// Keys and order (by sort_order) must match every app_sections insert in supabase/migrations;
// tests/unit/access.test.ts compares them.
export const SECTIONS: SectionDef[] = [
  { key: "crm", label: "CRM (lead funnel + import)", group: "Sections", paths: ["/crm"] },
  { key: "sales", label: "Sales (quotes, orders, stock)", group: "Sections", paths: ["/sales"] },
  { key: "tasks", label: "Projects & boards", group: "Sections", paths: ["/tasks"] },
  { key: "calculators", label: "Calculators", group: "Sections", paths: ["/calculators"] },
  { key: "saved", label: "Saved calculations", group: "Sections", paths: ["/saved"] },
  { key: "tool:pipeline", label: "Pipeline Simulator", group: "Tools", paths: ["/tools/pipeline"] },
  { key: "tool:cost-calculator", label: "Unit Cost Calculator", group: "Tools", paths: ["/tools/cost-calculator"] },
  { key: "tool:unit-economics", label: "Unit Economics Simulator", group: "Tools", paths: ["/tools/unit-economics"] },
  { key: "tool:pnl", label: "P&L Machine", group: "Tools", paths: ["/tools/pnl"] },
  { key: "tool:funding", label: "Funding & Investor Ask", group: "Tools", paths: ["/tools/funding"] },
  { key: "tool:qr-studio", label: "QR Studio", group: "Tools", paths: ["/tools/qr-studio"] },
];

export const SECTION_KEYS: SectionKey[] = SECTIONS.map((s) => s.key);

export function isSectionKey(v: unknown): v is SectionKey {
  return typeof v === "string" && (SECTION_KEYS as string[]).includes(v);
}

/** Section key for a TOOLS entry id (src/lib/tools.ts). */
export function toolSection(toolId: string): SectionKey | null {
  const key = `tool:${toolId}`;
  return isSectionKey(key) ? key : null;
}

export interface Access {
  role: Role | null;
  sections: ReadonlySet<SectionKey>;
}

export const NO_ACCESS: Access = { role: null, sections: new Set() };

/**
 * Access under the pre-0010 hard-coded rules (member = everything, contractor =
 * tasks only). Used only when current_user_access() does not exist yet — i.e.
 * the app was deployed before 0010_section_access.sql was run — so the app
 * keeps working instead of treating everyone as having no role. Matches the
 * seeded defaults, and RLS was role-based at that point too.
 */
export function legacyAccess(role: unknown): Access {
  if (role === "super_admin" || role === "member") {
    return { role, sections: new Set(SECTION_KEYS) };
  }
  if (role === "contractor") return { role, sections: new Set<SectionKey>(["tasks"]) };
  return NO_ACCESS;
}

/** Parse the jsonb returned by the current_user_access() RPC. */
export function parseAccess(raw: unknown): Access {
  if (!raw || typeof raw !== "object") return NO_ACCESS;
  const r = raw as { role?: unknown; sections?: unknown };
  const role =
    r.role === "super_admin" || r.role === "member" || r.role === "contractor" ? r.role : null;
  if (role === null) return NO_ACCESS;
  const list = Array.isArray(r.sections) ? r.sections.filter(isSectionKey) : [];
  return { role, sections: new Set(role === "super_admin" ? SECTION_KEYS : list) };
}

export function canSee(access: Access, section: SectionKey): boolean {
  if (access.role === "super_admin") return true;
  if (access.role === null) return false;
  return access.sections.has(section);
}

export interface RoleDefault {
  role: Role;
  section: string;
  allowed: boolean;
}

export interface UserOverride {
  email: string;
  section: string;
  allowed: boolean;
}

export interface SectionDecision {
  allowed: boolean;
  /** Where the answer came from — shown in the admin screen. */
  source: "super_admin" | "override" | "role_default" | "none";
  /** The role default, so the admin screen can show what "reset" would give. */
  roleDefault: boolean;
}

/**
 * One person's access to one section — the same rule as has_section():
 * super_admin → yes; no role → no; else override ?? role default ?? no.
 */
export function decideSection(
  role: Role | null,
  email: string,
  section: string,
  defaults: RoleDefault[],
  overrides: UserOverride[]
): SectionDecision {
  if (role === null) return { allowed: false, source: "none", roleDefault: false };
  if (role === "super_admin") return { allowed: true, source: "super_admin", roleDefault: true };
  const d = defaults.find((x) => x.role === role && x.section === section);
  const roleDefault = d ? d.allowed : false;
  const who = email.trim().toLowerCase();
  const o = overrides.find((x) => x.email.trim().toLowerCase() === who && x.section === section);
  if (o) return { allowed: o.allowed, source: "override", roleDefault };
  return { allowed: roleDefault, source: d ? "role_default" : "none", roleDefault };
}

/** Every section one person can see. */
export function resolveSections(
  role: Role | null,
  email: string,
  defaults: RoleDefault[],
  overrides: UserOverride[]
): Set<SectionKey> {
  const out = new Set<SectionKey>();
  for (const key of SECTION_KEYS) {
    if (decideSection(role, email, key, defaults, overrides).allowed) out.add(key);
  }
  return out;
}

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(prefix + "/");
}

/** The section that owns a route, or null for routes every signed-in user may open. */
export function sectionForPath(pathname: string): SectionKey | null {
  for (const s of SECTIONS) {
    for (const p of s.paths) if (matchesPrefix(pathname, p)) return s.key;
  }
  return null;
}

/** Does the person see anything on the dashboard (calculators or any tool)? */
export function hasWorkspace(access: Access): boolean {
  return SECTIONS.some(
    (s) => (s.key === "calculators" || s.group === "Tools") && canSee(access, s.key)
  );
}

/**
 * Where to send someone after sign-in, or when they hit a page they can't see.
 * The dashboard if it has anything for them; else their boards; else the
 * dashboard anyway (it explains that nothing has been shared yet).
 */
export function landingPath(access: Access): string {
  if (hasWorkspace(access)) return "/";
  if (canSee(access, "tasks")) return "/tasks";
  if (canSee(access, "crm")) return "/crm";
  return "/";
}

/**
 * Middleware decision for a signed-in user: null to let the request through,
 * or a path to redirect to. Never redirects to a path it would redirect again.
 */
export function routeRedirect(pathname: string, access: Access): string | null {
  // The dashboard is open to everyone, but someone with nothing on it starts on their boards.
  if (pathname === "/") {
    const landing = landingPath(access);
    return landing === "/" ? null : landing;
  }
  const section = sectionForPath(pathname);
  if (section === null || canSee(access, section)) return null;
  return landingPath(access);
}
