export default {
	// --- helpers internos ---
	_isYm(s) {
		return typeof s === "string" && /^\d{4}-\d{2}$/.test(s);
	},
	_fromRow(r) {
		if (!r) return { key: null, label: "" };
		const key =
					r?.mes_anio_key ??
					r?.mes_key ??
					null;

		const rawLabel =
					r?.mes_anio_label ??
					r?.mes_label ??
					"";

		return {
			key: this._isYm(key) ? key : null,
			label: String(rawLabel || "").trim(),
		};
	},
	_fmtLabelFromKey(ym) {
		if (!this._isYm(ym)) return "";
		const [y, m] = ym.split("-").map((x) => Number(x));
		const meses = ["ENE","FEB","MAR","ABR","MAY","JUN","JUL","AGO","SEP","OCT","NOV","DIC"];
		const mm = m >= 1 && m <= 12 ? meses[m - 1] : "";
		return `${mm} / ${y}`;
	},

	// --- compat con tu API actual ---
	_key(r)   { return this._fromRow(r).key; },
	_label(r) {
		const { key, label } = this._fromRow(r);
		return label || (key ? this._fmtLabelFromKey(key) : "");
	},

	/**
   * Devuelve opciones únicas de meses presentes en 'rows'
   * [{label:"NOV / 2025", value:"2025-11"}, ...], ordenado desc (más reciente primero)
   */
	monthOptions(rows) {
		const data = Array.isArray(rows)
		? rows
		: (Table_visitas?.tableData || q_visitas_historial?.data || []);

		const seen = new Set();
		const out  = [];

		for (const r of data) {
			const key = this._key(r);
			if (!key || seen.has(key)) continue;
			seen.add(key);
			out.push({ label: this._label(r) || this._fmtLabelFromKey(key), value: key });
		}

		// "YYYY-MM" ordena bien como string: desc
		out.sort((a, b) => (a.value < b.value ? 1 : (a.value > b.value ? -1 : 0)));
		return out;
	},

	/**
   * Filtra las filas por el mes seleccionado (clave "YYYY-MM").
   * Si no hay selección, devuelve todas las filas.
   */
	apply(rows, selectedKey) {
		const data = Array.isArray(rows) ? rows : (q_visitas_historial?.data || []);
		const sel  = selectedKey ?? SelMes?.selectedOptionValue;

		if (!this._isYm(sel)) return data;
		return data.filter((r) => this._key(r) === sel);
	}
};
