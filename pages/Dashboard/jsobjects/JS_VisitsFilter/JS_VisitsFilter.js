export default {
	// ---------- Helpers internos ----------
	_ymKey(iso) {
		// Devuelve "YYYY-MM" o null si no aplica
		if (!iso) return null;
		try {
			const m = moment(iso);
			return m.isValid() ? m.format("YYYY-MM") : null;
		} catch (_) { return null; }
	},
	_ymLabel(iso) {
		// Devuelve "MMM / YYYY" en mayúsculas sin punto (NOV / 2025)
		if (!iso) return null;
		try {
			const m = moment(iso);
			if (!m.isValid()) return null;
			return m.format("MMM / YYYY").toUpperCase().replace(/\./g, "");
		} catch (_) { return null; }
	},

	// ---------- Fuente única de datos ----------
	_rowsSource() {
		// Preferimos lo que guardó el handler (evita carreras). Fallback al query.
		const storeRows = appsmith.store?.clienteHistorial;
		if (Array.isArray(storeRows)) return storeRows;
		const qRows = q_visitas_historial?.data;
		return Array.isArray(qRows) ? qRows : [];
	},

	_detail() {
		// Detalle del cliente (lo guarda el handler)
		return appsmith.store?.clienteDetalle || {};
	},

	// ---------- Opciones del Select (meses) ----------
	options() {
		const rows = this._rowsSource();

		// Construimos value/label con prioridad a campos precalculados;
		// si no vienen, derivamos de la fecha.
		const opts = _.chain(rows)
		.map((r) => {
			const key =
						r?.mes_key ??
						this._ymKey(r?.fecha);
			const label =
						(r?.mes_label && String(r.mes_label).trim()) ||
						this._ymLabel(r?.fecha);
			if (!key || !label) return null;
			return { label, value: key };
		})
		.compact()
		.uniqBy("value")
		.sortBy("value") // "YYYY-MM" ordena ascendente
		.reverse()       // descendente (más reciente primero)
		.value();

		return opts;
	},

	defaultValue() {
		const saved = appsmith.store?.selMes;
		if (saved) return saved;
		const first = this.options()[0];
		return first ? first.value : "";
	},

	// ---------- Filas para la Table_visitas ----------
	rows() {
		const rows = this._rowsSource();
		const sel = SelMes?.selectedOptionValue || appsmith.store?.selMes || "";
		if (!sel) return rows;

		return rows.filter((r) => {
			const key =
						r?.mes_key ??
						this._ymKey(r?.fecha);
			return key === sel;
		});
	},

	onChange() {
		return storeValue("selMes", SelMes?.selectedOptionValue || "");
	},

	// ---------- Model para el Custom Widget ----------
	_isVip(detail) {
		const plan = String(detail?.planName || detail?.tipo_bono || "").toLowerCase();
		const tag  = String(detail?.tag || "").toLowerCase();
		return /vip/.test(plan) || /vip/.test(tag) || !!detail?.isVip;
	},

	_countCompleted(rows) {
		// total de visitas (todas) – usa las filas ya obtenidas
		return Array.isArray(rows) ? rows.length : 0;
	},

	_buildSlots(isVip, totalVisits) {
		const totalSlots = isVip ? 4 : 10;
		// Progreso del ciclo actual:
		let filled = totalSlots ? (totalVisits % totalSlots) : 0;
		if (filled === 0 && totalVisits > 0) {
			filled = Math.min(totalSlots, totalVisits);
		}
		const arr = [];
		for (let i = 1; i <= totalSlots; i++) {
			arr.push({ value: i, filled: i <= filled });
		}
		return { totalSlots, slots: arr, filled };
	},

	// ===== Calcula el modelo usando filas y detalle proporcionados =====
	processDataFrom(rows, detail) {
		const isVip = this._isVip(detail);
		const totalVisits = this._countCompleted(rows);
		const { totalSlots, slots, filled } = this._buildSlots(isVip, totalVisits);

		return {
			planName: detail?.planName || detail?.tipo_bono || "",
			tag: detail?.tag || "",
			isVip,
			// currentVisits: progreso del ciclo actual (para el header del widget)
			currentVisits: filled,
			totalSlots,
			slots,
		};
	},

	// Compat: calcula el modelo tomando fuentes estándar (store / query)
	processData() {
		const detail = this._detail();
		const rows   = this._rowsSource();
		return this.processDataFrom(rows, detail);
	}
};
