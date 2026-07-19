import type { OutputFormat } from "@/lib/format";

export type CategoryId =
  | "unit-economics"
  | "go-to-market"
  | "product-mgmt"
  | "financial";

export interface InputField {
  id: string;
  label: string;
  type: "currency" | "number" | "percentage";
  defaultValue: number;
  min?: number;
  max?: number;
  step?: number;
  helpText?: string;
}

export interface InputGroup {
  id: string;
  title: string;
  fields: InputField[];
}

export interface OutputDef {
  id: string;
  label: string;
  format: OutputFormat;
  note?: string;
  emphasis?: boolean;
}

export interface ChartSeries {
  name: string;
  color: string;
  values: number[];
}

export interface ChartSpec {
  title: string;
  type: "bar" | "line";
  labels: string[];
  series: ChartSeries[];
  format?: OutputFormat;
}

export type Inputs = Record<string, number>;
export type Outputs = Record<string, number>;

export interface CalculatorConfig {
  id: string;
  category: CategoryId;
  name: string;
  description: string;
  icon: string;
  inputGroups: InputGroup[];
  compute: (inputs: Inputs) => Outputs;
  outputs: OutputDef[];
  chart?: (inputs: Inputs, outputs: Outputs) => ChartSpec;
  verdict?: (inputs: Inputs, outputs: Outputs) => { ok: boolean; text: string };
}

export interface CategoryDef {
  id: CategoryId;
  name: string;
  blurb: string;
}

export const CATEGORIES: CategoryDef[] = [
  {
    id: "unit-economics",
    name: "Unit Economics",
    blurb: "Per-unit cost, margin, and payback math.",
  },
  {
    id: "go-to-market",
    name: "Go-to-Market",
    blurb: "Hotel acquisition, reorders, and channel profitability.",
  },
  {
    id: "product-mgmt",
    name: "Product Management",
    blurb: "Inventory velocity and product-mix margins.",
  },
  {
    id: "financial",
    name: "Financial Forecasting",
    blurb: "LTV, cash flow, and growth scenarios.",
  },
];
