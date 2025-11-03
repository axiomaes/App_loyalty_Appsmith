export default {
  // === Permisos ===
  canDelete() {
    return Roles?.canDeleteCustomers?.() === true;
  },

  // UUID simple
  _isUuid(s) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(s || ""));
  },

  async _confirm(msg) {
    if (typeof showConfirm === "function") return await showConfirm(msg);
    const fn = typeof globalThis.confirm === "function" ? globalThis.confirm : null;
    return fn ? !!fn(msg) : true;
  },

  // Punto de entrada (úsalo en la columna de la tabla):
  // {{ DeleteCustomer.run(currentRow) }}
  async run(row = null) {
    try {
      if (!this.canDelete()) {
        showAlert("No autorizado para eliminar clientes.", "warning");
        return;
      }

      const r = row || Listado_clientes?.selectedRow || {};
      const id = r?.id;
      const name = r?.name || "(sin nombre)";

      if (!this._isUuid(id)) {
        showAlert("ID de cliente inválido.", "warning");
        return;
      }

      const ok = await this._confirm(`¿Marcar como eliminado a "${name}"?`);
      if (!ok) return;

      // --- Asegúrate de que la query exista en esta página y se llame EXACTAMENTE así:
      if (typeof q_delete_customer?.run !== "function") {
        throw new Error("La acción q_delete_customer no está definida o no es una query ejecutable.");
      }

      // La query espera { customerId } (no { id })
      const res = await q_delete_customer.run({ customerId: id });

      // La query que compartiste devuelve { updated: bool, row, related_counts }
      const updated =
        Array.isArray(res) ? (res[0]?.updated ? 1 : 0) :
        (res?.updated ? 1 : 0);

      if (!updated) {
        showAlert("No se modificó el cliente (¿ya estaba eliminado?).", "warning");
        return;
      }

      // Limpiar selección si coincide
      const selectedId = appsmith.store.selCustomerId || appsmith.store.editingCustomer?.id;
      if (selectedId === id) {
        await storeValue("selCustomerId", null);
        await storeValue("editingCustomer", null);
        await storeValue("visits", []);
      }

      // Refresca tabla si existe
      try { typeof q_clientes_listado?.run === "function" && (await q_clientes_listado.run()); } catch {}

      showAlert(`Cliente "${name}" marcado como eliminado.`, "success");
    } catch (e) {
      console.error("DeleteCustomer.run error:", e);
      showAlert(e?.message || "No se pudo eliminar el cliente.", "error");
    }
  }
};
