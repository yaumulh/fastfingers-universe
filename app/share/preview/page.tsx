import Link from "next/link";
import { LANGUAGE_LABELS } from "@/app/typing/word-banks";
import { GaugeIcon, SparkIcon, TimerIcon } from "@/app/components/icons";

type SharePreviewProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

function readParam(params: SharePreviewProps["searchParams"], key: string): string {
  const raw = params?.[key];
  if (Array.isArray(raw)) {
    return raw[0] ?? "";
  }
  return raw ?? "";
}

function safeNumber(value: string, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export default function SharePreviewPage({ searchParams }: SharePreviewProps) {
  const wpm = safeNumber(readParam(searchParams, "wpm"));
  const accuracy = safeNumber(readParam(searchParams, "accuracy"));
  const duration = safeNumber(readParam(searchParams, "duration"));
  const words = safeNumber(readParam(searchParams, "words"));
  const mistakes = safeNumber(readParam(searchParams, "mistakes"));
  const language = readParam(searchParams, "language") || "en";
  const mode = readParam(searchParams, "mode") || "normal";
  const name = readParam(searchParams, "name") || "Guest";
  const atRaw = readParam(searchParams, "at");
  const timestamp = atRaw ? new Date(atRaw) : null;

  const languageLabel = LANGUAGE_LABELS[language as keyof typeof LANGUAGE_LABELS] ?? language.toUpperCase();
  const typingHref =
    mode === "advanced"
      ? `/typing-advanced?language=${encodeURIComponent(language)}`
      : `/typing?language=${encodeURIComponent(language)}`;

  return (
    <main className="site-shell profile-page share-page">
      <section className="typing-header">
        <h1>
          <SparkIcon className="ui-icon ui-icon-accent" />
          Shared Result
        </h1>
        <p>Fast-fingers Universe typing snapshot.</p>
      </section>

      <section className="card glass share-card">
        <div className="share-head">
          <div className="share-avatar share-avatar-fallback">
            {name[0]?.toUpperCase()}
          </div>
          <div className="share-title">
            <h2>{name}</h2>
            <p>{timestamp ? timestamp.toLocaleString() : "Just now"}</p>
          </div>
        </div>

        <div className="share-stats">
          <article>
            <p className="kpi">{Math.round(wpm)}</p>
            <p className="kpi-label">WPM</p>
          </article>
          <article>
            <p className="kpi">{Math.round(accuracy)}%</p>
            <p className="kpi-label">Accuracy</p>
          </article>
          <article>
            <p className="kpi">{duration}s</p>
            <p className="kpi-label">Duration</p>
          </article>
          <article>
            <p className="kpi">{words}</p>
            <p className="kpi-label">Words</p>
          </article>
          <article>
            <p className="kpi">{mistakes}</p>
            <p className="kpi-label">Mistakes</p>
          </article>
        </div>

        <div className="share-meta">
          <span className="typing-mini-chip">
            <TimerIcon className="ui-icon" /> {duration}s
          </span>
          <span className="typing-mini-chip">
            <GaugeIcon className="ui-icon" /> {languageLabel}
          </span>
          <span className="typing-mini-chip">{mode}</span>
        </div>

        <div className="share-actions">
          <Link href={typingHref} className="btn btn-primary">
            Try This Test
          </Link>
          <Link href="/" className="btn btn-ghost">
            Back Home
          </Link>
        </div>
      </section>
    </main>
  );
}
