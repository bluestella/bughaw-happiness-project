# 0003 — Interns use the contractor role plus per-person page access

**Date:** 2026-11-12 · **Status:** proposed (board recommendation; owner has not confirmed)

## Decision

No fourth role. An intern is a `contractor` on the allowlist with a
`people_interns` profile row (discipline, school, required hours, supervisor). What
each intern can see is set per person at `/admin/access`, which migration 0010
already enforces in routing, navigation and RLS.

Suggested starting access by discipline:

| Discipline | Sections allowed on top of the contractor defaults |
|---|---|
| Marketing | `crm` |
| Chemical Engineering | `tool:cost-calculator`; `production` when it exists |
| Graphics | none (task boards only) |
| All interns | `people` (their own log and reports) |

## Why

A role is a permission tier; a discipline is a set of pages. The second already
exists as data. A fourth role would touch every policy and the permission matrix
for no gain.

## Consequences

- Within `people`, RLS narrows further: an intern reads and writes only their own
  logs and reports; the supervisor and super_admins read all; evaluations are
  super_admin only until shared.
- Giving a Marketing intern `crm` shows them every lead. The CRM has no per-row
  ownership rule, and this decision does not add one.
- If interns ever need a permission no contractor should have, this is reopened.
