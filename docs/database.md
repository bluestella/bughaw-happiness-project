# Database

> Schema, RLS matrix, and migration rules. Source of truth:
> [`supabase/migrations/`](../supabase/migrations/). Security rationale in
> [security.md](security.md).

## 1. Migration rules

- Migrations are **numbered, append-only**: `0001_init.sql`, `0002_task_management.sql`.
  Next change = `0003_<slug>.sql`. Never edit a shipped migration.
- Run order matters (0002 alters tables from 0001). Apply via Supabase SQL editor or
  `supabase db push`.
- Every new table in the same migration must get: `enable row level security` +
  explicit policies + any indexes for its FK/lookup columns.
- Both existing migrations contain **operator-editable seed/role sections**
  (allowlist inserts, super_admin assignment) — flag this when giving setup
  instructions.

## 2. Schema overview

### Auth & roles (0001 + 0002)

```
allowed_emails (email PK, note, added_at, role app_role DEFAULT 'member')
  ├─ RLS enabled, NO policies → service-role/dashboard only
  ├─ role enum: 'super_admin' | 'member' | 'contractor'
  └─ read path for clients: RPC current_user_role() (security definer)

trigger enforce_signup_allowlist  BEFORE INSERT ON auth.users
  └─ rejects any email not in allowed_emails (covers password AND OAuth signups)
```

### Shared workspace (0001) — flat team data, no roles

```
pipeline_accounts   # hotel CRM rows: name, property, segment A|B,
                    # stage (Warm Contact → … → Repeat Order | Disqualified),
                    # contact, notes, reason, referred_by, generated_referral
app_state           # key text PK, value jsonb — shared JSON docs (tools state)
saved_calculations  # calculator_id, label, inputs jsonb, outputs jsonb,
                    # created_by uuid, created_by_email
```

0001 also seeds `pipeline_accounts` with the real July 2026 hotel pipeline.

### Task management (0002)

```
projects                 (id, name, description, created_by_email, timestamps)
mini_projects            (project_id FK cascade, …)
project_contributors     (project_id, user_email) PK — grant, inherits downward
mini_project_contributors(mini_project_id, user_email) PK — scoped grant
tasks                    (mini_project_id FK cascade, title, description,
                          status 'To Do'|'In Progress'|'Done',
                          priority 'Low'|'Medium'|'High',
                          due_date, assignee_email,
                          position float  ← fractional ordering,
                          created_by_email)
task_comments            (task_id FK cascade, body, author_email) — append-only
```

All `created_by_email` / `added_by_email` / `author_email` columns default to
`auth.jwt() ->> 'email'` — set by the DB, not the client.

## 3. SQL functions (all `security definer`, `set search_path = public`, granted to `authenticated`)

| Function | Returns | Purpose |
|---|---|---|
| `current_user_role()` | `app_role` | Role of the caller's JWT email; the only way clients read `allowed_emails` |
| `has_project_access(uuid)` | bool | Caller is a `project_contributors` row (email, case-insensitive) |
| `has_mini_project_access(uuid)` | bool | Direct mini-project contributor OR contributor on the parent project |

`security definer` is required because these read tables the caller cannot see;
`set search_path = public` prevents search-path hijacking. Keep both on any new
helper.

## 4. RLS policy matrix

### Workspace tables (0001) — role-blind

| Table | select | insert | update | delete |
|---|---|---|---|---|
| pipeline_accounts | any authenticated | any | any | any |
| app_state | any | any | any | any |
| saved_calculations | any | any | **no policy → denied** | any |

Note: `saved_calculations` has no update policy on purpose — saved runs are
immutable snapshots (re-save instead). Contractors *can* reach these tables at the
API level even though the routes are blocked — see [security.md](security.md) §5.

### Task tables (0002)

Legend: SA = super_admin, M = member, C = contractor; "access" = the relevant
`has_*_access()` check.

| Table | select | insert | update | delete |
|---|---|---|---|---|
| projects | SA, or access | SA | SA | SA |
| mini_projects | SA, or access | SA, or M+project access | SA, or M+access | SA |
| project_contributors | SA, or access | SA, or M+access | — | SA |
| mini_project_contributors | SA, or access | SA, or M+access | — | SA |
| tasks | SA, or access | SA, or access (any role) | SA; M+access; C+access+own | same as update |
| task_comments | SA, or access via parent task | same | **none** | **none** |

"Own" for contractors = `lower(created_by_email) = lower(auth.jwt()->>'email')`.

These policies are mirrored (UI-only) by `src/lib/permissions.ts` and asserted in
`tests/unit/permissions.test.ts`. **Change all three together.**

## 5. Design notes & invariants

- **Identity is email, not uuid**, for grants and ownership — chosen so grants can be
  issued before the invitee has signed up. Consequence: always compare with
  `lower()`; a changed auth email changes effective permissions.
- **Grants don't validate against the allowlist** — adding a contributor email that
  was never invited is legal and inert. Known gap; fix would be an FK or trigger
  against `allowed_emails`.
- **Cascade deletes** flow project → mini_projects → tasks → task_comments. Deleting
  a project is maximally destructive and correctly restricted to super_admin (UI
  double-confirms).
- **`tasks.position` is `double precision`** — midpoint insertion can exhaust float
  precision after ~50 consecutive same-slot insertions in theory; if it ever
  matters, add a renormalization pass, don't change the drag-write model.
- Indexes exist on every FK/lookup path (`mini_projects.project_id`, contributor
  emails, `tasks(mini_project_id, status)`, `task_comments.task_id`). Match this for
  new tables.
