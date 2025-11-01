export default {
  // ----- Config -----
  ROLES: ["SUPERADMIN", "ADMIN", "OWNER", "STAFF", "BARBER"],
  DEFAULT: "STAFF",

  // ----- Rol actual -----
  get() {
    const raw =
      (typeof Auth?.role === "function" && Auth.role()) ||
      appsmith.store?.role ||
      this.DEFAULT;

    const r = String(raw || "").toUpperCase().trim();
    return this.ROLES.includes(r) ? r : this.DEFAULT;
  },

  // ----- Comparadores básicos -----
  isOneOf(...roles) {
    return roles.map(r => String(r).toUpperCase()).includes(this.get());
  },
  isSuper()  { return this.isOneOf("SUPERADMIN"); },
  isAdmin()  { return this.isOneOf("ADMIN", "SUPERADMIN"); },
  isOwner()  { return this.isOneOf("OWNER"); },
  isStaff()  { return this.isOneOf("STAFF"); },
  isBarber() { return this.isOneOf("BARBER"); },

  // ----- Capacidades generales -----
  canSeeSensitive()     { return this.isOneOf("OWNER", "ADMIN", "SUPERADMIN"); },
  canManageBusinesses() { return this.isOneOf("ADMIN", "SUPERADMIN"); },
  canManageUsers()      { return this.isOneOf("OWNER", "ADMIN", "SUPERADMIN"); },
  canEditCustomers()    { return this.isOneOf("OWNER", "ADMIN", "SUPERADMIN"); },
  canDeleteCustomers()  { return this.isOneOf("OWNER", "ADMIN", "SUPERADMIN"); },
  canCreateVisits()     { return this.isOneOf("OWNER", "ADMIN", "SUPERADMIN", "STAFF", "BARBER"); },
  canRefund()           { return this.isOneOf("OWNER", "ADMIN", "SUPERADMIN"); },

  // ----- Helpers específicos para VISITAS -----
  isAdminLike()     { return this.isOwner() || this.isAdmin() || this.isSuper(); },
  canDeleteVisits() { return this.isAdminLike(); },
  canForceVisit()   { return this.isAdminLike(); },

  // ----- Extras útiles -----
  // muestra el rol en un formato amigable
  label(role = this.get()) {
    const labels = {
      SUPERADMIN: "Super Admin",
      ADMIN: "Administrador",
      OWNER: "Propietario",
      STAFF: "Empleado",
      BARBER: "Barbero"
    };
    return labels[role] || role;
  },

  // muestra un color según jerarquía (útil para badges)
  color(role = this.get()) {
    const map = {
      SUPERADMIN: "purple",
      ADMIN: "red",
      OWNER: "blue",
      STAFF: "green",
      BARBER: "teal"
    };
    return map[role] || "gray";
  },

  // comprobación rápida de permisos: Roles.check("canEditCustomers")
  check(fnName) {
    return typeof this[fnName] === "function" ? this[fnName]() : false;
  }
};
