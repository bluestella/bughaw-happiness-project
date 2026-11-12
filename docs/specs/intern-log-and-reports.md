# Spec — Intern daily log and weekly reports

**Wave:** 1 (evaluations and school export formats: Wave 2) · **Migrations:** 0015, 0019 · **Section:** `people` · **Status:** draft for owner review
Follows [standards/database.md](../standards/database.md) and
[decision 0003](../standards/decisions/0003-interns-use-contractor-role.md).

## Why

Interns from Chemical Engineering, Marketing and Graphics are working now. Their
schools credit only documented hours and supervisor-signed reports. The owner
needs to see what each intern did without chasing them.

## Principles

- Monitoring means reviewed output: hours the intern enters, tasks they completed,
  reports the supervisor approved. No screen, location or activity tracking.
- An intern sees only their own records. Evaluations are private.
- These are personal data. Collect only what the school and supervision need.

## User stories

1. As an intern, I log each work day: hours, what I did, which tasks it relates to.
2. As an intern, I see my hours so far against the hours my school requires.
3. As an intern, I submit a weekly report built from my daily entries, add
   learnings and blockers, and get it approved or returned with a comment.
4. As a supervisor, I see a queue of submitted reports and approve or return each.
5. As the owner, I see every intern's hours, approval status and completed tasks
   for a week on one page.
6. As an intern, I print an approved weekly report and an hours summary to hand to my school.

## Data

**`people_interns`** — profile, one per intern (super_admin manages).
`email` → `allowed_emails` (unique), `full_name`, `discipline` (`'chemical_engineering','marketing','graphics','other'`), `school`, `program`, `required_hours` integer, `starts_on`, `ends_on`, `supervisor_email` → `allowed_emails`, `is_active`.

**`people_daily_logs`**
`intern_email`, `work_date` date, `hours` numeric(4,2) with `check (hours > 0 and hours <= 12)`, `summary` text (max 1000), `task_ids uuid[]`, `weekly_report_id` nullable. Unique `(intern_email, work_date)`.

**`people_weekly_reports`**
`intern_email`, `week_start` date (a Monday; unique with `intern_email`), `status` (`'draft','submitted','approved','returned'`), `accomplishments`, `learnings`, `blockers`, `next_week_plan`, `total_hours` (computed by trigger from the week's logs), `submitted_at`, `reviewed_by_email`, `reviewed_at`, `review_comment`.

Wave 2 adds `people_evaluations` (mid-term and final, criteria scores, comments,
`shared_with_intern_at`) and discipline deliverable summaries.

## Rules enforced in the database

- `intern_email` is set from the session; an intern cannot write a row for someone else.
- A log can be created or edited only for a `work_date` within the last 7 days and
  not in the future. Older corrections go through the supervisor.
- Logs inside a `submitted` or `approved` week are read-only. Returning the report
  unlocks them.
- Transitions: `draft → submitted` (intern); `submitted → approved | returned`
  (supervisor or super_admin); `returned → submitted` (intern). Approved is final.
- A reviewer cannot approve their own report.

## Access

| | Intern (own rows) | Supervisor (their interns) | super_admin | Others with `people` | No `people` |
|---|---|---|---|---|---|
| Read profile | ✅ | ✅ | ✅ | ❌ | ❌ |
| Create/edit daily log | ✅ (rules above) | ❌ | ✅ | ❌ | ❌ |
| Read logs and reports | ✅ | ✅ | ✅ | ❌ | ❌ |
| Submit weekly report | ✅ | ❌ | ❌ | ❌ | ❌ |
| Approve or return | ❌ | ✅ | ✅ | ❌ | ❌ |
| Manage profiles | ❌ | ❌ | ✅ | ❌ | ❌ |

Role defaults for `people`: member allowed, contractor allowed. The section only
opens the pages; row rules decide what is visible.

## Deliverables

Wave 1 reuses task boards. A weekly report lists tasks the intern moved to Done
that week (read through existing task access) and tasks linked from daily logs.
Discipline-specific measures wait for Wave 2 and for the owner to say what they are:

| Discipline | Candidate measures (not decided) |
|---|---|
| Chemical Engineering | Experiments run, test results recorded, batches checked |
| Marketing | Leads added, follow-ups completed, content published |
| Graphics | Assets delivered, revision rounds per asset |

## Pure logic (`src/lib/people.ts`, unit-tested)

- `weekStart(date)` — Monday of that week, timezone Asia/Manila
- `hoursProgress(logs, requiredHours)` — total, remaining, percent; 0 when required is 0
- `canEditLog(workDate, today, weekStatus)`
- `canTransitionReport(from, to, actor)`
- `draftAccomplishments(logs)` — joins the week's summaries into a starting text

## Screens

- `/people/my-log` — week grid, add or edit a day, progress against required hours
- `/people/my-reports` — list, editor, submit, print
- `/people/review` — supervisor queue
- `/people/overview` — owner's week view of all interns (super_admin and supervisors)
- `/people/interns` — profiles (super_admin)

## Acceptance

- [ ] Intern A cannot read or write intern B's logs or reports (access test).
- [ ] An intern cannot approve any report, including their own.
- [ ] A log dated 8 days ago is refused; today's is accepted; tomorrow's is refused.
- [ ] Submitting a report locks that week's logs; returning unlocks them.
- [ ] `total_hours` equals the sum of the week's logs after any edit.
- [ ] Printed weekly report shows intern, school, week, hours per day, text sections,
      reviewer name and approval date.
- [ ] A member who is not a supervisor sees no intern records.

## Needs from the owner before build

Each intern's name, email, discipline, school, programme, required hours, start and
end dates and supervisor; and each school's report and evaluation form if one is
mandated.

## Data Privacy Act note

Purpose: supervision and school crediting. Retention: until one year after the
internship ends, then delete on request or archive. Access: the intern, their
supervisor, super_admins. Interns are told what is recorded when they are invited.
