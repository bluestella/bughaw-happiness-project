# BUGHAW CALCULATORS HUB — Implementation Plan

**Project Goal:** Consolidate existing artifact calculators (CAC/LTV + others) into a unified web application deployable to Vercel, plus 9 new hospitality-focused calculators.

**Target Users:** Founders/operators, sales & business dev, investors  
**Tech Stack:** React 18 + TypeScript + Next.js 14 + Tailwind CSS 3 + Vercel  
**Phasing:** MVP (Weeks 1-4) → Phase 2 New Calculators (Weeks 5-10) → Phase 3 Advanced Features (Weeks 11+)

---

## 0. LOCKED DECISIONS (2026-07-19)

| Decision | Choice |
|----------|--------|
| Database | **Supabase (Postgres)** — replaces localStorage-only plan |
| Auth | **Supabase Auth, login required for the entire app** (internal tool) |
| Signups | **Invite-only** via `allowed_emails` table, enforced by a DB trigger on `auth.users` |
| Data model | **Shared team workspace** — all authenticated users read/write the same data (RLS: authenticated-only) |
| Currency | **PHP (₱), en-PH locale everywhere** |
| Design | **One unified design system** — cream/paper background, coir-green primary, clay accent (from the Unit Cost Calculator) |
| Build scope | Everything in one pass: 9 new calculators + 4 migrated existing apps |

### Existing apps to migrate (found in repo root as HTML artifacts)

1. `bughaw_cost_calculator.html` — **Unit Cost Calculator**: ingredient/equipment cost table, unit conversions (g/kg/mL/L/pcs), equipment amortization, cost per run → cost per pair. State moves from artifact storage to Supabase (shared team doc).
2. `bughaw_slipper_unit_economics_simulator.html` — **Unit Economics Simulator**: slider-driven per-pair contribution, hotel CAC, LTV, LTV:CAC, payback, 30% margin go/no-go gate. This is the "legacy CAC/LTV calculator" referenced below.
3. `bughaw_p2_slipper_pnl_machine.html` — **P&L Machine**: 12-month P&L with compounding growth, breakeven month/pairs, year-1 cumulative. Chart.js → Recharts.
4. `bughaw_pipeline_simulator.html` — **Pipeline mini-app (CRM)**: kanban pipeline tracker with real hotel accounts, scenario simulator with hypothetical leads, disqualified graveyard, derived CAC/LTV tab. Gets first-class Supabase tables (`pipeline_accounts` + shared state), not calculator state.

These live under `/tools/*` in the app; the 9 formula calculators live under `/calculators/[category]/[id]`.

---

## 1. FEATURE SCOPE

### MVP (Phase 1): Consolidate Existing Apps
- CAC/LTV Calculator (migrated from artifacts)
- Other existing calculators (to be specified)
- Single navigation entry point
- Unified styling & layout
- Basic export (CSV/JSON)
- Local storage persistence

### Phase 2: Core Hospitality Calculators (Recommended)

#### Unit Economics (3 calculators)
- **COGS % Calculator** — Cost of goods sold as % of revenue
- **Wholesale Margin Calculator** — Hotel purchase price vs retail comparison
- **Payback Period Calculator** — When does customer ROI justify investment

#### Sales & Go-to-Market (3 calculators)
- **Hotel Penetration Rate** — % of target hotels acquired
- **Repeat Order Rate Calculator** — Frequency of reorders per hotel
- **Break-Even by Channel** — Profitability comparison (direct vs partnerships vs resellers)

#### Product Management (2 calculators)
- **Inventory Turnover Ratio** — How fast products move through inventory
- **Product Mix Margin Analysis** — Margin by product type (slippers, organizers, utilities)

#### Financial Forecasting (3 calculators)
- **Customer LTV by Hotel Segment** — Tiered by hotel size/region
- **Cash Flow Projection** — Monthly/quarterly forecast
- **Growth Scenario Modeling** — Sensitivity analysis on key variables

### Phase 3: Enhancements
- User accounts & saved calculations (optional for public tool)
- Benchmarking against hospitality industry norms
- Advanced visualizations (waterfall diagrams, scenario charts)
- API for third-party integrations

---

## 2. TECH STACK RECOMMENDATION

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Framework | React 18.2+ | Component reusability, TypeScript support, rich ecosystem |
| Language | TypeScript 5.x | Type safety, better DX, catches bugs at build time |
| Framework | Next.js 14 (App Router) | File-based routing, built-in optimization, Vercel integration |
| Styling | Tailwind CSS 3.x | Utility-first, fast iteration, consistent design system |
| State Mgmt | React Context + useReducer → Zustand (Phase 2) | Start simple, scale as needed |
| Forms | React Hook Form + Zod | Lightweight, zero dependencies, great validation |
| Charts | Recharts | React-native, lightweight, easy integration |
| Export/Share | js-yaml, papaparse, jsPDF | Lightweight, no backend required |
| Deployment | Vercel | Native Next.js support, auto-scaling, analytics |
| Testing | Vitest + React Testing Library | Fast, intuitive, modern tooling |
| Linting | ESLint + Prettier | Code quality, consistency across team |

---

## 3. NAVIGATION & INFORMATION ARCHITECTURE

### URL Structure (Next.js App Router)

```
/                                  → Landing page with calculator grid
/calculators                        → Calculator hub (directory)
/calculators/unit-economics/cogs    → COGS % Calculator
/calculators/unit-economics/margin  → Wholesale Margin Calculator
/calculators/unit-economics/payback → Payback Period Calculator
/calculators/go-to-market/penetration → Hotel Penetration Rate
/calculators/go-to-market/repeat-order → Repeat Order Rate
/calculators/go-to-market/breakeven    → Break-Even by Channel
/calculators/product-mgmt/inventory    → Inventory Turnover
/calculators/product-mgmt/mix-margin   → Product Mix Margin
/calculators/financial/ltv-segment     → Customer LTV by Segment
/calculators/financial/cash-flow       → Cash Flow Projection
/calculators/financial/growth-scenario → Growth Scenario Modeling
/calculators/legacy/cac-ltv            → CAC/LTV (existing)
/results/[shareId]                     → Shared result view (public link)
```

### Information Architecture (Sidebar Navigation)

```
Bughaw Calculators Hub
├── Home & Dashboard
├── Unit Economics
│   ├── COGS % Calculator
│   ├── Wholesale Margin
│   └── Payback Period
├── Go-to-Market
│   ├── Hotel Penetration Rate
│   ├── Repeat Order Rate
│   └── Break-Even by Channel
├── Product Management
│   ├── Inventory Turnover
│   └── Product Mix Margin
├── Financial Forecasting
│   ├── Customer LTV by Segment
│   ├── Cash Flow Projection
│   └── Growth Scenario Modeling
└── Legacy (Archived)
    └── CAC/LTV
```

---

## 4. DIRECTORY STRUCTURE

```
bughaw-calculators/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── layout.tsx                # Root layout, nav wrapper
│   │   ├── page.tsx                  # Home/dashboard
│   │   ├── calculators/
│   │   │   ├── layout.tsx            # Calculator layout (sidebar nav)
│   │   │   ├── page.tsx              # Calculator grid/directory
│   │   │   ├── [category]/
│   │   │   │   ├── page.tsx          # Category landing
│   │   │   │   └── [calculatorId]/
│   │   │   │       ├── page.tsx      # Calculator interface
│   │   │   │       └── loading.tsx   # Skeleton/loader
│   │   └── results/
│   │       └── [shareId]/
│   │           └── page.tsx          # Shared result view
│   │
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Header.tsx            # Top navigation
│   │   │   ├── Sidebar.tsx           # Category navigation
│   │   │   ├── Footer.tsx            # Footer with links
│   │   │   └── MobileNav.tsx         # Mobile menu
│   │   │
│   │   ├── calculators/
│   │   │   ├── CalculatorWrapper.tsx # Main calculator container
│   │   │   ├── InputForm.tsx         # Generic form builder
│   │   │   ├── ResultsCard.tsx       # Results display
│   │   │   ├── ExportMenu.tsx        # CSV/JSON/PDF export
│   │   │   ├── ShareButton.tsx       # Generate shareable link
│   │   │   └── calculators/          # Individual calculator UIs
│   │   │       ├── CogsCalculator.tsx
│   │   │       ├── MarginCalculator.tsx
│   │   │       ├── PaybackCalculator.tsx
│   │   │       └── ... (others)
│   │   │
│   │   ├── common/
│   │   │   ├── Card.tsx
│   │   │   ├── Button.tsx
│   │   │   ├── InputField.tsx
│   │   │   ├── CurrencyInput.tsx
│   │   │   ├── PercentageInput.tsx
│   │   │   ├── Chart.tsx             # Recharts wrapper
│   │   │   ├── MetricBox.tsx         # KPI display
│   │   │   └── TooltipIcon.tsx       # Hover help text
│   │   │
│   │   └── home/
│   │       ├── HeroSection.tsx
│   │       ├── CalculatorGrid.tsx
│   │       └── FeaturedCalculators.tsx
│   │
│   ├── lib/
│   │   ├── calculators/              # Business logic & formulas
│   │   │   ├── types.ts              # Shared types
│   │   │   ├── cogsCalculator.ts
│   │   │   ├── marginCalculator.ts
│   │   │   ├── paybackCalculator.ts
│   │   │   └── ... (others)
│   │   │
│   │   ├── utils/
│   │   │   ├── formatting.ts         # Number, currency formatting
│   │   │   ├── validation.ts         # Input validation
│   │   │   ├── export.ts             # CSV/JSON/PDF generation
│   │   │   ├── storage.ts            # Local storage helpers
│   │   │   └── analytics.ts          # Event tracking
│   │   │
│   │   ├── hooks/
│   │   │   ├── useCalculator.ts      # Generic calculator hook
│   │   │   ├── useLocalStorage.ts    # Persist state
│   │   │   ├── useShare.ts           # Share link generation
│   │   │   └── useExport.ts          # Export handling
│   │   │
│   │   └── config/
│   │       ├── calculators.config.ts # Metadata for all calculators
│   │       ├── categories.ts         # Category definitions
│   │       └── constants.ts          # Global constants
│   │
│   ├── context/
│   │   ├── CalculatorContext.tsx     # Global calculator state
│   │   └── ThemeContext.tsx          # Light/dark mode
│   │
│   ├── types/
│   │   ├── calculator.ts             # Core types
│   │   ├── inputs.ts                 # Input field types
│   │   └── api.ts                    # API response types
│   │
│   └── styles/
│       ├── globals.css               # Tailwind imports
│       └── theme.css                 # CSS variables
│
├── public/
│   ├── icons/
│   ├── logos/
│   └── og-image.png
│
├── tests/
│   ├── unit/
│   │   └── calculators/              # Formula tests
│   └── integration/
│       └── e2e-scenarios.test.ts
│
├── .env.local                        # Git-ignored
├── .env.example                      # Template
├── next.config.js                    # Next.js optimization
├── tsconfig.json                     # TypeScript config
├── tailwind.config.js                # Tailwind config
├── package.json                      # Dependencies
└── vercel.json                       # Deployment config
```

---

## 5. CORE TYPES & DATA STRUCTURES

### CalculatorConfig (Master Type)

```typescript
interface CalculatorConfig {
  id: string;                    // Unique slug (e.g., 'cogs-percentage')
  name: string;                  // Display name
  description: string;           // One-liner for grid
  category: CalculatorCategory;  // 'unit-economics' | 'go-to-market' | ...
  icon: string;                  // Emoji or icon name
  inputGroups: InputGroup[];     // Form sections
  formulas: Formula[];           // Calculation logic
  outputs: OutputDefinition[];   // Result fields
  sharing: boolean;              // Allow share links
  exporting: boolean;            // Allow export
  onboardingHint?: string;       // Help text
}

interface InputField {
  id: string;
  label: string;
  type: 'currency' | 'number' | 'percentage' | 'text' | 'select';
  required: boolean;
  defaultValue?: number | string;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;                 // '$', '%', 'units'
  helpText?: string;
}

interface CalculatorResult {
  calculatorId: string;
  inputs: Record<string, number | string>;
  outputs: Record<string, number | string>;
  timestamp: number;
  shareToken?: string;
}

type CalculatorCategory =
  | 'unit-economics'
  | 'go-to-market'
  | 'product-mgmt'
  | 'financial'
  | 'legacy';
```

---

## 6. IMPLEMENTATION SEQUENCE (Build Order)

### Critical Path (Dependency Order)

**Days 1-2: Foundation**
1. `/src/types/calculator.ts` — Master type definitions
2. `/src/lib/config/calculators.config.ts` — Metadata registry for all calculators
3. `/src/lib/config/categories.ts` — Category definitions
4. `/src/lib/hooks/useCalculator.ts` — Generic calculator hook
5. `/src/lib/utils/validation.ts` — Input validation rules

**Days 2-3: Layout & Core Components**
6. `/src/components/layout/Header.tsx` + Sidebar + Footer
7. `/src/app/layout.tsx` — Root layout
8. `/src/components/calculators/CalculatorWrapper.tsx` — Generic calculator container
9. `/src/components/calculators/InputForm.tsx` — Form builder
10. `/src/components/calculators/ResultsCard.tsx` — Results display

**Days 3-4: Utility Components**
11. Common UI components (Button, Card, InputField, MetricBox, CurrencyInput)
12. `/src/lib/utils/formatting.ts` — Number/currency formatting
13. `/src/lib/utils/export.ts` — CSV/JSON/PDF export logic

**Days 4-6: Calculators (Start with Existing)**
14. Migrate existing CAC/LTV calculator to new structure
15. Implement first new calculator (COGS %) to validate architecture
16. Implement remaining Phase 2 calculators in parallel

**Days 6-7: Pages & Routing**
17. `/src/app/page.tsx` — Home/dashboard
18. `/src/app/calculators/layout.tsx` + page structure
19. `/src/app/calculators/[category]/[calculatorId]/page.tsx`
20. `/src/app/results/[shareId]/page.tsx` — Shared result view

**Days 7-8: Features**
21. `/src/lib/hooks/useShare.ts` — Share link generation
22. ShareButton & ExportMenu components
23. Local storage persistence

**Days 8-9: Testing & Deployment**
24. Unit tests for calculator formulas (`tests/unit/calculators/`)
25. Integration tests for form flows
26. `/vercel.json` — Deployment config
27. `/next.config.js` — Performance optimization
28. CI/CD pipeline (GitHub Actions)

---

## 7. PHASING & MILESTONES

### Phase 1: MVP (Weeks 1-4) — Consolidated Hub
**Deliverables:**
- [ ] Next.js project scaffold with TypeScript + Tailwind
- [ ] Root layout: Header, Sidebar, Footer
- [ ] Landing/dashboard page with calculator grid
- [ ] Migrate existing CAC/LTV calculator
- [ ] Generic calculator wrapper component (reusable)
- [ ] Form validation & error handling
- [ ] Basic export (CSV, JSON)
- [ ] Local storage for inputs
- [ ] Mobile responsiveness
- [ ] Deploy to Vercel staging

**Definition of Done:**
- All existing calculators accessible from single entry point
- Page load time <2s (Lighthouse)
- Zero console errors
- All inputs persist on page refresh

---

### Phase 2: Core Calculators (Weeks 5-10) — 9 New Hospitality Calculators
**Deliverables:**
- [ ] COGS %, Wholesale Margin, Payback Period
- [ ] Penetration Rate, Repeat Order Rate, Break-Even
- [ ] Inventory Turnover, Product Mix Margin
- [ ] LTV by Segment, Cash Flow Projection
- [ ] Share functionality with public links
- [ ] PDF export
- [ ] Charts/visualizations (Recharts)
- [ ] Improved tooltips & onboarding
- [ ] Unit tests for formulas (≥80% coverage)

**Definition of Done:**
- All 9 calculators in production
- Share links unique, trackable (analytics)
- Result computation <1s
- All tests passing

---

### Phase 3: Advanced Features (Weeks 11+) — Scale & Depth
**Deliverables:**
- [ ] User accounts (optional: public-only until traction)
- [ ] Saved calculation history
- [ ] Industry benchmarking (hotel norms)
- [ ] Advanced scenario modeling
- [ ] API endpoint for third-party integrations
- [ ] Vercel Analytics dashboard
- [ ] Mobile PWA support

---

## 8. DEPLOYMENT & DEVOPS

### Vercel Configuration (vercel.json)

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": ".next",
  "framework": "nextjs",
  "env": {
    "NEXT_PUBLIC_SITE_URL": "@site_url",
    "NEXT_PUBLIC_GA_ID": "@ga_id"
  },
  "headers": [
    {
      "source": "/api/:path*",
      "headers": [
        { "key": "Cache-Control", "value": "max-age=60, s-maxage=3600" }
      ]
    }
  ]
}
```

### Environment Variables (.env.example)

```bash
NEXT_PUBLIC_SITE_URL=https://calculators.bughaw.com
NEXT_PUBLIC_GA_ID=G_XXXXXXXXXX

# Phase 2+
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
```

### Performance Optimizations

| Tactic | Implementation |
|--------|-----------------|
| Code Splitting | Next.js dynamic imports for each calculator |
| Image Optimization | Next.js `<Image>` component with srcset |
| Font Loading | Variable fonts, `font-display: swap` |
| Caching | Vercel Edge Cache for static pages |
| Monitoring | Vercel Analytics + Web Vitals |
| Error Tracking | Sentry integration (Phase 2) |

### CI/CD Pipeline (GitHub Actions)

```yaml
name: Deploy
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run lint
      - run: npm run test
      - run: npm run build

  deploy:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: vercel/action@main
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
```

---

## 9. EXAMPLE: COGS CALCULATOR CONFIGURATION

```typescript
// src/lib/config/calculators.config.ts

export const CogsCalculatorConfig: CalculatorConfig = {
  id: 'cogs-percentage',
  name: 'COGS % Calculator',
  description: 'Calculate cost of goods sold as percentage of revenue.',
  category: 'unit-economics',
  icon: '💰',
  
  inputGroups: [
    {
      id: 'costs',
      title: 'Cost Structure',
      description: 'Enter your total production and delivery costs.',
      fields: [
        {
          id: 'manufacturingCost',
          label: 'Manufacturing Cost per Unit',
          type: 'currency',
          required: true,
          unit: '$',
          helpText: 'Raw materials, labor, overhead.',
        },
        {
          id: 'shippingCost',
          label: 'Shipping Cost per Unit',
          type: 'currency',
          required: true,
          unit: '$',
        },
        {
          id: 'packagingCost',
          label: 'Packaging Cost per Unit',
          type: 'currency',
          required: false,
          defaultValue: 0,
          unit: '$',
        },
      ],
    },
    {
      id: 'revenue',
      title: 'Revenue',
      fields: [
        {
          id: 'wholesalePrice',
          label: 'Wholesale Price to Hotel',
          type: 'currency',
          required: true,
          unit: '$',
          helpText: 'Price you charge per unit.',
        },
        {
          id: 'unitsPerMonth',
          label: 'Monthly Units Sold',
          type: 'number',
          required: true,
          min: 1,
          step: 1,
        },
      ],
    },
  ],

  formulas: [
    {
      outputId: 'totalCostPerUnit',
      compute: (inputs) =>
        (inputs.manufacturingCost || 0) +
        (inputs.shippingCost || 0) +
        (inputs.packagingCost || 0),
    },
    {
      outputId: 'cogsPercentage',
      compute: (inputs) => {
        const totalCost =
          (inputs.manufacturingCost || 0) +
          (inputs.shippingCost || 0) +
          (inputs.packagingCost || 0);
        const price = inputs.wholesalePrice || 0;
        return price > 0 ? (totalCost / price) * 100 : 0;
      },
    },
    {
      outputId: 'grossMarginPerUnit',
      compute: (inputs) =>
        (inputs.wholesalePrice || 0) -
        ((inputs.manufacturingCost || 0) +
          (inputs.shippingCost || 0) +
          (inputs.packagingCost || 0)),
    },
  ],

  outputs: [
    {
      id: 'cogsPercentage',
      label: 'COGS %',
      format: 'percentage',
    },
    {
      id: 'totalCostPerUnit',
      label: 'Total Cost per Unit',
      format: 'currency',
    },
    {
      id: 'grossMarginPerUnit',
      label: 'Gross Margin per Unit',
      format: 'currency',
    },
  ],

  sharing: true,
  exporting: true,
};
```

---

## 10. TESTING STRATEGY

### Unit Tests (Formula Validation)

```typescript
// tests/unit/calculators/cogsCalculator.test.ts

import { describe, it, expect } from 'vitest';
import { CogsCalculatorConfig } from '@/lib/config/calculators.config';

describe('COGS Calculator', () => {
  it('should calculate COGS % correctly', () => {
    const inputs = {
      manufacturingCost: 5,
      shippingCost: 2,
      packagingCost: 1,
      wholesalePrice: 20,
      unitsPerMonth: 100,
    };

    const formula = CogsCalculatorConfig.formulas.find(f => f.outputId === 'cogsPercentage');
    const result = formula.compute(inputs);
    
    expect(result).toBeCloseTo(40, 1); // (5+2+1)/20 = 40%
  });

  it('should handle zero wholesale price safely', () => {
    const inputs = {
      manufacturingCost: 5,
      shippingCost: 2,
      packagingCost: 1,
      wholesalePrice: 0,
      unitsPerMonth: 100,
    };

    const formula = CogsCalculatorConfig.formulas.find(f => f.outputId === 'cogsPercentage');
    const result = formula.compute(inputs);
    
    expect(result).toBe(0); // Safe fallback
  });
});
```

### Integration Tests (Form Flow)

```typescript
// tests/integration/calculator-flow.test.tsx

import { render, screen, fireEvent } from '@testing-library/react';
import { CalculatorWrapper } from '@/components/calculators/CalculatorWrapper';

describe('Calculator Form Flow', () => {
  it('should compute results when inputs change', async () => {
    render(<CalculatorWrapper calculatorId="cogs-percentage" />);

    const manufactInput = screen.getByLabelText(/Manufacturing Cost/);
    fireEvent.change(manufactInput, { target: { value: '5' } });

    const wholePrice = screen.getByLabelText(/Wholesale Price/);
    fireEvent.change(wholePrice, { target: { value: '20' } });

    expect(screen.getByText(/40%/)).toBeInTheDocument();
  });

  it('should export results as CSV', async () => {
    render(<CalculatorWrapper calculatorId="cogs-percentage" />);
    
    // Fill in inputs...
    const exportBtn = screen.getByText(/Export/);
    fireEvent.click(exportBtn);
    
    const csvOption = screen.getByText(/CSV/);
    fireEvent.click(csvOption);
    
    // Verify download was triggered
    // (Implementation details depend on your export mechanism)
  });
});
```

---

## 11. SUCCESS CRITERIA & LAUNCH CHECKLIST

### MVP Launch (Week 4)

- [ ] All existing calculators migrated and functional
- [ ] Zero critical bugs in pre-launch testing
- [ ] Lighthouse score ≥90 (Performance)
- [ ] Mobile responsive (tested on iOS 14+, Android 10+)
- [ ] Export works for all calculators
- [ ] Local storage persists across sessions
- [ ] Vercel deployment (auto-deploy on main branch)
- [ ] Error tracking configured (Sentry)
- [ ] Analytics enabled (Vercel Analytics)
- [ ] Documentation complete for dev team

### Post-Launch Monitoring (Ongoing)

- [ ] Daily check: Vercel Analytics dashboard
- [ ] Error rate <0.1%
- [ ] Uptime monitoring (99.9%+)
- [ ] Weekly: User engagement metrics (visits, calc most-used)
- [ ] Export/share conversion rates
- [ ] Mobile vs desktop split
- [ ] Collect feature requests via feedback widget

---

## 12. RECOMMENDED TEAM STRUCTURE

- **1 Senior Full-Stack Dev** — Architect, lead implementation, code review
- **1-2 Mid-Level Devs** — Calculator implementations, testing
- **1 QA/Tester** — Integration testing, cross-browser validation (Phase 1+)
- **Product/Designer** (Optional) — Polish, design system, mobile UX (Phase 2+)

**Estimated Timeline:** 8-10 weeks (MVP + Phase 2) for a 2-3 person team

---

## 13. DECISION SUMMARY

| Decision | Choice | Why |
|----------|--------|-----|
| **State Management** | Context + useReducer (MVP) → Zustand (Phase 2) | Start simple, avoid over-engineering |
| **Forms** | React Hook Form + Zod | Minimal re-renders, excellent validation |
| **Charts** | Recharts | React-native, lightweight, great for dashboards |
| **Styling** | Tailwind CSS | Consistency, rapid iteration, utilities |
| **Database** | localStorage (MVP) → PostgreSQL (Phase 3) | Public tool needs no auth initially |
| **Hosting** | Vercel | Native Next.js, auto-scaling, free tier |
| **Analytics** | Vercel Analytics + Sentry (Phase 2) | Built-in, lightweight |

---

## 14. NEXT STEPS FOR YOUR TEAM

1. **List existing calculators** — Share the full list of CAC/LTV + others so we can prioritize migration order
2. **Design system** — Finalize Bughaw brand colors, typography, logo
3. **Timeline** — Confirm Week 1-4 MVP deadline with team
4. **Calculator formulas** — Validate formulas for all Phase 2 calculators with your finance/ops team
5. **Hosting setup** — Create Vercel project, set up domain, configure GitHub integration

---

**This plan is production-ready and can be handed directly to your development team. Start with Section 6 (Implementation Sequence) for day-by-day sprint planning.**