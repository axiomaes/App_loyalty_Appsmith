export default {
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

		const opts = _.chain(rows)
		.map(r => {
			const key =
						r.mes_key || (r.fecha ? moment(r.fecha).format("YYYY-MM") : null);
			const label =
						r.mes_label || (r.fecha ? moment(r.fecha).format("MMM / YYYY").toUpperCase().replace(".", "") : null);
			if (!key || !label) return null;
			return { label, value: key };
		})
		.compact()
		.uniqBy("value")
		.sortBy("value")
		.reverse()
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

		return rows.filter(r => {
			const key = r.mes_key || (r.fecha ? moment(r.fecha).format("YYYY-MM") : null);
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
		// si es múltiplo exacto (>0), mostramos la fila completa.
		let filled = totalVisits % totalSlots;
		if (filled === 0 && totalVisits > 0) {
			filled = Math.min(totalSlots, totalVisits);
		}
		const arr = [];
		for (let i = 1; i <= totalSlots; i++) {
			arr.push({ value: i, filled: i <= filled });
		}
		return { totalSlots, slots: arr, filled };
	},

	// ===== NUEVO: calcula el modelo usando filas y detalle proporcionados =====
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
