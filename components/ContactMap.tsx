"use client";

import { useEffect, useRef } from "react";

export type ContactMapItem = {
  id: string;
  companyName: string;
  location: string;
  phone: string;
  website: string;
  status: string;
  latitude: number;
  longitude: number;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character] || character);
}

export default function ContactMap({ items }: { items: ContactMapItem[] }) {
  const mapElementRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!mapElementRef.current) return;
    let cancelled = false;
    let cleanup: (() => void) | null = null;

    void import("leaflet").then(({ default: leaflet }) => {
      if (cancelled || !mapElementRef.current) return;

      const map = leaflet.map(mapElementRef.current, {
        zoomControl: true,
        scrollWheelZoom: true,
        minZoom: 4,
        maxZoom: 18,
      }).setView([46.6, 2.2], 5.6);

      leaflet.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      const redPin = leaflet.divIcon({
        className: "contact-map-pin-wrap",
        html: '<span class="contact-map-pin" aria-hidden="true"></span>',
        iconSize: [22, 30],
        iconAnchor: [11, 29],
        popupAnchor: [0, -28],
      });
      const bounds = leaflet.latLngBounds([]);
      for (const item of items) {
        const marker = leaflet.marker([item.latitude, item.longitude], { icon: redPin }).addTo(map);
        const website = item.website
          ? `<a href="${escapeHtml(item.website)}" target="_blank" rel="noreferrer">Abrir website</a>`
          : "";
        marker.bindPopup(`
          <div class="contact-map-popup">
            <strong>${escapeHtml(item.companyName)}</strong>
            <span>${escapeHtml(item.location)}</span>
            <span>${escapeHtml(item.phone)}</span>
            <span class="contact-map-status">${escapeHtml(item.status)}</span>
            ${website}
          </div>
        `);
        bounds.extend([item.latitude, item.longitude]);
      }

      if (items.length > 0) {
        map.fitBounds(bounds, { padding: [32, 32], maxZoom: 13 });
      }

      cleanup = () => {
        map.remove();
      };
    });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [items]);

  return <div ref={mapElementRef} className="contact-map" aria-label="Mapa dos contactos em França" />;
}
