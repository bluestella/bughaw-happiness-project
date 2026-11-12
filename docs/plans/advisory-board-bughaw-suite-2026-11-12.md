# Advisory Board — What Bughaw Suite should build, and in what order

**Convened:** 2026-11-12 · **Tier:** Standard 5 · **Chairman:** Fractional COO (has taken two product startups from first batch to repeat orders)
**Question:** With one founder-developer plus Claude, pre-revenue and fundraising, what should Bughaw Suite build and in what order to become the company's main operations app, starting with selling the first batch?
**Your stated position at intake:** Make this the main application for everything: orders and invoicing, production and inventory, finance, people and interns. Top priority is selling the first batch. The app should issue official BIR invoices. A sale, a pitch and the interns' needs are all due within 2 weeks.

---

## Verdict

Build it as the main app, but in three waves, not at once. **Wave 1 (2 weeks)** is only what turns the first batch into money and keeps interns' hours on record: CRM deal fields, quotations and sales orders, a finished-goods stock count, and an intern daily log with weekly reports. **Wave 2 (weeks 3 to 8)** adds production and R&D records, expenses and cash, intern evaluations, the framework calculators, and monitoring. **Wave 3** adds purchasing, audit history and performance work.

**Do not issue official BIR invoices from the app in Wave 1.** The council overrode your intake answer here. Issue the official invoice from your BIR-registered booklet and record its number against the sales order in the app. Revisit after one conversation with your accountant (see Open questions).

Every new table ships with an automated access test against the real database. That is the hardening, done as you go, not as a separate phase.

**Confidence:** Medium. The sequencing had strong agreement. The BIR call rests on secondary sources and on facts about your tax registration that nobody in the room had.

What the council tried and failed to break: the Dissenter argued the app should not grow at all before the first sale. That lost because a quotation and an order record are part of making the sale, and because interns are already working without an hours record. It won on everything else in Wave 1: no bookkeeping, no production module, no new calculators until a buyer has paid.

## Monday action

| # | Step | Owner | By when |
|---|---|---|---|
| 1 | Ask your accountant the four BIR questions in Open questions | You | Nov 16 |
| 2 | Approve the parallel work plan and the Wave 1 scope | You | Nov 13 |
| 3 | Wave 0: standards, domain model, feature contracts, access-test harness | EA, SA, TE | Nov 14 |
| 4 | Wave 1 build: CRM deal fields, quotes, orders, stock, intern logs | BE, FE, TE | Nov 26 |
| 5 | Set each intern's page access by discipline at `/admin/access` (no code needed) | You | Nov 13 |

## Key findings

| # | Finding | Confidence | Basis |
|---|---|---|---|
| 1 | "Everything in 2 weeks" is not achievable by one reviewer; scope must be cut to the sale path plus intern logging | High | All five seats agreed, by different routes |
| 2 | In-app official invoicing needs BIR system registration first, and the e-invoicing mandate (deadline Dec 31, 2026) may cover businesses using invoicing software; micro taxpayers are exempt from the mandate | Medium | E2, E3; sources are mostly vendor guides and disagree on coverage |
| 3 | "Their discipline's area" for interns needs no new role. Per-person page access (migration 0010) already does it | High | Repo: `/admin/access`, `has_section()` |
| 4 | The CRM and the Pipeline tool hold two versions of the customer. Orders must hang off one account record, so this is decided before the orders schema | High | Repo: `crm_accounts` vs `pipeline_accounts` |
| 5 | There is no "OWASP Top 10 2026". The current list is OWASP Top 10:2025. The app's main exposure is A01 (access control in RLS), where a real bug was already found and fixed in 0008 | High | E1; `docs/security.md` §5.8 |
| 6 | The access rules are tested only against the TypeScript mirror, not the real policies. This is the single highest-value test gap | High | `docs/testing.md` §3.2 |
| 7 | Core Web Vitals targets are LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1 at the 75th percentile. An invite-only app has no public field data, so measure with lab checks in CI plus real-user monitoring; the public card page `/c/<token>` is the one page outsiders load | Medium | E4; reasoning |
| 8 | Several requested "consulting tools" are qualitative frameworks, not calculators. They fit as scored worksheets that end in a verdict; Deloitte has no canonical startup calculator to copy | Medium | Reasoning only |
| 9 | Intern records (hours, evaluations) are personal data under the Data Privacy Act. Registration with the NPC is likely not required at this size, but the duties still apply | Medium | E6; law-firm summaries, not NPC text |

## Decisions the council recommends

**CRM.** Add deal value, expected close date, next action with due date, buyer segment (hotel, resort, spa, other business), lost reason, and sample tracking. Add an overdue-follow-up view. Make the CRM account the one customer record and have the Pipeline tool read from it.

**Orders.** Quotation → sales order → delivery → billing statement, each numbered, each immutable once issued, each printable. Record the official invoice number and payment against the order.

**Inventory.** Wave 1 is one table of finished-goods stock with reservations from sales orders. Raw materials, batches and quality checks wait for Wave 2.

**Interns.** Daily time log, weekly accomplishment report with supervisor approval, deliverables taken from the existing task boards, private evaluations (super_admin only), and a printable hours-and-report summary for the school. No screen or activity tracking.

**Finance.** Expense log, cash position, budget against actual, runway. No double-entry ledger; the accountant keeps the books.

**Calculators and frameworks (Wave 2, in this order).**

| Group | Tools | Type |
|---|---|---|
| Sales | Weighted pipeline forecast, sales velocity, volume price tiers and MOQ, landed cost per delivery | Calculator |
| Fundraising | TAM/SAM/SOM, cap table and dilution, SAFE or convertible note conversion, use-of-funds vs runway, sensitivity (tornado) on unit economics | Calculator |
| Operations | Cash conversion cycle, batch yield and scrap cost, capacity vs demand | Calculator |
| Sustainability | Plastic and carbon avoided per pair and per hotel | Calculator, once you supply the factors |
| Strategy | Porter's Five Forces, Balanced Scorecard, McKinsey Three Horizons, GE-McKinsey nine-box, Bain NPS, Bain RAPID decision roles, Jobs-to-be-Done interview scorer, RICE prioritisation, Sean Ellis product-market-fit test | Scored worksheet |
| Innovation | Technology Readiness Level tracker, stage-gate checklist | Scored worksheet |

**Database standards.** Written once by the Enterprise Architect as `docs/standards/database.md`; summary in the work plan.

**Security, tests, performance.** Mapped to OWASP Top 10:2025, with definitions of done, in the work plan.

## Dissent register

**Chief Dissenter — the app should not grow before the first payment**
> A founder with unsold stock and no revenue is about to spend the selling fortnight reviewing migrations. A quotation is a PDF. One batch of slippers is a number on a whiteboard. Every hour in this plan is an hour not spent in a hotel lobby. Ship nothing but the follow-up reminders and go sell.
>
> **Becomes the right call if:** by Nov 19 fewer than five quotations have gone out, or Wave 1 is less than half done.

**Platform and Security Architect — build the access-test harness before any new table**
> Four new data domains on a rule system that has already had one privilege-escalation bug, with one reviewer, is how the second one ships. Two days of harness first is cheaper than one leak of hotel pricing to an intern.
>
> **Becomes the right call if:** the harness cannot be finished in parallel by the end of Wave 0. Then Wave 1 tables wait for it.

**Startup CFO — official invoicing may never belong in this app**
> Registering and maintaining a home-built invoicing system with the BIR is a recurring compliance cost. A registered low-cost invoicing product linked from the sales order may be permanently better.
>
> **Becomes the right call if:** the accountant confirms Bughaw is covered by the e-invoicing mandate, or quotes more than a few days' effort a year to keep the system registered.

## Kill criteria

- No quotation sent from the app by Nov 26: stop building and review why.
- A Wave 1 access test shows an intern or contractor reading prices, costs or another person's evaluation: freeze features until fixed.
- Interns are not logging hours daily after one week: simplify the log before building evaluations.
- The accountant says in-app sales documents could be mistaken for official invoices: relabel them before the next quote goes out.

## Open questions

| Question | Why it matters | What would resolve it |
|---|---|---|
| Is Bughaw BIR-registered, VAT or non-VAT, and classed as micro (under ₱3M sales)? | Decides whether e-invoicing is mandatory and what an invoice must show | Your accountant; Certificate of Registration |
| Do you already hold a printed, BIR-authorised invoice booklet? | Wave 1 relies on it | Check with accountant |
| Does using an in-app quotation and order system count as a "computerized invoicing system" for coverage? | The disputed point in E3 | Accountant or RDO, against RR 11-2025 text |
| How many interns, which schools, how many required hours, which report and evaluation forms? | Shapes the export formats | The schools' OJT coordinators |
| Which of the three deadlines comes first, and on what date? | Orders the Wave 1 slices | You |
| What are the price tiers, MOQ and lead time for batch one, and how many pairs are in stock? | Needed for quotes and stock | You |
| What emission and plastic factors back the sustainability claim? | Without them the calculator would invent numbers | ChemE interns' test data or a published source |

---

# Appendix A — The council

| Seat | Perspective | Optimizes for | Blind spot |
|---|---|---|---|
| Chief Dissenter | The case that building is avoidance | Founder time spent selling | Undervalues records that compound later |
| PH Hospitality Sales Operator | Has sold amenities into hotel purchasing departments | Speed from enquiry to purchase order | Ignores compliance and security cost |
| Startup CFO / BIR compliance | Ran finance for early-stage PH product companies | Cash, clean books, no penalties | Over-weights compliance against speed |
| Platform and Security Architect | Builds on Postgres row-level security | Integrity of access rules and schema | Under-weights the deadline |
| Intern Supervisor (absent stakeholder) | Speaks for interns and their schools | Fair, signed records interns can hand in | Sees the app only from the intern's side |

**Chairman:** Fractional COO — wrote no first opinion, ranked nothing of its own.

# Appendix B — Council brief (Stage 0)

```
Question: With one founder-developer plus Claude, pre-revenue and fundraising, what
  should Bughaw Suite build and in what order to become the main operations app,
  starting with selling the first batch?
Type: decision
Context lens: Philippines; B2B sustainable coir amenities; buyers are hotels,
  resorts, spas and other businesses; internal invite-only Next.js + Supabase app
Stakes: founder time during the first selling window / Reversibility: scope is
  cheap to change; schema and tax-compliance choices are costly
Deadline: 2 weeks for a sale, a pitch and intern logging
Constraints: one developer with Claude; anon key + RLS only; migrations append-only
User's current position: build all four domains, official BIR invoices in-app,
  sell the first batch first
Already ruled out: service-role key, public share links, editing shipped migrations
Success criteria: a sequenced scope, standards, and a plan five roles can run in parallel
Out of scope: marketing site, pricing strategy, the fundraising narrative itself
Smuggled assumptions: that one app should do everything; that in-app invoicing is
  only a feature; that "OWASP 2026" exists; that "perfect" tests is definable;
  that all three deadlines are equally hard
```

# Appendix C — Evidence pool

| Tag | Claim | Source | Strength |
|---|---|---|---|
| E1 | Current list is OWASP Top 10:2025: Broken Access Control first, Security Misconfiguration second, new categories for Software Supply Chain Failures and Mishandling of Exceptional Conditions | [OWASP](https://owasp.org/Top10/2025/0x00_2025-Introduction/), [Qualys](https://blog.qualys.com/qualys-insights/2026/06/15/what-changed-in-owasp-top-10-2025-and-recommendations-for-each-category), [The Register](https://www.theregister.com/2025/11/11/new_owasp_top_ten_broken/) | strong on categories, mixed on exact numbering |
| E2 | A computerized accounting or invoicing system must be registered with the RDO (Acknowledgement Certificate, about three working days once documents are complete) and meet BIR technical standards | [PwC tax alert on RMC 5-2021](https://www.pwc.com/ph/en/tax/tax-publications/tax-alerts/2021-tax-alerts/tax-alert-8.html), [ClearTax](https://www.cleartax.com/ph/bir-cas-registration) | mixed |
| E3 | Covered taxpayers must issue electronic invoices by Dec 31, 2026; micro taxpayers are not covered; whether users of invoicing software are covered is disputed between guides | [BIR press release, Sep 23 2026](https://bir-cdn.bir.gov.ph/BIR/pdf/PR101SEP2326.pdf), [Taxumo](https://www.taxumo.com/blog/bir-einvoice-requirement/), [Orkids](https://orkids.ph/guides/bir-eis-e-invoicing) | mixed |
| E4 | Core Web Vitals "good": LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1 at the 75th percentile | [corewebvitals.io](https://corewebvitals.io/core-web-vitals) and other secondary guides | strong on values, secondary sources |
| E5 | PH internships run under CHED CMO 104 s. 2017; schools expect signed weekly reports, a supervisor evaluation and a certificate of completion; required hours vary by programme | [USTP internship manual](https://www.ustp.edu.ph//wp-content/uploads/2020/06/Internship-Manual_25Jan19-1.pdf), [Mapua evaluation form](https://fs2.mapua.edu.ph/MapuaWebsite/Downloads/For%20Companies/ICEP/ICEP-OJT-05A-03%20Performance%20Evaluation%20Form%20-%20ABET%20Accredited%20Programs.pdf) | thin for Chemical Engineering specifically |
| E6 | NPC registration applies at 250 employees or sensitive data of 1,000 people; smaller controllers still owe Data Privacy Act duties, including breach notice in 72 hours | [Baker McKenzie](https://insightplus.bakermckenzie.com/bm/data-technology/philippines-new-npc-circular-on-registration-of-data-protection-officers-and-data-processing-systems-takes-effect_1), [Mondaq](https://www.mondaq.com/privacy-protection/1363568/employee-data-protection-in-philippines) | mixed |
| E7 | Repo: RLS is the only enforcement layer; RLS integration tests are missing; one E2E spec exists; no error tracking, audit log or rate limiting; a privilege-escalation bug was fixed in 0008 | `docs/security.md`, `docs/testing.md` | strong |
| E8 | Repo: 15 calculators across four categories plus a funding tool; per-person section access exists | `src/lib/calculators/configs`, migration 0010 | strong |

**Gaps:** Bughaw's tax registration status; the RR 11-2025 text; the interns' schools and required hours; batch size, price and stock; whether any hotel has asked for a quote.

# Appendix D — First opinions (Stage 1)

### Chief Dissenter
**Position:** Build almost nothing; the request is avoidance of selling.
Pre-revenue with stock on hand, the only scarce thing is the founder's selling hours. Four operational domains plus hardening is months of work for a team, and the founder is also the only reviewer. One batch needs no inventory system. Books belong to an accountant. A home-built BIR invoicing system is a compliance liability taken on to avoid buying a booklet.
**Evidence:** E2, E3, E7.
**Strongest objection to own position:** Without a shared record, follow-ups get dropped and interns' hours go unrecorded, which costs sales and goodwill.
**Would change mind if:** A buyer is waiting on a document the app could produce.

### PH Hospitality Sales Operator
**Position:** Build the quote-to-order path on top of the CRM now; nothing else moves the first batch.
Purchasing officers want a formal quotation with price tiers, minimum order, lead time, validity and terms, then a sample, then a purchase order. Deals die in the gap between sample and follow-up. The CRM has stages but no deal value, no next-action date, no sample record and no segment for non-hotel buyers. Two customer lists (CRM and Pipeline) will confuse whoever sends the quote.
**Evidence:** E8; otherwise reasoning from experience.
**Strongest objection to own position:** A spreadsheet template would produce the first three quotations today.
**Would change mind if:** Fewer than five live prospects exist, in which case tooling is premature.

### Startup CFO / BIR compliance
**Position:** Track money in the app; do not make the app the official invoicing system yet.
An invoicing system must be registered before use, and the e-invoicing mandate lands Dec 31 with unclear coverage for software users. Micro taxpayers are exempt, which Bughaw probably is. Use the registered booklet, store the invoice number on the order. For fundraising, investors need cash position, runway and unit economics that tie to real orders, not more models.
**Evidence:** E2, E3.
**Strongest objection to own position:** Sources are vendor blogs; the accountant may say registration is trivial.
**Would change mind if:** The accountant confirms a simple registration and no e-invoicing coverage.

### Platform and Security Architect
**Position:** Foundations first: one customer entity, schema standards and an access-test harness, then features.
Every new table is new policy surface, and policies are only tested against a TypeScript mirror. The 0008 bug shows the failure mode. Orders need a single account record, so the CRM and Pipeline split must be settled. Intern access by discipline already exists as data. "OWASP 2026" is OWASP Top 10:2025. Performance needs measurement before targets.
**Evidence:** E1, E4, E7, E8.
**Strongest objection to own position:** Foundations-first can consume the whole two weeks.
**Would change mind if:** The harness can be built in parallel without blocking feature work.

### Intern Supervisor (absent stakeholder)
**Position:** Interns need a signed record of hours and weekly reports now; everything else can wait.
Their grade depends on documented hours and a supervisor-signed report. They are working today. Deliverables are already on task boards. Evaluations must be private. Monitoring should mean reviewed output, not surveillance. These records are personal data.
**Evidence:** E5, E6.
**Strongest objection to own position:** A shared spreadsheet covers hours for a handful of interns.
**Would change mind if:** The schools require their own paper forms regardless.

# Appendix E — Rebuttal and revision (Stage 1.5)

**Rebuttals**
- **Chief Dissenter → Architect:** "Foundations first" is the most respectable form of not selling. Name the days.
- **Sales Operator → Dissenter:** A founder emailing ad hoc PDFs to purchasing departments looks like a hobby. The document is part of the sale.
- **CFO → Sales Operator:** A "billing statement" that looks like an invoice invites a penalty. Label and number it distinctly.
- **Architect → Sales Operator:** Quotes built on the current two-list customer model will need a rewrite within a month.
- **Intern Supervisor → Architect:** Interns cannot wait for foundations; hours unlogged this week are hours a school may not credit.

**Revisions**
- **Chief Dissenter:** REVISED — from "build nothing" to "build only the quote, order and follow-up path and the hours log", because the document is part of the sale.
- **Sales Operator:** REVISED — accepts one customer record first and clearly labelled non-invoice documents.
- **CFO:** HELD — nothing challenged the registration risk.
- **Architect:** REVISED — from "harness before features" to "harness in parallel during Wave 0, and a hard gate on each new table".
- **Intern Supervisor:** HELD — but accepts evaluations moving to Wave 2.

# Appendix F — Anonymized peer review (Stage 2)

**Aggregate ranking**

| Response | Seat | Ranks received | Mean | Final |
|---|---|---|---|---|
| A | Startup CFO | 1, 1, 2, 1, 3 | 1.6 | 1st |
| E | Sales Operator | 2, 2, 1, 3, 1 | 1.8 | 2nd |
| C | Chief Dissenter | 3, 3, 3, 5, 5 | 3.8 | 3rd (tie) |
| D | Architect | 5, 4, 4, 2, 4 | 3.8 | 3rd (tie) |
| B | Intern Supervisor | 4, 5, 5, 4, 2 | 4.0 | 5th |

**Flags:** Reciprocal last-place between C and D (sell first against foundations first). This is the real fault line and the verdict resolves it by running the harness in parallel as a gate. No unanimity. The tie was left standing.

**Critiques (condensed)**

- **Response A:** Most decision-changing, since it overturns an intake answer. Flaw: rests on vendor guides and an unverified guess that Bughaw is a micro taxpayer.
- **Response E:** Concrete about what a buyer needs. Flaw: no evidence in the pool for the buying process; all experience claims.
- **Response C:** Correct about founder time. Flaw: after revision it is close to E, and it gives no way to measure "selling enough".
- **Response D:** Only response grounded in the repo. Flaw: no day estimates, and it treats security risk as certain rather than sized.
- **Response B:** Speaks for people nobody else did. Flaw: concedes a spreadsheet would work and does not say why the app is better.

Rankings by reviewer (order: Dissenter, Sales, CFO, Architect, Supervisor): A 1,1,2,1,3 · B 4,5,5,4,2 · C 3,3,3,5,5 · D 5,4,4,2,4 · E 2,2,1,3,1.

# Appendix G — Method

Adapted from Andrej Karpathy's LLM Council (github.com/karpathy/llm-council): independent first opinions, anonymized peer review ranked on accuracy and insight, and Chairman synthesis. Run here as domain-adaptive seats inside a single Claude session rather than across multiple models, which removes model diversity as a source of independent error. Treat the output as a structured argument to interrogate, not as a verdict from independent authorities.
