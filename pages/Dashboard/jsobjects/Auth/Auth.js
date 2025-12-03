export default {
	// 🎭 Roles permitidos
	ROLES: ["SUPERADMIN", "ADMIN", "OWNER", "STAFF", "BARBER"],
	DEFAULT_ROLE: "BARBER",

	// 🔍 Valida formato UUID (v4 o v5)
	isUuid(s) {
		return typeof s === "string" &&
			/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
	},

	// 🧑‍💼 Rol actual del usuario
	role() {
		const raw = (appsmith.store.role || this.DEFAULT_ROLE).toString().trim().toUpperCase();
		return this.ROLES.includes(raw) ? raw : this.DEFAULT_ROLE;
	},

	// 🏢 Business ID actual (prioriza el seleccionado si es admin)
	businessId() {
		const fromLogin  = appsmith.store.businessId ?? null;
		const fromPicker = appsmith.store.selectedBusinessId ?? null;
		const bid = this.isAdmin() ? (fromPicker || fromLogin) : fromLogin;
		return this.isUuid(bid) ? bid : null;
	},

	// 🏢 Nombre del negocio activo
	businessName() {
		return appsmith.store.businessName ?? null;
	},

	// 👤 ID y datos del usuario actual
	userId() {
		const id = appsmith.store.userId ?? null;
		return this.isUuid(id) ? id : null;
	},

	userEmail() {
		return appsmith.store.userEmail ?? null;
	},

	// 🔐 NUEVO: getter de JWT desde el store
	jwt() {
		return appsmith.store.jwt || "";
	},

	// ✅ Estado de sesión
	isLoggedIn() {
		return Boolean(this.userId());
	},

	hasBusiness() {
		return Boolean(this.businessId());
	},

	// 🧠 Guardar negocio seleccionado (solo admins)
	setSelectedBusiness(bid) {
		return storeValue("selectedBusinessId", this.isUuid(bid) ? bid : null);
	},

	// 🔐 Guardar sesión completa
	async setSession({ userId, role, email, businessId, businessName }) {
		const safeRole = (role || this.DEFAULT_ROLE).toString().toUpperCase();
		await Promise.all([
			storeValue("userId", this.isUuid(userId) ? userId : null),
			storeValue("role", this.ROLES.includes(safeRole) ? safeRole : this.DEFAULT_ROLE),
			storeValue("userEmail", email ?? null),
			storeValue("businessId", this.isUuid(businessId) ? businessId : null),
			storeValue("businessName", businessName ?? null),
			storeValue("selectedBusinessId", null)
			// ⚠️ aquí NO tocamos jwt: se guarda donde ya lo tengas (login)
		]);
	},

	// 🚪 Cerrar sesión y limpiar store
	async logout() {
		const keys = [
			"userId",
			"role",
			"userEmail",
			"businessId",
			"businessName",
			"selectedBusinessId",
			"jwt"    // 👈 NUEVO: limpiar token también
		];
		await Promise.all(keys.map(k => storeValue(k, null)));
	},

	// 🧮 Validación de roles
	isOneOf(...roles) {
		const r = this.role();
		return roles.map(x => x.toString().toUpperCase()).includes(r);
	},

	// 🛡️ Helpers de permisos
	isAdmin() {
		return this.isOneOf("ADMIN", "SUPERADMIN");
	},

	canCreateVisits() {
		return this.isOneOf("OWNER", "STAFF", "ADMIN", "SUPERADMIN");
	},

	canEditCustomer() {
		return this.isOneOf("OWNER", "ADMIN", "SUPERADMIN");
	},

	// 🔄 Retorna UUID del negocio o cadena vacía
	bidOrEmpty() {
		return this.businessId() ?? "";
	}
};
