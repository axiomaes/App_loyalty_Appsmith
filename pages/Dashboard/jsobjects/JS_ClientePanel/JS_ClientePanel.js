export default {
  _lastId: null,
  _busy: false,

  _isUuid(s) {
    return typeof s === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
  },

  _page() {
    const size = Number(Table_visitas.pageSize) || 50;
    const page = Number(Table_visitas.pageNo) || 1;
    const offset = (page - 1) * size;
    return { size, page, offset };
  },

  async cargar(row) {
    const id = row?.id;
    if (!this._isUuid(id)) return;

    // evita doble disparo
    if (this._busy) return;
    this._busy = true;

    try {
      // evita recargar si ya es el mismo
      if (this._lastId === id && appsmith.store.selCustomerId === id) return;

      await storeValue("loading_panel_id", id);
      await storeValue("selCustomerId", id);
      this._lastId = id;

      // 1) detalle
      const [det] = await Promise.allSettled([
        q_cliente_detalle.run({ id })
      ]);

      const cliente = q_cliente_detalle.data?.[0];
      if (cliente) {
        await storeValue("editingCustomer", cliente);
      }

      // 2) historial (paginado)
      const { size, offset } = this._page();
      await q_visitas_historial.run({ customerId: id, limit: size, offset });

    } catch (e) {
      console.error("JS_ClientePanel.cargar error:", e);
      showAlert("No se pudo cargar el panel del cliente.", "error");
    } finally {
      await storeValue("loading_panel_id", null);
      this._busy = false;
    }
  },

  // recarga solo el historial (útil tras crear/eliminar una visita)
  async recargarHistorial() {
    const id = appsmith.store.selCustomerId;
    if (!this._isUuid(id)) return;
    const { size, offset } = this._page();
    try {
      await q_visitas_historial.run({ customerId: id, limit: size, offset });
    } catch (e) {
      console.error("recargarHistorial error:", e);
    }
  }
};
