"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

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
  yWpm: number;
  yAcc: number;
};

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function smoothPath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const curr = points[i];
    const cx1 = prev.x + (curr.x - prev.x) * 0.35;
    const cx2 = prev.x + (curr.x - prev.x) * 0.65;
    d += ` C ${cx1} ${prev.y}, ${cx2} ${curr.y}, ${curr.x} ${curr.y}`;
  }
  return d;
}

export function RecentRunsChart({ runs, maxPoints = 7 }: RecentRunsChartProps) {
  const [viewMode, setViewMode] = useState<"both" | "wpm" | "acc">("both");
  const [typingMode, setTypingMode] = useState<"normal" | "advanced">("normal");
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const uid = useId().replace(/:/g, "");

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

    const width = 760;
    const height = 290;
    const left = 46;
    const right = 44;
    const top = 22;
    const bottom = 46;
    const plotW = width - left - right;
    const plotH = height - top - bottom;
    const minWpm = Math.min(...sorted.map((item) => item.wpm));
    const maxWpm = Math.max(...sorted.map((item) => item.wpm));
    const wpmFloor = Math.max(0, Math.floor((minWpm - 8) / 5) * 5);
    const wpmCeil = Math.max(wpmFloor + 10, Math.ceil((maxWpm + 8) / 5) * 5);
    const wpmSpan = Math.max(1, wpmCeil - wpmFloor);
    const xStep = sorted.length > 1 ? plotW / (sorted.length - 1) : 0;

    const points: ChartPoint[] = sorted.map((run, index) => {
      const x = left + xStep * index;
      const yWpm = top + (1 - (run.wpm - wpmFloor) / wpmSpan) * plotH;
      const yAcc = top + (1 - clamp(run.accuracy, 0, 100) / 100) * plotH;
      return {
        date: new Date(run.date),
        wpm: Math.round(run.wpm),
        accuracy: Math.round(run.accuracy),
        label: new Date(run.date).toLocaleDateString(undefined, { month: "short", day: "2-digit" }),
        x,
        yWpm,
        yAcc,
      };
    });

    const wpmLinePath = smoothPath(points.map((point) => ({ x: point.x, y: point.yWpm })));
    const accLinePath = smoothPath(points.map((point) => ({ x: point.x, y: point.yAcc })));

    const wpmAreaPath = `${wpmLinePath} L ${points[points.length - 1].x} ${top + plotH} L ${points[0].x} ${top + plotH} Z`;
    const accAreaPath = `${accLinePath} L ${points[points.length - 1].x} ${top + plotH} L ${points[0].x} ${top + plotH} Z`;

    const latest = points[points.length - 1];
    const first = points[0];
    const deltaWpm = latest.wpm - first.wpm;

    return {
      width,
      height,
      left,
      right,
      top,
      bottom,
      plotW,
      plotH,
      points,
      wpmLinePath,
      accLinePath,
      wpmAreaPath,
      accAreaPath,
      latest,
      wpmFloor,
      wpmCeil,
      deltaWpm,
    };
  }, [maxPoints, runs, typingMode]);

  const activePoint = chart && hoveredIndex !== null ? chart.points[hoveredIndex] : null;

  function resolveNearestIndex(clientX: number): number | null {
    if (!svgRef.current || chart.points.length === 0) return null;
    const rect = svgRef.current.getBoundingClientRect();
    if (rect.width <= 0) return null;
    const xInViewBox = ((clientX - rect.left) / rect.width) * chart.width;
    let nearest = 0;
    let bestDist = Number.POSITIVE_INFINITY;
    for (let i = 0; i < chart.points.length; i += 1) {
      const dist = Math.abs(chart.points[i].x - xInViewBox);
      if (dist < bestDist) {
        bestDist = dist;
        nearest = i;
      }
    }
    return nearest;
  }

  function handlePointerMove(event: React.PointerEvent<SVGSVGElement>): void {
    const nextIndex = resolveNearestIndex(event.clientX);
    if (nextIndex === null) return;
    setHoveredIndex(nextIndex);
    if (svgRef.current) {
      const rect = svgRef.current.getBoundingClientRect();
      setTooltipPos({
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      });
    }
  }

  const tooltipStyle = useMemo(() => {
    if (!activePoint || !tooltipPos || !svgRef.current) {
      return null;
    }
    const rect = svgRef.current.getBoundingClientRect();
    const tooltipWidth = 184;
    const tooltipHeight = 90;
    const edge = 8;
    const offset = 12;

    let left = tooltipPos.x + offset;
    if (left + tooltipWidth > rect.width - edge) {
      left = tooltipPos.x - tooltipWidth - offset;
    }
    left = Math.min(Math.max(left, edge), Math.max(edge, rect.width - tooltipWidth - edge));

    let top = tooltipPos.y - tooltipHeight - offset;
    if (top < edge) {
      top = tooltipPos.y + offset;
    }
    if (top + tooltipHeight > rect.height - edge) {
      top = Math.max(edge, rect.height - tooltipHeight - edge);
    }

    return { left: `${left}px`, top: `${top}px` };
  }, [activePoint, tooltipPos]);

  if (!chart) {
    return <p className="kpi-label">No run data yet.</p>;
  }

  const yTicks = 4;
  const accTicks = [0, 25, 50, 75, 100];
  const seriesKey = `${typingMode}-${viewMode}-${chart.points.length}`;

  return (
    <div className="runs-chart-shell">
      <div className="runs-chart-head">
        <div className="runs-chart-meta">
          <span className="runs-chart-chip">{chart.points.length} runs</span>
          <span className="runs-chart-chip">Latest {chart.latest.wpm} WPM</span>
          <span className={`runs-chart-chip ${chart.deltaWpm >= 0 ? "accent" : ""}`}>
            {chart.deltaWpm >= 0 ? "+" : ""}
            {chart.deltaWpm} from first run
          </span>
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

      <div className="runs-chart-wrap">
        <svg
          ref={svgRef}
          className="runs-chart"
          viewBox={`0 0 ${chart.width} ${chart.height}`}
          aria-label="Recent runs chart"
          onPointerMove={handlePointerMove}
          onPointerLeave={() => {
            setHoveredIndex(null);
            setTooltipPos(null);
          }}
        >
          <defs>
            <linearGradient id={`runs-wpm-grad-${uid}`} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" style={{ stopColor: "var(--runs-wpm-a)" }} stopOpacity="0.56" />
              <stop offset="100%" style={{ stopColor: "var(--runs-wpm-b)" }} stopOpacity="0.02" />
            </linearGradient>
            <linearGradient id={`runs-acc-grad-${uid}`} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" style={{ stopColor: "var(--runs-acc-a)" }} stopOpacity="0.46" />
              <stop offset="100%" style={{ stopColor: "var(--runs-acc-b)" }} stopOpacity="0.02" />
            </linearGradient>
          </defs>

        <rect
          x={chart.left}
          y={chart.top}
          width={chart.plotW}
          height={chart.plotH}
          rx={14}
          className="runs-plot-bg"
        />

        {Array.from({ length: yTicks + 1 }).map((_, index) => {
          const ratio = index / yTicks;
          const y = chart.top + chart.plotH * ratio;
          const value = Math.round(chart.wpmCeil - (chart.wpmCeil - chart.wpmFloor) * ratio);
          return (
            <g key={`y-${index}`}>
              <line x1={chart.left} y1={y} x2={chart.width - chart.right} y2={y} className="runs-grid-line" />
              <text x={chart.left - 8} y={y + 4} textAnchor="end" className="runs-y-label">
                {value}
              </text>
            </g>
          );
        })}

        {accTicks.map((value) => {
          const y = chart.top + (1 - value / 100) * chart.plotH;
          return (
            <text key={`acc-${value}`} x={chart.width - chart.right + 8} y={y + 4} className="runs-y-label runs-y-label-right">
              {value}%
            </text>
          );
        })}

          <g key={seriesKey} className="runs-series">
            {viewMode !== "acc" ? (
              <>
                <path d={chart.wpmAreaPath} fill={`url(#runs-wpm-grad-${uid})`} className="runs-area wpm" />
                <path d={chart.wpmLinePath} className="runs-line wpm" />
              </>
            ) : null}

            {viewMode !== "wpm" ? (
              <>
                <path d={chart.accAreaPath} fill={`url(#runs-acc-grad-${uid})`} className="runs-area acc" />
                <path d={chart.accLinePath} className="runs-line acc" />
              </>
            ) : null}

            {chart.points.map((point, index) => (
              <g key={`${point.date.toISOString()}-${index}`}>
                {viewMode !== "acc" ? (
                  <circle cx={point.x} cy={point.yWpm} r={4.3} className="runs-dot wpm">
                    <title>{`${point.wpm} WPM`}</title>
                  </circle>
                ) : null}

                {viewMode !== "wpm" ? (
                  <circle cx={point.x} cy={point.yAcc} r={4.1} className="runs-dot acc">
                    <title>{`${point.accuracy}% ACC`}</title>
                  </circle>
                ) : null}

                <text x={point.x} y={chart.height - 14} textAnchor="middle" className="runs-x-label">
                  {point.label}
                </text>
              </g>
            ))}
          </g>

          {activePoint ? (
            <>
              <line
                className="runs-crosshair-line"
                x1={activePoint.x}
                y1={chart.top}
                x2={activePoint.x}
                y2={chart.top + chart.plotH}
              />
              {viewMode !== "acc" ? (
                <line
                  className="runs-crosshair-line soft"
                  x1={chart.left}
                  y1={activePoint.yWpm}
                  x2={chart.width - chart.right}
                  y2={activePoint.yWpm}
                />
              ) : null}
              {viewMode !== "wpm" ? (
                <line
                  className="runs-crosshair-line soft acc"
                  x1={chart.left}
                  y1={activePoint.yAcc}
                  x2={chart.width - chart.right}
                  y2={activePoint.yAcc}
                />
              ) : null}
              {viewMode !== "acc" ? (
                <circle cx={activePoint.x} cy={activePoint.yWpm} r={6.2} className="runs-dot-focus wpm" />
              ) : null}
              {viewMode !== "wpm" ? (
                <circle cx={activePoint.x} cy={activePoint.yAcc} r={5.9} className="runs-dot-focus acc" />
              ) : null}
            </>
          ) : null}
        </svg>

        {activePoint && tooltipStyle ? (
          <div
            className="runs-tooltip"
            style={tooltipStyle}
          >
            <p className="runs-tooltip-date">{activePoint.date.toLocaleString()}</p>
            <p className="runs-tooltip-line"><span>WPM</span><strong>{activePoint.wpm}</strong></p>
            <p className="runs-tooltip-line"><span>Accuracy</span><strong>{activePoint.accuracy}%</strong></p>
          </div>
        ) : null}
      </div>

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
