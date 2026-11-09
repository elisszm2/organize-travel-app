/* UI primitives: modal, confirm, toast, preview, empty states. */

import { esc, icon, fileKind } from "./utils.js";

let activeClose = null;

export function openModal({
  title,
  subtitle = "",
  body = "",
  submitLabel = "Save",
  onSubmit = null,
  onMount = null,
  onClose = null,
  size = "",
  footerExtra = "",
  hideSubmit = false,
  closeLabel = "Cancel",
}) {
  const root = document.getElementById("modal-root");
  if (activeClose) activeClose({ silent: true });

  let closed = false;
  const close = (options = {}) => {
    if (closed) return;
    closed = true;
    root.innerHTML = "";
    document.body.style.overflow = "";
    document.removeEventListener("keydown", onKeydown);
    activeClose = null;
    if (!options.silent && onClose) onClose();
  };
  activeClose = close;

  const footer = hideSubmit
    ? `<button type="button" class="btn btn-ghost" data-close>${esc(closeLabel)}</button>`
    : `<button type="button" class="btn btn-ghost" data-close>${esc(closeLabel)}</button>
       <button type="submit" class="btn btn-primary" data-submit>${esc(submitLabel)}</button>`;

  root.innerHTML = `
    <div class="modal-backdrop" data-backdrop>
      <div class="modal ${size}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <div class="modal-head">
          <div>
            <h2>${esc(title)}</h2>
            ${subtitle ? `<p class="modal-subtitle">${esc(subtitle)}</p>` : ""}
          </div>
          <button type="button" class="icon-btn" data-close aria-label="Close">${icon("x")}</button>
        </div>
        <form novalidate>
          <div class="modal-body">${body}</div>
          <div class="modal-foot">
            ${footerExtra}
            ${footer}
          </div>
        </form>
      </div>
    </div>`;

  const form = root.querySelector("form");
  const submit = root.querySelector("[data-submit]");

  function onKeydown(event) {
    if (event.key === "Escape") close();
  }
  document.addEventListener("keydown", onKeydown);
  document.body.style.overflow = "hidden";

  root.querySelectorAll("[data-close]").forEach((button) => {
    button.addEventListener("click", () => close());
  });
  const backdrop = root.querySelector("[data-backdrop]");
  backdrop.addEventListener("mousedown", (event) => {
    if (event.target === backdrop) close();
  });

  if (onSubmit) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (submit) {
        submit.disabled = true;
        submit.dataset.label = submit.textContent;
        submit.textContent = "Saving…";
      }
      try {
        const result = await onSubmit(form);
        if (result === false) {
          if (submit) {
            submit.disabled = false;
            submit.textContent = submit.dataset.label || submitLabel;
          }
          return;
        }
        close();
      } catch (error) {
        toast(error.message || "Something went wrong.", "error");
        if (submit) {
          submit.disabled = false;
          submit.textContent = submit.dataset.label || submitLabel;
        }
      }
    });
  } else {
    form.addEventListener("submit", (event) => event.preventDefault());
  }

  if (onMount) onMount({ form, close, modal: root.querySelector(".modal") });

  requestAnimationFrame(() => {
    const first = root.querySelector(
      "input:not([type=hidden]):not([type=file]), select, textarea",
    );
    if (first) first.focus({ preventScroll: true });
  });

  return { close, form };
}

export function confirmDialog({
  title,
  message,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  danger = true,
  onConfirm,
}) {
  return new Promise((resolve) => {
    let confirmed = false;
    openModal({
      title,
      size: "sm",
      hideSubmit: true,
      closeLabel: cancelLabel,
      body: `<p class="confirm-body">${esc(message)}</p>`,
      footerExtra: `<button type="button" class="btn ${danger ? "btn-danger" : "btn-primary"}" data-confirm style="margin-right:auto">${esc(confirmLabel)}</button>`,
      onMount: ({ close }) => {
        const button = document.querySelector("[data-confirm]");
        button?.addEventListener("click", async () => {
          confirmed = true;
          button.disabled = true;
          button.textContent = "Working…";
          try {
            await onConfirm?.();
            close();
            resolve(true);
          } catch (error) {
            toast(error.message || "Something went wrong.", "error");
            button.disabled = false;
            button.textContent = confirmLabel;
          }
        });
      },
      onClose: () => {
        if (!confirmed) resolve(false);
      },
    });
  });
}

export function toast(message, type = "success") {
  const root = document.getElementById("toast-root");
  const el = document.createElement("div");
  el.className = `toast ${type === "error" ? "error" : ""}`;
  el.innerHTML = `${icon(type === "error" ? "alert" : "check-circle")}<span>${esc(message)}</span>`;
  root.appendChild(el);
  setTimeout(() => {
    el.classList.add("leaving");
    setTimeout(() => el.remove(), 220);
  }, 3400);
}

export function emptyState({ iconName = "compass", title, text = "", action = "" }) {
  return `
    <div class="empty-state">
      <div class="empty-icon">${icon(iconName)}</div>
      <div class="empty-title">${esc(title)}</div>
      ${text ? `<p class="empty-text">${esc(text)}</p>` : ""}
      ${action}
    </div>`;
}

export function previewDocument(doc) {
  const kind = fileKind(doc.mimetype, doc.name);
  let body;
  if (kind === "pdf") {
    body = `<iframe class="preview-frame" src="${esc(doc.url)}" title="${esc(doc.name)}"></iframe>`;
  } else if (kind === "image") {
    body = `<img class="preview-image" src="${esc(doc.url)}" alt="${esc(doc.name)}">`;
  } else {
    body = `<div class="preview-unsupported">This file type can't be previewed in the browser.<br><a class="btn btn-ghost btn-sm" style="margin-top:12px" href="${esc(doc.url)}?download=1">${icon("download")} Download ${esc(doc.name)}</a></div>`;
  }
  openModal({
    title: doc.name,
    subtitle: "Document preview",
    size: "lg",
    hideSubmit: true,
    closeLabel: "Close",
    body: `<div class="preview-modal-body">${body}</div>`,
    footerExtra: `<a class="btn btn-ghost btn-sm" href="${esc(doc.url)}?download=1" style="margin-right:auto">${icon("download")} Download</a>`,
  });
}

export function closeDrawer() {
  document.getElementById("sidebar")?.classList.remove("open");
  document.getElementById("drawer-overlay")?.classList.remove("show");
  document.body.style.overflow = "";
}

export function openDrawer() {
  document.getElementById("sidebar")?.classList.add("open");
  document.getElementById("drawer-overlay")?.classList.add("show");
  document.body.style.overflow = "hidden";
}
