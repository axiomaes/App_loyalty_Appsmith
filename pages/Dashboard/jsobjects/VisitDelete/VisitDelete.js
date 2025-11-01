export default {
  async run(visitId) {
    // 🛡️ Permisos
    if (!Roles.canDeleteVisits()) {
      showAlert("No tienes permisos para eliminar visitas.", "warning");
      return;
    }

    // 🆔 Validación del ID
    if (!Utils.isUuid?.(visitId)) {
      showAlert("ID de visita inválido o ausente.", "warning");
      return;
    }

    // 🧠 Confirma antes (opcional)
    //const ok = await showConfirm("¿Eliminar esta visita definitivamente?");
    //if (!ok) return;

    // 💾 Estado actual (para rollback si falla)
    const prev = appsmith.store.visits || [];

    // 💡 UI optimista: elimina visualmente la fila
    await storeValue(
      "visits",
      prev.filter(r => r?.id !== visitId)
    );

    try {
      // 🔄 Query real
      await q_delete_visit.run({ visitId });

      // 🔁 Refresca datos actualizados
      const customerId =
        appsmith.store.selCustomerId || appsmith.store.editingCustomer?.id;

      if (Utils.isUuid(customerId)) {
        await q_visitas_historial.run({ customerId, limit: 500, offset: 0 });
        await storeValue("visits", q_visitas_historial.data || []);
      }

      showAlert("Visita eliminada correctamente.", "success");
    } catch (e) {
      // 🔙 Rollback en error
      await storeValue("visits", prev);
      console.error("VisitDelete error:", e);
      showAlert(e?.message || "No se pudo eliminar la visita.", "error");
    }
  }
};
