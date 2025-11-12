export default {
  maskPhone(p) {
    const s = (p || "").replace(/\s+/g, "");
    if (s.length < 3) return "—";
    return "••• •• •• " + s.slice(-3);
  },

  // Construye modelo simple para tu Custom Card
  _buildCardModel(c) {
    // Campos defensivos: intenta varias llaves comunes
    const tag         = (c.tag || c.customer_tag || "").trim();
    const planName    = c.plan_name || c.planName || "";
    const visits      = Number(c.total_visitas ?? c.visits_count ?? c.visits ?? 0);
    const isVip       = /vip/i.test(tag) || /vip/i.test(planName) || !!c.is_vip;

    const totalSlots  = isVip ? 4 : 10;

    // Slots: llena tantos como 'visits' dentro del rango total
    const slots = Array.from({ length: totalSlots }, (_, i) => ({
      value: i + 1,
      filled: i + 1 <= visits,
    }));

    return {
      planName,
      tag,
      isVip,
      currentVisits: visits,
      totalSlots,
      slots,
      // Si ya tienes un flag en BD para "primer 50% ya emitido", pásalo aquí:
      firstHalfIssued: !!c.first_half_issued
    };
  },

  async afterScan(customerId) {
    try {
      // 1) Refrescar la tabla de hoy (si existe)
      if (typeof q_visitas_hoy?.run === "function") {
        await q_visitas_hoy.run();
      }

      if (!customerId) return;

      // 2) Traer datos del cliente para pintar cabecera y la tarjeta
      //    Usamos tu consulta existente q_cliente_detalle
      let c = null;
      if (typeof q_cliente_detalle?.run === "function") {
        const r = await q_cliente_detalle.run({ id: customerId });
        c = Array.isArray(r) ? r[0] : r;
      }

      // 3) Cabecera (usa un Text con: {{ appsmith.store.staffHeader || '' }})
      if (c) {
        const header = `${c.name || c.full_name || 'Cliente'} • ${this.maskPhone(c.phone || c.mobile)}`;
        await storeValue("staffHeader", header);
      } else {
        await storeValue("staffHeader", "");
      }

      // 4) Tarjeta: si tu Custom Widget se llama p.ej. CustomCard
      if (typeof CustomCard?.setModel === "function") {
        const model = this._buildCardModel(c || {});
        await CustomCard.setModel(model);
      }

    } catch (e) {
      console.error("JS_StaffUI.afterScan error:", e);
      showAlert("No se pudo refrescar la información del cliente.", "warning");
    }
  }
};
