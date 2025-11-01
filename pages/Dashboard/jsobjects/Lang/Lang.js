export default {
  // ===== Estado =====
  DEFAULT: "es",
  FALLBACKS: ["es", "en"], // orden de búsqueda si falta una clave
  NS: "common",            // namespace por defecto

  // Diccionarios (puedes partirlos por namespaces: common, dashboard, customers...)
  dict: {
    es: {
      common: {
        dashboard: "Tablero",
        customers: "Clientes",
        visits: "Visitas",
        create: "Crear",
        cancel: "Cancelar",
        name: "Nombre",
        phone: "Teléfono",
        email: "Correo",
        item: "elemento",
        item_plural: "elementos"
      }
    },
    en: {
      common: {
        dashboard: "Dashboard",
        customers: "Customers",
        visits: "Visits",
        create: "Create",
        cancel: "Cancel",
        name: "Name",
        phone: "Phone",
        email: "Email",
        item: "item",
        item_plural: "items"
      }
    }
  },

  // ===== Locale =====
  current() {
    return appsmith.store.lang || this.DEFAULT;
  },

  async init(lang = null) {
    const l = (lang || this.current()).toLowerCase();
    try { moment.locale(l); } catch {}
    await storeValue("lang", l);
    return l;
  },

  async set(lang) {
    if (!lang) return;
    const l = lang.toLowerCase();
    try { moment.locale(l); } catch {}
    await storeValue("lang", l);
    showAlert(`Idioma cambiado a ${l}`, "success");
  },

  // ===== Gestión de diccionarios =====
  // Mezcla nuevas claves (útil si cargas módulos por página)
  extend(lang, ns, entries) {
    const L = (lang || this.current()).toLowerCase();
    this.dict[L] = this.dict[L] || {};
    this.dict[L][ns] = { ...(this.dict[L][ns] || {}), ...(entries || {}) };
  },

  // ===== Núcleo de traducción =====
  // path admite "ns.key" o "key" (usa ns por defecto).
  // vars: {name: 'Juan'} → reemplaza {{name}}
  // opts: { ns: 'customers', count: n, fallback: 'Texto por defecto' }
  t(path, vars = {}, opts = {}) {
    const lang = this.current();
    const nsDefault = opts.ns || this.NS;
    const [ns, key] = path.includes(".") ? path.split(/\.(.*)/) : [nsDefault, path];
    const fall = (typeof opts.fallback === "string") ? opts.fallback : key;

    // función que busca una clave en un idioma dado
    const lookup = (lng, usePlural) => {
      const base = this.dict?.[lng]?.[ns] || {};
      if (usePlural && typeof opts.count === "number") {
        const pluralKey = `${key}_plural`;
        if (opts.count === 1 && base[key] !== undefined) return base[key];
        if (opts.count !== 1 && base[pluralKey] !== undefined) return base[pluralKey];
      }
      return base[key];
    };

    // intenta en el idioma actual + fallbacks
    const langs = [lang, ...this.FALLBACKS.filter(l => l !== lang)];
    let raw;
    for (const lng of langs) {
      raw = lookup(lng, true);
      if (raw !== undefined) break;
    }
    if (raw === undefined) raw = fall;

    // interpolación {{var}}
    let out = String(raw);
    Object.entries(vars || {}).forEach(([k, v]) => {
      out = out.replace(new RegExp(`{{\\s*${k}\\s*}}`, "g"), v ?? "");
    });

    // si hay count y la cadena lo requiere
    if (typeof opts.count === "number") {
      out = out.replace(/{{\s*count\s*}}/g, String(opts.count));
    }
    return out;
  },

  // atajo de plural: tn('item', n) → "1 elemento" / "2 elementos"
  tn(key, count, opts = {}) {
    const s = this.t(key, { count }, { ...opts, count });
    // si quieres prefijar el número automáticamente:
    return `${count} ${s}`;
  },

  // ===== Formatos =====
  formatDate(iso, fmt = "LL") {
    return iso ? moment(iso).format(fmt) : "";
  },
  formatDateTime(iso, fmt = "LLL") {
    return iso ? moment(iso).format(fmt) : "";
  },
  formatCurrency(v, c = "EUR") {
    try {
      const I = globalThis.Intl;
      return new I.NumberFormat(this.current(), { style: "currency", currency: c }).format(v ?? 0);
    } catch { return `${v ?? ""}`; }
  },
  formatNumber(v, o = {}) {
    try {
      const I = globalThis.Intl;
      return new I.NumberFormat(this.current(), o).format(v ?? 0);
    } catch { return `${v ?? ""}`; }
  }
};
