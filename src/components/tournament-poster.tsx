"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { TABLE_LEGEND, paginate, startsNewSlot } from "@/lib/tournaments/poster";
import type { PosterPlayer, PosterRow } from "@/server/tournament-poster";

// Affiche d'un tournoi pour l'écran du club-house (16:9). Toutes les tailles sont en unités du cadre (cqw) : l'affiche garde ses
// proportions à toutes les largeurs et en plein écran. Les pages défilent toutes les 15 s si la case est cochée.

const subscribe = () => () => {};
const origin = () => window.location.origin;

const ROTATE_MS = 15_000;
const COLUMNS = "5fr 6fr 13fr 10fr 4fr 2fr 10fr 2fr 13fr 10fr 4fr";
const HEADERS = ["Horaire", "Tableau", "Joueur 1", "Club", "Class.", "V", "Score", "V", "Joueur 2", "Club", "Class."];

export type PosterProps = {
  tournamentName: string;
  clubName: string;
  venue: string;
  dateLabel: string;
  heading: string;
  rows: PosterRow[];
  /** Chemin de la page du tournoi (« /tournois/<id> ») : l'adresse complète est lue dans le navigateur. */
  tournamentPath: string;
};

export function TournamentPoster({ tournamentName, clubName, venue, dateLabel, heading, rows, tournamentPath }: PosterProps) {
  const base = useSyncExternalStore(subscribe, origin, () => "");
  const pages = paginate(rows);
  const [index, setIndex] = useState(0);
  const [auto, setAuto] = useState(false);
  const frame = useRef<HTMLDivElement>(null);
  const page = Math.min(index, pages.length - 1);

  useEffect(() => {
    if (!auto || pages.length < 2) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % pages.length), ROTATE_MS);
    return () => clearInterval(id);
  }, [auto, pages.length]);

  function fullscreen() {
    frame.current?.requestFullscreen?.().catch(() => {});
  }

  const current = pages[page]!;
  const footer = pages.length > 1 ? (page < pages.length - 1 ? `Page ${page + 1}/${pages.length} · Suite des matchs page ${page + 2}` : `Page ${page + 1}/${pages.length} · Fin du programme`) : "";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3" data-testid="poster-controls">
        {pages.length > 1 && (
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setIndex((page + pages.length - 1) % pages.length)} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-line bg-surface text-xl" aria-label="Page précédente">
              ‹
            </button>
            <span className="font-data text-sm" data-testid="poster-page-indicator">
              Page {page + 1}/{pages.length}
            </span>
            <button type="button" onClick={() => setIndex((page + 1) % pages.length)} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-line bg-surface text-xl" aria-label="Page suivante">
              ›
            </button>
          </div>
        )}
        {pages.length > 1 && (
          <label className="inline-flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} className="size-5" data-testid="poster-auto" />
            Faire défiler les pages toutes les 15 s
          </label>
        )}
        <button type="button" onClick={fullscreen} className="inline-flex min-h-11 items-center rounded-lg border-2 border-primary px-4 font-semibold text-primary" data-testid="poster-fullscreen">
          Plein écran
        </button>
      </div>

      <div ref={frame} className="@container aspect-video w-full overflow-hidden bg-canvas text-ink" style={{ containerType: "inline-size" }} data-testid="poster">
        <div className="flex h-full flex-col" style={{ fontSize: "1.15cqw" }}>
          <header className="flex items-center justify-between gap-[2cqw] bg-brand px-[2cqw] text-on-primary" style={{ height: "9cqw" }}>
            <div className="min-w-0" style={{ flexBasis: "30%" }}>
              <p className="font-logo leading-none text-gold" style={{ fontSize: "3cqw" }}>
                Ralli
              </p>
              <p className="truncate font-semibold" style={{ fontSize: "1.3cqw" }} data-testid="poster-club">
                {clubName}
              </p>
              <p className="truncate text-on-primary-soft" data-testid="poster-venue">
                {venue}
              </p>
            </div>
            <h2 className="min-w-0 flex-1 text-center font-serif font-semibold leading-tight" style={{ fontSize: "3.2cqw" }} data-testid="poster-title">
              {tournamentName}
            </h2>
            <p className="text-right font-serif font-semibold text-gold" style={{ flexBasis: "30%", fontSize: "2.2cqw" }} data-testid="poster-date">
              {heading} {dateLabel}
            </p>
          </header>

          <div className="flex-1 px-[1.5cqw] pt-[0.8cqw]" data-testid="poster-table">
            <div className="grid items-center gap-x-[0.5cqw] border-b-2 border-brand pb-[0.3cqw] font-semibold uppercase tracking-wide text-ink-muted" style={{ gridTemplateColumns: COLUMNS, fontSize: "0.85cqw" }}>
              {HEADERS.map((h, i) => (
                <span key={`${h}-${i}`} className={h === "V" ? "text-center" : ""}>
                  {h}
                </span>
              ))}
            </div>
            {current.length === 0 ? (
              <p className="py-[3cqw] text-center text-ink-muted" style={{ fontSize: "1.6cqw" }} data-testid="poster-empty">
                Le programme du jour sera affiché ici.
              </p>
            ) : (
              current.map((row, i) => <Row key={row.id} row={row} newSlot={startsNewSlot(current.map((r) => ({ timeKey: r.time })), i)} />)
            )}
          </div>

          <div className="px-[1.5cqw] pb-[0.6cqw]">
            {footer && (
              <p className="pb-[0.3cqw] text-center font-semibold text-accent" data-testid="poster-footer">
                {footer}
              </p>
            )}
            <div className="rounded-[0.6cqw] border border-line bg-surface px-[1cqw] py-[0.4cqw]" style={{ fontSize: "0.8cqw" }} data-testid="poster-legend">
              {TABLE_LEGEND.map((l) => (
                <p key={l.title}>
                  <strong>{l.title} : </strong>
                  {l.items.map((i) => `${i.code} : ${i.meaning}`).join(" ; ")}
                </p>
              ))}
            </div>
            <p className="pt-[0.3cqw] text-center text-ink-muted" style={{ fontSize: "0.8cqw" }}>
              {base.replace(/^https?:\/\//, "")}{tournamentPath}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ row, newSlot }: { row: PosterRow; newSlot: boolean }) {
  const homeWon = row.home.won;
  const awayWon = row.away.won;
  return (
    <div className={`grid items-stretch gap-x-[0.5cqw] ${newSlot ? "mt-[0.9cqw]" : "mt-[0.25cqw]"}`} style={{ gridTemplateColumns: COLUMNS, minHeight: "2.3cqw" }} data-testid="poster-row" data-done={row.done}>
      <span className="self-center font-data font-semibold">{row.time}</span>
      <span className="self-center font-semibold text-primary">{row.table}</span>
      <Side p={row.home} won={homeWon} part="name" />
      <Side p={row.home} won={homeWon} part="club" />
      <Side p={row.home} won={homeWon} part="rank" />
      <span className="self-center text-center font-bold text-success-ink">{homeWon ? "V" : ""}</span>
      <span className="flex items-center justify-center rounded-[0.4cqw] bg-pale px-[0.4cqw] text-center font-data font-semibold" data-testid="poster-score">
        {homeWon && row.score ? `◀ ${row.score}` : awayWon && row.score ? `${row.score} ▶` : row.score}
      </span>
      <span className="self-center text-center font-bold text-success-ink">{awayWon ? "V" : ""}</span>
      <Side p={row.away} won={awayWon} part="name" />
      <Side p={row.away} won={awayWon} part="club" />
      <Side p={row.away} won={awayWon} part="rank" />
    </div>
  );
}

function Side({ p, won, part }: { p: PosterPlayer; won: boolean; part: "name" | "club" | "rank" }) {
  const text = part === "name" ? p.name : part === "club" ? p.club : p.rank;
  return (
    <span className={`flex items-center truncate rounded-[0.3cqw] px-[0.4cqw] ${won ? "bg-brand text-gold" : "bg-pale"} ${part === "name" && won ? "font-extrabold" : part === "name" ? "font-medium" : ""}`} data-testid={part === "name" ? "poster-player" : undefined} data-won={won}>
      <span className="truncate">{text}</span>
    </span>
  );
}
