# Spec — CRM deal fields and follow-ups

**Wave:** 1 · **Migration:** 0014 · **Section:** `crm` · **Status:** built 2026-11-12 (see "As built" at the end)
Follows [standards/database.md](../standards/database.md) and
[decision 0002](../standards/decisions/0002-one-customer-record.md).

## Why

The funnel shows where a lead is but not what it is worth, what happens next, or
when. Deals are lost between the sample and the follow-up.

## User stories

1. As a seller, I record what a deal is worth and when I expect it to close.
2. As a seller, I set the next action and its due date, and see everything overdue
   in one list.
3. As a seller, I record that a sample went out and whether the buyer responded.
4. As the owner, I see why deals were lost.
5. As a seller, I classify a buyer as hotel, resort, spa or other business.

## Data

`crm_accounts` — add:

| Column | Type | Rule |
|---|---|---|
| `segment` | text, nullable | `check (segment in ('hotel','resort','spa','other_business'))`. Backfill `'hotel'` where `kind = 'hotel'`; leave others NULL. `kind` stays for the ingest function. |

`crm_leads` — add (all nullable):

| Column | Type | Rule |
|---|---|---|
| `deal_value` | numeric(14,2) | `>= 0` |
| `expected_close_on` | date | |
| `next_action` | text | max 200 chars |
| `next_action_due_on` | date | required when `next_action` is set |
| `sample_sent_on` | date | |
| `sample_feedback_on` | date | `>= sample_sent_on` |
| `lost_reason` | text | `check (lost_reason in ('price','timing','no_response','chose_competitor','not_a_fit','other'))`; required when status is `Closed Lost` (trigger), cleared otherwise |

`pipeline_accounts` — add `crm_account_id uuid references crm_accounts(id) on delete set null`, indexed. Backfill on exact case-insensitive name match.

Index: `crm_leads (next_action_due_on) where next_action_due_on is not null`.

## Behaviour

- Changing any new field writes a `crm_lead_activities` row, like status changes do today.
- Moving a card to Closed Lost opens a reason picker; cancelling it cancels the move.
- **Follow-ups view:** open leads with `next_action_due_on <= today`, oldest first,
  plus "due this week". Open means not Closed Won or Closed Lost.
- Board cards show deal value and an overdue marker.
- Funnel header shows the open pipeline total and a weighted total. Stage weights
  are a constant in `src/lib/crm.ts` (New 5%, Acknowledged 10%, Qualified 30%,
  Pilot Scoping 60%); these are placeholders for the owner to set.
- CSV export and import include the new columns.

## Access

Unchanged: anyone with `crm` reads and writes; delete is super_admin only.

## Pure logic (unit-tested in `src/lib/crm.ts`)

- `isOverdue(lead, today)`, `followUpBuckets(leads, today)`
- `weightedPipeline(leads, weights)` returns 0 for empty input, never `NaN`
- validation for the new fields, mirroring the check constraints

## Acceptance

- [ ] A lead cannot be saved as Closed Lost without a reason (database refuses, UI prevents).
- [ ] A next action without a due date is refused.
- [ ] Follow-ups view lists an overdue lead and drops it when the date moves forward.
- [ ] Contractor without `crm` cannot read the new columns (access test).
- [ ] Existing ingest and import paths still pass their tests.

## As built (2026-11-12)

Differences from the text above:

- **CSV import does not read the new columns.** Import goes through the same
  normalisation as the website forms, which has no deal fields. Export includes
  them. Importing deals is left for when someone has a file that needs it.
- **Dropping a card on Closed Lost** puts the card back and opens the lead panel
  with the reason prompt, instead of a separate picker dialog.
- **Deal edits are logged as one `system` activity** listing what changed. Segment
  changes are not logged, because the segment belongs to the account, not the lead.
- **Existing Closed Lost leads were given the reason `other`** by the migration so
  later edits to them are not refused.
- A due date without a next action is allowed (the database allows it too).
- Proof: `tests/unit/crmDeals.test.ts`, `tests/integration/access/crm-rules.itest.ts`,
  `tests/e2e/specs/crm-deals.spec.ts`.
