export default {
  // === Nombres de acciones (ajusta si tu query se llama distinto)
  qLogical: q_delete_customer,          // UPDATE "Customer".deletedAt = now()
  tableQuery: q_clientes_listado,       // refrescar tabla
  visitsQuery: q_visitas_historial,     // opcional: refrescar historial
  detailQuery: q_cliente_detalle,       // opcional: refrescar panel

  // Permisos
  canDelete() {
    return Roles?.canDeleteCustomers?.() === true;
  },

  // Validador UUID local (por si no tienes Utils.isUuid)
  _isUuid(s) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(s || ""));
  },

  // Confirm seguro (evita lint si no existe showConfirm)
  async _confirm(msg) {
    if (typeof showConfirm === "function") return await showConfirm(msg);
    const fn = typeof globalThis.confirm === "function" ? globalThis.confirm : null;
    return fn ? !!fn(msg) : true;
  },

  // Punto de entrada: puedes llamarla desde botón de la tabla o fuera
  // Si la llamas desde una columna, pásale explícitamente `currentRow`
  async run(row = null) {
    try {
      if (!this.canDelete()) {
        showAlert("No autorizado para eliminar clientes.", "warning");
        return;
      }

      // Fuente del row: param → selección en la tabla
      const r = row || Listado_clientes?.selectedRow || {};
      const id = r?.id;
      const name = r?.name || "(sin nombre)";

      if (!this._isUuid(id)) {
        showAlert("ID de cliente inválido.", "warning");
        return;
      }

      const ok = await this._confirm(`¿Marcar como eliminado a "${name}"?`);
      if (!ok) return;

      // 🔧 Solo borrado lógico
      const res = await this.qLogical.run({ id });
      const affected = Array.isArray(res) ? res.length : 0;

      if (!affected) {
        showAlert("No se modificó el cliente (¿ya estaba eliminado o no pertenece a este negocio?).", "warning");
        return;
      }

      // Si era el seleccionado, limpia selección/panel
      const selectedId = appsmith.store.selCustomerId || appsmith.store.editingCustomer?.id;
      if (selectedId === id) {
        await storeValue("selCustomerId", null);
        await storeValue("editingCustomer", null);
        await storeValue("visits", []);
      }

      // Refrescos
      if (typeof this.tableQuery?.run === "function") await this.tableQuery.run();
      // Opcional: si tienes panel/historial abiertos para ese cliente, puedes refrescarlos aquí.

      showAlert("Cliente marcado como eliminado.", "success");
    } catch (e) {
      console.error("DeleteCustomer.run error:", e);
      showAlert(e?.message || "No se pudo eliminar el cliente.", "error");
    }
  }
};
