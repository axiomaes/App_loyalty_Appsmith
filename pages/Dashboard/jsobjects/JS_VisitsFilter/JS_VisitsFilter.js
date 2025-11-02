export default {
  // Arma las opciones únicas [ {label, value} ] a partir del query
  options() {
    const rows = q_visitas_historial.data || [];

    const opts = _.chain(rows)
      .map(r => {
        const key =
          r.mes_key ||
          (r.fecha ? moment(r.fecha).format('YYYY-MM') : null);

        const label =
          r.mes_label ||
          (r.fecha
            ? moment(r.fecha).format('MMM / YYYY').toUpperCase().replace('.', '')
            : null);

        if (!key || !label) return null;
        return { label, value: key };
      })
      .compact()
      .uniqBy('value')     // sin duplicados
      .sortBy('value')     // ascendente
      .reverse()           // más reciente primero
      .value();

    return opts;
  },

  // Valor por defecto: el guardado en store o el más reciente
  defaultValue() {
    const saved = appsmith.store.selMes;
    if (saved) return saved;
    const first = this.options()[0];
    return first ? first.value : "";
  },

  // Filtra las filas para la tabla según el Select
  rows() {
    const rows = q_visitas_historial.data || [];
    const sel = SelMes.selectedOptionValue || appsmith.store.selMes || "";

    if (!sel) return rows;

    return rows.filter(r => {
      const key =
        r.mes_key ||
        (r.fecha ? moment(r.fecha).format('YYYY-MM') : null);
      return key === sel;
    });
  },

  // Guardar selección cuando cambia el Select
  onChange() {
    return storeValue('selMes', SelMes.selectedOptionValue || "");
  }
};
