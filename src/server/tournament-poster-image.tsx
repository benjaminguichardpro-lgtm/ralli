import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import type { CSSProperties, ReactNode } from "react";
import { clubInitials } from "@/lib/clubs/profile";
import { formatParisDay } from "@/lib/time";
import { POSTER_FORMATS, type PosterFormat, TABLE_LEGEND, paginate, startsNewSlot } from "@/lib/tournaments/poster";
import { POSTER_COLORS as C } from "@/lib/tournaments/poster-colors";
import type { PosterPlayer, PosterRow, PosterView } from "./tournament-poster";

// Affiche du tournoi en image PNG : une image par page, au format « écran du club-house » (1920 × 1080) ou « story » (1080 × 1920).
// Fabriquée côté serveur (Satori) : seul flexbox existe, chaque bloc à plusieurs enfants est donc un `display: flex`.
// Les polices sont dans `assets/fonts` (licence OFL, voir les fichiers OFL-*.txt) ; les couleurs viennent de `poster-colors.ts`.

const fontsDir = join(process.cwd(), "assets/fonts");
type PosterFont = { name: string; data: Buffer; weight: 400 | 500 | 600 | 700; style: "normal" };

let fontsPromise: Promise<PosterFont[]> | null = null;

/** Polices lues une fois, à la première image, puis gardées en mémoire. */
function loadFonts(): Promise<PosterFont[]> {
  fontsPromise ??= Promise.all([
    readFile(join(fontsDir, "dm-sans-400.woff")),
    readFile(join(fontsDir, "dm-sans-500.woff")),
    readFile(join(fontsDir, "dm-sans-700.woff")),
    readFile(join(fontsDir, "cormorant-garamond-600.woff")),
    readFile(join(fontsDir, "cormorant-garamond-700.woff")),
    readFile(join(fontsDir, "norican-400.woff")),
  ]).then(([dm400, dm500, dm700, cg600, cg700, norican]): PosterFont[] => [
    { name: "DM Sans", data: dm400, weight: 400, style: "normal" },
    { name: "DM Sans", data: dm500, weight: 500, style: "normal" },
    { name: "DM Sans", data: dm700, weight: 700, style: "normal" },
    { name: "Cormorant Garamond", data: cg600, weight: 600, style: "normal" },
    { name: "Cormorant Garamond", data: cg700, weight: 700, style: "normal" },
    { name: "Norican", data: norican, weight: 400, style: "normal" },
  ]);
  fontsPromise.catch(() => (fontsPromise = null)); // une lecture ratée ne reste pas en mémoire
  return fontsPromise;
}

type Metrics = { rowH: number; slotGap: number; name: number; club: number; small: number; time: number; score: number; cols: number[]; padX: number };

// Largeurs de colonnes (px). Écran : horaire, tableau, joueur 1, club, classement, V, score, V, joueur 2, club, classement.
// Story : horaire, tableau, joueur 1 (nom + club dessous), classement, V, score, V, joueur 2, classement.
const SCREEN: Metrics = { rowH: 44, slotGap: 8, name: 25, club: 21, small: 21, time: 24, score: 23, cols: [88, 88, 320, 230, 80, 46, 230, 46, 320, 230, 80], padX: 36 };
const STORY: Metrics = { rowH: 46, slotGap: 10, name: 21, club: 15, small: 19, time: 21, score: 19, cols: [76, 66, 221, 62, 28, 160, 28, 221, 62], padX: 24 };

// Hauteurs fixes (px) autour du tableau : en-tête, et pied (légende, lien). Le reste est partagé entre les lignes.
const HEADER_H = { ecran: 170, story: 370 } as const;
const FOOTER_H = { ecran: 160, story: 205 } as const;
const NOTE_H = 34;
const TABLE_TOP = 14 + 34; // marge au-dessus du tableau + ligne d'en-tête du tableau
const ROW_RANGE = { ecran: { min: 34, max: 78, ref: 44, kmax: 1.12 }, story: { min: 40, max: 80, ref: 46, kmax: 1.1 } } as const;

/** Ajuste la hauteur des lignes au nombre de matchs de la page (peu de matchs : lignes hautes, texte plus grand ; beaucoup : resserrées). */
function fit(base: Metrics, format: PosterFormat, rows: number, slots: number, hasNote: boolean): Metrics {
  if (rows === 0) return base;
  const r = ROW_RANGE[format];
  const avail = POSTER_FORMATS[format].height - HEADER_H[format] - FOOTER_H[format] - (hasNote ? NOTE_H : 0) - TABLE_TOP;
  const rowH = Math.max(r.min, Math.min(r.max, Math.floor((avail - rows * 4 - slots * base.slotGap) / rows)));
  const k = Math.max(0.8, Math.min(r.kmax, rowH / r.ref));
  const sc = (n: number) => Math.round(n * k);
  return { ...base, rowH, name: sc(base.name), club: sc(base.club), small: sc(base.small), time: sc(base.time), score: sc(base.score) };
}

const base = { display: "flex" } as const;
const ellipsis = { display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const;

function Arrow({ dir }: { dir: "left" | "right" }) {
  return (
    <svg width="14" height="16" viewBox="0 0 14 16" xmlns="http://www.w3.org/2000/svg">
      <path d={dir === "left" ? "M14 0 L0 8 L14 16 Z" : "M0 0 L14 8 L0 16 Z"} fill={C.accent} />
    </svg>
  );
}

function Cell({ w, children, bg, color, weight = 500, size, align = "flex-start", gap }: { w: number; children: ReactNode; bg?: string; color?: string; weight?: 400 | 500 | 700; size: number; align?: "flex-start" | "center"; gap?: number }) {
  // Satori refuse les valeurs de style `undefined` : on n'ajoute que celles qui existent.
  const style: CSSProperties = { ...base, width: w, height: "100%", alignItems: "center", justifyContent: align, padding: "0 10px", borderRadius: 6, color: color ?? C.ink, fontSize: size, fontWeight: weight };
  if (bg) style.background = bg;
  if (gap) style.gap = gap;
  return <div style={style}>{children}</div>;
}

/** Une moitié de ligne : joueur, club, classement (écran) ou joueur avec son club dessous, puis classement (story). */
function PlayerCells({ p, m, format, cols }: { p: PosterPlayer; m: Metrics; format: PosterFormat; cols: number[] }) {
  const bg = p.won ? C.brand : C.pale;
  const color = p.won ? C.gold : C.ink;
  const nameWeight = p.won ? 700 : 500;
  if (format === "ecran") {
    return (
      <>
        <Cell w={cols[0]!} bg={bg} color={color} weight={nameWeight} size={m.name}>
          <div style={ellipsis}>{p.name}</div>
        </Cell>
        <Cell w={cols[1]!} bg={bg} color={color} weight={p.won ? 500 : 400} size={m.club}>
          <div style={ellipsis}>{p.club}</div>
        </Cell>
        <Cell w={cols[2]!} bg={bg} color={color} weight={p.won ? 700 : 500} size={m.small} align="center">
          {p.rank}
        </Cell>
      </>
    );
  }
  return (
    <>
      <div style={{ ...base, flexDirection: "column", justifyContent: "center", width: cols[0], height: "100%", padding: "0 10px", borderRadius: 6, background: bg, color }}>
        <div style={{ ...ellipsis, fontSize: m.name, fontWeight: nameWeight, lineHeight: 1.1 }}>{p.name}</div>
        <div style={{ ...ellipsis, fontSize: m.club, fontWeight: 400, lineHeight: 1.15 }}>{p.club}</div>
      </div>
      <Cell w={cols[1]!} bg={bg} color={color} weight={p.won ? 700 : 500} size={m.small} align="center">
        {p.rank}
      </Cell>
    </>
  );
}

function Row({ row, newSlot, m, format }: { row: PosterRow; newSlot: boolean; m: Metrics; format: PosterFormat }) {
  const story = format === "story";
  const c = m.cols;
  const homeCols = story ? [c[2]!, c[3]!] : [c[2]!, c[3]!, c[4]!];
  const awayCols = story ? [c[7]!, c[8]!] : [c[8]!, c[9]!, c[10]!];
  const vHome = story ? c[4]! : c[5]!;
  const scoreW = story ? c[5]! : c[6]!;
  const vAway = story ? c[6]! : c[7]!;
  return (
    <div style={{ ...base, alignItems: "center", gap: 8, height: m.rowH, marginTop: newSlot ? m.slotGap + 4 : 4 }}>
      <Cell w={c[0]!} size={m.time} weight={700}>
        {row.time}
      </Cell>
      <Cell w={c[1]!} size={m.small} weight={700} color={C.primary}>
        {row.table}
      </Cell>
      <PlayerCells p={row.home} m={m} format={format} cols={homeCols} />
      <Cell w={vHome} size={m.name} weight={700} color={C["success-ink"]} align="center">
        {row.home.won ? "V" : ""}
      </Cell>
      <Cell w={scoreW} size={m.score} weight={700} bg={C.pale} align="center" gap={8}>
        {row.home.won && row.score ? <Arrow dir="left" /> : null}
        <div style={{ display: "flex", whiteSpace: "nowrap" }}>{row.score}</div>
        {row.away.won && row.score ? <Arrow dir="right" /> : null}
      </Cell>
      <Cell w={vAway} size={m.name} weight={700} color={C["success-ink"]} align="center">
        {row.away.won ? "V" : ""}
      </Cell>
      <PlayerCells p={row.away} m={m} format={format} cols={awayCols} />
    </div>
  );
}

function TableHead({ m, format }: { m: Metrics; format: PosterFormat }) {
  const labels = format === "ecran" ? ["Horaire", "Tableau", "Joueur 1", "Club", "Class.", "V", "Score", "V", "Joueur 2", "Club", "Class."] : ["Heure", "Tab.", "Joueur 1", "Cl.", "V", "Score", "V", "Joueur 2", "Cl."];
  return (
    <div style={{ ...base, alignItems: "center", gap: 8, height: 34, borderBottom: `3px solid ${C.brand}`, color: C["ink-muted"], fontSize: 16, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase" }}>
      {labels.map((l, i) => (
        <div key={`${l}-${i}`} style={{ ...base, width: m.cols[i], padding: "0 10px", justifyContent: l === "V" || l === "Class." || l === "Cl." ? "center" : "flex-start" }}>
          {l}
        </div>
      ))}
    </div>
  );
}

function Legend({ size }: { size: number }) {
  return (
    <div style={{ ...base, flexDirection: "column", gap: 2, border: `2px solid ${C.line}`, borderRadius: 10, background: C.surface, padding: "8px 16px", fontSize: size, color: C.ink }}>
      {TABLE_LEGEND.map((l) => (
        <div key={l.title} style={{ ...base, gap: 8 }}>
          <div style={{ ...base, flexShrink: 0, fontWeight: 700 }}>{l.title} :</div>
          <div style={{ ...base, flex: 1 }}>{l.items.map((i) => `${i.code} : ${i.meaning}`).join(" ; ")}</div>
        </div>
      ))}
    </div>
  );
}

function ClubBadge({ view, logo, size }: { view: PosterView; logo: string | null; size: number }) {
  if (logo) {
    return (
      <div style={{ ...base, alignItems: "center", justifyContent: "center", width: size, height: size, borderRadius: 14, background: C.surface, padding: 6 }}>
        {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
        <img src={logo} width={size - 12} height={size - 12} style={{ objectFit: "contain" }} />
      </div>
    );
  }
  return (
    <div style={{ ...base, alignItems: "center", justifyContent: "center", width: size, height: size, borderRadius: 14, background: C.gold, color: C.ink, fontFamily: "Cormorant Garamond", fontWeight: 700, fontSize: Math.round(size * 0.42) }}>
      {clubInitials(view.clubName)}
    </div>
  );
}

function Header({ view, logo, format }: { view: PosterView; logo: string | null; format: PosterFormat }) {
  const date = `${view.heading} ${formatParisDay(view.startsAt)}`;
  const grad = `linear-gradient(135deg, ${C.brand}, ${C["primary-dark"]})`;
  const titleSize = (big: number, small: number) => (view.name.length > 26 ? small : big);
  if (format === "ecran") {
    return (
      <div style={{ ...base, alignItems: "center", justifyContent: "space-between", height: HEADER_H.ecran, padding: "0 44px", background: grad, color: C["on-primary"] }}>
        <div style={{ ...base, alignItems: "center", gap: 20, width: 560 }}>
          <ClubBadge view={view} logo={logo} size={104} />
          <div style={{ ...base, flexDirection: "column", flex: 1 }}>
            <div style={{ ...base, fontFamily: "Norican", fontSize: 52, lineHeight: 1, color: C.gold }}>Ralli</div>
            <div style={{ ...base, fontSize: 28, fontWeight: 700, marginTop: 6 }}>{view.clubName}</div>
            <div style={{ ...base, fontSize: 21, color: C["on-primary-soft"] }}>{view.venue}</div>
          </div>
        </div>
        <div style={{ ...base, flex: 1, justifyContent: "center", textAlign: "center", fontFamily: "Cormorant Garamond", fontWeight: 700, fontSize: titleSize(70, 54), lineHeight: 1.05, padding: "0 20px" }}>{view.name}</div>
        <div style={{ ...base, width: 560, justifyContent: "flex-end", textAlign: "right", fontFamily: "Cormorant Garamond", fontWeight: 700, fontSize: 46, lineHeight: 1.05, color: C.gold }}>{date}</div>
      </div>
    );
  }
  return (
    <div style={{ ...base, flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, height: HEADER_H.story, padding: "0 40px", background: grad, color: C["on-primary"], textAlign: "center" }}>
      <div style={{ ...base, fontFamily: "Norican", fontSize: 56, lineHeight: 1, color: C.gold }}>Ralli</div>
      <ClubBadge view={view} logo={logo} size={92} />
      <div style={{ ...base, justifyContent: "center", fontFamily: "Cormorant Garamond", fontWeight: 700, fontSize: titleSize(68, 52), lineHeight: 1.05 }}>{view.name}</div>
      <div style={{ ...base, fontFamily: "Cormorant Garamond", fontWeight: 700, fontSize: 38, color: C.gold }}>{date}</div>
      <div style={{ ...base, fontSize: 22, color: C["on-primary-soft"] }}>{`${view.clubName} · ${view.venue}`}</div>
    </div>
  );
}

export type PosterImageInput = { view: PosterView; format: PosterFormat; page: number; logo: string | null; link: string };

/** Image PNG d'une page (numérotée à partir de 1) de l'affiche. Appelant : vérifier avant que la page existe. */
export async function renderPosterImage({ view, format, page, logo, link }: PosterImageInput, headers: Record<string, string> = {}): Promise<ImageResponse> {
  const f = POSTER_FORMATS[format];
  const pages = paginate(view.rows, f.rowsPerPage);
  const rows = pages[page - 1] ?? [];
  const note = pages.length > 1 ? (page < pages.length ? `Page ${page}/${pages.length} · Suite des matchs page ${page + 1}` : `Page ${page}/${pages.length} · Fin du programme`) : "";
  const slots = rows.map((r) => ({ timeKey: r.time }));
  const m = fit(format === "ecran" ? SCREEN : STORY, format, rows.length, slots.filter((_, i) => startsNewSlot(slots, i)).length, note !== "");

  return new ImageResponse(
    (
      <div style={{ ...base, flexDirection: "column", width: f.width, height: f.height, background: C.canvas, color: C.ink, fontFamily: "DM Sans" }}>
        <Header view={view} logo={logo} format={format} />
        <div style={{ ...base, flexDirection: "column", flex: 1, padding: `14px ${m.padX}px 0`, overflow: "hidden" }}>
          <TableHead m={m} format={format} />
          {rows.length === 0 ? (
            <div style={{ ...base, justifyContent: "center", marginTop: 60, fontSize: 30, color: C["ink-muted"] }}>Le programme du jour sera affiché ici.</div>
          ) : (
            rows.map((r, i) => <Row key={r.id} row={r} newSlot={startsNewSlot(slots, i)} m={m} format={format} />)
          )}
        </div>
        <div style={{ ...base, flexDirection: "column", gap: 6, height: FOOTER_H[format] + (note ? NOTE_H : 0), padding: `0 ${m.padX}px 14px`, justifyContent: "flex-end" }}>
          {note ? <div style={{ ...base, justifyContent: "center", fontSize: 22, fontWeight: 700, color: C.accent }}>{note}</div> : null}
          <Legend size={format === "ecran" ? 16 : 15} />
          <div style={{ ...base, justifyContent: "center", fontSize: 17, color: C["ink-muted"] }}>{link}</div>
        </div>
      </div>
    ),
    { width: f.width, height: f.height, fonts: await loadFonts(), headers },
  );
}
