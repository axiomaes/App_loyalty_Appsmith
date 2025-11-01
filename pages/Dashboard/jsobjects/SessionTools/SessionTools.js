export default {
  // 🔹 Limpia solo estado volátil de la UI (no toca sesión)
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

  // 🔹 Limpia datos temporales/auxiliares (contraseñas, filtros, etc.)
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

  // 🔹 Cierra sesión usando Auth.logout() (limpia todos los campos de sesión)
  async resetSession() {
    try {
      if (typeof Auth?.logout === "function") {
        await Auth.logout();
      } else {
        // Fallback por si Auth.logout no está disponible
        await Promise.all([
          storeValue("userId", null),
          storeValue("role", null),
          storeValue("userEmail", null),
          storeValue("businessId", null),
          storeValue("businessName", null),
          storeValue("selectedBusinessId", null)
        ]);
      }
      showAlert("Sesión reiniciada. Vuelve a iniciar sesión.", "info");
      navigateTo("Login");
    } catch (e) {
      console.error("resetSession:", e);
      showAlert("No se pudo reiniciar la sesión.", "error");
    }
  },

  // 🔹 Reseteo duro: UI + temp + sesión (todo)
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
