export default {
  /**
   * Abre el detalle del cliente seleccionado desde una fila de la tabla.
   * Refresca también el historial y la tarjeta de visitas (Custom Widget).
   */
  async openDetail(row) {
    try {
      // 1️⃣ Obtener el ID del cliente desde la fila
      const id =
        row?.id ||
        row?.customerId ||
        row?.ID;

      if (!id) {
        showAlert("No se pudo determinar el ID del cliente.", "error");
        return;
      }

      // 2️⃣ Guardar en el store global
      await storeValue('selCustomerId', id);
      await storeValue('selectedCustomerId', id); // compatibilidad

      // 3️⃣ Ejecutar queries en paralelo
      const pageSize = Table_visitas?.pageSize || 50;
      const [det, hist] = await Promise.all([
        q_cliente_detalle.run({ id }),
        q_visitas_historial.run({
          customerId: id,
          limit: pageSize,
          offset: 0,
        }),
      ]);

      // 4️⃣ Guardar resultados en store
      await storeValue('clienteDetalle', Array.isArray(det) ? (det[0] || {}) : (det || {}));
      await storeValue('clienteHistorial', Array.isArray(hist) ? hist : []);

      // 5️⃣ Refrescar la tarjeta de visitas (Custom Widget)
      try {
        await Promise.all([
          getClientVisitsQuery?.run?.(),
          getFallbackVisitsCount?.run?.(),
        ]);
        const ui = await visitsLogic?.processData?.();
        if (ui) await storeValue('visitsUI', ui);
      } catch (e) {
        console.warn("⚠️ No se pudo refrescar la tarjeta de visitas:", e);
      }

      // 6️⃣ Mostrar modal
      await showModal(Modal_datos_clientes.name);

      console.log("✅ Cliente cargado:", id);

    } catch (err) {
      console.error("❌ Error en CustomerDetailHandler.openDetail:", err);
      showAlert("No se pudo abrir el detalle del cliente.", "error");
    }
  },
};
