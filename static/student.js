(function () {
  const params = new URLSearchParams(location.search);
  let TOKEN = params.get("t");
  if (!TOKEN) {
    location.href = "index.html";
    return;
  }

  const ALL_FUELS = Engine.fuels;
  const GROUPS = Engine.groups;
  const ENERGY_ROWS = Engine.energyRows;
  const ENERGY_UNITS = Engine.energyUnits;

  let rec = Engine.getStudent(TOKEN);
  if (!rec) {
    rec = Engine.upsertStudent(TOKEN, params.get("n") || "Ученик", {});
  }
  const INITIAL = rec.payload || {};
  document.title = rec.name + " — 12-ТЭК";

  const share = location.origin + location.pathname.replace(/[^/]+$/, "") + "s.html?t=" + encodeURIComponent(TOKEN);

  document.getElementById("app").innerHTML = `
<div class="student-head">
  <div>
    <p class="eyebrow">Личная страница</p>
    <h1 id="student-name">${rec.name}</h1>
    <p class="muted">Сохраните эту ссылку. На этом устройстве введённые данные останутся.</p>
    <div class="copy-row" style="margin-top:10px">
      <input readonly value="${share}" id="my-page-link">
      <button type="button" class="btn tiny" id="copy-link">Копировать ссылку</button>
    </div>
  </div>
  <div class="actions">
    <span class="save-state" id="save-state">${rec.updated_at ? "Сохранено " + rec.updated_at : "Ещё не сохраняли"}</span>
    <button type="button" class="btn ghost" id="btn-save">Сохранить</button>
    <button type="button" class="btn" id="btn-excel">Скачать Excel</button>
  </div>
</div>
<nav class="steps">
  <a href="#org">1. Реквизиты</a>
  <a href="#fuels">2. Топливо</a>
  <a href="#heat">3. Тепло</a>
  <a href="#elec">4. Электричество</a>
  <a href="#result">5. Отчёт</a>
</nav>
<section class="panel" id="org">
  <h2>Реквизиты организации</h2>
  <div class="grid-2">
    <label>Полное наименование юридического лица<input data-org="name"></label>
    <label>Обособленное подразделение<input data-org="unit_name"></label>
    <label>Почтовый адрес<input data-org="address"></label>
    <label>Электронный адрес<input data-org="email"></label>
    <label>ОКПО<input data-org="okpo"></label>
    <label>УНП<input data-org="unp"></label>
    <label>Отчёт за январь – месяц<input data-org="month" placeholder="июнь"></label>
    <label>Год<input data-org="year" placeholder="2026"></label>
    <label>Должность ответственного<input data-org="responsible_title"></label>
    <label>Инициалы, фамилия<input data-org="responsible_name"></label>
    <label>Телефон<input data-org="phone"></label>
  </div>
</section>
<section class="panel" id="fuels">
  <h2>Топливо</h2>
  <p class="muted">Разверните группу из указаний Белстата и отметьте любой вид — организация может выбрать любой. После отметки раскроются поля расхода. В раздел I не включают топливо в ДВС и сырьё на переработку.</p>
  <div class="search-row"><input id="fuel-search" placeholder="Найти вид топлива…"></div>
  <div id="picked-fuels"></div>
  <div id="fuel-groups"></div>
</section>
<section class="panel energy-panel heat" id="heat">
  <h2>Тепловая энергия</h2>
  <p class="muted">Отдельный раздел формы. Единицу выберите сами — в отчёт всё пересчитается в Гкал. По правилам: строки 110 + 120 + 130 = 140 + 150.</p>
  <div class="unit-bar">
    <label>В какой единице вводите тепло<select id="heat-unit"></select></label>
    <p class="unit-hint" id="heat-head">В форму попадёт в Гкал</p>
  </div>
  <div id="heat-rows" class="energy-list"></div>
</section>
<section class="panel energy-panel elec" id="elec">
  <h2>Электрическая энергия</h2>
  <p class="muted">Отдельный раздел формы. Единицу выберите сами — в отчёт всё пересчитается в тыс. кВт·ч. По правилам: строки 110 + 120 + 130 = 140 + 150.</p>
  <div class="unit-bar">
    <label>В какой единице вводите электричество<select id="elec-unit"></select></label>
    <p class="unit-hint" id="elec-head">В форму попадёт в тыс. кВт·ч</p>
  </div>
  <div id="elec-rows" class="energy-list"></div>
</section>
<section class="panel" id="result">
  <h2>Готовый отчёт</h2>
  <div id="warnings"></div>
  <div class="table-wrap">
    <table class="grid result" id="table1">
      <thead>
        <tr><th rowspan="3">Показатель</th><th rowspan="3">Код</th><th colspan="5">С начала года</th><th colspan="5">Предыдущий год</th></tr>
        <tr><th colspan="3">котельно-печное, т у.т.</th><th rowspan="2">тепло, Гкал</th><th rowspan="2">э/э, тыс. кВт·ч</th><th colspan="3">котельно-печное, т у.т.</th><th rowspan="2">тепло, Гкал</th><th rowspan="2">э/э, тыс. кВт·ч</th></tr>
        <tr><th>всего</th><th>местные</th><th>возобн.</th><th>всего</th><th>местные</th><th>возобн.</th></tr>
      </thead>
      <tbody></tbody>
    </table>
  </div>
  <div class="sum-box" id="table2"></div>
  <p class="actions end">
    <button type="button" class="btn ghost" id="btn-save-2">Сохранить</button>
    <button type="button" class="btn" id="btn-excel-2">Скачать Excel</button>
  </p>
</section>`;

  const state = {
    org: Object.assign({
      name: "", unit_name: "", address: "", email: "", okpo: "", unp: "",
      month: "", year: "", responsible_title: "", responsible_name: "", phone: ""
    }, INITIAL.org || {}),
    selected: new Set((INITIAL.fuels || []).map((f) => f.id)),
    fuels: Object.fromEntries((INITIAL.fuels || []).map((f) => [f.id, f])),
    heat: INITIAL.heat || {},
    elec: INITIAL.elec || {},
    units: Object.assign({ heat: "gcal", elec: "thous_kwh" }, INITIAL.units || {}),
  };

  const openGroups = new Set(
    GROUPS.filter((g) => ALL_FUELS.some((f) => f.group === g && state.selected.has(f.id)))
  );

  function fuelById(id) { return ALL_FUELS.find((f) => f.id === id); }
  function emptyFuel(id) {
    const f = fuelById(id) || {};
    return {
      id, qty_year: "", qty_prev: "", custom_k: "", moisture: "",
      imported: false, wood_share: "",
      unit: f.default_unit || "",
      density: f.default_density || "",
      prod_year: "", prod_prev: "", heat_year: "", heat_prev: "", pop_year: "", pop_prev: ""
    };
  }
  function payload() {
    return {
      org: state.org,
      fuels: [...state.selected].map((id) => Object.assign(emptyFuel(id), state.fuels[id] || {}, { id })),
      heat: state.heat,
      elec: state.elec,
      units: state.units
    };
  }

  function fillOrg() {
    document.querySelectorAll("[data-org]").forEach((input) => {
      const key = input.dataset.org;
      input.value = state.org[key] || "";
      input.addEventListener("input", () => { state.org[key] = input.value; scheduleSave(); });
    });
  }

  function numField(obj, key, placeholder) {
    return `<input type="number" step="any" min="0" data-fk="${key}" placeholder="${placeholder || ""}" value="${obj[key] ?? ""}">`;
  }

  function fuelFieldsHtml(f, d) {
    const tags = [];
    if (f.local) tags.push("местное");
    if (f.renewable) tags.push("возобновляемое");
    const unitOpts = (f.units || []).map((u) => `<option value="${u.id}" ${d.unit === u.id ? "selected" : ""}>${u.label}</option>`).join("");
    const needsDensity = f.unit_kind === "liquid" && (d.unit === "l" || d.unit === "m3");
    return `
      <div class="fuel-meta">
        <p>В форме считается в ${f.unit}. Средний коэффициент К = ${Number(f.k).toLocaleString("ru-RU", { maximumFractionDigits: 6 })}</p>
        ${f.note ? `<p class="note">${f.note}</p>` : ""}
        <div class="tags">${tags.map((t) => `<span>${t}</span>`).join("")}</div>
      </div>
      <div class="grid-3">
        <label>В какой единице вводите<select data-fk="unit">${unitOpts}</select></label>
        <label>Количество, этот год ${numField(d, "qty_year")}</label>
        <label>Количество, прошлый год ${numField(d, "qty_prev")}</label>
        ${needsDensity ? `<label>Плотность, кг/л ${numField(d, "density", f.default_density)}</label>` : ""}
        <label>Свой коэффициент К ${numField(d, "custom_k", "если известен")}</label>
        ${f.kind === "peat" ? `<label>Фактическая влажность, % ${numField(d, "moisture")}</label>` : ""}
        ${f.id === "peat_wood" ? `<label>Доля древесины, % ${numField(d, "wood_share")}</label>` : ""}
        <label class="check"><input type="checkbox" data-fk="imported" ${d.imported ? "checked" : ""}> Поступило по импорту (не местное)</label>
      </div>
      <p class="conv-hint" data-hint="${f.id}"></p>
      <details class="extra-split">
        <summary>Разбивка по строкам формы, т у.т. (необязательно)</summary>
        <div class="grid-3">
          <label>111 производственные нужды, этот год ${numField(d, "prod_year")}</label>
          <label>111 прошлый год ${numField(d, "prod_prev")}</label>
          <label>112 на выработку тепла и э/э, этот год ${numField(d, "heat_year")}</label>
          <label>112 прошлый год ${numField(d, "heat_prev")}</label>
          <label>130 населению, этот год ${numField(d, "pop_year")}</label>
          <label>130 прошлый год ${numField(d, "pop_prev")}</label>
        </div>
      </details>`;
  }

  function bindFuelFields(root, f, d) {
    root.querySelectorAll("[data-fk]").forEach((el) => {
      const key = el.dataset.fk;
      const handler = () => {
        d[key] = el.type === "checkbox" ? el.checked : el.value;
        if (key === "unit") {
          renderGroups();
          scheduleSave();
          return;
        }
        scheduleSave();
        refreshPreview();
      };
      el.addEventListener(el.tagName === "SELECT" || el.type === "checkbox" ? "change" : "input", handler);
    });
  }

  function renderPicked() {
    const box = document.getElementById("picked-fuels");
    if (!state.selected.size) {
      box.className = "picked-bar empty";
      box.textContent = "Пока ничего не выбрано. Разверните группу ниже и отметьте любой вид топлива.";
      return;
    }
    box.className = "picked-bar";
    const chips = [...state.selected].map((id) => {
      const f = fuelById(id);
      if (!f) return "";
      return `<span class="chip on">${f.name}</span>`;
    }).join("");
    box.innerHTML = `<p class="picked-label">Выбрано: ${state.selected.size}</p><div class="chips">${chips}</div>`;
  }

  function renderGroups() {
    const q = (document.getElementById("fuel-search").value || "").toLowerCase();
    const box = document.getElementById("fuel-groups");
    box.innerHTML = "";
    GROUPS.forEach((group) => {
      const items = ALL_FUELS.filter((f) => f.group === group && f.name.toLowerCase().includes(q));
      if (!items.length) return;
      const selectedHere = items.filter((f) => state.selected.has(f.id)).length;
      const wrap = document.createElement("details");
      wrap.className = "fuel-group";
      wrap.open = openGroups.has(group) || !!q;
      wrap.innerHTML = `<summary><h3>${group}</h3><span>${items.length} видов${selectedHere ? " · выбрано " + selectedHere : ""}</span></summary>`;
      wrap.addEventListener("toggle", () => {
        if (wrap.open) openGroups.add(group);
        else openGroups.delete(group);
      });
      const list = document.createElement("div");
      list.className = "fuel-list";
      items.forEach((f) => {
        const on = state.selected.has(f.id);
        if (on && !state.fuels[f.id]) state.fuels[f.id] = emptyFuel(f.id);
        const d = state.fuels[f.id] || emptyFuel(f.id);
        if (!d.unit) d.unit = f.default_unit;
        const pick = document.createElement("div");
        pick.className = "fuel-pick" + (on ? " on" : "");
        pick.innerHTML = `
          <label class="fuel-pick-head">
            <input type="checkbox" ${on ? "checked" : ""}>
            <span>${f.name}</span>
            <em>${f.unit}</em>
          </label>
          ${on ? `<div class="fuel-body">${fuelFieldsHtml(f, d)}</div>` : ""}`;
        pick.querySelector("input").addEventListener("change", (ev) => {
          if (ev.target.checked) {
            state.selected.add(f.id);
            if (!state.fuels[f.id]) state.fuels[f.id] = emptyFuel(f.id);
            openGroups.add(group);
          } else {
            state.selected.delete(f.id);
          }
          renderGroups();
          scheduleSave();
        });
        if (on) bindFuelFields(pick, f, d);
        list.appendChild(pick);
      });
      wrap.appendChild(list);
      box.appendChild(wrap);
    });
    renderPicked();
    refreshPreview();
  }

  function fillEnergyUnits() {
    ["heat", "elec"].forEach((kind) => {
      const sel = document.getElementById(kind + "-unit");
      sel.innerHTML = ENERGY_UNITS[kind].map((u) => `<option value="${u.id}" ${state.units[kind] === u.id ? "selected" : ""}>${u.label}</option>`).join("");
      sel.onchange = () => {
        state.units[kind] = sel.value;
        updateEnergyHeads();
        scheduleSave();
        refreshPreview();
      };
    });
    updateEnergyHeads();
  }

  function updateEnergyHeads() {
    const heat = ENERGY_UNITS.heat.find((u) => u.id === state.units.heat);
    const elec = ENERGY_UNITS.elec.find((u) => u.id === state.units.elec);
    document.getElementById("heat-head").textContent = heat && heat.id !== "gcal"
      ? "Вводите в " + heat.label + " — в форму попадёт в Гкал"
      : "В форму попадёт в Гкал";
    document.getElementById("elec-head").textContent = elec && elec.id !== "thous_kwh"
      ? "Вводите в " + elec.label + " — в форму попадёт в тыс. кВт·ч"
      : "В форму попадёт в тыс. кВт·ч";
  }

  function renderEnergyKind(kind) {
    const box = document.getElementById(kind + "-rows");
    box.innerHTML = "";
    ENERGY_ROWS.forEach((row) => {
      if (!row[kind]) return;
      const data = state[kind][row.code] || {};
      const item = document.createElement("div");
      const nested = /^(из него|из них)/i.test(row.name);
      item.className = "energy-row" + (nested ? " sub" : "");
      item.innerHTML = `
        <div class="energy-name">
          <strong>${row.name}</strong>
          <span class="code">строка ${row.code}</span>
        </div>
        <label>Этот год<input type="number" step="any" min="0" data-en="${kind}" data-code="${row.code}" data-when="year" value="${data.year ?? ""}"></label>
        <label>Прошлый год<input type="number" step="any" min="0" data-en="${kind}" data-code="${row.code}" data-when="prev" value="${data.prev ?? ""}"></label>`;
      box.appendChild(item);
    });
    box.querySelectorAll("input").forEach((el) => {
      el.addEventListener("input", () => {
        const block = el.dataset.en;
        const code = el.dataset.code;
        if (!state[block][code]) state[block][code] = {};
        state[block][code][el.dataset.when] = el.value;
        scheduleSave();
        refreshPreview();
      });
    });
  }

  function cell(v, ok) {
    if (!ok) return `<td class="na">×</td>`;
    return `<td>${v === null || v === undefined || v === "" ? "" : v}</td>`;
  }

  function renderReport(report) {
    document.querySelector("#table1 tbody").innerHTML = (report.table1 || []).map((r) => `
      <tr><td class="name">${r.name}</td><td>${r.code}</td>
      ${cell(r.c1, r.fuel_ok)}${cell(r.c2, r.fuel_ok)}${cell(r.c3, r.fuel_ok)}
      ${cell(r.c4, r.heat_ok)}${cell(r.c5, r.elec_ok)}
      ${cell(r.c6, r.fuel_ok)}${cell(r.c7, r.fuel_ok)}${cell(r.c8, r.fuel_ok)}
      ${cell(r.c9, r.heat_ok)}${cell(r.c10, r.elec_ok)}</tr>`).join("");
    const t2 = report.table2 || {};
    document.getElementById("table2").innerHTML =
      `<strong>Строка 260.</strong> Суммарное потребление ТЭР: <b>${t2.year ?? 0}</b> т у.т. с начала года, <b>${t2.prev ?? 0}</b> т у.т. за тот же период прошлого года.`;
    const w = document.getElementById("warnings");
    w.innerHTML = (report.warnings || []).map((x) => `<p class="alert">${x}</p>`).join("");
    (report.fuel_lines || []).forEach((line) => {
      const hint = document.querySelector(`[data-hint="${line.id}"]`);
      if (!hint) return;
      const fmt = (n) => Number(n || 0).toLocaleString("ru-RU", { maximumFractionDigits: 3 });
      hint.textContent = `В пересчёте: ${fmt(line.official_year)} ${line.official_unit} → ${fmt(line.tut_year)} т у.т. (этот год); ${fmt(line.official_prev)} ${line.official_unit} → ${fmt(line.tut_prev)} т у.т. (прошлый год).`;
    });
  }

  function refreshPreview() {
    renderReport(Engine.buildReport(payload()));
  }

  let saveTimer = null;
  function scheduleSave() {
    document.getElementById("save-state").textContent = "Сохраняем…";
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 400);
  }

  function saveNow() {
    const saved = Engine.upsertStudent(TOKEN, rec.name, payload());
    document.getElementById("save-state").textContent = "Сохранено " + saved.updated_at;
    refreshPreview();
  }

  function saveExcel() {
    saveNow();
    Engine.downloadExcel(Engine.buildReport(payload()), rec.name);
  }

  document.getElementById("copy-link").onclick = () => navigator.clipboard.writeText(share);
  document.getElementById("fuel-search").addEventListener("input", renderGroups);
  document.getElementById("btn-save").onclick = saveNow;
  document.getElementById("btn-save-2").onclick = saveNow;
  document.getElementById("btn-excel").onclick = saveExcel;
  document.getElementById("btn-excel-2").onclick = saveExcel;

  fillOrg();
  fillEnergyUnits();
  renderGroups();
  renderEnergyKind("heat");
  renderEnergyKind("elec");
  refreshPreview();
})();
