import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { AVATARS, DEFAULT_AVATAR_KEY, avatarSrc, isAvatarKey, pickAvatarKey } from "./avatars";

describe("avatars prédéfinis", () => {
  it("12 avatars, clés uniques, et un fichier SVG pour chacun", () => {
    expect(AVATARS).toHaveLength(12);
    expect(new Set(AVATARS.map((a) => a.key)).size).toBe(12);
    for (const a of AVATARS) expect(existsSync(`public/avatar/${a.key}.svg`), a.key).toBe(true);
  });

  it("reconnaît les clés valides seulement", () => {
    expect(isAvatarKey("smash")).toBe(true);
    expect(isAvatarKey("../etc/passwd")).toBe(false);
    expect(isAvatarKey(undefined)).toBe(false);
  });

  it("le tirage couvre toute la liste, bornes comprises", () => {
    expect(pickAvatarKey(() => 0)).toBe(AVATARS[0].key);
    expect(pickAvatarKey(() => 0.999999)).toBe(AVATARS[11].key);
    expect(pickAvatarKey(() => 1)).toBe(AVATARS[11].key);
  });
});

describe("avatarSrc", () => {
  const base = { id: "u1", avatarKey: "volee", avatarPhotoAt: null };
  it("avatar prédéfini sans photo", () => expect(avatarSrc(base)).toBe("/avatar/volee.svg"));
  it("la photo prend le dessus, et la date change l'adresse", () => {
    const a = avatarSrc({ ...base, avatarPhotoAt: new Date(1000) });
    const b = avatarSrc({ ...base, avatarPhotoAt: new Date(2000) });
    expect(a).toBe("/api/avatar/u1?v=1000");
    expect(a).not.toBe(b);
  });
  it("une clé inconnue retombe sur l'avatar par défaut", () => {
    expect(avatarSrc({ ...base, avatarKey: "n'importe quoi" })).toBe(`/avatar/${DEFAULT_AVATAR_KEY}.svg`);
  });
});
