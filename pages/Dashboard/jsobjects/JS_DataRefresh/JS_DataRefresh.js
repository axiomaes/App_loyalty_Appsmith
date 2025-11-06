export default {
	// --- IDs actuales seguros ---
	_bizId() {
		try {
			const a = (typeof Auth?.businessId === "function" && Auth.businessId()) || null;
			return a || appsmith.store?.businessId || "";
		} catch { return appsmith.store?.businessId || ""; }
	},
	_custId() {
		return appsmith.store?.selCustomerId || appsmith.store?.selectedCustomerId || "";
	},

	// --- Util: espera ms ---
	_sleep(ms = 250) { return new Promise(r => setTimeout(r, ms)); },

	// --- Refresca listado + KPIs (si existen) ---
	async refreshListAndKpis() {
		const bid = this._bizId();
		const runners = [];
		if (typeof q_clientes_listado?.run === "function") {
			runners.push(q_clientes_listado.run({ bid }));
		}
		if (typeof q_kpi_total_clientes?.run === "function") {
			runners.push(q_kpi_total_clientes.run({ bid }));
		}
		await Promise.allSettled(runners);

		// reintento suave si el listado vino vacío
		try {
			const rows = Array.isArray(q_clientes_listado?.data) ? q_clientes_listado.data : [];
			if (rows.length === 0) {
				await this._sleep(300);
				await q_clientes_listado.run({ bid });
			}
		} catch { /* noop */ }
	},

	// --- Refresca detalle + historial + tarjeta ---
	async refreshDetailAndVisits() {
		const id  = this._custId();
		const bid = this._bizId();
		if (!id) return;

		const pageSize = (Table_visitas && typeof Table_visitas.pageSize === "number") ? Table_visitas.pageSize : 50;

		const [detRes, histRes] = await Promise.allSettled([
			q_cliente_detalle?.run?.({ id, bid }),
			q_visitas_historial?.run?.({ customerId: id, limit: pageSize, offset: 0 }),
		]);

		// detalle
		const detRaw = detRes.status === "fulfilled"
		? (Array.isArray(detRes.value) ? (detRes.value[0] || {}) : (detRes.value || {}))
		: {};
		const nameNorm = detRaw?.name || detRaw?.fullName || detRaw?.nombre ||
					[detRaw?.firstName, detRaw?.lastName].filter(Boolean).join(" ").trim() ||
					detRaw?.alias || "Cliente";
		const detalle = { ...detRaw, name: nameNorm };

		await storeValue("clienteDetalle", detalle);
		await storeValue("editingCustomer", detalle);

		// historial
		const hist = histRes.status === "fulfilled" ? (Array.isArray(histRes.value) ? histRes.value : []) : [];
		await storeValue("clienteHistorial", hist);

		// reconstruir tarjeta (visitsUI)
		try {
			const ui = visitsLogic?.processData?.();
			if (ui) await storeValue("visitsUI", ui);
		} catch (e) {
			console.warn("visitsUI rebuild warn:", e);
		}
	},

	// --- Gancho principal para llamar tras una mutación ---
	async afterMutation({ refreshList = true, refreshDetail = true } = {}) {
		try {
			if (refreshList)  await this.refreshListAndKpis();
			if (refreshDetail) await this.refreshDetailAndVisits();
			showAlert("Datos actualizados.", "success");
		} catch (e) {
			console.error("afterMutation error:", e);
			showAlert("No se pudieron actualizar los datos.", "warning");
		}
	}
};
