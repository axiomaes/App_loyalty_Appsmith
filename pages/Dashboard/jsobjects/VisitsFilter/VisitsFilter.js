export default {
  // --- claves/etiquetas tomadas del query de visitas ---
  _key(r)   { return r?.mes_anio_key || r?.mes_key || null; },
  _label(r) { return r?.mes_anio_label || r?.mes_label || this._key(r) || ""; },

  /**
   * Devuelve opciones únicas de meses presentes en 'rows'
   * [{label:"NOV / 2025", value:"2025-11"}, ...], ordenado desc (más reciente primero)
   */
  monthOptions(rows) {
    const data = Array.isArray(rows) ? rows
               : (Table_visitas?.tableData || q_visitas_historial?.data || []);
    const seen = new Set();
    const out  = [];

    for (const r of data) {
      const value = this._key(r);
      if (!value || seen.has(value)) continue;
      seen.add(value);
      out.push({ label: this._label(r), value });
    }

    // "YYYY-MM" ordena bien como string
    out.sort((a, b) => (a.value < b.value ? 1 : -1));
    return out;
  },

  /**
   * Filtra las filas por el mes seleccionado (clave "YYYY-MM").
   * Si no hay selección, devuelve todas las filas.
   */
  apply(rows, selectedKey) {
    const data = Array.isArray(rows) ? rows : (q_visitas_historial?.data || []);
    const sel  = selectedKey ?? SelMes?.selectedOptionValue;

    if (!sel) return data;
    return data.filter(r => this._key(r) === sel);
  }
};
