/* Расчёт 12-ТЭК и хранение страниц учеников в браузере. */
(function (global) {
  const C = global.CATALOG;
  const FUELS = C.fuels;
  const BY_ID = Object.fromEntries(FUELS.map((f) => [f.id, f]));

  function num(value) {
    if (value === null || value === undefined || value === "") return 0;
    if (typeof value === "number") return value;
    const text = String(value).trim().replace(/\s/g, "").replace(",", ".");
    const n = parseFloat(text);
    return Number.isFinite(n) ? n : 0;
  }

  function roundInt(value) {
    return Math.round(value);
  }

  function toOfficial(fuel, qty, unitId, density) {
    const kind = fuel.unit_kind;
    unitId = unitId || fuel.default_unit;
    if (kind === "mass") return { t: qty, kg: qty / 1000, c: qty / 10 }[unitId] ?? qty;
    if (kind === "gas") return { thousand_m3: qty, m3: qty / 1000, million_m3: qty * 1000 }[unitId] ?? qty;
    if (kind === "liquid") {
      const dens = density > 0 ? density : fuel.default_density || 0.85;
      return { t: qty, kg: qty / 1000, l: (qty * dens) / 1000, m3: qty * dens }[unitId] ?? qty;
    }
    if (kind === "wood_dense") {
      return { dense_m3: qty, stacked_m3: qty * 0.75, t: qty / 0.67, kg: qty / 1000 / 0.67 }[unitId] ?? qty;
    }
    return qty;
  }

  function conventionalQty(fuel, qty, customK, moisture, unitId, density) {
    if (!qty) return [0, 0];
    unitId = unitId || fuel.default_unit;
    if (fuel.kind === "wood" && fuel.k_to_dense && fuel.k_to_tons && fuel.k_to_conv) {
      let official;
      let tons;
      if (unitId === "stacked_m3" || unitId === "loose_m3") {
        official = qty;
        tons = qty * fuel.k_to_dense * fuel.k_to_tons;
      } else if (unitId === "dense_m3") {
        official = fuel.k_to_dense ? qty / fuel.k_to_dense : qty;
        tons = qty * fuel.k_to_tons;
      } else if (unitId === "t") {
        official = fuel.k_to_dense && fuel.k_to_tons ? qty / (fuel.k_to_dense * fuel.k_to_tons) : qty;
        tons = qty;
      } else if (unitId === "kg") {
        tons = qty / 1000;
        official = fuel.k_to_dense && fuel.k_to_tons ? tons / (fuel.k_to_dense * fuel.k_to_tons) : tons;
      } else {
        official = qty;
        tons = qty * fuel.k_to_dense * fuel.k_to_tons;
      }
      const k = customK > 0 ? customK : fuel.k_to_conv;
      return [official, tons * k];
    }
    let official = toOfficial(fuel, qty, unitId, density);
    if (fuel.kind === "peat" && moisture != null && fuel.cond_moisture != null && moisture < 100) {
      official = (official * (100 - moisture)) / (100 - fuel.cond_moisture);
    }
    const k = customK > 0 ? customK : fuel.k;
    return [official, official * k];
  }

  function fuelLine(item) {
    const fuel = BY_ID[item.id];
    if (!fuel) return null;
    const customK = num(item.custom_k) || 0;
    const moisture = item.moisture === "" || item.moisture == null ? null : num(item.moisture);
    const density = num(item.density) || 0;
    const unitId = item.unit || fuel.default_unit;
    const [officialYear, tutYear] = conventionalQty(fuel, num(item.qty_year), customK, moisture, unitId, density);
    const [officialPrev, tutPrev] = conventionalQty(fuel, num(item.qty_prev), customK, moisture, unitId, density);
    const unitLabel = (fuel.units || []).find((u) => u.id === unitId)?.label || fuel.unit;
    let local = !!(fuel.local && !item.imported);
    let renewable = !!(fuel.renewable && local);
    if (fuel.id === "peat_wood") renewable = local && num(item.wood_share) > 50;
    const usedK = customK || (fuel.kind === "wood" && fuel.k_to_dense ? fuel.k_to_dense * fuel.k_to_tons * fuel.k_to_conv : fuel.k);
    return {
      id: fuel.id,
      name: fuel.name,
      unit: unitLabel,
      official_unit: fuel.unit,
      group: fuel.group,
      k: Math.round(usedK * 1e6) / 1e6,
      qty_year: num(item.qty_year),
      qty_prev: num(item.qty_prev),
      official_year: Math.round(officialYear * 1000) / 1000,
      official_prev: Math.round(officialPrev * 1000) / 1000,
      tut_year: tutYear,
      tut_prev: tutPrev,
      local,
      renewable,
      prod_year: num(item.prod_year),
      prod_prev: num(item.prod_prev),
      heat_year: num(item.heat_year),
      heat_prev: num(item.heat_prev),
      pop_year: num(item.pop_year),
      pop_prev: num(item.pop_prev),
    };
  }

  function energyPair(block, code) {
    const row = (block || {})[code] || {};
    return [num(row.year), num(row.prev)];
  }

  function buildReport(payload) {
    const fuelLines = (payload.fuels || []).map(fuelLine).filter(Boolean);
    const fuelTotals = {};
    ["110", "111", "112", "130"].forEach((code) => {
      fuelTotals[code] = { year: 0, prev: 0, local_year: 0, local_prev: 0, ren_year: 0, ren_prev: 0 };
    });
    fuelLines.forEach((line) => {
      const usedYear = line.prod_year + line.heat_year + line.pop_year;
      const usedPrev = line.prod_prev + line.heat_prev + line.pop_prev;
      const add = {
        110: [line.tut_year, line.tut_prev],
        111: usedYear || usedPrev ? [line.prod_year, line.prod_prev] : [0, 0],
        112: [line.heat_year, line.heat_prev],
        130: [line.pop_year, line.pop_prev],
      };
      Object.entries(add).forEach(([code, [y, p]]) => {
        fuelTotals[code].year += y;
        fuelTotals[code].prev += p;
        if (line.local) {
          fuelTotals[code].local_year += y;
          fuelTotals[code].local_prev += p;
        }
        if (line.renewable) {
          fuelTotals[code].ren_year += y;
          fuelTotals[code].ren_prev += p;
        }
      });
    });

    const heatUnits = C.energy_units.heat;
    const elecUnits = C.energy_units.elec;
    const heatId = (payload.units && payload.units.heat) || "gcal";
    const elecId = (payload.units && payload.units.elec) || "thous_kwh";
    const heatFactor = (heatUnits.find((u) => u.id === heatId) || heatUnits[0]).to_official;
    const elecFactor = (elecUnits.find((u) => u.id === elecId) || elecUnits[0]).to_official;
    const heat = payload.heat || {};
    const elec = payload.elec || {};
    const table1 = C.energy_rows.map((meta) => {
      const [hy0, hp0] = energyPair(heat, meta.code);
      const [ey0, ep0] = energyPair(elec, meta.code);
      const ft = fuelTotals[meta.code] || { year: 0, prev: 0, local_year: 0, local_prev: 0, ren_year: 0, ren_prev: 0 };
      return {
        code: meta.code,
        name: meta.name,
        fuel_ok: meta.fuel,
        heat_ok: meta.heat,
        elec_ok: meta.elec,
        c1: meta.fuel ? roundInt(ft.year) : null,
        c2: meta.fuel ? roundInt(ft.local_year) : null,
        c3: meta.fuel ? roundInt(ft.ren_year) : null,
        c4: meta.heat ? roundInt(hy0 * heatFactor) : null,
        c5: meta.elec ? roundInt(ey0 * elecFactor) : null,
        c6: meta.fuel ? roundInt(ft.prev) : null,
        c7: meta.fuel ? roundInt(ft.local_prev) : null,
        c8: meta.fuel ? roundInt(ft.ren_prev) : null,
        c9: meta.heat ? roundInt(hp0 * heatFactor) : null,
        c10: meta.elec ? roundInt(ep0 * elecFactor) : null,
      };
    });
    const by = Object.fromEntries(table1.map((r) => [r.code, r]));
    function term(f110, h110, h140, e110, e140, e143) {
      return (
        roundInt(f110 || 0) +
        roundInt(((h110 || 0) - (h140 || 0)) * 0.143) +
        roundInt(((e110 || 0) - (e140 || 0)) * 0.123) +
        roundInt((e143 || 0) * 0.123)
      );
    }
    const row260Year = term(by["110"].c1, by["110"].c4, by["140"].c4, by["110"].c5, by["140"].c5, by["143"].c5);
    const row260Prev = term(by["110"].c6, by["110"].c9, by["140"].c9, by["110"].c10, by["140"].c10, by["143"].c10);
    const heatUse = (by["110"].c4 || 0) + (by["120"].c4 || 0) + (by["130"].c4 || 0);
    const heatSrc = (by["140"].c4 || 0) + (by["150"].c4 || 0);
    const elecUse = (by["110"].c5 || 0) + (by["120"].c5 || 0) + (by["130"].c5 || 0);
    const elecSrc = (by["140"].c5 || 0) + (by["150"].c5 || 0);
    const warnings = [];
    if ((heatUse || heatSrc) && heatUse !== heatSrc) {
      warnings.push(`Тепло: расход+отпуск (${heatUse}) должен равняться производству+получению (${heatSrc}).`);
    }
    if ((elecUse || elecSrc) && elecUse !== elecSrc) {
      warnings.push(`Электричество: расход+отпуск (${elecUse}) должен равняться выработке+получению (${elecSrc}).`);
    }
    return {
      org: payload.org || {},
      fuel_lines: fuelLines.map((line) => ({
        ...line,
        tut_year: Math.round(line.tut_year * 1000) / 1000,
        tut_prev: Math.round(line.tut_prev * 1000) / 1000,
      })),
      table1,
      table2: { year: row260Year, prev: row260Prev },
      warnings,
    };
  }

  const STORE = "natasha12tek.v1";

  function loadDB() {
    try {
      return JSON.parse(localStorage.getItem(STORE) || "{}");
    } catch {
      return {};
    }
  }

  function saveDB(db) {
    localStorage.setItem(STORE, JSON.stringify(db));
  }

  function token() {
    return crypto.randomUUID().replace(/-/g, "").slice(0, 10);
  }

  function upsertStudent(id, name, payload, extra) {
    const db = loadDB();
    const now = new Date().toISOString().slice(0, 16).replace("T", " ");
    const prev = db[id] || { token: id, name, created_at: now, payload: {} };
    db[id] = {
      ...prev,
      ...extra,
      token: id,
      name: name || prev.name,
      payload: payload || prev.payload || {},
      updated_at: now,
    };
    saveDB(db);
    return db[id];
  }

  function getStudent(id) {
    return loadDB()[id] || null;
  }

  function allStudents() {
    return Object.values(loadDB()).sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
  }

  function deleteStudent(id) {
    const db = loadDB();
    delete db[id];
    saveDB(db);
  }

  function cell(v) {
    return v == null ? "" : v;
  }

  function downloadExcel(report, studentName) {
    const org = report.org || {};
    const rows = [
      ["Форма 12-ТЭК. Отчёт о расходе топливно-энергетических ресурсов"],
      [`за январь – ${org.month || ""} ${org.year || ""}    |    ученик: ${studentName}`],
      [],
      ["Организация", org.name || ""],
      ["Подразделение", org.unit_name || ""],
      ["Адрес", org.address || ""],
      ["e-mail", org.email || ""],
      ["ОКПО / УНП", `${org.okpo || "—"} / ${org.unp || "—"}`],
      [],
      ["РАЗДЕЛ I. Расход топливно-энергетических ресурсов"],
      ["Показатель", "Код", "КПТ всего", "местные", "возобн.", "тепло Гкал", "э/э тыс. кВт·ч", "КПТ прошлый", "местные пр.", "возобн. пр.", "тепло пр.", "э/э пр."],
    ];
    (report.table1 || []).forEach((r) => {
      rows.push([
        r.name,
        r.code,
        r.fuel_ok ? cell(r.c1) : "×",
        r.fuel_ok ? cell(r.c2) : "×",
        r.fuel_ok ? cell(r.c3) : "×",
        r.heat_ok ? cell(r.c4) : "×",
        r.elec_ok ? cell(r.c5) : "×",
        r.fuel_ok ? cell(r.c6) : "×",
        r.fuel_ok ? cell(r.c7) : "×",
        r.fuel_ok ? cell(r.c8) : "×",
        r.heat_ok ? cell(r.c9) : "×",
        r.elec_ok ? cell(r.c10) : "×",
      ]);
    });
    rows.push([]);
    rows.push(["РАЗДЕЛ II. Суммарное потребление ТЭР"]);
    rows.push(["Показатель", "Код", "С начала года, т у.т.", "Прошлый год, т у.т."]);
    rows.push(["Суммарное потребление топливно-энергетических ресурсов", "260", report.table2.year, report.table2.prev]);
    if (report.warnings && report.warnings.length) {
      rows.push([]);
      report.warnings.forEach((w) => rows.push([w]));
    }
    const calc = [
      ["Пересчёт выбранного топлива"],
      ["Группа", "Вид топлива", "Ед. ввода", "Введено (этот год)", "В офиц. ед.", "т у.т. (этот год)", "Введено (прошлый год)", "В офиц. ед. пр.", "т у.т. пр."],
    ];
    (report.fuel_lines || []).forEach((line) => {
      calc.push([
        line.group,
        line.name,
        line.unit + (line.unit !== line.official_unit ? " → " + line.official_unit : ""),
        line.qty_year,
        line.official_year,
        line.tut_year,
        line.qty_prev,
        line.official_prev,
        line.tut_prev,
      ]);
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "12-ТЭК");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(calc), "Расчёт топлива");
    const safe = (studentName || "uchenik").replace(/[^\w\- А-Яа-яЁё]/g, "");
    XLSX.writeFile(wb, `12-TEK_${safe || "uchenik"}.xlsx`);
  }

  global.Engine = {
    buildReport,
    token,
    upsertStudent,
    getStudent,
    allStudents,
    deleteStudent,
    downloadExcel,
    fuels: FUELS,
    groups: C.groups,
    energyRows: C.energy_rows,
    energyUnits: C.energy_units,
  };
})(window);
