/* Kanban column/card rendering and drag-and-drop behaviour. */

import { api } from "./api.js";
import { confirmDialog, toast } from "./ui.js";
import { openTaskModal } from "./forms.js";
import { esc, icon, dueLabel, taskCategory } from "./utils.js";

const STATUSES = [
  { key: "todo", label: "Pendiente", dot: "todo" },
  { key: "doing", label: "En curso", dot: "doing" },
  { key: "done", label: "Hecha", dot: "done" },
];

export function taskCardHTML(task, { mini = false } = {}) {
  const category = taskCategory(task.category);
  const due = dueLabel(task.due_date);
  const done = task.status === "done";
  return `
    <div class="kcard ${done ? "done" : ""}" draggable="true" data-task-id="${task.id}" data-status="${esc(task.status)}">
      <div class="kcard-title-row">
        <button type="button" class="kcard-check" data-task-toggle title="${done ? "Marcar como pendiente" : "Marcar como hecha"}" aria-label="${done ? "Marcar como pendiente" : "Marcar como hecha"}">${icon("check")}</button>
        <div class="kcard-title">${esc(task.title)}</div>
        ${
          mini
            ? ""
            : `<div class="kcard-actions">
                 <button type="button" class="icon-btn" data-task-edit title="Editar tarea" aria-label="Editar tarea">${icon("edit")}</button>
                 <button type="button" class="icon-btn danger" data-task-delete title="Eliminar tarea" aria-label="Eliminar tarea">${icon("trash")}</button>
               </div>`
        }
      </div>
      <div class="kcard-meta">
        <span class="pill ${category.tone}">${icon(category.icon)} ${category.label}</span>
        ${due ? `<span class="kcard-due ${due.overdue ? "overdue" : ""}">${icon("calendar")} ${due.text}</span>` : ""}
      </div>
      ${!mini && task.notes ? `<div class="task-notes">${esc(task.notes)}</div>` : ""}
    </div>`;
}

export function kanbanColumnsHTML(tasks, { mini = false, limit = 4 } = {}) {
  return STATUSES.map((status) => {
    const all = tasks.filter((task) => task.status === status.key);
    const visible = mini ? all.slice(0, limit) : all;
    const hidden = all.length - visible.length;
    return `
      <div class="kanban-col" data-status="${status.key}">
        <div class="kanban-col-head">
          <div class="kanban-col-title">
            <span class="status-dot ${status.dot}"></span>
            ${status.label}
            <span class="kanban-col-count">${all.length}</span>
          </div>
          <button type="button" class="icon-btn" data-add-task="${status.key}" title="Añadir una tarea" aria-label="Añadir una tarea">${icon("plus")}</button>
        </div>
        <div class="kanban-col-body">
          ${visible.map((task) => taskCardHTML(task, { mini })).join("")}
          ${!visible.length ? `<div class="kanban-empty">Aquí no hay nada todavía</div>` : ""}
          ${hidden > 0 ? `<div class="kanban-more">+${hidden} más</div>` : ""}
        </div>
      </div>`;
  }).join("");
}

export function wireKanban(root, { trip, refresh, mini = false } = {}) {
  root.querySelectorAll("[data-add-task]").forEach((button) => {
    button.addEventListener("click", () => {
      openTaskModal({
        trip,
        status: button.dataset.addTask,
        onSaved: refresh,
      });
    });
  });

  root.querySelectorAll(".kcard").forEach((card) => {
    const taskId = Number(card.dataset.taskId);
    const task = (trip.tasks || []).find((item) => item.id === taskId);

    card.addEventListener("click", (event) => {
      if (event.target.closest("button")) return;
      if (!task) return;
      openTaskModal({ trip, task, onSaved: refresh });
    });

    card.querySelector("[data-task-toggle]")?.addEventListener("click", async (event) => {
      event.stopPropagation();
      if (!task) return;
      const next = task.status === "done" ? "todo" : "done";
      try {
        await api.updateTask(task.id, { status: next });
        await refresh();
      } catch (error) {
        toast(error.message || "No se pudo actualizar la tarea.", "error");
      }
    });

    card.querySelector("[data-task-edit]")?.addEventListener("click", (event) => {
      event.stopPropagation();
      if (!task) return;
      openTaskModal({ trip, task, onSaved: refresh });
    });

    card.querySelector("[data-task-delete]")?.addEventListener("click", async (event) => {
      event.stopPropagation();
      if (!task) return;
      const confirmed = await confirmDialog({
        title: "¿Eliminar la tarea?",
        message: `“${task.title}” se quitará de este viaje.`,
        confirmLabel: "Eliminar tarea",
        onConfirm: async () => {
          await api.deleteTask(task.id);
          await refresh();
          toast("Tarea eliminada.");
        },
      });
      return confirmed;
    });

    card.addEventListener("dragstart", (event) => {
      event.dataTransfer.setData("text/plain", String(taskId));
      event.dataTransfer.effectAllowed = "move";
      card.classList.add("dragging");
    });
    card.addEventListener("dragend", () => card.classList.remove("dragging"));
  });

  root.querySelectorAll(".kanban-col").forEach((column) => {
    const status = column.dataset.status;
    const setOver = (on) => column.classList.toggle("drag-over", on);

    column.addEventListener("dragover", (event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      setOver(true);
    });
    column.addEventListener("dragleave", (event) => {
      if (!column.contains(event.relatedTarget)) setOver(false);
    });
    column.addEventListener("drop", async (event) => {
      event.preventDefault();
      setOver(false);
      const taskId = Number(event.dataTransfer.getData("text/plain"));
      if (!taskId) return;
      const task = (trip.tasks || []).find((item) => item.id === taskId);
      if (!task || task.status === status) return;
      try {
        await api.updateTask(taskId, { status });
        await refresh();
      } catch (error) {
        toast(error.message || "No se pudo mover la tarea.", "error");
      }
    });
  });
}

export { STATUSES };
