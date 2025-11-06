export default {
  async run() {
    try {
      if (!(Auth?.isLoggedIn?.() && Auth?.hasBusiness?.())) {
        showAlert("Sesión inválida. Vuelve a iniciar sesión.", "error");
        await Auth?.logout?.();
        navigateTo("Login");
        return;
      }

      // 1) Garantiza businessId en store ANTES de que el listado pinte
      let bid =
        (typeof Auth?.businessId === "function" && Auth.businessId()) ||
        appsmith.store?.businessId ||
        null;

      if (!bid) {
        const wait = (ms)=>new Promise(r=>setTimeout(r,ms));
        const t0 = Date.now();
        while (!bid && Date.now()-t0 < 3000) {
          bid =
            (typeof Auth?.businessId === "function" && Auth.businessId()) ||
            appsmith.store?.businessId || null;
          if (bid) break;
          await wait(120);
        }
      }
      await storeValue("businessId", bid);

      // 2) Refresca listado + KPIs (si los tienes)
      if (typeof q_clientes_listado?.run === "function") {
        await q_clientes_listado.run({ bid });
      }
      if (typeof q_kpi_total_clientes?.run === "function") {
        await q_kpi_total_clientes.run({ bid });
      }

      // 3) No tocamos nada más (detalle/historial siguen como estaban)
    } catch (e) {
      console.error("OnLoad.run error:", e);
      showAlert("Error cargando la página.", "error");
    }
  }
};
