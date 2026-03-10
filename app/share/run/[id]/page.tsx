import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { LANGUAGE_LABELS, type LanguageCode } from "@/app/typing/word-banks";
import { GaugeIcon, SparkIcon, TimerIcon } from "@/app/components/icons";

type SharePageProps = {
  params: { id: string };
};

function getModeLabel(difficulty: string): "normal" | "advanced" {
  if (difficulty === "hard") {
    return "advanced";
  }
  return "normal";
}

function formatTime(value: Date): string {
  return value.toLocaleString();
}

export default async function ShareRunPage({ params }: SharePageProps) {
  const id = params.id?.trim();
  if (!id) {
    notFound();
  }

  const result = await prisma.testResult.findUnique({
    where: { id },
    include: {
      user: {
        select: {
          username: true,
          displayName: true,
          avatarUrl: true,
        },
      },
    },
  });

  if (!result) {
    notFound();
  }

  const languageLabel = LANGUAGE_LABELS[result.language as LanguageCode] ?? result.language.toUpperCase();
  const modeLabel = getModeLabel(result.difficulty);
  const typingHref =
    modeLabel === "advanced"
      ? `/typing-advanced?language=${encodeURIComponent(result.language)}`
      : `/typing?language=${encodeURIComponent(result.language)}`;

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
          {result.user?.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={result.user.avatarUrl} alt="" className="share-avatar" />
          ) : (
            <div className="share-avatar share-avatar-fallback">
              {(result.user?.displayName ?? result.user?.username ?? "G")[0]?.toUpperCase()}
            </div>
          )}
          <div className="share-title">
            <h2>{result.user?.displayName ?? result.user?.username ?? "Guest"}</h2>
            <p>{formatTime(result.createdAt)}</p>
          </div>
        </div>

        <div className="share-stats">
          <article>
            <p className="kpi">{Math.round(result.wpm)}</p>
            <p className="kpi-label">WPM</p>
          </article>
          <article>
            <p className="kpi">{Math.round(result.accuracy)}%</p>
            <p className="kpi-label">Accuracy</p>
          </article>
          <article>
            <p className="kpi">{result.duration}s</p>
            <p className="kpi-label">Duration</p>
          </article>
          <article>
            <p className="kpi">{result.wordCount}</p>
            <p className="kpi-label">Words</p>
          </article>
        </div>

        <div className="share-meta">
          <span className="typing-mini-chip">
            <TimerIcon className="ui-icon" /> {result.duration}s
          </span>
          <span className="typing-mini-chip">
            <GaugeIcon className="ui-icon" /> {languageLabel}
          </span>
          <span className="typing-mini-chip">{modeLabel}</span>
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
