/* Full task board with category filters. */

import { api } from "../api.js";
import { confirmDialog, toast } from "../ui.js";
import { openTaskModal } from "../forms.js";
import { kanbanColumnsHTML, wireKanban } from "../kanban.js";
import { icon, TASK_CATEGORIES } from "../utils.js";

let activeFilter = "all";

export function renderTasks(root, trip, ctx) {
  const tasks = trip.tasks || [];
  const filtered = activeFilter === "all" ? tasks : tasks.filter((task) => task.category === activeFilter);
  const done = tasks.filter((task) => task.status === "done").length;

  const filters = [
    { key: "all", label: "Todas", icon: "kanban", count: tasks.length },
    ...Object.entries(TASK_CATEGORIES).map(([key, meta]) => ({
      key,
      label: meta.label,
      icon: meta.icon,
      count: tasks.filter((task) => task.category === key).length,
    })),
  ];

  root.innerHTML = `
    <div class="section-head">
      <div>
        <h2>Tareas</h2>
        <p>Todo lo que tiene que ocurrir antes y durante el viaje · ${done}/${tasks.length} hechas</p>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${done ? `<button type="button" class="btn btn-ghost btn-sm" data-clear-done>${icon("trash")} Borrar hechas</button>` : ""}
        <button type="button" class="btn btn-primary" data-add-task-main>${icon("plus")} Añadir tarea</button>
      </div>
    </div>

    <div class="tasks-toolbar">
      <div class="filter-chips">
        ${filters
          .map(
            (filter) => `
              <button type="button" class="filter-chip ${activeFilter === filter.key ? "active" : ""}" data-filter="${filter.key}">
                ${icon(filter.icon)} ${filter.label} <span style="opacity:.65">${filter.count}</span>
              </button>`,
          )
          .join("")}
      </div>
      <span class="field-hint" style="display:inline-flex;align-items:center;gap:5px">${icon("grip")} Arrastra las tarjetas entre columnas</span>
    </div>

    ${
      tasks.length
        ? `<div class="kanban-full">${kanbanColumnsHTML(filtered)}</div>`
        : `<div class="card">${`<div class="empty-state">
             <div class="empty-icon">${icon("kanban")}</div>
             <div class="empty-title">Aún no hay tareas</div>
             <p class="empty-text">Añade lo primero que necesites reservar, revisar o preparar.</p>
             <button type="button" class="btn btn-primary btn-sm" data-add-task-main>${icon("plus")} Añadir tarea</button>
           </div>`}</div>`
    }`;

  root.querySelectorAll("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      activeFilter = button.dataset.filter;
      renderTasks(root, trip, ctx);
    });
  });

  root.querySelectorAll("[data-add-task-main]").forEach((button) => {
    button.addEventListener("click", () => openTaskModal({ trip, status: "todo", onSaved: ctx.refresh }));
  });

  root.querySelector("[data-clear-done]")?.addEventListener("click", async () => {
    await confirmDialog({
      title: "¿Borrar las tareas completadas?",
      message: `${done} tarea${done === 1 ? "" : "s"} completada${done === 1 ? "" : "s"} se eliminará${done === 1 ? "" : "n"} permanentemente.`,
      confirmLabel: "Borrar hechas",
      onConfirm: async () => {
        const completed = tasks.filter((task) => task.status === "done");
        for (const task of completed) {
          await api.deleteTask(task.id);
        }
        await ctx.refresh();
        toast(`${completed.length} tarea${completed.length === 1 ? "" : "s"} borrada${completed.length === 1 ? "" : "s"}.`);
      },
    });
  });

  wireKanban(root.querySelector(".kanban-full"), { trip, refresh: ctx.refresh });
}
