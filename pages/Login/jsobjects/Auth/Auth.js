export default {
  // ===== Config =====
  ROLES: ["SUPERADMIN", "ADMIN", "OWNER", "STAFF", "BARBER"],
  DEFAULT_ROLE: "STAFF",

  // ===== Utils =====
  isUuid(s) {
    return typeof s === "string"
      && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
  },

  // ===== Sesión (store) =====
  role() {
    const r = (appsmith.store.role || this.DEFAULT_ROLE).toString().toUpperCase().trim();
    return this.ROLES.includes(r) ? r : this.DEFAULT_ROLE;
  },
  userId()    { return appsmith.store.userId    || null; },
  userEmail() { return appsmith.store.userEmail || null; },

  businessId() {
    const fromLogin  = appsmith.store.businessId || null;
    const fromPicker = appsmith.store.selectedBusinessId || null;
    const bid = this.isAdmin() ? (fromPicker || fromLogin) : fromLogin;
    return this.isUuid(bid) ? bid : null;   // solo UUID válido
  },

  businessName() { return appsmith.store.businessName || null; },

  setSelectedBusiness(bid) {
    return storeValue("selectedBusinessId", bid || null);
  },

  async setSession({ userId, role, email, businessId, businessName }) {
    await Promise.all([
      storeValue("userId", userId ?? null),
      storeValue("role", (role || this.DEFAULT_ROLE).toUpperCase()),
      storeValue("userEmail", email ?? null),
      storeValue("businessId", businessId ?? null),
      storeValue("businessName", businessName ?? null),
      storeValue("selectedBusinessId", null)
    ]);
  },

  async logout() {
    await Promise.all([
      storeValue("userId", null),
      storeValue("role", null),
      storeValue("userEmail", null),
      storeValue("businessId", null),
      storeValue("businessName", null),
      storeValue("selectedBusinessId", null),
    ]);
  },

  // ===== Comprobaciones de rol =====
  isOneOf(...roles) { return roles.map(r => String(r).toUpperCase()).includes(this.role()); },
  isSuper()  { return this.isOneOf("SUPERADMIN"); },
  isAdmin()  { return this.isOneOf("ADMIN", "SUPERADMIN"); },
  isOwner()  { return this.isOneOf("OWNER"); },
  isStaff()  { return this.isOneOf("STAFF"); },

  // Capacidades
  canSeeSensitive()     { return this.isOneOf("OWNER","ADMIN","SUPERADMIN"); },
  canManageBusinesses() { return this.isOneOf("ADMIN","SUPERADMIN"); },
  canManageUsers()      { return this.isOneOf("OWNER","ADMIN","SUPERADMIN"); },
  canEditCustomers()    { return this.isOneOf("OWNER","ADMIN","SUPERADMIN","STAFF"); },
  canDeleteCustomers()  { return this.isOneOf("OWNER","ADMIN","SUPERADMIN"); },
  canCreateVisits()     { return this.isOneOf("OWNER","STAFF","ADMIN","SUPERADMIN"); },

  require(...roles) {
    if (!this.isOneOf(...roles)) { showAlert("No tienes permiso para esta acción.", "error"); return false; }
    return true;
  },

  bidOrEmpty() { return this.businessId() || ""; }
};
