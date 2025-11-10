export default {
	__visitsTicker: null,
	__visitsVisHandler: null,

	// ===== Helpers internos =====================================================
	_wait(ms) { return new Promise(r => setTimeout(r, ms)); },

	async _ensureBusinessId() {
		let bid =
				(typeof Auth?.businessId === "function" && Auth.businessId()) ||
				appsmith.store?.businessId || null;

		if (!bid) {
			const t0 = Date.now();
			while (!bid && Date.now() - t0 < 3000) {
				bid =
					(typeof Auth?.businessId === "function" && Auth.businessId()) ||
					appsmith.store?.businessId || null;
				if (bid) break;
				await this._wait(120);
			}
		}
		if (bid) await storeValue("businessId", bid);
		return bid;
	},

	async _loadWaSettingsSafe() {
		try {
			if (typeof JS_WaSettings?.load === "function") {
				await JS_WaSettings.load();
				return;
			}
		} catch (e) {
			console.warn("WA settings load warn:", e);
		}
		// Defaults (no bloquea si no existe JS_WaSettings)
		await storeValue("ownerPhone", appsmith.store?.ownerPhone || "+34632803533");
		await storeValue("wa_mode", appsmith.store?.wa_mode || "vip");
		await storeValue("wa_bi_approved", appsmith.store?.wa_bi_approved ?? false);
	},

	// En 1.89 no hay setFocus, lo dejamos como NO-OP
	_focusScanner() { /* sin-op en CE 1.89 */ },

	// Guardamos ids en propiedades del propio objeto (no window/document)
	_clearVisitsTicker() {
		try {
			if (this.__visitsTicker) {
				clearInterval(this.__visitsTicker);
				this.__visitsTicker = null;
			}
		} catch (_) {}
	},

	_startVisitsTicker(bid) {
		if (typeof q_visitas_hoy?.run !== "function") return;
		this._clearVisitsTicker();

		const refresh = async () => {
			try {
				await q_visitas_hoy.run({ bid });
				await storeValue("_visitasHoy_last", Date.now());
			} catch (e) {
				console.warn("q_visitas_hoy refresh warn:", e?.message || e);
			}
		};

		refresh();
		this.__visitsTicker = setInterval(refresh, 25000);
	},

	// ===== OnLoad (Automatismo) =================================================
	async run() {
		try {
			// 0) Sesión válida
			if (!(Auth?.isLoggedIn?.() && Auth?.hasBusiness?.())) {
				showAlert("Sesión inválida. Vuelve a iniciar sesión.", "error");
				await Auth?.logout?.();
				navigateTo("Login");
				return;
			}

			// 1) businessId en store
			const bid = await this._ensureBusinessId();
			if (!bid) {
				showAlert("No se pudo resolver el negocio.", "error");
				return;
			}

			// 2) Configuración WA
			await this._loadWaSettingsSafe();

			// 3) Datos principales
			if (typeof q_clientes_listado?.run === "function") {
				await q_clientes_listado.run({ bid });
			}
			if (typeof q_kpi_total_clientes?.run === "function") {
				await q_kpi_total_clientes.run({ bid });
			}

			// 4) Registro de visitas (ticker + "foco" best-effort)
			if (typeof q_visitas_hoy?.run === "function") {
				this._startVisitsTicker(bid);
			}
			this._focusScanner(); // no-op en 1.89

		} catch (e) {
			console.error("OnLoad.run error:", e);
			showAlert("Error cargando la página.", "error");
		}
	}
};
