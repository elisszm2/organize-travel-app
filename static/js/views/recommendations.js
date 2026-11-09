/* Recommendations and saved ideas. */

import { api } from "../api.js";
import { confirmDialog, toast } from "../ui.js";
import { openRecommendationModal } from "../forms.js";
import { esc, icon, recommendationCategory, safeUrl } from "../utils.js";

function recCard(rec) {
  const category = recommendationCategory(rec.category);
  const url = safeUrl(rec.url);
  const pinned = rec.lat !== null && rec.lat !== undefined && rec.lng !== null && rec.lng !== undefined;
  return `
    <article class="rec-card" data-rec-id="${rec.id}">
      <div class="rec-top">
        <div class="rec-icon ${category.tone}">${icon(category.icon)}</div>
        <div class="rec-main">
          <div class="rec-title">${esc(rec.title)}</div>
          ${rec.address ? `<div class="rec-address">${icon("pin")} <span>${esc(rec.address)}</span></div>` : ""}
        </div>
        <div class="rec-actions">
          <button type="button" class="icon-btn" data-rec-edit title="Edit idea" aria-label="Edit idea">${icon("edit")}</button>
          <button type="button" class="icon-btn danger" data-rec-delete title="Delete idea" aria-label="Delete idea">${icon("trash")}</button>
        </div>
      </div>
      ${rec.notes ? `<div class="rec-notes">${esc(rec.notes)}</div>` : ""}
      <div class="rec-foot">
        <span class="pill ${category.tone}">${icon(category.icon)} ${category.label}${pinned ? " · on map" : ""}</span>
        ${
          url
            ? `<a class="rec-link" href="${esc(url)}" target="_blank" rel="noreferrer">Open link ${icon("external")}</a>`
            : ""
        }
      </div>
    </article>`;
}

export function renderRecommendations(root, trip, ctx) {
  const recommendations = trip.recommendations || [];

  root.innerHTML = `
    <div class="section-head">
      <div>
        <h2>Ideas &amp; recommendations</h2>
        <p>Places, restaurants and experiences worth remembering · ${recommendations.length} saved</p>
      </div>
      <button type="button" class="btn btn-primary" data-add-rec>${icon("plus")} Save an idea</button>
    </div>

    ${
      recommendations.length
        ? `<div class="rec-grid">${recommendations.map(recCard).join("")}</div>`
        : `<div class="card">${`<div class="empty-state">
             <div class="empty-icon">${icon("sparkles")}</div>
             <div class="empty-title">Collect the good stuff</div>
             <p class="empty-text">Save restaurants, viewpoints, museums and tips you find while planning. Pinned ideas appear on the trip map.</p>
             <button type="button" class="btn btn-primary btn-sm" data-add-rec>${icon("plus")} Save first idea</button>
           </div>`}</div>`
    }`;

  root.querySelectorAll("[data-add-rec]").forEach((button) => {
    button.addEventListener("click", () => openRecommendationModal({ trip, onSaved: ctx.refresh }));
  });

  root.querySelectorAll("[data-rec-id]").forEach((card) => {
    const rec = recommendations.find((item) => item.id === Number(card.dataset.recId));
    if (!rec) return;
    card.querySelector("[data-rec-edit]")?.addEventListener("click", () => {
      openRecommendationModal({ trip, recommendation: rec, onSaved: ctx.refresh });
    });
    card.querySelector("[data-rec-delete]")?.addEventListener("click", async () => {
      await confirmDialog({
        title: "Delete idea?",
        message: `“${rec.title}” will be removed from this trip.`,
        confirmLabel: "Delete idea",
        onConfirm: async () => {
          await api.deleteRecommendation(rec.id);
          await ctx.refresh();
          toast("Idea deleted.");
        },
      });
    });
  });
}
