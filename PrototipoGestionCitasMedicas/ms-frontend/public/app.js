/* ═══════════════════════════════════════════════════════════
   Gestión de Citas Médicas — Frontend SPA
   ═══════════════════════════════════════════════════════════ */

const API = {
  usuarios:       "http://localhost:3001",
  disponibilidad: "http://localhost:3003",
  citas:          "http://localhost:3004",
  especialidades: "http://localhost:3007",
};

/* ── Utilidades ─────────────────────────────────────────────── */

function toast(msg, type = "info") {
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  document.getElementById("toast-container").appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

async function apiFetch(url, opts = {}) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function badge(text, cls) {
  return `<span class="badge badge-${cls}">${text}</span>`;
}

function fmtFecha(str) {
  if (!str) return "—";
  const d = new Date(str);
  return d.toLocaleString("es-CO", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function fmtDate(str) {
  if (!str) return "—";
  const [y, m, d] = str.split("-");
  return `${d}/${m}/${y}`;
}

function openModal(title, bodyHTML) {
  document.getElementById("modal-title").textContent = title;
  document.getElementById("modal-body").innerHTML = bodyHTML;
  document.getElementById("modal-overlay").classList.remove("hidden");
}

function closeModal() {
  document.getElementById("modal-overlay").classList.add("hidden");
}

function tableLoading(cols) {
  return `<tr class="loading-row"><td colspan="${cols}">
    <span class="spinner"></span> Cargando…
  </td></tr>`;
}

function tableEmpty(cols, msg = "Sin registros") {
  return `<tr><td colspan="${cols}" style="padding:40px;text-align:center;color:var(--text-muted)">${msg}</td></tr>`;
}

/* ── Navegación ─────────────────────────────────────────────── */

const sections = {
  dashboard:      renderDashboard,
  usuarios:       renderUsuarios,
  especialidades: renderEspecialidades,
  disponibilidad: renderDisponibilidad,
  citas:          renderCitas,
};

const sectionTitles = {
  dashboard:      "Dashboard",
  usuarios:       "Usuarios",
  especialidades: "Especialidades",
  disponibilidad: "Disponibilidad Médica",
  citas:          "Gestión de Citas",
};

let currentSection = "dashboard";

function navigate(section) {
  currentSection = section;
  document.querySelectorAll(".nav-item").forEach(el => {
    el.classList.toggle("active", el.dataset.section === section);
  });
  document.getElementById("page-title").textContent = sectionTitles[section];
  const btnNuevo = document.getElementById("btn-nuevo");
  btnNuevo.classList.toggle("hidden", section === "dashboard");
  sections[section]();
}

document.querySelectorAll(".nav-item").forEach(el => {
  el.addEventListener("click", () => navigate(el.dataset.section));
});

document.getElementById("modal-close").addEventListener("click", closeModal);
document.getElementById("modal-overlay").addEventListener("click", e => {
  if (e.target === document.getElementById("modal-overlay")) closeModal();
});

document.getElementById("btn-nuevo").addEventListener("click", () => {
  const actions = {
    usuarios:       openFormUsuario,
    especialidades: openFormEspecialidad,
    disponibilidad: openFormDisponibilidad,
    citas:          openFormCita,
  };
  actions[currentSection]?.();
});

/* ══════════════════════════════════════════════════════════════
   DASHBOARD
══════════════════════════════════════════════════════════════ */

async function renderDashboard() {
  const main = document.getElementById("main-content");
  main.innerHTML = `
    <p class="section-title">Resumen del sistema</p>
    <div class="dashboard-grid" id="stats-grid">
      ${["Usuarios","Especialidades","Disponibilidades","Citas"].map(l =>
        `<div class="stat-card">
          <div class="label">${l}</div>
          <div class="value"><span class="spinner"></span></div>
        </div>`).join("")}
    </div>
    <p class="section-title" style="margin-top:8px">Estado de microservicios</p>
    <div class="services-grid" id="services-grid">
      ${Object.entries({ "MS-1 Usuarios":"3001","MS-3 Disponibilidad":"3003","MS-4 Citas":"3004","MS-7 Especialidades":"3007" })
        .map(([name,port]) => `
          <div class="service-card">
            <div class="service-indicator loading" id="ind-${port}"></div>
            <div class="service-info">
              <div class="name">${name}</div>
              <div class="port">:${port}</div>
            </div>
          </div>`).join("")}
    </div>`;

  // Health checks en paralelo
  const healthChecks = [
    { name: "MS-1 Usuarios",        port: "3001", url: `${API.usuarios}/health` },
    { name: "MS-3 Disponibilidad",  port: "3003", url: `${API.disponibilidad}/health` },
    { name: "MS-4 Citas",           port: "3004", url: `${API.citas}/health` },
    { name: "MS-7 Especialidades",  port: "3007", url: `${API.especialidades}/health` },
  ];

  healthChecks.forEach(async ({ port, url }) => {
    const ind = document.getElementById(`ind-${port}`);
    if (!ind) return;
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(3000) });
      ind.className = `service-indicator ${r.ok ? "ok" : "error"}`;
    } catch {
      ind.className = "service-indicator error";
    }
  });

  // Conteos en paralelo
  const counts = await Promise.allSettled([
    apiFetch(`${API.usuarios}/usuarios`),
    apiFetch(`${API.especialidades}/especialidades`),
    apiFetch(`${API.disponibilidad}/disponibilidad`),
    apiFetch(`${API.citas}/citas`),
  ]);

  const grid = document.getElementById("stats-grid");
  const labels = ["Usuarios","Especialidades","Disponibilidades","Citas"];
  const subs   = ["pacientes y médicos","registradas","bloques activos","total registradas"];
  grid.innerHTML = counts.map((r, i) => {
    const val = r.status === "fulfilled" ? r.value.total : "—";
    return `<div class="stat-card">
      <div class="label">${labels[i]}</div>
      <div class="value">${val}</div>
      <div class="sub">${subs[i]}</div>
    </div>`;
  }).join("");
}

/* ══════════════════════════════════════════════════════════════
   USUARIOS
══════════════════════════════════════════════════════════════ */

async function renderUsuarios(filtroRol = "") {
  const main = document.getElementById("main-content");
  main.innerHTML = `
    <div class="card">
      <div class="card-toolbar">
        <label style="font-size:12px;font-weight:600;color:var(--text-muted)">Filtrar por rol:</label>
        <select id="filtro-rol">
          <option value="">Todos</option>
          <option value="paciente" ${filtroRol==="paciente"?"selected":""}>Paciente</option>
          <option value="medico"   ${filtroRol==="medico"  ?"selected":""}>Médico</option>
          <option value="admin"    ${filtroRol==="admin"   ?"selected":""}>Admin</option>
        </select>
        <div class="spacer"></div>
      </div>
      <table>
        <thead><tr>
          <th>ID</th><th>Nombre</th><th>Email</th><th>Rol</th><th>Estado</th><th>Acciones</th>
        </tr></thead>
        <tbody id="tbody-usuarios">${tableLoading(6)}</tbody>
      </table>
    </div>`;

  document.getElementById("filtro-rol").addEventListener("change", e => {
    renderUsuarios(e.target.value);
  });

  try {
    const { datos } = await apiFetch(`${API.usuarios}/usuarios`);
    const filtrados = filtroRol ? datos.filter(u => u.rol === filtroRol) : datos;
    const tbody = document.getElementById("tbody-usuarios");
    if (!filtrados.length) { tbody.innerHTML = tableEmpty(6); return; }
    tbody.innerHTML = filtrados.map(u => `
      <tr>
        <td>${u.id}</td>
        <td><strong>${u.nombre}</strong></td>
        <td>${u.email}</td>
        <td>${badge(u.rol, u.rol)}</td>
        <td>${badge(u.activo ? "Activo" : "Inactivo", u.activo ? "activo" : "inactivo")}</td>
        <td class="td-actions">
          ${u.activo
            ? `<button class="btn btn-danger btn-sm" onclick="desactivarUsuario(${u.id})">Desactivar</button>`
            : `<span style="color:var(--text-muted);font-size:12px">Desactivado</span>`}
        </td>
      </tr>`).join("");
  } catch (err) {
    document.getElementById("tbody-usuarios").innerHTML =
      tableEmpty(6, `Error al cargar usuarios: ${err.message}`);
  }
}

function openFormUsuario() {
  openModal("Nuevo Usuario", `
    <div class="form-group">
      <label>Nombre completo</label>
      <input id="f-nombre" type="text" placeholder="Ej: María García" />
    </div>
    <div class="form-group">
      <label>Correo electrónico</label>
      <input id="f-email" type="email" placeholder="correo@ejemplo.com" />
    </div>
    <div class="form-group">
      <label>Rol</label>
      <select id="f-rol">
        <option value="">Seleccionar rol…</option>
        <option value="paciente">Paciente</option>
        <option value="medico">Médico</option>
        <option value="admin">Administrador</option>
      </select>
    </div>
    <div class="form-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="guardarUsuario()">Crear Usuario</button>
    </div>`);
}

async function guardarUsuario() {
  const nombre = document.getElementById("f-nombre").value.trim();
  const email  = document.getElementById("f-email").value.trim();
  const rol    = document.getElementById("f-rol").value;
  if (!nombre || !email || !rol) { toast("Completa todos los campos", "error"); return; }
  try {
    await apiFetch(`${API.usuarios}/usuarios`, {
      method: "POST",
      body: JSON.stringify({ nombre, email, rol }),
    });
    toast("Usuario creado correctamente", "success");
    closeModal();
    renderUsuarios();
  } catch (err) {
    toast(err.message, "error");
  }
}

async function desactivarUsuario(id) {
  if (!confirm("¿Desactivar este usuario?")) return;
  try {
    await apiFetch(`${API.usuarios}/usuarios/${id}`, { method: "DELETE" });
    toast("Usuario desactivado", "success");
    renderUsuarios();
  } catch (err) {
    toast(err.message, "error");
  }
}

/* ══════════════════════════════════════════════════════════════
   ESPECIALIDADES
══════════════════════════════════════════════════════════════ */

async function renderEspecialidades() {
  const main = document.getElementById("main-content");
  main.innerHTML = `
    <div class="card">
      <table>
        <thead><tr>
          <th>ID</th><th>Nombre</th><th>Descripción</th><th>Estado</th><th>Acciones</th>
        </tr></thead>
        <tbody id="tbody-esp">${tableLoading(5)}</tbody>
      </table>
    </div>`;

  try {
    const { datos } = await apiFetch(`${API.especialidades}/especialidades`);
    const tbody = document.getElementById("tbody-esp");
    if (!datos.length) { tbody.innerHTML = tableEmpty(5); return; }
    tbody.innerHTML = datos.map(e => `
      <tr>
        <td>${e.id}</td>
        <td><strong>${e.nombre}</strong></td>
        <td>${e.descripcion || "<span style='color:var(--text-muted)'>—</span>"}</td>
        <td>${badge(e.activo ? "Activa" : "Inactiva", e.activo ? "activo" : "inactivo")}</td>
        <td class="td-actions">
          ${e.activo
            ? `<button class="btn btn-danger btn-sm" onclick="desactivarEspecialidad(${e.id})">Desactivar</button>`
            : `<span style="color:var(--text-muted);font-size:12px">Inactiva</span>`}
        </td>
      </tr>`).join("");
  } catch (err) {
    document.getElementById("tbody-esp").innerHTML =
      tableEmpty(5, `Error: ${err.message}`);
  }
}

function openFormEspecialidad() {
  openModal("Nueva Especialidad", `
    <div class="form-group">
      <label>Nombre</label>
      <input id="f-esp-nombre" type="text" placeholder="Ej: Neurología" />
    </div>
    <div class="form-group">
      <label>Descripción (opcional)</label>
      <textarea id="f-esp-desc" placeholder="Breve descripción…"></textarea>
    </div>
    <div class="form-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="guardarEspecialidad()">Crear</button>
    </div>`);
}

async function guardarEspecialidad() {
  const nombre      = document.getElementById("f-esp-nombre").value.trim();
  const descripcion = document.getElementById("f-esp-desc").value.trim();
  if (!nombre) { toast("El nombre es requerido", "error"); return; }
  try {
    await apiFetch(`${API.especialidades}/especialidades`, {
      method: "POST",
      body: JSON.stringify({ nombre, descripcion }),
    });
    toast("Especialidad creada", "success");
    closeModal();
    renderEspecialidades();
  } catch (err) {
    toast(err.message, "error");
  }
}

async function desactivarEspecialidad(id) {
  if (!confirm("¿Desactivar esta especialidad?")) return;
  try {
    await apiFetch(`${API.especialidades}/especialidades/${id}`, { method: "DELETE" });
    toast("Especialidad desactivada", "success");
    renderEspecialidades();
  } catch (err) {
    toast(err.message, "error");
  }
}

/* ══════════════════════════════════════════════════════════════
   DISPONIBILIDAD
══════════════════════════════════════════════════════════════ */

async function renderDisponibilidad() {
  const main = document.getElementById("main-content");
  main.innerHTML = `
    <div class="card">
      <div class="card-toolbar">
        <label style="font-size:12px;font-weight:600;color:var(--text-muted)">Médico ID:</label>
        <input id="filtro-medico" type="number" placeholder="Todos" style="width:90px" />
        <label style="font-size:12px;font-weight:600;color:var(--text-muted)">Fecha:</label>
        <input id="filtro-fecha" type="date" />
        <button class="btn btn-ghost btn-sm" onclick="cargarDisponibilidad()">Filtrar</button>
        <div class="spacer"></div>
      </div>
      <table>
        <thead><tr>
          <th>ID</th><th>Médico ID</th><th>Fecha</th>
          <th>Hora inicio</th><th>Hora fin</th><th>Especialidad ID</th><th>Acciones</th>
        </tr></thead>
        <tbody id="tbody-disp">${tableLoading(7)}</tbody>
      </table>
    </div>`;

  cargarDisponibilidad();
}

async function cargarDisponibilidad() {
  const medicoId = document.getElementById("filtro-medico")?.value.trim();
  const fecha    = document.getElementById("filtro-fecha")?.value;

  const params = new URLSearchParams();
  if (medicoId) params.set("medico_id", medicoId);
  if (fecha)    params.set("fecha", fecha);

  const tbody = document.getElementById("tbody-disp");
  tbody.innerHTML = tableLoading(7);

  try {
    const qs = params.toString();
    const { datos } = await apiFetch(`${API.disponibilidad}/disponibilidad${qs ? "?" + qs : ""}`);
    if (!datos.length) { tbody.innerHTML = tableEmpty(7); return; }
    tbody.innerHTML = datos.map(d => `
      <tr>
        <td>${d.id}</td>
        <td>${d.medico_id}</td>
        <td>${fmtDate(d.fecha)}</td>
        <td>${d.hora_inicio?.substring(0,5) || "—"}</td>
        <td>${d.hora_fin?.substring(0,5) || "—"}</td>
        <td>${d.especialidad_id ?? "<span style='color:var(--text-muted)'>—</span>"}</td>
        <td class="td-actions">
          <button class="btn btn-danger btn-sm" onclick="eliminarDisponibilidad(${d.id})">Eliminar</button>
        </td>
      </tr>`).join("");
  } catch (err) {
    tbody.innerHTML = tableEmpty(7, `Error: ${err.message}`);
  }
}

async function openFormDisponibilidad() {
  // Cargar médicos y especialidades antes de abrir el modal
  let medicos = [], especialidades = [];
  try {
    const r = await apiFetch(`${API.usuarios}/usuarios`);
    medicos = r.datos.filter(u => u.rol === "medico" && u.activo);
  } catch { /* sin médicos */ }
  try {
    const r = await apiFetch(`${API.especialidades}/especialidades`);
    especialidades = r.datos.filter(e => e.activo);
  } catch { /* sin especialidades */ }

  const optMedicos = medicos.length
    ? medicos.map(m => `<option value="${m.id}">${m.nombre} (ID ${m.id})</option>`).join("")
    : `<option value="">No hay médicos registrados</option>`;

  const optEsp = especialidades.length
    ? `<option value="">Sin especialidad</option>` +
      especialidades.map(e => `<option value="${e.id}">${e.nombre}</option>`).join("")
    : `<option value="">No hay especialidades</option>`;

  openModal("Registrar Disponibilidad", `
    <div class="form-group">
      <label>Médico</label>
      <select id="f-disp-medico">${optMedicos}</select>
    </div>
    <div class="form-group">
      <label>Especialidad (opcional)</label>
      <select id="f-disp-esp">${optEsp}</select>
    </div>
    <div class="form-group">
      <label>Fecha</label>
      <input id="f-disp-fecha" type="date" />
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Hora inicio</label>
        <input id="f-disp-inicio" type="time" />
      </div>
      <div class="form-group">
        <label>Hora fin</label>
        <input id="f-disp-fin" type="time" />
      </div>
    </div>
    <div class="form-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="guardarDisponibilidad()">Registrar</button>
    </div>`);
}

async function guardarDisponibilidad() {
  const medico_id      = document.getElementById("f-disp-medico").value;
  const especialidad_id= document.getElementById("f-disp-esp").value || null;
  const fecha          = document.getElementById("f-disp-fecha").value;
  const hora_inicio    = document.getElementById("f-disp-inicio").value;
  const hora_fin       = document.getElementById("f-disp-fin").value;

  if (!medico_id || !fecha || !hora_inicio || !hora_fin) {
    toast("Completa todos los campos requeridos", "error"); return;
  }
  if (hora_inicio >= hora_fin) {
    toast("La hora de inicio debe ser anterior a la hora fin", "error"); return;
  }

  try {
    await apiFetch(`${API.disponibilidad}/disponibilidad`, {
      method: "POST",
      body: JSON.stringify({
        medico_id: parseInt(medico_id),
        especialidad_id: especialidad_id ? parseInt(especialidad_id) : null,
        fecha, hora_inicio, hora_fin,
      }),
    });
    toast("Disponibilidad registrada correctamente", "success");
    closeModal();
    renderDisponibilidad();
  } catch (err) {
    toast(err.message, "error");
  }
}

async function eliminarDisponibilidad(id) {
  if (!confirm("¿Eliminar este bloque de disponibilidad?")) return;
  try {
    await apiFetch(`${API.disponibilidad}/disponibilidad/${id}`, { method: "DELETE" });
    toast("Bloque eliminado", "success");
    cargarDisponibilidad();
  } catch (err) {
    toast(err.message, "error");
  }
}

/* ══════════════════════════════════════════════════════════════
   CITAS
══════════════════════════════════════════════════════════════ */

async function renderCitas(filtroEstado = "") {
  const main = document.getElementById("main-content");
  main.innerHTML = `
    <div class="card">
      <div class="card-toolbar">
        <label style="font-size:12px;font-weight:600;color:var(--text-muted)">Estado:</label>
        <select id="filtro-estado">
          <option value="">Todos</option>
          <option value="programada"  ${filtroEstado==="programada" ?"selected":""}>Programada</option>
          <option value="cancelada"   ${filtroEstado==="cancelada"  ?"selected":""}>Cancelada</option>
          <option value="completada"  ${filtroEstado==="completada" ?"selected":""}>Completada</option>
        </select>
        <div class="spacer"></div>
      </div>
      <table>
        <thead><tr>
          <th>ID</th><th>Fecha y hora</th><th>Paciente</th>
          <th>Médico</th><th>Estado</th><th>Notas</th><th>Acciones</th>
        </tr></thead>
        <tbody id="tbody-citas">${tableLoading(7)}</tbody>
      </table>
    </div>`;

  document.getElementById("filtro-estado").addEventListener("change", e => {
    renderCitas(e.target.value);
  });

  try {
    const { datos } = await apiFetch(`${API.citas}/citas`);
    const filtradas = filtroEstado ? datos.filter(c => c.estado === filtroEstado) : datos;
    const tbody = document.getElementById("tbody-citas");
    if (!filtradas.length) { tbody.innerHTML = tableEmpty(7); return; }
    tbody.innerHTML = filtradas.map(c => `
      <tr>
        <td>${c.id}</td>
        <td>${fmtFecha(c.fecha_hora)}</td>
        <td>${c.paciente}</td>
        <td>${c.medico}</td>
        <td>${badge(c.estado, c.estado)}</td>
        <td>${c.notas ? `<span title="${c.notas}" style="cursor:help">📝</span>` : "—"}</td>
        <td class="td-actions">
          ${c.estado === "programada" ? `
            <button class="btn btn-success btn-sm" onclick="completarCita(${c.id})">Completar</button>
            <button class="btn btn-danger btn-sm" onclick="cancelarCita(${c.id})">Cancelar</button>
          ` : `<span style="color:var(--text-muted);font-size:12px">${c.estado}</span>`}
        </td>
      </tr>`).join("");
  } catch (err) {
    document.getElementById("tbody-citas").innerHTML =
      tableEmpty(7, `Error al cargar citas: ${err.message}`);
  }
}

async function openFormCita() {
  let pacientes = [], medicos = [];
  try {
    const r = await apiFetch(`${API.usuarios}/usuarios`);
    pacientes = r.datos.filter(u => u.rol === "paciente" && u.activo);
    medicos   = r.datos.filter(u => u.rol === "medico"   && u.activo);
  } catch { /* sin usuarios */ }

  const optPac = pacientes.length
    ? pacientes.map(p => `<option value="${p.id}">${p.nombre}</option>`).join("")
    : `<option value="">Sin pacientes registrados</option>`;

  const optMed = medicos.length
    ? medicos.map(m => `<option value="${m.id}">${m.nombre}</option>`).join("")
    : `<option value="">Sin médicos registrados</option>`;

  // Fecha/hora mínima = ahora
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  const minDT = now.toISOString().slice(0, 16);

  openModal("Agendar Nueva Cita", `
    <div class="form-group">
      <label>Paciente</label>
      <select id="f-cita-pac">${optPac}</select>
    </div>
    <div class="form-group">
      <label>Médico</label>
      <select id="f-cita-med">${optMed}</select>
    </div>
    <div class="form-group">
      <label>Fecha y hora</label>
      <input id="f-cita-dt" type="datetime-local" min="${minDT}" />
    </div>
    <div class="form-group">
      <label>Notas (opcional)</label>
      <textarea id="f-cita-notas" placeholder="Motivo de consulta, observaciones…"></textarea>
    </div>
    <p style="font-size:12px;color:var(--text-muted);margin-bottom:4px">
      ℹ️ El médico debe tener disponibilidad registrada en ese horario.
    </p>
    <div class="form-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="guardarCita()">Agendar Cita</button>
    </div>`);
}

async function guardarCita() {
  const paciente_id = document.getElementById("f-cita-pac").value;
  const medico_id   = document.getElementById("f-cita-med").value;
  const fecha_hora  = document.getElementById("f-cita-dt").value;
  const notas       = document.getElementById("f-cita-notas").value.trim();

  if (!paciente_id || !medico_id || !fecha_hora) {
    toast("Completa todos los campos requeridos", "error"); return;
  }

  try {
    await apiFetch(`${API.citas}/citas`, {
      method: "POST",
      body: JSON.stringify({
        paciente_id: parseInt(paciente_id),
        medico_id:   parseInt(medico_id),
        fecha_hora:  new Date(fecha_hora).toISOString(),
        notas:       notas || null,
      }),
    });
    toast("Cita agendada correctamente", "success");
    closeModal();
    renderCitas();
  } catch (err) {
    toast(err.message, "error");
  }
}

async function cancelarCita(id) {
  if (!confirm("¿Cancelar esta cita?")) return;
  try {
    await apiFetch(`${API.citas}/citas/${id}/cancelar`, { method: "PATCH" });
    toast("Cita cancelada", "success");
    renderCitas();
  } catch (err) {
    toast(err.message, "error");
  }
}

async function completarCita(id) {
  if (!confirm("¿Marcar esta cita como completada?")) return;
  try {
    await apiFetch(`${API.citas}/citas/${id}/completar`, { method: "PATCH" });
    toast("Cita marcada como completada", "success");
    renderCitas();
  } catch (err) {
    toast(err.message, "error");
  }
}

/* ── Inicio ─────────────────────────────────────────────────── */
navigate("dashboard");
