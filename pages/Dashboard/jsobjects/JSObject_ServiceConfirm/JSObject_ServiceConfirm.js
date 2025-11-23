export default {
  open(service) {
    storeValue("pendingService", service);
    showModal("Modal_ConfirmService");
  },

  async confirm() {
    try {
      const customerId = appsmith.store.selCustomerId;
      const s = appsmith.store.pendingService;

      if (!customerId || !s) {
        showAlert("No hay cliente o servicio seleccionado", "error");
        return;
      }

      const res = await q_visit_with_progress.run({
        customerId,
        serviceId: s.id,
        serviceName: s.name,
        priceCents: s.priceCents,
      });

      closeModal("Modal_ConfirmService");
      showAlert("Visita registrada correctamente.", "success");

      // Limpieza
      storeValue("pendingService", null);

      // Refrescar datos del cliente
      await Promise.all([
        q_cliente_detalle.run({ id: customerId }),
        q_visitas_historial.run({ customerId, limit: 500, offset: 0 })
      ]);

    } catch (e) {
      console.error("Error confirmando servicio:", e);
      showAlert("Hubo un error registrando la visita", "error");
    }
  }
};
