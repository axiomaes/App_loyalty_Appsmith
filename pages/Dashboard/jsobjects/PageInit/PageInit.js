export default {
  async run() {
    try {
      // 1) Idioma (opcional)
      if (typeof Lang?.init === "function") {
        await Lang.init();
      }

      // 2) Sesión
      const hasSession = Auth.isLoggedIn?.() && Auth.hasBusiness?.();
      if (!hasSession) {
        showAlert("Sesión inválida o negocio no asignado. Vuelve a iniciar sesión.", "error");
        await Auth.logout?.();
        navigateTo("Login");
        return;
      }

      // 3) Filtros por defecto (opcional)
      if (!appsmith.store.filters_from || !appsmith.store.filters_to) {
        await Filters.resetLastNDays?.(5);
      }

      // 4) Normalizar selectedCustomerId
      //    a) si llega por URL ?cid=...
      const urlCid = appsmith.URL.queryParams?.cid;
      if (urlCid && urlCid !== appsmith.store.selectedCustomerId) {
        await storeValue("selectedCustomerId", urlCid);
      }
      //    b) si existe la clave vieja en store, alias -> selectedCustomerId
      if (!appsmith.store.selectedCustomerId && appsmith.store.selCustomerId) {
        await storeValue("selectedCustomerId", appsmith.store.selCustomerId);
      }

      // 5) Validación final
      if (!appsmith.store.selectedCustomerId) {
        showAlert("Selecciona un cliente para ver sus visitas y premios.", "warning");
        return;
      }

      // 6) Ejecutar queries (usan selectedCustomerId)
      await getClientVisitsQuery.run();   // bono activo + progreso
      await getFallbackVisitsCount.run(); // respaldo si no hay bono

      // 7) Construir UI y guardar para los widgets
      const ui = await visitsLogic.processData();
      await storeValue("visitsUI", ui);

      console.log("PageInit OK → visitsUI", ui);
    } catch (e) {
      console.error("PageInit.run() error:", e);
      showAlert("Error inicializando la página.", "error");
    }
  }
};
