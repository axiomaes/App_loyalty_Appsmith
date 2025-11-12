export default {
	// ========= Getters básicos y normalización =========
	get() {
		// Prioriza el objeto 'session' único
		const s = appsmith.store?.session || {};
		// Compat con claves legacy sueltas en store (si existieran)
		const role =
					(typeof Roles?.get === "function" && Roles.get()) ||
					s.role || appsmith.store?.role || "STAFF";

		return {
			userId:     s.userId     || appsmith.store?.userId     || appsmith.user?.email || "anonymous",
			email:      s.email      || appsmith.store?.userEmail  || appsmith.user?.email || "",
			role,
			businessId: s.businessId || appsmith.store?.businessId || "",
			businessName: s.businessName || appsmith.store?.businessName || ""
		};
	},

	userId()     { return this.get().userId; },
	role()       { return this.get().role; },
	businessId() { return this.get().businessId; },

	// Asegura que exista una sesión mínima (llámalo en onPageLoad)
	async ensure() {
		if (!appsmith.store?.session) {
			await storeValue("session", this.get()); // crea con los defaults de arriba
		}
		return appsmith.store.session;
	},

	// Setea/actualiza la sesión (úsalo en el login OK)
	async setSession({ userId, email, role, businessId, businessName } = {}) {
		const current = this.get();
		const next = {
			userId:       userId       ?? current.userId,
			email:        email        ?? current.email,
			role:         (role ? String(role).toUpperCase() : current.role),
			businessId:   businessId   ?? current.businessId,
			businessName: businessName ?? current.businessName
		};
		await storeValue("session", next);

		// (Opcional) espeja claves legacy si tienes código antiguo que aún las usa
		await Promise.all([
			storeValue("userId", next.userId),
			storeValue("userEmail", next.email),
			storeValue("role", next.role),
			storeValue("businessId", next.businessId),
			storeValue("businessName", next.businessName)
		]);

		return next;
	},

	// ========= Limpiezas que ya tenías =========
	async clearUiState() {
		try {
			await Promise.all([
				storeValue("_loadingCustomer", null),
				storeValue("_loadedCustId", null),
				storeValue("selCustomerId", null),
				storeValue("editingCustomer", null),
				storeValue("visits", null),
				storeValue("cliente_creado", null),
				storeValue("cliente_qr_payload", null),
				storeValue("selectedBusinessId", null)
			]);
		} catch (e) {
			console.warn("clearUiState:", e);
		}
	},

	async clearTempData() {
		try {
			await Promise.all([
				storeValue("tempPassMap", null),
				storeValue("filters_from", undefined),
				storeValue("filters_to", undefined),
			]);
		} catch (e) {
			console.warn("clearTempData:", e);
		}
	},

	// ========= Logout / reseteo =========
	async resetSession() {
		try {
			if (typeof Auth?.logout === "function") {
				await Auth.logout();
			}

			// Limpia el objeto de sesión unificado + legacy
			await Promise.all([
				storeValue("session", null),
				storeValue("userId", null),
				storeValue("role", null),
				storeValue("userEmail", null),
				storeValue("businessId", null),
				storeValue("businessName", null),
				storeValue("selectedBusinessId", null)
			]);

			showAlert("Sesión reiniciada. Vuelve a iniciar sesión.", "info");
			navigateTo("Login");
		} catch (e) {
			console.error("resetSession:", e);
			showAlert("No se pudo reiniciar la sesión.", "error");
		}
	},

	async hardReset() {
		try {
			await this.clearUiState();
			await this.clearTempData();
			await this.resetSession();
		} catch (e) {
			console.error("hardReset:", e);
			showAlert("No se pudo completar el reseteo.", "error");
		}
	}
};
