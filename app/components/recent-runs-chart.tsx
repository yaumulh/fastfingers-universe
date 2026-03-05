"use client";

import { useEffect, useMemo, useState } from "react";

type RunPoint = {
  date: string;
  wpm: number;
  accuracy: number;
  mode?: "normal" | "advanced";
};

type RecentRunsChartProps = {
  runs: RunPoint[];
  maxPoints?: number;
};

type ChartPoint = {
  date: Date;
  wpm: number;
  accuracy: number;
  label: string;
  x: number;
  barHeight: number;
  accY: number;
};

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function RecentRunsChart({ runs, maxPoints = 6 }: RecentRunsChartProps) {
  const [viewMode, setViewMode] = useState<"both" | "wpm" | "acc">("both");
  const [typingMode, setTypingMode] = useState<"normal" | "advanced">("normal");
  const modeAvailability = useMemo(() => {
    let hasNormal = false;
    let hasAdvanced = false;
    for (const run of runs) {
      if (run.mode === "advanced") hasAdvanced = true;
      else hasNormal = true;
    }
    return { hasNormal, hasAdvanced };
  }, [runs]);

  useEffect(() => {
    if (typingMode === "normal" && modeAvailability.hasNormal) return;
    if (typingMode === "advanced" && modeAvailability.hasAdvanced) return;
    if (modeAvailability.hasNormal) {
      setTypingMode("normal");
      return;
    }
    if (modeAvailability.hasAdvanced) {
      setTypingMode("advanced");
    }
  }, [modeAvailability.hasAdvanced, modeAvailability.hasNormal, typingMode]);

  const chart = useMemo(() => {
    const sorted = [...runs]
      .filter((run) => (typingMode === "advanced" ? run.mode === "advanced" : run.mode !== "advanced"))
      .filter((run) => Number.isFinite(run.wpm) && Number.isFinite(run.accuracy))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(-maxPoints);

    if (sorted.length === 0) {
      return null;
    }

    const chartW = 560;
    const chartH = 180;
    const topPad = 16;
    const bottomPad = 38;
    const leftPad = 18;
    const rightPad = 14;
    const plotW = chartW - leftPad - rightPad;
    const plotH = chartH - topPad - bottomPad;
    const maxWpm = Math.max(20, ...sorted.map((run) => run.wpm));
    const step = sorted.length > 1 ? plotW / (sorted.length - 1) : 0;
    const barW = sorted.length <= 3 ? 28 : 20;

    const points: ChartPoint[] = sorted.map((run, index) => {
      const x = leftPad + index * step;
      const barHeight = clamp((run.wpm / maxWpm) * (plotH - 8), 4, plotH);
      const accY = topPad + (1 - clamp(run.accuracy, 0, 100) / 100) * plotH;
      return {
        date: new Date(run.date),
        wpm: Math.round(run.wpm),
        accuracy: Math.round(run.accuracy),
        label: new Date(run.date).toLocaleDateString(undefined, { month: "short", day: "2-digit" }),
        x,
        barHeight,
        accY,
      };
    });

    const linePath = points
      .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.accY.toFixed(1)}`)
      .join(" ");

    const latest = points[points.length - 1];
    return { chartW, chartH, topPad, plotH, points, linePath, latest, maxWpm, leftPad };
  }, [maxPoints, runs, typingMode]);

  if (!chart) {
    return <p className="kpi-label">No run data yet.</p>;
  }

  return (
    <div className="runs-chart-shell">
      <div className="runs-chart-head">
        <div className="runs-chart-meta">
          <span className="runs-chart-chip">{chart.points.length} runs</span>
          <span className="runs-chart-chip">Top {chart.maxWpm} WPM scale</span>
          <span className="runs-chart-chip accent">Latest {chart.latest.wpm} WPM</span>
        </div>
        <div className="runs-mode-toggle" role="tablist" aria-label="Typing mode">
          <button
            type="button"
            role="tab"
            aria-selected={typingMode === "normal"}
            className={`runs-mode-btn ${typingMode === "normal" ? "active" : ""}`}
            disabled={!modeAvailability.hasNormal}
            onClick={() => setTypingMode("normal")}
          >
            Normal
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={typingMode === "advanced"}
            className={`runs-mode-btn ${typingMode === "advanced" ? "active" : ""}`}
            disabled={!modeAvailability.hasAdvanced}
            onClick={() => setTypingMode("advanced")}
          >
            Advanced
          </button>
        </div>
        <div className="runs-chart-toggle" role="tablist" aria-label="Chart mode">
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === "wpm"}
            className={`runs-toggle-btn ${viewMode === "wpm" ? "active" : ""}`}
            onClick={() => setViewMode("wpm")}
          >
            WPM
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === "acc"}
            className={`runs-toggle-btn ${viewMode === "acc" ? "active" : ""}`}
            onClick={() => setViewMode("acc")}
          >
            ACC
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === "both"}
            className={`runs-toggle-btn ${viewMode === "both" ? "active" : ""}`}
            onClick={() => setViewMode("both")}
          >
            Both
          </button>
        </div>
      </div>
      <svg className="runs-chart" viewBox={`0 0 ${chart.chartW} ${chart.chartH}`} aria-label="Latest typing runs chart">
        <defs>
          <linearGradient id="runs-bar-grad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#7ef6ff" />
            <stop offset="100%" stopColor="#4d8dff" />
          </linearGradient>
          <linearGradient id="runs-line-grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#e5d3ff" />
            <stop offset="100%" stopColor="#b06fff" />
          </linearGradient>
        </defs>

        <line x1={chart.leftPad} y1={chart.topPad + chart.plotH} x2={chart.chartW - 14} y2={chart.topPad + chart.plotH} className="runs-axis" />

        {chart.points.map((point, index) => (
          <g key={`${point.date.toISOString()}-${index}`}>
            {viewMode !== "acc" ? (
              <rect
                x={point.x - 10}
                y={chart.topPad + chart.plotH - point.barHeight}
                width={20}
                height={point.barHeight}
                rx={6}
                fill="url(#runs-bar-grad)"
                opacity={0.86}
              >
                <title>{`${point.wpm} WPM • ${point.accuracy}% ACC`}</title>
              </rect>
            ) : null}
            <text x={point.x} y={chart.chartH - 12} textAnchor="middle" className="runs-x-label">
              {point.label}
            </text>
          </g>
        ))}

        {viewMode !== "wpm" ? <path d={chart.linePath} className="runs-acc-line" /> : null}

        {viewMode !== "wpm"
          ? chart.points.map((point, index) => (
              <circle key={`acc-${point.date.toISOString()}-${index}`} cx={point.x} cy={point.accY} r={4.2} className="runs-acc-dot">
                <title>{`${point.accuracy}% accuracy`}</title>
              </circle>
            ))
          : null}
      </svg>
      {viewMode === "both" ? (
        <div className="runs-chart-legend">
          <span className="runs-legend-item">
            <span className="runs-legend-swatch wpm" />
            WPM
          </span>
          <span className="runs-legend-item">
            <span className="runs-legend-swatch acc" />
            Accuracy
          </span>
        </div>
      ) : null}
    </div>
  );
}
