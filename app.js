// =========================================================
//  Home for Christmas · The Living Room — lógica de la página
// =========================================================
(() => {
  "use strict";

  const COSTO = Number(window.CONFIG.COSTO_EVENTO) || 750;
  const GRUPOS = window.CONFIG.GRUPOS;

  if (!window.supabase || !window.CONFIG.SUPABASE_URL || window.CONFIG.SUPABASE_URL.includes("TU-PROYECTO")) {
    document.body.innerHTML =
      '<p style="padding:24px;font-family:sans-serif;color:#F3ECDA">Falta configurar <b>config.js</b> con la URL y la llave de Supabase.</p>';
    return;
  }

  const db = window.supabase.createClient(window.CONFIG.SUPABASE_URL, window.CONFIG.SUPABASE_ANON_KEY);

  // ---------- Utilidades ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const dinero = (n) => "$" + Number(n || 0).toLocaleString("es-MX", { maximumFractionDigits: 2 });
  const normalizar = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const soloDigitos = (s) => String(s || "").replace(/\D/g, "");
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fecha = (iso) =>
    new Date(iso).toLocaleString("es-MX", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

  let toastTimer;
  function toast(msg, error = false) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.toggle("is-error", error);
    t.classList.add("is-on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("is-on"), 3200);
  }

  function mensajeError(error) {
    const m = error?.message || String(error);
    if (m.includes("Invalid login credentials")) return "Correo o contraseña incorrectos.";
    if (m.includes("Failed to fetch")) return "Sin conexión. Revisa tu internet.";
    if (m.includes("estudiantes_grupo_check")) return "Elige un grupo válido.";
    if (m.includes("estudiantes_edad_check")) return "La edad debe estar entre 10 y 99.";
    if (m.includes("JWT expired")) return "Tu sesión expiró. Vuelve a entrar.";
    return m;
  }

  function ocupado(form, on) {
    $$("button[type=submit]", form).forEach((b) => (b.disabled = on));
  }

  // ---------- Estado ----------
  let estudiantes = [];
  let carros = [];
  let actual = null; // estudiante abierto en un modal

  // ---------- Inicializar selects y textos ----------
  $$("[data-grupos]").forEach((sel) => {
    GRUPOS.forEach((g) => sel.insertAdjacentHTML("beforeend", `<option>${esc(g)}</option>`));
  });
  GRUPOS.forEach((g) => $("#filtro-grupo").insertAdjacentHTML("beforeend", `<option>${esc(g)}</option>`));
  $$("[data-costo]").forEach((el) => (el.textContent = COSTO));
  $$("[data-max-costo]").forEach((el) => (el.max = COSTO));

  // Cerrar modales
  $$("[data-close]").forEach((b) => b.addEventListener("click", () => b.closest("dialog").close()));
  $$("dialog").forEach((d) =>
    d.addEventListener("click", (e) => {
      if (e.target === d) d.close(); // clic fuera
    })
  );

  // ---------- Sesión ----------
  function mostrar(sesion) {
    const logueado = !!sesion;
    $("#pantalla-login").hidden = logueado;
    $("#pantalla-panel").hidden = !logueado;
    if (logueado) {
      pintarUsuario(sesion.user);
      if (!nombreDe(sesion.user)) setTimeout(abrirPerfil, 400); // primera vez: pedir nombre
      cargar();
    } else {
      estudiantes = [];
      $("#lista").innerHTML = "";
    }
  }

  db.auth.getSession().then(({ data }) => mostrar(data.session));
  db.auth.onAuthStateChange((evento, sesion) => {
    if (evento === "SIGNED_IN" || evento === "SIGNED_OUT") mostrar(sesion);
  });

  $("#form-login").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    const err = $("#login-error");
    err.textContent = "";
    ocupado(f, true);
    const { error } = await db.auth.signInWithPassword({
      email: f.email.value.trim(),
      password: f.password.value,
    });
    ocupado(f, false);
    if (error) err.textContent = mensajeError(error);
    else f.reset();
  });

  $("#btn-salir").addEventListener("click", () => db.auth.signOut());

  // Ver / ocultar contraseña
  $("#btn-ver-pass").addEventListener("click", (e) => {
    const input = $("#form-login").password;
    const visible = input.type === "text";
    input.type = visible ? "password" : "text";
    e.currentTarget.textContent = visible ? "Ver" : "Ocultar";
    e.currentTarget.setAttribute("aria-label", visible ? "Mostrar contraseña" : "Ocultar contraseña");
    input.focus();
  });

  // ---------- Mi perfil (nombre del líder) ----------
  function nombreDe(user) {
    return (user && user.user_metadata && user.user_metadata.nombre) || "";
  }

  function pintarUsuario(user) {
    const nombre = nombreDe(user);
    $("#usuario-nombre").textContent = nombre || user.email;
    $("#usuario-inicial").textContent = (nombre || user.email || "?").trim().charAt(0).toUpperCase();
  }

  const dlgPerfil = $("#dlg-perfil");
  const formPerfil = $("#form-perfil");

  async function abrirPerfil() {
    if (dlgPerfil.open) return;
    const { data } = await db.auth.getUser();
    if (!data.user) return;
    formPerfil.nombre.value = nombreDe(data.user);
    $("[data-correo]", formPerfil).textContent = data.user.email;
    $(".form__error", formPerfil).textContent = "";
    dlgPerfil.showModal();
    formPerfil.nombre.focus();
  }

  $("#btn-perfil").addEventListener("click", abrirPerfil);

  formPerfil.addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $(".form__error", formPerfil);
    const nombre = formPerfil.nombre.value.trim();
    if (nombre.length < 2) return (err.textContent = "Escribe tu nombre.");

    ocupado(formPerfil, true);
    const { data, error } = await db.auth.updateUser({ data: { nombre } });
    if (!error) await db.auth.refreshSession(); // para que los nuevos registros ya lleven tu nombre
    ocupado(formPerfil, false);
    if (error) return (err.textContent = mensajeError(error));

    pintarUsuario(data.user);
    dlgPerfil.close();
    toast(`¡Listo, ${nombre}!`);
  });

  // ---------- Cargar y pintar ----------
  async function cargar() {
    $("#lista").innerHTML = '<p class="vacio">Cargando…</p>';
    const [resE, resC] = await Promise.all([
      db.from("estudiantes_resumen").select("*").order("nombre_completo"),
      db.from("carros").select("*").order("dueno"),
    ]);
    const error = resE.error || resC.error;
    if (error) {
      $("#lista").innerHTML = `<p class="vacio">No se pudo cargar: ${esc(mensajeError(error))}</p>`;
      return;
    }
    carros = resC.data;
    const data = resE.data;
    estudiantes = data.map((e) => ({
      ...e,
      total_abonado: Number(e.total_abonado),
      restante: Number(e.restante),
    }));
    pintar();
    pintarCarros();
  }

  function filtrados() {
    const q = normalizar($("#buscar").value.trim());
    const qDig = soloDigitos(q);
    const grupo = $("#filtro-grupo").value;
    const estado = $("#filtro-estado").value;
    const carro = $("#filtro-carro").value;
    return estudiantes.filter((e) => {
      if (grupo && e.grupo !== grupo) return false;
      if (estado === "pagado" && !e.pagado) return false;
      if (estado === "pendiente" && e.pagado) return false;
      if (carro === "__sin" && e.carro_id) return false;
      if (carro && carro !== "__sin" && e.carro_id !== carro) return false;
      if (!q) return true;
      return (
        normalizar(e.nombre_completo).includes(q) ||
        normalizar(e.correo).includes(q) ||
        (qDig.length >= 3 && soloDigitos(e.telefono).includes(qDig))
      );
    });
  }

  function pintar() {
    // Totales (de todos, no solo de los filtrados)
    const recaudado = estudiantes.reduce((s, e) => s + e.total_abonado, 0);
    $("#st-registrados").textContent = estudiantes.length;
    $("#st-liquidados").textContent = estudiantes.filter((e) => e.pagado).length;
    $("#st-recaudado").textContent = dinero(recaudado);
    $("#st-porcobrar").textContent = dinero(estudiantes.length * COSTO - recaudado);

    const lista = filtrados();
    $("#contador").textContent =
      lista.length === estudiantes.length
        ? `${estudiantes.length} estudiante${estudiantes.length === 1 ? "" : "s"}`
        : `${lista.length} de ${estudiantes.length}`;

    if (!estudiantes.length) {
      $("#lista").innerHTML =
        '<div class="vacio"><strong>¡Bienvenido!</strong>Todavía no hay registros. Usa “+ Nuevo registro”.</div>';
      return;
    }
    if (!lista.length) {
      $("#lista").innerHTML = '<p class="vacio">Nadie coincide con la búsqueda.</p>';
      return;
    }

    $("#lista").innerHTML = lista
      .map((e) => {
        const pct = Math.min(100, (e.total_abonado / COSTO) * 100);
        return `
        <article class="card">
          <div class="card__top">
            <div>
              <h3 class="card__name">${esc(e.nombre_completo)}</h3>
              <div class="card__meta"><span class="grupo">${esc(e.grupo)}</span>${esc(e.edad)} años</div>
              ${e.carro_dueno ? `<div class="carro-chip">Carro de <strong>${esc(e.carro_dueno)}</strong></div>` : '<div class="carro-chip carro-chip--sin">Sin carro</div>'}
            </div>
            ${e.pagado ? '<span class="badge badge--ok">Liquidado</span>' : `<span class="badge badge--pend">Faltan ${dinero(e.restante)}</span>`}
          </div>
          <div class="card__contact">
            <a href="tel:${esc(soloDigitos(e.telefono))}">${esc(e.telefono)}</a>
            <a href="mailto:${esc(e.correo)}">${esc(e.correo)}</a>
          </div>
          <div class="progress"><div class="progress__bar ${e.pagado ? "is-full" : ""}" style="width:${pct}%"></div></div>
          <div class="card__money"><span>Abonado <strong>${dinero(e.total_abonado)}</strong></span><span>de ${dinero(COSTO)}</span></div>
          <div class="card__actions">
            <button class="btn btn--red btn--sm" data-abonar="${e.id}" ${e.pagado ? "disabled" : ""}>Abonar</button>
            <button class="btn btn--ghost btn--sm" data-modificar="${e.id}">Modificar</button>
          </div>
        </article>`;
      })
      .join("");
  }

  ["#buscar", "#filtro-grupo", "#filtro-estado", "#filtro-carro"].forEach((s) => $(s).addEventListener("input", pintar));

  $("#lista").addEventListener("click", (e) => {
    const a = e.target.closest("[data-abonar]");
    const m = e.target.closest("[data-modificar]");
    if (a) abrirAbonar(a.dataset.abonar);
    if (m) abrirModificar(m.dataset.modificar);
  });

  // ---------- Nuevo registro ----------
  const dlgRegistro = $("#dlg-registro");
  const formRegistro = $("#form-registro");

  $("#btn-nuevo").addEventListener("click", () => {
    formRegistro.reset();
    $(".form__error", formRegistro).textContent = "";
    dlgRegistro.showModal();
    formRegistro.nombre.focus();
  });

  $$("[data-set-abono]", formRegistro).forEach((b) =>
    b.addEventListener("click", () => {
      formRegistro.abono.value = b.dataset.setAbono === "full" ? COSTO : b.dataset.setAbono;
    })
  );

  formRegistro.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = formRegistro;
    const err = $(".form__error", f);
    err.textContent = "";

    const datos = {
      p_nombre: f.nombre.value.trim(),
      p_edad: parseInt(f.edad.value, 10),
      p_grupo: f.grupo.value,
      p_correo: f.correo.value.trim().toLowerCase(),
      p_telefono: f.telefono.value.trim(),
      p_abono: Number(f.abono.value || 0),
    };

    if (soloDigitos(datos.p_telefono).length < 10) return (err.textContent = "El teléfono debe tener al menos 10 dígitos.");
    if (datos.p_abono < 0 || datos.p_abono > COSTO) return (err.textContent = `El abono debe estar entre $0 y $${COSTO}.`);

    // ¿Ya existe alguien con ese correo o teléfono?
    const tel = soloDigitos(datos.p_telefono);
    const dup = estudiantes.find((x) => x.correo === datos.p_correo || soloDigitos(x.telefono) === tel);
    if (dup && !window.confirm(`Ya existe "${dup.nombre_completo}" con ese correo o teléfono. ¿Registrar de todos modos?`)) return;

    ocupado(f, true);
    const { error } = await db.rpc("registrar_estudiante", datos);
    ocupado(f, false);
    if (error) return (err.textContent = mensajeError(error));

    dlgRegistro.close();
    toast(`${datos.p_nombre} quedó registrado${datos.p_abono ? ` con ${dinero(datos.p_abono)}` : ""}.`);
    cargar();
  });

  // ---------- Abonar ----------
  const dlgAbonar = $("#dlg-abonar");
  const formAbonar = $("#form-abonar");

  function abrirAbonar(id) {
    actual = estudiantes.find((x) => x.id === id);
    if (!actual) return;
    formAbonar.reset();
    $(".form__error", formAbonar).textContent = "";
    $("[data-nombre]", formAbonar).textContent = actual.nombre_completo;
    $("[data-bar]", formAbonar).style.width = Math.min(100, (actual.total_abonado / COSTO) * 100) + "%";
    $("[data-resumen]", formAbonar).textContent =
      `Lleva ${dinero(actual.total_abonado)} · Faltan ${dinero(actual.restante)}`;
    formAbonar.monto.max = actual.restante;
    dlgAbonar.showModal();
    formAbonar.monto.focus();
  }

  $$("[data-set-monto]", formAbonar).forEach((b) =>
    b.addEventListener("click", () => {
      if (!actual) return;
      const v = b.dataset.setMonto === "resto" ? actual.restante : Math.min(Number(b.dataset.setMonto), actual.restante);
      formAbonar.monto.value = v;
    })
  );

  formAbonar.addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $(".form__error", formAbonar);
    err.textContent = "";
    const monto = Number(formAbonar.monto.value);
    if (!(monto > 0)) return (err.textContent = "Escribe un monto mayor a $0.");
    if (monto > actual.restante) return (err.textContent = `Solo le faltan ${dinero(actual.restante)}.`);

    ocupado(formAbonar, true);
    const { error } = await db.from("abonos").insert({ estudiante_id: actual.id, monto });
    ocupado(formAbonar, false);
    if (error) return (err.textContent = mensajeError(error));

    dlgAbonar.close();
    const quedan = actual.restante - monto;
    toast(quedan <= 0 ? `¡${actual.nombre_completo} ya liquidó!` : `Abono de ${dinero(monto)} guardado. Faltan ${dinero(quedan)}.`);
    cargar();
  });

  // ---------- Modificar ----------
  const dlgModificar = $("#dlg-modificar");
  const formModificar = $("#form-modificar");

  async function abrirModificar(id) {
    actual = estudiantes.find((x) => x.id === id);
    if (!actual) return;
    const f = formModificar;
    $(".form__error", f).textContent = "";
    f.nombre.value = actual.nombre_completo;
    f.edad.value = actual.edad;
    f.grupo.value = actual.grupo;
    f.correo.value = actual.correo;
    f.telefono.value = actual.telefono;
    llenarSelectCarro(f.carro, actual.carro_id);
    $("[data-meta]", f).textContent =
      `Registrado ${fecha(actual.created_at)}${actual.registrado_por ? " por " + actual.registrado_por : ""}`;
    dlgModificar.showModal();
    cargarHistorial();
  }

  async function cargarHistorial() {
    const ul = $("[data-historial]", formModificar);
    ul.innerHTML = "<li>Cargando…</li>";
    const { data, error } = await db
      .from("abonos")
      .select("*")
      .eq("estudiante_id", actual.id)
      .order("created_at", { ascending: true });
    if (error) return (ul.innerHTML = `<li>${esc(mensajeError(error))}</li>`);
    if (!data.length) return (ul.innerHTML = "<li>Sin abonos todavía.</li>");
    const total = data.reduce((s, a) => s + Number(a.monto), 0);
    ul.innerHTML =
      data
        .map(
          (a) => `
      <li>
        <div><strong>${dinero(a.monto)}</strong><small>${fecha(a.created_at)}${a.registrado_por ? " · " + esc(a.registrado_por) : ""}</small></div>
        <button type="button" class="borrar" data-borrar="${a.id}" data-monto="${a.monto}">Borrar</button>
      </li>`
        )
        .join("") + `<li><span>Total</span><strong>${dinero(total)} de ${dinero(COSTO)}</strong></li>`;
  }

  $("[data-historial]", formModificar).addEventListener("click", async (e) => {
    const b = e.target.closest("[data-borrar]");
    if (!b) return;
    if (!window.confirm(`¿Borrar el abono de ${dinero(b.dataset.monto)}? Esto no se puede deshacer.`)) return;
    b.disabled = true;
    const { error } = await db.from("abonos").delete().eq("id", b.dataset.borrar);
    if (error) {
      b.disabled = false;
      return toast(mensajeError(error), true);
    }
    toast("Abono borrado.");
    await cargar();
    actual = estudiantes.find((x) => x.id === actual.id) || actual;
    cargarHistorial();
  });

  formModificar.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = formModificar;
    const err = $(".form__error", f);
    err.textContent = "";
    const cambios = {
      nombre_completo: f.nombre.value.trim(),
      edad: parseInt(f.edad.value, 10),
      grupo: f.grupo.value,
      correo: f.correo.value.trim().toLowerCase(),
      telefono: f.telefono.value.trim(),
      carro_id: f.carro.value || null,
    };
    if (soloDigitos(cambios.telefono).length < 10) return (err.textContent = "El teléfono debe tener al menos 10 dígitos.");

    ocupado(f, true);
    const { error } = await db.from("estudiantes").update(cambios).eq("id", actual.id);
    ocupado(f, false);
    if (error) return (err.textContent = mensajeError(error));

    dlgModificar.close();
    toast("Datos actualizados.");
    cargar();
  });

  // ---------- Descargar CSV ----------
  $("#btn-csv").addEventListener("click", () => {
    const cols = ["nombre_completo", "edad", "grupo", "correo", "telefono", "carro_dueno", "total_abonado", "restante", "pagado", "registrado_por", "created_at"];
    const titulos = ["Nombre", "Edad", "Grupo", "Correo", "Teléfono", "Carro", "Abonado", "Restante", "Liquidado", "Registró", "Fecha de registro"];
    const celda = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const filas = filtrados().map((e) =>
      cols.map((c) => celda(c === "pagado" ? (e.pagado ? "Sí" : "No") : c === "created_at" ? fecha(e.created_at) : e[c])).join(",")
    );
    const csv = "﻿" + [titulos.map(celda).join(","), ...filas].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: "home-for-christmas-registros.csv" });
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });
  // =========================================================
  //  CARROS
  // =========================================================
  const ocupadosDe = (carroId) => estudiantes.filter((e) => e.carro_id === carroId);

  // Pestañas Estudiantes / Carros
  $$("[data-tab]").forEach((b) =>
    b.addEventListener("click", () => {
      $$("[data-tab]").forEach((x) => x.classList.toggle("is-on", x === b));
      $("#vista-estudiantes").hidden = b.dataset.tab !== "estudiantes";
      $("#vista-carros").hidden = b.dataset.tab !== "carros";
    })
  );

  function llenarSelectCarro(sel, actualId) {
    sel.innerHTML =
      '<option value="">Sin carro</option>' +
      carros
        .map((c) => {
          const ocup = ocupadosDe(c.id).length;
          const lleno = ocup >= c.lugares && c.id !== actualId;
          return `<option value="${c.id}" ${c.id === actualId ? "selected" : ""} ${lleno ? "disabled" : ""}>${esc(c.dueno)} (${ocup}/${c.lugares})${lleno ? " · lleno" : ""}</option>`;
        })
        .join("");
  }

  function pintarCarros() {
    // filtro de carros en la vista de estudiantes
    const fc = $("#filtro-carro");
    const elegido = fc.value;
    fc.innerHTML =
      '<option value="">Todos los carros</option><option value="__sin">Sin carro</option>' +
      carros.map((c) => `<option value="${c.id}">Carro de ${esc(c.dueno)}</option>`).join("");
    fc.value = [...fc.options].some((o) => o.value === elegido) ? elegido : "";

    const sinCarro = estudiantes.filter((e) => !e.carro_id);
    const lugaresTot = carros.reduce((s, c) => s + c.lugares, 0);
    const asignados = estudiantes.length - sinCarro.length;
    $("#resumen-carros").textContent = carros.length
      ? `${carros.length} carro${carros.length === 1 ? "" : "s"} · ${asignados} de ${estudiantes.length} estudiantes con carro · ${Math.max(0, lugaresTot - asignados)} lugares libres`
      : "Todavía no hay carros.";

    const opcionesSin = sinCarro
      .map((e) => `<option value="${e.id}">${esc(e.nombre_completo)} · ${esc(e.grupo)}</option>`)
      .join("");

    $("#lista-carros").innerHTML = carros.length
      ? carros
          .map((c) => {
            const pas = ocupadosDe(c.id);
            const lleno = pas.length >= c.lugares;
            const vacios = Math.max(0, c.lugares - pas.length);
            return `
        <article class="card">
          <div class="card__top">
            <div>
              <h3 class="card__name">Carro de ${esc(c.dueno)}</h3>
            </div>
            <span class="carro__lugares ${lleno ? "is-full" : ""}">${pas.length}/${c.lugares}</span>
          </div>
          ${c.notas ? `<p class="carro__notas">${esc(c.notas)}</p>` : ""}
          <ul class="pasajeros">
            ${pas.map((e) => `<li><span>${esc(e.nombre_completo)}<small>${esc(e.grupo)}</small></span><button type="button" class="quitar" data-quitar="${e.id}">Quitar</button></li>`).join("")}
            ${'<li class="vacio-lugar">Lugar libre</li>'.repeat(Math.min(vacios, 2))}${vacios > 2 ? `<li class="vacio-lugar">+${vacios - 2} lugares libres</li>` : ""}
          </ul>
          ${
            lleno
              ? ""
              : sinCarro.length
              ? `<select class="agregar" data-agregar="${c.id}"><option value="">+ Agregar persona…</option>${opcionesSin}</select>`
              : '<p class="carro__notas">Todos los estudiantes ya tienen carro.</p>'
          }
          <div class="card__actions"><button type="button" class="btn btn--ghost btn--sm" data-editar-carro="${c.id}" style="grid-column:1/-1">Editar carro</button></div>
        </article>`;
          })
          .join("")
      : '<div class="vacio"><strong>¡A rodar!</strong>Crea el primer carro con “+ Nuevo carro”.</div>';

    $("#num-sin-carro").textContent = `(${sinCarro.length})`;
    $("#lista-sin-carro").innerHTML = sinCarro.length
      ? sinCarro.map((e) => `<span class="persona">${esc(e.nombre_completo)}<small>${esc(e.grupo)}</small></span>`).join("")
      : '<p class="contador">Todos tienen carro asignado.</p>';
  }

  async function asignarCarro(estudianteId, carroId) {
    const { error } = await db.from("estudiantes").update({ carro_id: carroId }).eq("id", estudianteId);
    if (error) {
      toast(mensajeError(error), true);
      pintarCarros();
      return;
    }
    const e = estudiantes.find((x) => x.id === estudianteId);
    const c = carros.find((x) => x.id === carroId);
    toast(c ? `${e.nombre_completo} va en el carro de ${c.dueno}.` : `${e.nombre_completo} quedó sin carro.`);
    cargar();
  }

  $("#lista-carros").addEventListener("change", (e) => {
    const sel = e.target.closest("[data-agregar]");
    if (sel && sel.value) asignarCarro(sel.value, sel.dataset.agregar);
  });
  $("#lista-carros").addEventListener("click", (e) => {
    const q = e.target.closest("[data-quitar]");
    const ed = e.target.closest("[data-editar-carro]");
    if (q) asignarCarro(q.dataset.quitar, null);
    if (ed) abrirCarro(ed.dataset.editarCarro);
  });

  // Nuevo / editar carro
  const dlgCarro = $("#dlg-carro");
  const formCarro = $("#form-carro");
  let carroActual = null;

  function abrirCarro(id) {
    carroActual = id ? carros.find((c) => c.id === id) : null;
    formCarro.reset();
    $(".form__error", formCarro).textContent = "";
    $("[data-titulo]", formCarro).textContent = carroActual ? "Editar carro" : "Nuevo carro";
    $("[data-borrar-carro]", formCarro).hidden = !carroActual;
    if (carroActual) {
      formCarro.dueno.value = carroActual.dueno;
      formCarro.lugares.value = carroActual.lugares;
      formCarro.notas.value = carroActual.notas || "";
    }
    dlgCarro.showModal();
    formCarro.dueno.focus();
  }

  $("#btn-nuevo-carro").addEventListener("click", () => abrirCarro(null));

  formCarro.addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $(".form__error", formCarro);
    err.textContent = "";
    const datos = {
      dueno: formCarro.dueno.value.trim(),
      lugares: parseInt(formCarro.lugares.value, 10),
      notas: formCarro.notas.value.trim() || null,
    };
    if (datos.dueno.length < 2) return (err.textContent = "Escribe el nombre del dueño.");
    if (!(datos.lugares >= 1 && datos.lugares <= 15)) return (err.textContent = "Los lugares deben ser de 1 a 15.");
    if (carroActual && ocupadosDe(carroActual.id).length > datos.lugares)
      return (err.textContent = `Ya van ${ocupadosDe(carroActual.id).length} personas; quita a alguien primero.`);

    ocupado(formCarro, true);
    const { error } = carroActual
      ? await db.from("carros").update(datos).eq("id", carroActual.id)
      : await db.from("carros").insert(datos);
    ocupado(formCarro, false);
    if (error) return (err.textContent = mensajeError(error));

    dlgCarro.close();
    toast(carroActual ? "Carro actualizado." : `Carro de ${datos.dueno} creado.`);
    cargar();
  });

  $("[data-borrar-carro]", formCarro).addEventListener("click", async () => {
    if (!carroActual) return;
    const n = ocupadosDe(carroActual.id).length;
    const aviso = n ? ` Las ${n} personas asignadas quedarán sin carro.` : "";
    if (!window.confirm(`¿Borrar el carro de ${carroActual.dueno}?${aviso}`)) return;
    const { error } = await db.from("carros").delete().eq("id", carroActual.id);
    if (error) return ($(".form__error", formCarro).textContent = mensajeError(error));
    dlgCarro.close();
    toast("Carro borrado.");
    cargar();
  });
})();
