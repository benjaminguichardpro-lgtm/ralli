"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { addStoryToWallAction, createStoryAction, deleteCollectionAction, deleteStoryAction, markStoryViewedAction, removeStoryFromWallAction, setCollectionPinnedAction } from "@/app/actions/stories";
import { initialFormState } from "@/app/actions/types";
import { STORY_BACKGROUNDS, STORY_BACKGROUND_KEYS, STORY_BODY_MAX, type StoryBackground, COLLECTION_NAME_MAX } from "@/lib/stories";
import { clubInitials, logoSrc } from "@/lib/clubs/profile";
import { WINS_RING_LABEL } from "@/lib/win-cards";
import type { WinCardData } from "@/server/win-cards";
import { FormMessage, Select, SubmitButton, confirmOnSubmit } from "./ui";
import { WinCard } from "./win-card";
import { WinCardActions } from "./win-card-actions";

// Les dates passent en texte (ISO) du serveur au navigateur.
export type StoryData = {
  id: string;
  clubId: string;
  kind: "CLUB_POST" | "WIN_CARD";
  body: string;
  background: string;
  createdAt: string;
  authorName: string;
  author: { id: string; avatarKey: string; avatarPhotoAt: string | null };
  isMine: boolean;
  winCard: WinCardData | null;
  reactions: { count: number; mine: boolean; names: string[] | null };
  canReact: boolean;
  reportedByMe: boolean;
  teamName: string | null;
  seen: boolean;
  viewCount: number | null;
  canDelete: boolean;
  canManageWall: boolean;
  collection: { id: string; name: string } | null;
};
export type RingData = {
  key: string;
  clubId: string;
  clubName: string;
  logoUpdatedAt: string | null;
  teamName: string | null;
  wins: boolean;
  unseen: number;
  stories: StoryData[];
};
/** Collection à la une (« à la une ») : un rond nommé qui ouvre ses stories. */
export type CollectionData = {
  id: string;
  clubId: string;
  clubName: string;
  logoUpdatedAt: string | null;
  name: string;
  pinned: boolean;
  isAdmin: boolean;
  coverBackground: string;
  stories: StoryData[];
};
export type TargetData = { clubId: string; clubName: string; isAdmin: boolean; teams: { id: string; name: string }[]; collections: { id: string; name: string }[] };

/** Ce que le lecteur plein écran sait afficher : un rond de stories ou une collection de la une. */
type Playable = { key: string; clubId: string; clubName: string; teamName: string | null; wins?: boolean; stories: StoryData[]; collection?: { id: string; name: string; pinned: boolean; isAdmin: boolean } };

const bg = (key: string) => (STORY_BACKGROUNDS[key as StoryBackground] ?? STORY_BACKGROUNDS.brand).classes;
const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });

/**
 * Bandeau de stories : le « + » (admins et capitaines) puis un rond par club ou équipe ayant une story vivante.
 * Sur la page d'un club, une seconde rangée affiche « à la une » du club : un rond nommé par collection (« à la une »).
 */
export function StoriesBar({ rings, targets, collections = [] }: { rings: RingData[]; targets: TargetData[]; collections?: CollectionData[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const playable: Playable | null = (() => {
    const ring = rings.find((r) => r.key === open);
    if (ring) return ring;
    const c = collections.find((x) => `collection:${x.id}` === open);
    return c ? { key: `collection:${c.id}`, clubId: c.clubId, clubName: c.clubName, teamName: null, stories: c.stories, collection: { id: c.id, name: c.name, pinned: c.pinned, isAdmin: c.isAdmin } } : null;
  })();
  if (rings.length === 0 && targets.length === 0 && collections.length === 0) return null;
  return (
    <div className="space-y-3" data-testid="stories-bar">
      {(rings.length > 0 || targets.length > 0) && (
        <ul className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-1">
          {targets.length > 0 && (
            <li className="flex w-[4.5rem] shrink-0 flex-col items-center gap-1">
              <button
                type="button"
                onClick={() => setComposing(true)}
                aria-label="Publier une story"
                data-testid="story-add"
                className="grid size-16 place-items-center rounded-full border-2 border-dashed border-primary bg-surface font-serif text-3xl text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                +
              </button>
              <span className="text-xs text-ink-muted">Publier</span>
            </li>
          )}
          {rings.map((r) => (
            <li key={r.key} className="flex w-[4.5rem] shrink-0 flex-col items-center gap-1">
              <button
                type="button"
                onClick={() => setOpen(r.key)}
                aria-label={`${r.wins ? WINS_RING_LABEL : "Stories"} de ${r.clubName}${r.teamName ? ` · ${r.teamName}` : ""}${r.unseen > 0 ? ` (${r.unseen} non vue${r.unseen > 1 ? "s" : ""})` : ""}`}
                data-testid="story-ring"
                data-unseen={r.unseen > 0 ? "true" : "false"}
                className={`grid size-16 place-items-center rounded-full border-[3px] p-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${r.unseen > 0 ? "border-accent" : "border-line"}`}
              >
                {r.wins ? <WinsFace /> : <ClubFace name={r.clubName} id={r.clubId} logoUpdatedAt={r.logoUpdatedAt} />}
              </button>
              <span className="w-full truncate text-center text-xs text-ink-muted">{r.wins ? WINS_RING_LABEL : (r.teamName ?? r.clubName)}</span>
            </li>
          ))}
        </ul>
      )}
      {collections.length > 0 && (
        <div className="space-y-1" data-testid="club-wall">
          <h2 className="font-serif text-xl text-primary">À la une</h2>
          <ul className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-1">
            {collections.map((c) => (
              <li key={c.id} className="flex w-[4.5rem] shrink-0 flex-col items-center gap-1">
                <button
                  type="button"
                  onClick={() => setOpen(`collection:${c.id}`)}
                  aria-label={`Collection ${c.name}${c.pinned ? " (épinglée)" : ""}`}
                  data-testid="wall-collection"
                  data-pinned={c.pinned ? "true" : "false"}
                  className="relative grid size-16 place-items-center rounded-full border-[3px] border-line p-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  <span aria-hidden="true" className={`grid size-[3.25rem] place-items-center rounded-full font-serif text-2xl font-bold ${bg(c.coverBackground)}`}>
                    {c.name.trim().charAt(0).toLocaleUpperCase("fr-FR")}
                  </span>
                  {c.pinned && (
                    <span aria-hidden="true" className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-accent text-xs text-on-accent">
                      ★
                    </span>
                  )}
                </button>
                <span className="w-full truncate text-center text-xs text-ink-muted" data-testid="wall-collection-name">
                  {c.name}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {playable && <StoryViewer key={playable.key} ring={playable} targets={targets} onClose={() => setOpen(null)} />}
      {composing && <Composer targets={targets} onClose={() => setComposing(false)} />}
    </div>
  );
}

/** Rond « Rallis gagnants » : un trophée doré. */
function WinsFace() {
  return (
    <span aria-hidden="true" className="grid size-[3.25rem] place-items-center rounded-full bg-gold text-on-gold">
      <svg viewBox="0 0 24 24" className="size-7 fill-none stroke-current" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 4h8v5a4 4 0 0 1-8 0V4z" />
        <path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4" />
        <path d="M12 13v4M9 20h6M10 17h4" />
      </svg>
    </span>
  );
}

function ClubFace({ name, id, logoUpdatedAt }: { name: string; id: string; logoUpdatedAt: string | null }) {
  const src = logoSrc({ id, logoUpdatedAt: logoUpdatedAt ? new Date(logoUpdatedAt) : null });
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" width={52} height={52} className="size-[3.25rem] rounded-full bg-surface object-contain p-1" />;
  }
  return (
    <span aria-hidden="true" className="grid size-[3.25rem] place-items-center rounded-full bg-brand font-serif text-lg font-bold text-on-primary">
      {clubInitials(name)}
    </span>
  );
}

function StoryViewer({ ring, targets, onClose }: { ring: Playable; targets: TargetData[]; onClose: () => void }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const firstUnseen = ring.stories.findIndex((s) => !s.seen);
  const [index, setIndex] = useState(ring.collection || firstUnseen === -1 ? 0 : firstUnseen);
  const at = Math.min(index, ring.stories.length - 1);
  const story = ring.stories[at];
  const [del, delAction] = useActionState(deleteStoryAction, initialFormState);

  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
  }, []);

  // Une story est « vue » dès qu'elle s'affiche en plein écran (le serveur ignore celles qui ont expiré).
  useEffect(() => {
    if (story) void markStoryViewedAction(story.id);
  }, [story]);

  const close = () => {
    dialog.current?.close();
    onClose();
    router.refresh(); // les liserés se mettent à jour
  };

  useEffect(() => {
    if (del.ok) close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [del]);

  if (!story) return null;
  const last = at === ring.stories.length - 1;
  return (
    <dialog ref={dialog} className="story-viewer" aria-label={ring.collection ? `Collection ${ring.collection.name}` : `${ring.wins ? WINS_RING_LABEL : "Stories"} de ${ring.clubName}`} data-testid="story-viewer" onClose={() => { onClose(); router.refresh(); }}>
      <div className="mx-auto flex h-full w-full max-w-xl flex-col overflow-y-auto">
        <div className="flex gap-1 px-3 pt-3" aria-hidden="true">
          {ring.stories.map((s, i) => (
            <span key={s.id} className={`h-1 flex-1 rounded-full ${i <= at ? "bg-gold" : "bg-on-primary-soft/40"}`} />
          ))}
        </div>
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <p className="min-w-0 truncate text-sm">
            <strong className="font-semibold" data-testid="story-title">
              {ring.collection ? ring.collection.name : ring.wins ? WINS_RING_LABEL : ring.clubName}
            </strong>
            {ring.collection ? ` · ${ring.clubName}` : story.teamName ? ` · ${story.teamName}` : ""}
            <span className="text-on-primary-soft"> · {story.authorName} · {timeLabel(story.createdAt)}</span>
          </p>
          <button type="button" onClick={close} aria-label="Fermer" className="grid size-11 shrink-0 place-items-center rounded-full text-2xl focus-visible:outline-2 focus-visible:outline-gold">
            ×
          </button>
        </div>
        <div className={`relative mx-3 grid min-h-64 flex-1 place-items-center rounded-2xl p-6 ${bg(story.background)}`} data-testid="story-card">
          {story.winCard ? (
            <WinCard card={story.winCard} author={{ name: story.authorName, avatar: { ...story.author, avatarPhotoAt: story.author.avatarPhotoAt ? new Date(story.author.avatarPhotoAt) : null } }} comment={story.body} className="w-full" />
          ) : (
            <p className="whitespace-pre-wrap break-words text-center font-serif text-3xl font-semibold leading-snug" data-testid="story-text">
              {story.body}
            </p>
          )}
          <button type="button" onClick={() => setIndex(Math.max(0, at - 1))} disabled={at === 0} aria-label="Story précédente" className="absolute inset-y-0 left-0 w-1/3 rounded-l-2xl focus-visible:outline-2 focus-visible:outline-gold" />
          <button type="button" onClick={() => (last ? close() : setIndex(at + 1))} aria-label={last ? "Terminer les stories" : "Story suivante"} className="absolute inset-y-0 right-0 w-2/3 rounded-r-2xl focus-visible:outline-2 focus-visible:outline-gold" />
        </div>
        <div className="flex items-center justify-between gap-3 px-4 py-4">
          <p className="text-sm text-on-primary-soft" data-testid="story-views">
            {story.viewCount === null ? "" : `Vue par ${story.viewCount} membre${story.viewCount > 1 ? "s" : ""}`}
          </p>
          {story.canDelete && (
            <form action={delAction} onSubmit={confirmOnSubmit("Supprimer cette story ? Elle disparaîtra pour tout le club.")}>
              <input type="hidden" name="storyId" value={story.id} />
              <button type="submit" className="min-h-11 rounded-lg border border-on-primary-soft px-4 text-sm font-semibold">
                Supprimer
              </button>
            </form>
          )}
        </div>
        {del.message && !del.ok && <p role="alert" className="px-4 pb-3 text-sm font-semibold">⚠ {del.message}</p>}
        {story.winCard && <WinCardActions key={`win-${story.id}`} story={story} />}
        {story.canManageWall && <WallControls key={story.id} story={story} collections={targets.find((t) => t.clubId === story.clubId)?.collections ?? []} />}
        {ring.collection?.isAdmin && <CollectionControls key={ring.collection.id} collection={ring.collection} onDeleted={close} />}
      </div>
    </dialog>
  );
}

/** Choix de la collection de la une : une existante, ou « Nouvelle collection » avec son nom (comme les « à la une » d'Instagram). */
function CollectionPicker({
  collections,
  collectionId,
  onId,
  name,
  onName,
  dark = false,
}: {
  collections: { id: string; name: string }[];
  collectionId: string;
  onId: (v: string) => void;
  name: string;
  onName: (v: string) => void;
  dark?: boolean;
}) {
  const creating = collections.length === 0 || collectionId === "";
  const field = dark ? "border-on-primary-soft bg-surface text-ink" : "border-ink-muted bg-surface text-ink";
  return (
    <div className="space-y-2">
      {collections.length > 0 && (
        <div className="space-y-1">
          <label htmlFor="collection-choice" className="block text-sm font-medium">
            Collection à la une
          </label>
          <select id="collection-choice" value={collectionId} onChange={(e) => onId(e.target.value)} className={`block min-h-11 w-full rounded-lg border px-3 ${field}`}>
            {collections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            <option value="">Nouvelle collection…</option>
          </select>
        </div>
      )}
      {creating && (
        <div className="space-y-1">
          <label htmlFor="collection-name" className="block text-sm font-medium">
            Nom de la collection
          </label>
          <input id="collection-name" value={name} onChange={(e) => onName(e.target.value)} maxLength={COLLECTION_NAME_MAX} autoComplete="off" className={`block min-h-11 w-full rounded-lg border px-3 ${field}`} />
          <p className={`text-xs ${dark ? "text-on-primary-soft" : "text-ink-muted"}`}>
            {name.length}/{COLLECTION_NAME_MAX} · Exemple : « Tournoi d&apos;été », « Infos de la saison »
          </p>
        </div>
      )}
    </div>
  );
}

/** Admin : ajouter la story à une collection de la une, ou l'en retirer. */
function WallControls({ story, collections }: { story: StoryData; collections: { id: string; name: string }[] }) {
  const [adding, setAdding] = useState(false);
  const [addState, addAction] = useActionState(addStoryToWallAction, initialFormState);
  const [removeState, removeAction] = useActionState(removeStoryFromWallAction, initialFormState);
  const [collectionId, setCollectionId] = useState(collections[0]?.id ?? "");
  const [name, setName] = useState("");
  const formOpen = adding && !addState.ok;
  const creating = collections.length === 0 || collectionId === "";
  return (
    <div className="space-y-3 border-t border-on-primary-soft/30 px-4 py-3" data-testid="story-wall-controls">
      {story.collection ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm" data-testid="story-on-wall">
            À la une : <strong>{story.collection.name}</strong>
          </p>
          <form action={removeAction} onSubmit={confirmOnSubmit("Retirer cette story de la une du club ? Elle reste visible jusqu'à ses 24 h.")}>
            <input type="hidden" name="storyId" value={story.id} />
            <button type="submit" className="min-h-11 rounded-lg border border-on-primary-soft px-4 text-sm font-semibold">
              Retirer de la une
            </button>
          </form>
        </div>
      ) : formOpen ? (
        <form action={addAction} className="space-y-3" noValidate>
          <input type="hidden" name="storyId" value={story.id} />
          <input type="hidden" name="collectionId" value={creating ? "" : collectionId} />
          <input type="hidden" name="collectionName" value={creating ? name : ""} />
          <CollectionPicker collections={collections} collectionId={collectionId} onId={setCollectionId} name={name} onName={setName} dark />
          <button type="submit" disabled={creating && name.trim().length === 0} className="min-h-11 rounded-lg bg-gold px-4 font-semibold text-on-gold disabled:opacity-50">
            Ajouter
          </button>
        </form>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="min-h-11 rounded-lg border border-on-primary-soft px-4 text-sm font-semibold">
          Ajouter à la une
        </button>
      )}
      {addState.message && !addState.ok && <p role="alert" className="text-sm font-semibold">⚠ {addState.message}</p>}
      {(addState.ok || removeState.ok) && <p role="status" className="text-sm font-semibold text-gold">✓ {addState.ok ? addState.message : removeState.message}</p>}
      {removeState.message && !removeState.ok && <p role="alert" className="text-sm font-semibold">⚠ {removeState.message}</p>}
    </div>
  );
}

/** Admin, depuis une collection : l'épingler en tête de la une, ou la supprimer (les stories ne sont pas supprimées). */
function CollectionControls({ collection, onDeleted }: { collection: { id: string; name: string; pinned: boolean }; onDeleted: () => void }) {
  const [pinState, pinAction] = useActionState(setCollectionPinnedAction, initialFormState);
  const [delState, delAction] = useActionState(deleteCollectionAction, initialFormState);
  useEffect(() => {
    if (delState.ok) onDeleted();
  }, [delState, onDeleted]);
  return (
    <div className="space-y-2 border-t border-on-primary-soft/30 px-4 py-3" data-testid="collection-controls">
      <p className="text-sm text-on-primary-soft">Collection « {collection.name} »</p>
      <div className="flex flex-wrap gap-3">
        <form action={pinAction}>
          <input type="hidden" name="collectionId" value={collection.id} />
          <input type="hidden" name="pinned" value={collection.pinned ? "false" : "true"} />
          <button type="submit" className="min-h-11 rounded-lg border border-on-primary-soft px-4 text-sm font-semibold">
            {collection.pinned ? "Désépingler" : "Épingler en premier"}
          </button>
        </form>
        <form action={delAction} onSubmit={confirmOnSubmit(`Supprimer la collection « ${collection.name} » de la une ? Les stories ne sont pas supprimées.`)}>
          <input type="hidden" name="collectionId" value={collection.id} />
          <button type="submit" className="min-h-11 rounded-lg border border-on-primary-soft px-4 text-sm font-semibold">
            Supprimer la collection
          </button>
        </form>
      </div>
      {pinState.message && <p role="alert" className="text-sm font-semibold">⚠ {pinState.message}</p>}
      {delState.message && !delState.ok && <p role="alert" className="text-sm font-semibold">⚠ {delState.message}</p>}
    </div>
  );
}

function Composer({ targets, onClose }: { targets: TargetData[]; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [state, action] = useActionState(createStoryAction, initialFormState);
  const [clubId, setClubId] = useState(targets[0]!.clubId);
  const target = targets.find((t) => t.clubId === clubId) ?? targets[0]!;
  const [teamId, setTeamId] = useState("");
  const [body, setBody] = useState("");
  const [background, setBackground] = useState<StoryBackground>("brand");
  const [onWall, setOnWall] = useState(false);
  const [collectionPick, setCollectionPick] = useState<string | null>(null); // null = pas encore choisi : la première collection
  const [collectionName, setCollectionName] = useState("");
  // L'aperçu reste affiché tant que le serveur n'a pas répondu : une réponse (erreur) ramène à la saisie.
  const [previewOf, setPreviewOf] = useState<object | null>(null);
  const step = previewOf === state ? "preview" : "edit";

  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
  }, []);

  // Réussite : on ferme.
  useEffect(() => {
    if (state.ok) {
      dialog.current?.close();
      onClose();
    }
  }, [state, onClose]);

  const wall = onWall && target.isAdmin;
  const collectionId = collectionPick ?? target.collections[0]?.id ?? "";
  const creating = target.collections.length === 0 || collectionId === "";
  const chosenName = creating ? collectionName.trim() : (target.collections.find((c) => c.id === collectionId)?.name ?? "");
  const effectiveTeam = target.isAdmin ? "" : teamId || target.teams[0]?.id || "";
  const teamName = target.teams.find((t) => t.id === effectiveTeam)?.name ?? null;
  const tooLong = body.length > STORY_BODY_MAX;
  const empty = body.trim().length === 0 || (wall && chosenName.length === 0);
  const audience = teamName ? `l'équipe ${teamName} de ${target.clubName}` : `tout le club ${target.clubName}`;

  return (
    <dialog ref={dialog} className="sheet" aria-label="Publier une story" data-testid="story-composer" onClose={onClose}>
      <form action={action} className="mx-auto grid max-h-[90dvh] w-full max-w-xl gap-4 overflow-y-auto rounded-t-3xl bg-surface px-5 pb-6 pt-4" noValidate>
        <input type="hidden" name="clubId" value={target.clubId} />
        <input type="hidden" name="teamId" value={effectiveTeam} />
        <input type="hidden" name="background" value={background} />
        <input type="hidden" name="body" value={body} />
        {wall && <input type="hidden" name="onWall" value="on" />}
        {wall && <input type="hidden" name="collectionId" value={creating ? "" : collectionId} />}
        {wall && <input type="hidden" name="collectionName" value={creating ? collectionName : ""} />}
        <h2 className="font-serif text-2xl text-primary">Publier une story</h2>

        <div hidden={step !== "edit"} className="grid gap-4">
          {targets.length > 1 && (
            <Select label="Club" name="club-choice" value={clubId} onChange={(e) => { setClubId(e.target.value); setTeamId(""); setCollectionPick(null); }} options={targets.map((t) => ({ value: t.clubId, label: t.clubName }))} />
          )}
          {!target.isAdmin && target.teams.length > 1 && (
            <Select label="Équipe" name="team-choice" value={effectiveTeam} onChange={(e) => setTeamId(e.target.value)} options={target.teams.map((t) => ({ value: t.id, label: t.name }))} />
          )}
          <div className="space-y-1">
            <label htmlFor="story-body" className="block font-medium">
              Ton message
            </label>
            <textarea id="story-body" rows={4} value={body} onChange={(e) => setBody(e.target.value)} className="block w-full rounded-lg border border-ink-muted bg-surface px-3 py-2" />
            <p className={`text-sm ${tooLong ? "font-semibold text-ink" : "text-ink-muted"}`} data-testid="story-counter">
              {body.length}/{STORY_BODY_MAX}
            </p>
          </div>
          <fieldset className="space-y-2">
            <legend className="font-medium">Fond</legend>
            <div className="flex flex-wrap gap-3">
              {STORY_BACKGROUND_KEYS.map((k) => (
                <label key={k} className="cursor-pointer">
                  <input type="radio" name="bg-choice" value={k} checked={background === k} onChange={() => setBackground(k)} className="peer sr-only" />
                  <span className={`grid size-11 place-items-center rounded-full border-2 border-line text-sm font-bold peer-checked:border-primary peer-checked:ring-2 peer-checked:ring-primary peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary ${STORY_BACKGROUNDS[k].classes}`}>
                    Aa
                    <span className="sr-only">{STORY_BACKGROUNDS[k].label}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          {target.isAdmin && (
            <label className="flex min-h-11 items-center gap-3">
              <input type="checkbox" checked={onWall} onChange={(e) => setOnWall(e.target.checked)} className="size-5 accent-primary" />
              <span>Aussi à la une du club</span>
            </label>
          )}
          {wall && <CollectionPicker collections={target.collections} collectionId={collectionId} onId={setCollectionPick} name={collectionName} onName={setCollectionName} />}
          <FormMessage signal={state} ok={state.ok}>{state.message}</FormMessage>
          <div className="flex gap-3">
            <button type="button" onClick={() => dialog.current?.close()} className="min-h-11 flex-1 rounded-lg border border-primary px-4 font-semibold text-primary">
              Annuler
            </button>
            <button type="button" disabled={empty || tooLong} onClick={() => setPreviewOf(state)} className="min-h-11 flex-1 rounded-lg bg-primary px-4 font-semibold text-on-primary disabled:opacity-50">
              Aperçu
            </button>
          </div>
        </div>

        <div hidden={step !== "preview"} className="grid gap-4" data-testid="story-preview">
          <div className={`grid min-h-40 place-items-center rounded-2xl p-6 ${bg(background)}`}>
            <p className="whitespace-pre-wrap break-words text-center font-serif text-2xl font-semibold">{body}</p>
          </div>
          <p className="font-medium">
            Publier pour {audience} ?{wall ? ` Elle restera aussi à la une du club, dans la collection « ${chosenName} ».` : ""}
          </p>
          <div className="flex gap-3">
            <button type="button" onClick={() => setPreviewOf(null)} className="min-h-11 flex-1 rounded-lg border border-primary px-4 font-semibold text-primary">
              Modifier
            </button>
            <SubmitButton className="flex-1" pendingLabel="Publication…">
              Publier
            </SubmitButton>
          </div>
        </div>
      </form>
    </dialog>
  );
}
