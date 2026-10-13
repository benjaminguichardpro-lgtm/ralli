"use client";

import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import { useEffect, useRef } from "react";
import type { MapClub } from "@/lib/clubs/map";

// Carte OpenStreetMap des clubs (Leaflet). Chargée côté navigateur seulement. Les épingles proches sont groupées en une
// pastille avec un nombre ; toucher une épingle ouvre une petite carte (nom, ville, compteur, lien vers le club).
// Le contenu des fenêtres est construit avec des noeuds DOM (textContent) : un nom de club n'est jamais interprété comme du HTML.

const FRANCE_CENTER: [number, number] = [46.6, 2.5];

export function ClubMap({ clubs, interactive = true, className = "" }: { clubs: MapClub[]; interactive?: boolean; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let disposed = false;
    let cleanup = () => {};
    (async () => {
      const L = (await import("leaflet")).default;
      await import("leaflet.markercluster");
      if (disposed) return;
      const map = L.map(el, {
        center: FRANCE_CENTER,
        zoom: 5,
        zoomControl: false,
        dragging: interactive,
        scrollWheelZoom: interactive,
        doubleClickZoom: interactive,
        touchZoom: interactive,
        boxZoom: interactive,
        keyboard: interactive,
        attributionControl: true,
      });
      if (interactive) L.control.zoom({ position: "bottomright" }).addTo(map); // en bas : le haut est pris par les filtres
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);

      const pin = L.divIcon({
        className: "",
        html: '<span class="block size-5 rounded-full border-2 border-on-primary bg-primary shadow-md"></span>',
        iconSize: [20, 20],
        iconAnchor: [10, 10],
        popupAnchor: [0, -12],
      });
      const group = L.markerClusterGroup({
        showCoverageOnHover: false,
        maxClusterRadius: 45,
        iconCreateFunction: (cluster) => {
          const n = cluster.getChildCount();
          return L.divIcon({
            className: "",
            html: `<span class="flex size-10 items-center justify-center rounded-full border-2 border-gold bg-primary-dark text-sm font-bold text-gold shadow-md">${n}</span>`,
            iconSize: [40, 40],
          });
        },
      });
      const points: [number, number][] = [];
      for (const c of clubs) {
        const marker = L.marker([c.latitude, c.longitude], { icon: pin, title: c.name, keyboard: interactive });
        if (interactive) marker.bindPopup(popupContent(c), { minWidth: 180 });
        group.addLayer(marker);
        points.push([c.latitude, c.longitude]);
      }
      map.addLayer(group);
      if (points.length > 0) map.fitBounds(L.latLngBounds(points), { padding: [28, 28], maxZoom: 12 });
      cleanup = () => map.remove();
    })();
    return () => {
      disposed = true;
      cleanup();
    };
  }, [clubs, interactive]);

  return <div ref={ref} className={`z-0 w-full overflow-hidden rounded-2xl bg-pale ${className}`} data-testid={interactive ? "club-map" : "club-map-preview"} />;
}

function popupContent(c: MapClub): HTMLElement {
  const box = document.createElement("div");
  box.className = "space-y-1";
  const name = document.createElement("a");
  name.href = `/clubs/${c.id}`;
  name.textContent = c.name;
  name.className = "block font-serif text-lg font-semibold text-primary underline";
  name.dataset.testid = "map-popup-link";
  box.append(name);
  if (c.place) {
    const place = document.createElement("p");
    place.textContent = c.place;
    place.className = "text-sm text-ink-muted";
    box.append(place);
  }
  const followers = document.createElement("p");
  followers.textContent = c.followersLabel;
  followers.className = "text-sm text-ink-muted";
  box.append(followers);
  return box;
}
