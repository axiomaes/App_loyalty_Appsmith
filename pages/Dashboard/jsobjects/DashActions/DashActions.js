export default {
  _lastId: null,

  _isUuid(s) {
    return typeof s === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
  },

  async selectCustomer(row) {
    const id = row?.id || Listado_clientes.selectedRow?.id;
    if (!this._isUuid(id)) return;

    // Evita recargar si es el mismo cliente
    if (this._lastId === id && appsmith.store.selCustomerId === id) return;

    await storeValue("selCustomerId", id);
    this._lastId = id;

    // Carga detalle + historial (50 últimas visitas)
    await Promise.allSettled([
      q_cliente_detalle.run({ id }),
      q_visitas_historial.run({ customerId: id, limit: 50, offset: 0 })
    ]);
  },

  // Selecciona la primera fila tras cargar la tabla si no hay selección previa
  async selectFirstIfEmpty() {
    const rows = Array.isArray(Listado_clientes.tableData) ? Listado_clientes.tableData : [];
    if (!appsmith.store.selCustomerId && rows.length > 0) {
      await this.selectCustomer(rows[0]);
    }
  }
};
