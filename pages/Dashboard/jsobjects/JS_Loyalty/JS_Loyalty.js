export default {
  // --- DETECCIÓN Y CONFIGURACIÓN --------------------------------------------
  isVIP(tag) {
    const t = String(tag || "").toUpperCase();
    return t.startsWith("BONO_VIP_") || t === "VIP";
  },

  slots(tag) {
    // VIP: 4 sellos | normal: 10 visitas
    return this.isVIP(tag) ? 4 : 10;
  },

  // --- LECTURA DE DATOS -----------------------------------------------------
  totalFromStore() {
    return Number(appsmith.store?.editingCustomer?.visitsCount ?? 0);
  },

  tagFromStore() {
    return String(appsmith.store?.editingCustomer?.tag || "");
  },

  totalFromRow(row) {
    return Number(row?.visitsCount ?? 0);
  },

  tagFromRow(row) {
    return String(row?.tag || "");
  },

  // --- CÁLCULO DE ESTADO DEL CICLO -----------------------------------------
  activeCount(total, tag) {
    const s = this.slots(tag);
    return total % s;
  },

  punchModel() {
    const total = this.totalFromStore();
    const tag = this.tagFromStore();
    const s = this.slots(tag);
    const act = this.activeCount(total, tag);
    return Array.from({ length: s }, (_, i) => ({
      n: i + 1,
      filled: i < act
    }));
  },

  punchModelForRow(row) {
    const total = this.totalFromRow(row);
    const tag = this.tagFromRow(row);
    const s = this.slots(tag);
    const act = this.activeCount(total, tag);
    return Array.from({ length: s }, (_, i) => ({
      n: i + 1,
      filled: i < act
    }));
  },

  remainingTo50() {
    const tag = this.tagFromStore();
    if (this.isVIP(tag)) return "";
    const act = this.activeCount(this.totalFromStore(), tag);
    const r = Math.max(5 - act, 0);
    return `${r} para 50%`;
  },

  remainingToFree() {
    const tag = this.tagFromStore();
    if (this.isVIP(tag)) return "";
    const act = this.activeCount(this.totalFromStore(), tag);
    const r = Math.max(10 - act, 0);
    return `${r} para gratis`;
  },

  // --- ACCIONES -------------------------------------------------------------
  async addVisit() {
    const cid = appsmith.store?.editingCustomer?.id;
    const bid = Auth.businessId?.() || "";

    if (!cid || !bid) {
      showAlert("Falta cliente o negocio.", "warning");
      return;
    }

    try {
      await q_visita_add.run({ customerId: cid, businessId: bid });

      // refrescar detalle y visitas
      await q_cliente_detalle.run({ id: cid });
      await storeValue("editingCustomer", q_cliente_detalle.data?.[0]);

      await q_visitas_historial.run({
        customerId: cid,
        limit: Table_visitas.pageSize || 100,
        offset: 0
      });

      const total = this.totalFromStore();
      const tag = this.tagFromStore();
      const s = this.slots(tag);
      const act = this.activeCount(total, tag);

      if (!this.isVIP(tag)) {
        if (act === 0) {
          showAlert("🎉 ¡Has llegado a 10! Servicio gratis (ciclo reiniciado).", "success");
        } else if (act === 5) {
          showAlert("⭐ ¡Has llegado a 5! Aplica 50% en esta o próxima visita.", "info");
        } else {
          showAlert("Visita añadida.", "success");
        }
      } else {
        showAlert("Visita añadida (VIP).", "success");
      }

    } catch (e) {
      console.error("addVisit error:", e);
      showAlert(e?.message || "No se pudo añadir la visita.", "error");
    }
  },

  async manualReset() {
    const cid = appsmith.store?.editingCustomer?.id;
    const bid = Auth.businessId?.() || "";
    if (!cid || !bid) { showAlert("Falta cliente o negocio.", "warning"); return; }

    const role = Auth.role?.() || "";
    const can = ["ADMIN", "SUPERADMIN", "OWNER"].includes(role);
    if (!can) { showAlert("Sin permisos para resetear.", "warning"); return; }

    try {
      const total = this.totalFromStore();
      const tag = this.tagFromStore();
      const act = this.activeCount(total, tag);
      if (act === 0) { showAlert("Nada que resetear.", "info"); return; }

      await q_visitas_delete_last_n.run({ customerId: cid, businessId: bid, n: act });

      await q_cliente_detalle.run({ id: cid });
      await storeValue("editingCustomer", q_cliente_detalle.data?.[0]);
      await q_visitas_historial.run({
        customerId: cid,
        limit: Table_visitas.pageSize || 100,
        offset: 0
      });

      showAlert("Ciclo reseteado. Historial anterior intacto.", "success");
    } catch (e) {
      console.error("manualReset error:", e);
      showAlert(e?.message || "No se pudo resetear.", "error");
    }
  }
};
