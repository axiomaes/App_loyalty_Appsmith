export default {
	// ==== Estado interno =======================================================
	_lastId: null,
	_pollerId: null,

	// ==== Helpers ==============================================================
	_isUuid(s) {
		return (
			typeof s === "string" &&
			/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)
		);
	},

	_rows() {
		// Fuente cuando se usa Table (Appsmith)
		const wRows = Array.isArray(Listado_clientes?.tableData) ? Listado_clientes.tableData : [];
		// Fuente directa de la query por si la tabla no está aún montada
		const qRows = Array.isArray(q_clientes_listado?.data) ? q_clientes_listado.data : [];
		return wRows.length ? wRows : qRows;
	},

	// ==== Orquestador de página (OnPageLoad) ===================================
	async run() {
		try {
			// 0) Sesión/negocio
			if (!(Auth?.isLoggedIn?.() && Auth?.hasBusiness?.())) {
				showAlert("Sesión inválida. Vuelve a iniciar sesión.", "error");
				await Auth?.logout?.();
				navigateTo("Login");
				return;
			}

			// 1) Refrescar SIEMPRE el listado (evita caché de Appsmith)
			await q_clientes_listado.run();

			// 2) Resolver selección con prioridad al parámetro ?cid=
			const urlCid = appsmith.URL?.queryParams?.cid?.trim();
			if (urlCid && this._isUuid(urlCid)) {
				await storeValue("selCustomerId", urlCid);
			}

			// 3) Si no hay selección, usar la primera fila del listado
			if (!appsmith.store.selCustomerId) {
				await this.selectFirstIfEmpty(); // usa tu propio helper
			}

			// 4) Cargar detalle + visitas del seleccionado (si existe)
			const cid = appsmith.store.selCustomerId;
			if (this._isUuid(cid)) {
				await Promise.allSettled([
					q_cliente_detalle.run({ id: cid }),
					q_visitas_historial.run({ customerId: cid, limit: 50, offset: 0 })
				]);
			} else {
				showAlert("No hay cliente seleccionado.", "warning");
			}
		} catch (e) {
			console.error("DashActions.run error:", e);
			showAlert("Error cargando la página.", "error");
		}
	},

	// ==== Mantener tu selección viva aunque entren clientes nuevos ============
	async refreshCustomersAndKeepSelection() {
		await q_clientes_listado.run();
		const cid = appsmith.store.selCustomerId;
		const rows = this._rows();
		const found = rows.some(r => r?.id === cid);

		if (!found && rows.length > 0) {
			// si el seleccionado ya no está (o no había), selecciona el primero
			await this.selectCustomer(rows[0]);
			// ya no forzamos selección visual en la tabla
		}
	},

	// ==== Auto-refresh opcional (polling) ======================================
	startPolling(ms = 15000) {
		this.stopPolling();
		this._pollerId = setInterval(async () => {
			try {
				await this.refreshCustomersAndKeepSelection();
			} catch (e) {
				console.warn("poll refresh error:", e);
			}
		}, Math.max(5000, Number(ms) || 15000));
		showAlert("Auto-refresh activado.", "info");
	},

	stopPolling() {
		if (this._pollerId) {
			clearInterval(this._pollerId);
			this._pollerId = null;
			showAlert("Auto-refresh detenido.", "info");
		}
	},

	// ==== TUS FUNCIONES (sin romper nombres) ==================================
	async selectCustomer(row) {
		const id = row?.id || Listado_clientes?.selectedRow?.id;
		if (!this._isUuid(id)) return;

		// Evita recargar si es el mismo cliente
		if (this._lastId === id && appsmith.store.selCustomerId === id) return;

		await storeValue("selCustomerId", id);
		this._lastId = id;

		// Carga detalle + historial (50 últimas visitas)
		await Promise.allSettled([
			q_cliente_detalle.run({ id }),
			q_visitas_historial.run({ customerId: id, limit: 50, offset: 0 })
		]);
	},

	// Selecciona la primera fila tras cargar la tabla si no hay selección previa
	async selectFirstIfEmpty() {
		const rows = this._rows();
		if (!appsmith.store.selCustomerId && rows.length > 0) {
			await this.selectCustomer(rows[0]);
			// ya no forzamos selección visual en la tabla
		}
	}
};
