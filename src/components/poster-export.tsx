"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { POSTER_FORMATS, type PosterFormat } from "@/lib/tournaments/poster";

// « Créer l'image » (personnel du tournoi) : choix du format, puis une fenêtre « Ton affiche est prête » avec une image par page,
// chacune téléchargeable ou partageable. Les images sont fabriquées par le serveur à chaque demande (jamais stockées).

const subscribe = () => () => {};
const canShareFiles = () => typeof navigator !== "undefined" && typeof navigator.canShare === "function";

const btn = "inline-flex min-h-11 items-center justify-center rounded-lg border-2 border-primary px-4 font-semibold text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

export function PosterExport({ tournamentId, pageCounts }: { tournamentId: string; pageCounts: Record<PosterFormat, number> }) {
  const [format, setFormat] = useState<PosterFormat>("ecran");
  const [stamp, setStamp] = useState(0);
  const [shareError, setShareError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const shareable = useSyncExternalStore(subscribe, canShareFiles, () => false);
  const pages = Array.from({ length: pageCounts[format] }, (_, i) => i + 1);
  const url = (page: number, download = false) => `/tournois/${tournamentId}/affiche/image?format=${format}&page=${page}&v=${stamp}${download ? "&telecharger=1" : ""}`;

  function create() {
    setStamp(Date.now()); // adresse neuve : l'image reflète les scores du moment
    setShareError("");
    dialog.current?.showModal();
  }

  async function share(page: number) {
    setShareError("");
    try {
      const blob = await (await fetch(url(page))).blob();
      const file = new File([blob], `affiche-${format}-${page}.png`, { type: "image/png" });
      if (!navigator.canShare({ files: [file] })) {
        setShareError("Ton navigateur ne peut pas partager cette image : télécharge-la, puis envoie-la depuis tes photos.");
        return;
      }
      await navigator.share({ files: [file] });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return; // partage annulé : rien à signaler
      setShareError("Le partage n'a pas marché : télécharge l'image, puis envoie-la depuis tes photos.");
    }
  }

  return (
    <div className="space-y-3 rounded-2xl bg-surface p-4 shadow-sm" data-testid="poster-export">
      <h2 className="font-serif text-xl text-primary">Créer l&apos;image de l&apos;affiche</h2>
      <fieldset className="space-y-1">
        <legend className="font-medium">Format</legend>
        {(Object.keys(POSTER_FORMATS) as PosterFormat[]).map((f) => (
          <label key={f} className="flex min-h-11 cursor-pointer items-center gap-3">
            <input type="radio" name="poster-format" value={f} checked={format === f} onChange={() => setFormat(f)} className="size-5 accent-primary" />
            <span>
              {POSTER_FORMATS[f].label} <span className="text-sm text-ink-muted">({POSTER_FORMATS[f].width} × {POSTER_FORMATS[f].height} px, {pageCounts[f]} image{pageCounts[f] > 1 ? "s" : ""})</span>
            </span>
          </label>
        ))}
      </fieldset>
      <button type="button" onClick={create} className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-primary px-4 font-semibold text-on-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" data-testid="poster-create">
        {pageCounts[format] > 1 ? `Créer les ${pageCounts[format]} images` : "Créer l'image"}
      </button>

      <dialog ref={dialog} aria-label="Ton affiche est prête" className="m-auto max-h-[92dvh] w-[min(92vw,48rem)] overflow-y-auto rounded-2xl bg-surface p-4 text-ink backdrop:bg-ink/60" data-testid="poster-ready">
        <div className="space-y-4">
          <h2 className="font-serif text-2xl text-primary">Ton affiche est prête</h2>
          <p className="text-sm text-ink-muted">Sur ordinateur : clic droit sur l&apos;image, puis « Enregistrer l&apos;image ». Sur téléphone : appui long sur l&apos;image.</p>
          {shareError && (
            <p role="alert" className="text-sm font-semibold text-ink">
              ⚠ {shareError}
            </p>
          )}
          <ul className="space-y-5">
            {pages.map((n) => (
              <li key={n} className="space-y-2" data-testid="poster-image-item">
                {/* Image fabriquée par le serveur à la demande : pas d'optimiseur. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url(n)} alt={`Affiche, image ${n} sur ${pages.length}`} loading="lazy" className="w-full rounded-lg border border-line bg-pale" data-testid="poster-image" />
                <div className="flex flex-wrap gap-3">
                  <a href={url(n, true)} download className={btn} data-testid="poster-download">
                    {pages.length > 1 ? `Télécharger l'image ${n}` : "Télécharger"}
                  </a>
                  {shareable && (
                    <button type="button" onClick={() => void share(n)} className={btn} data-testid="poster-share">
                      {pages.length > 1 ? `Partager l'image ${n}` : "Partager"}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => dialog.current?.close()} className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-primary px-4 font-semibold text-on-primary" data-testid="poster-close">
            Fermer
          </button>
        </div>
      </dialog>
    </div>
  );
}
