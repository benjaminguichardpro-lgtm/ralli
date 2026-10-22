import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { POSTER_COLORS } from "./poster-colors";

const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");

describe("couleurs de l'affiche en image", () => {
  it.each(Object.entries(POSTER_COLORS))("%s = jeton de globals.css", (token, value) => {
    const m = new RegExp(`--color-${token}:\\s*(#[0-9a-fA-F]{6})`).exec(css);
    expect(m, `jeton --color-${token} absent de globals.css`).not.toBeNull();
    expect(m![1]!.toLowerCase()).toBe(value);
  });
});
