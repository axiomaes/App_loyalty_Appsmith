export default {
	_isUuid(s) {
		return typeof s === "string" &&
			/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
	},

	_buildMonthKey(dateIso) {
		// YYYY-MM (UTC)
		try {
			const d = new Date(dateIso);
			const y = d.getUTCFullYear();
			const m = String(d.getUTCMonth() + 1).padStart(2, "0");
			return `${y}-${m}`;
		} catch { return null; }
	},

	_buildMonthLabel(dateIso) {
		// "ENE / 2025" en mayúsculas
		try {
			const d = new Date(dateIso);
			const y = d.getUTCFullYear();
			const monthNames = ["ENE","FEB","MAR","ABR","MAY","JUN","JUL","AGO","SEP","OCT","NOV","DIC"];
			const lbl = `${monthNames[d.getUTCMonth()]} / ${y}`;
			return lbl.toUpperCase();
		} catch { return null; }
	},

	_computeMonthOptions(rows = []) {
		// Usa mes_key/mes_label si vienen del query; si no, deriva desde fecha
		const items = [];
		for (const r of rows) {
			const key = r.mes_key || this._buildMonthKey(r.fecha);
			const label = r.mes_label || this._buildMonthLabel(r.fecha);
			if (key && label) items.push({ label, value: key });
		}
		// Uniq por value (mes más reciente primero)
		const map = new Map();
		for (const it of items) map.set(it.value, it.label);
		const dedup = Array.from(map.entries()).map(([value, label]) => ({ value, label }));
		// Orden DESC por value (YYYY-MM)
		dedup.sort((a, b) => (a.value < b.value ? 1 : a.value > b.value ? -1 : 0));
		return dedup;
	},

	/**
   * Abre el detalle del cliente seleccionado desde una fila de la tabla
   * y prepara meses únicos para el filtro SelMes.
   */
	async openDetail(row) {
		try {
			// 1) ID del cliente
			const id =
						row?.id ||
						row?.customerId ||
						row?.ID ||
						Listado_clientes?.triggeredRow?.id;

			if (!id) {
				showAlert("No se pudo determinar el ID del cliente.", "error");
				return;
			}

			// 2) Guardar selección global
			await storeValue("selCustomerId", id);
			await storeValue("selectedCustomerId", id);

			// 3) Ejecutar queries en paralelo
			const pageSize = Table_visitas?.pageSize || 50;
			const [det, hist] = await Promise.all([
				q_cliente_detalle.run({ id }),
				q_visitas_historial.run({ customerId: id, limit: pageSize, offset: 0 })
			]);

			// 4) Guardar resultados crudos
			const detalle = Array.isArray(det) ? (det[0] || {}) : (det || {});
			const historial = Array.isArray(hist) ? hist : [];
			await storeValue("clienteDetalle", detalle);
			await storeValue("clienteHistorial", historial);

			// 5) Preparar opciones de meses para SelMes
			const monthOpts = this._computeMonthOptions(historial);
			const monthDefault = monthOpts?.[0]?.value || null;
			await storeValue("visitsMonthsOptions", monthOpts);
			await storeValue("visitsMonthDefault", monthDefault);

			// 6) Refrescar la tarjeta de visitas (Custom Widget) sin bloquear el flujo
			try {
				await Promise.all([
					getClientVisitsQuery?.run?.(),
					getFallbackVisitsCount?.run?.(),
				]);
				const ui = await visitsLogic?.processData?.();
				if (ui) await storeValue("visitsUI", ui);
			} catch (e) {
				console.warn("⚠️ No se pudo refrescar la tarjeta de visitas:", e);
			}

			// 7) Abrir modal
			await showModal(Modal_datos_clientes.name);

			console.log("✅ Cliente cargado:", id, "Meses:", monthOpts);

		} catch (err) {
			console.error("❌ Error en CustomerDetailHandler.openDetail:", err);
			showAlert("No se pudo abrir el detalle del cliente.", "error");
		}
	},
};
