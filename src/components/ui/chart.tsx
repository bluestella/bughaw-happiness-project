"use client";

import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { BarChart, LineChart } from "echarts/charts";
import { GridComponent, TooltipComponent, LegendComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsCoreOption } from "echarts/core";
import type { ChartSpec } from "@/lib/calculators/types";
import { formatValue, pesoRound, type OutputFormat } from "@/lib/format";
import { CHART, compactPeso } from "@/lib/chartTheme";

echarts.use([BarChart, LineChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);

const MONO = "'IBM Plex Mono', ui-monospace, monospace";
const SANS = "Inter, system-ui, sans-serif";

function fmt(format: OutputFormat | undefined, v: number): string {
  if (format === "currency") return pesoRound(v);
  if (format) return formatValue(format, v);
  return v.toLocaleString();
}

/**
 * Builds a themed ECharts option from a calculator ChartSpec.
 * `polarity` colors each bar by sign (green ≥ 0, clay < 0) — sign is also
 * encoded by position around the zero line, so color is never the only cue.
 */
export function specToOption(
  spec: ChartSpec,
  opts?: { polarity?: boolean }
): EChartsCoreOption {
  const multi = spec.series.length > 1;
  const axisLabel = { color: CHART.axisInk, fontSize: 11, fontFamily: MONO };

  return {
    animationDuration: 300,
    animationDurationUpdate: 200,
    animationEasingUpdate: "cubicOut",
    grid: { left: 8, right: 12, top: 16, bottom: multi ? 34 : 8, containLabel: true },
    legend: multi
      ? {
          bottom: 0,
          icon: "circle",
          itemWidth: 8,
          itemHeight: 8,
          itemGap: 16,
          textStyle: { color: CHART.axisInk, fontSize: 11, fontFamily: SANS },
        }
      : undefined,
    tooltip: {
      trigger: "axis",
      axisPointer:
        spec.type === "bar"
          ? { type: "shadow", shadowStyle: { color: "rgba(15,23,42,0.05)" } }
          : { type: "line", lineStyle: { color: CHART.line } },
      backgroundColor: "#FFFFFF",
      borderColor: CHART.line,
      padding: [8, 12],
      textStyle: { color: CHART.ink, fontSize: 12, fontFamily: SANS },
      formatter: (params: unknown) => {
        type TooltipParam = {
          marker?: string;
          seriesName?: string;
          value?: number | string;
          axisValueLabel?: string;
        };
        const list = (Array.isArray(params) ? params : [params]) as TooltipParam[];
        const rows = list
          .map(
            (p) =>
              `<div style="display:flex;align-items:center;gap:6px;margin-top:2px">${p.marker}` +
              `<span style="color:${CHART.axisInk}">${p.seriesName}</span>` +
              `<b style="font-family:${MONO};margin-left:auto;padding-left:12px">${fmt(spec.format, Number(p.value))}</b></div>`
          )
          .join("");
        return `<div style="min-width:130px"><div style="color:${CHART.axisInk};font-size:11px">${list[0]?.axisValueLabel ?? ""}</div>${rows}</div>`;
      },
    },
    xAxis: {
      type: "category",
      data: spec.labels,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel,
    },
    yAxis: {
      type: "value",
      splitLine: { lineStyle: { color: CHART.grid } },
      axisLabel: {
        ...axisLabel,
        formatter: (v: number) =>
          spec.format === "currency" ? compactPeso(v) : v.toLocaleString(),
      },
    },
    series: spec.series.map((s) =>
      spec.type === "bar"
        ? {
            type: "bar" as const,
            name: s.name,
            barMaxWidth: 40,
            barGap: "12%",
            data: s.values.map((v) => {
              const value = Math.round(v);
              const color = opts?.polarity ? (value < 0 ? CHART.clay : CHART.green) : s.color;
              return {
                value,
                itemStyle: {
                  color,
                  borderRadius: value < 0 ? [0, 0, 4, 4] : [4, 4, 0, 0],
                },
              };
            }),
          }
        : {
            type: "line" as const,
            name: s.name,
            data: s.values.map((v) => Math.round(v)),
            showSymbol: false,
            smooth: 0.2,
            emphasis: { focus: multi ? ("series" as const) : ("none" as const) },
            lineStyle: { width: 2, color: s.color, type: s.dash ? ("dashed" as const) : ("solid" as const) },
            itemStyle: { color: s.color },
          }
    ),
  };
}

export function Chart({
  option,
  className,
  ariaLabel,
}: {
  option: EChartsCoreOption;
  className?: string;
  ariaLabel?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const chart = echarts.init(el);
    chartRef.current = chart;
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(el);
    return () => {
      ro.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // replaceMerge keeps series in sync when a spec changes shape between renders
    chartRef.current?.setOption(
      reduceMotion ? { ...option, animation: false } : option,
      { replaceMerge: ["series"], lazyUpdate: true }
    );
  }, [option]);

  return <div ref={ref} className={className} role="img" aria-label={ariaLabel} />;
}
