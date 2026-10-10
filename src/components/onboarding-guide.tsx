"use client";

import { useEffect, useRef, useState } from "react";
import { markOnboardingSeenAction } from "@/app/actions/onboarding";

type Step = { target: string; title: string; text: string; textNoClub?: string };

// Les éléments sont repérés par leur attribut data-tour (solde et avatar dans l'en-tête, onglets dans la barre du bas).
const STEPS: readonly Step[] = [
  {
    target: "solde",
    title: "Ton solde",
    text: "Tes Aces. Ils baissent quand tu engages un pronostic et montent quand tu as raison.",
  },
  {
    target: "matchs",
    title: "Matchs",
    text: "Les rencontres de tes clubs. Touche une rencontre, puis la cote du joueur que tu penses gagnant, choisis ton montant et valide ton ralli.",
    textNoClub: "Ici tu verras les rencontres de ton club. Touche une rencontre, puis une cote, choisis ton montant et valide ton ralli. Rejoins d'abord un club.",
  },
  {
    target: "rallis",
    title: "Mes rallis",
    text: "Tes rallis en cours et terminés : gagné, perdu ou remboursé, avec ton bilan et l'historique de tes Aces.",
    textNoClub: "Ici tu verras tes rallis, en cours puis terminés : gagné, perdu ou remboursé, avec ton bilan et l'historique de tes Aces.",
  },
  {
    target: "classement",
    title: "Classement",
    text: "Ta place parmi les membres de ton club, selon tes résultats.",
    textNoClub: "Ici tu verras ton classement dans ton club, une fois que tu en auras rejoint un.",
  },
  {
    target: "club",
    title: "Club",
    text: "Ton club : ses équipes, ses membres, et comment inviter tes coéquipiers.",
    textNoClub: "Ici tu peux rejoindre un club avec son code d'invitation, ou en créer un.",
  },
  {
    target: "profil",
    title: "Ton profil",
    text: "Ton profil : change ton avatar ou ta photo, ton mot de passe, et revois ce guide quand tu veux.",
  },
];

/** Si l'élément n'apparaît pas (page encore en chargement…), on attend ce temps au plus, puis on passe à l'étape suivante. */
const WAIT_FOR_TARGET_MS = 1500;
const POLL_MS = 100;
const PAD = 6; // marge du cadre autour de l'élément
const GAP = 14; // distance entre le cadre et la bulle
const MIN_RADIUS = 16; // coins du cadre au moins aussi arrondis que la bulle (rounded-2xl) ; un élément déjà plus rond (pastille, avatar) garde sa forme
const EDGE = 4; // le cadre reste au moins à cette distance du bord de l'écran (son contour doré ne doit pas être coupé)

type Spot = { top: number; left: number; width: number; height: number; radius: string };
const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max);

/**
 * Écran d'accueil (monnaie fictive), puis visite guidée des éléments de l'app, sur la vraie page.
 * `onClose` est appelé une seule fois quand la personne a fini ou passé (« Passer », Échap, « Terminer »).
 */
export function Guide({ hasClub, onClose }: { hasClub: boolean; onClose: () => void }) {
  // null = écran d'accueil ; sinon numéro de l'étape de la visite.
  const [step, setStep] = useState<number | null>(null);
  if (step === null) return <Welcome onTour={() => setStep(0)} onClose={onClose} />;
  return <Tour hasClub={hasClub} step={step} setStep={setStep} onClose={onClose} />;
}

function Welcome({ onTour, onClose }: { onTour: () => void; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="sheet"
      aria-label="Guide de démarrage"
      data-testid="onboarding"
      onClose={onClose}
      onClick={(e) => e.target === dialog.current && dialog.current?.close()}
    >
      <div className="mx-auto grid w-full max-w-xl gap-4 rounded-t-3xl bg-primary-dark px-5 pb-6 pt-3 text-center text-on-primary">
        <div className="mx-auto h-1 w-10 rounded-full bg-on-primary-soft opacity-60" aria-hidden="true" />
        <p className="text-xs font-bold uppercase tracking-widest text-on-primary-soft">Bienvenue sur Ralli</p>
        <h2 className="font-serif text-4xl font-semibold" data-testid="onboarding-title">
          Tu as 1 000 Aces
        </h2>
        <p className="text-on-primary-soft" data-testid="onboarding-text">
          Les Aces sont la monnaie virtuelle de Ralli, et la seule monnaie du jeu. Aucun vrai argent n&apos;est en jeu ici : rien à acheter, rien à payer, rien à retirer.
        </p>
        <p className="text-on-primary-soft">Fais le tour de l&apos;app en 30 secondes.</p>
        <button
          type="button"
          onClick={() => {
            // Le dialogue disparaît de l'écran (démonté) : pas de fermeture à signaler, la visite prend le relais.
            onTour();
          }}
          className="inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-gold px-4 font-semibold text-on-gold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
        >
          Faire la visite
        </button>
        <button
          type="button"
          onClick={() => dialog.current?.close()}
          className="inline-flex min-h-11 items-center justify-center px-4 font-semibold text-on-primary-soft underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
        >
          Passer
        </button>
      </div>
    </dialog>
  );
}

function Tour({ hasClub, step, setStep, onClose }: { hasClub: boolean; step: number; setStep: (n: number) => void; onClose: () => void }) {
  const last = STEPS.length - 1;
  const s = STEPS[step]!;
  const [spot, setSpot] = useState<Spot | null>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const next = useRef<HTMLButtonElement>(null);

  // Repère l'élément de l'étape (avec un peu de patience), puis suit ses déplacements (rotation, défilement).
  useEffect(() => {
    const find = () => document.querySelector<HTMLElement>(`[data-tour="${s.target}"]`);
    const measure = () => {
      const el = find();
      if (!el) return;
      const r = el.getBoundingClientRect();
      const top = Math.max(r.top - PAD, EDGE);
      const left = Math.max(r.left - PAD, EDGE);
      const right = Math.min(r.right + PAD, window.innerWidth - EDGE);
      const bottom = Math.min(r.bottom + PAD, window.innerHeight - EDGE);
      setSpot({ top, left, width: right - left, height: bottom - top, radius: Math.max(parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0, MIN_RADIUS) + "px" });
    };
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const el = find();
      if (el) {
        el.scrollIntoView({ block: "nearest" });
        measure();
        return;
      }
      if (++tries * POLL_MS >= WAIT_FOR_TARGET_MS) {
        // Introuvable : on ne bloque pas l'écran, on passe à la suite (ou on termine).
        if (step < last) setStep(step + 1);
        else onClose();
        return;
      }
      timer = setTimeout(tick, POLL_MS);
    };
    timer = setTimeout(tick, 0);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [s.target, step, last, setStep, onClose]);

  // Échap = passer ; Tab reste dans la bulle ; le focus va au bouton « Suivant ».
  useEffect(() => {
    next.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "Tab" && bubble.current) {
        const items = [...bubble.current.querySelectorAll<HTMLElement>("button")];
        const first = items[0]!;
        const lastItem = items[items.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          lastItem.focus();
        } else if (!e.shiftKey && document.activeElement === lastItem) {
          e.preventDefault();
          first.focus();
        } else if (!bubble.current.contains(document.activeElement)) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [step, onClose]);

  let place: { style: React.CSSProperties; arrowLeft: number; below: boolean } | null = null;
  if (spot) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(340, vw - 32);
    const cx = spot.left + spot.width / 2;
    const left = clamp(cx - width / 2, 16, vw - width - 16);
    const below = spot.top + spot.height / 2 < vh / 2;
    place = {
      below,
      arrowLeft: clamp(cx - left - 8, 16, width - 32),
      style: below ? { top: spot.top + spot.height + GAP, left, width } : { bottom: vh - spot.top + GAP, left, width },
    };
  }

  const text = !hasClub && s.textNoClub ? s.textNoClub : s.text;
  return (
    // Le fond intercepte les touches : on ne clique pas l'app derrière la visite.
    <div className="fixed inset-0 z-50" style={{ touchAction: "none" }} data-testid="tour">
      {spot && <div className="tour-spot" data-testid="tour-spot" style={{ top: spot.top, left: spot.left, width: spot.width, height: spot.height, borderRadius: spot.radius }} />}
      {spot && place && (
        <div
          ref={bubble}
          role="dialog"
          aria-modal="true"
          aria-label="Visite guidée"
          className="fixed rounded-2xl bg-surface p-4 text-ink shadow-xl"
          style={place.style}
          data-testid="tour-bubble"
        >
          <span
            aria-hidden="true"
            className={`absolute size-4 rotate-45 bg-surface ${place.below ? "-top-2" : "-bottom-2"}`}
            style={{ left: place.arrowLeft }}
          />
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <h2 className="font-serif text-2xl font-semibold text-primary" data-testid="tour-title">
              {s.title}
            </h2>
            <p className="text-sm font-semibold text-ink-muted" data-testid="tour-counter" aria-label={`Étape ${step + 1} sur ${STEPS.length}`}>
              {step + 1}/{STEPS.length}
            </p>
          </div>
          <p className="mb-4" data-testid="tour-text">
            {text}
          </p>
          <div className="flex items-center gap-2">
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep(step - 1)}
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-primary bg-surface px-4 font-semibold text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                Précédent
              </button>
            )}
            {step < last && (
              <button
                type="button"
                onClick={onClose}
                className="inline-flex min-h-11 items-center justify-center px-2 font-semibold text-ink-muted underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                Passer
              </button>
            )}
            <button
              ref={next}
              type="button"
              onClick={() => (step < last ? setStep(step + 1) : onClose())}
              className="ml-auto inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 font-semibold text-on-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              {step < last ? "Suivant" : "Terminer"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Guide du premier lancement : à la fin ou à « Passer », le compte est marqué « vu » et la fenêtre suivante peut apparaître. */
export function OnboardingGuide({ hasClub }: { hasClub: boolean }) {
  return <Guide hasClub={hasClub} onClose={() => void markOnboardingSeenAction()} />;
}

/** Bouton « Revoir le guide » (profil) : rejoue l'écran d'accueil et la visite, sans rien enregistrer. */
export function GuideReplayButton({ hasClub }: { hasClub: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-11 items-center font-semibold text-primary underline">
        Revoir le guide
      </button>
      {open && <Guide hasClub={hasClub} onClose={() => setOpen(false)} />}
    </>
  );
}
