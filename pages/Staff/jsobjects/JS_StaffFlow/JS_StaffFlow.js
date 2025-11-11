export default {
  maskPhone(p){
    const s = (p || "").replace(/\s+/g, "");
    if (s.length < 3) return "—";
    return "••• •• •• " + s.slice(-3);
  },

  async onQr(code){
    // 1) Cliente por token
    const c = await q_get_customer_by_token.run({ token: code });
    if (!c || !c.id) {
      showAlert("QR no reconocido", "warning");
      return;
    }

    // 2) Registrar visita
    await q_add_visit.run({ customerId: c.id });

    // 3) Refrescar listado de hoy
    if (typeof q_visitas_hoy?.run === "function") await q_visitas_hoy.run();

    // 4) Cargar progreso de tarjeta
    const p = await q_progress.run({ customerId: c.id }); // devuelve { visits, isVip, firstHalfIssued, totalSlots, slots[], planName, tag }
    // 5) Actualizar widget tarjeta
    await CustomCard.setModel({
      planName: p.planName,
      tag: p.tag,
      isVip: p.isVip,
      currentVisits: p.visits,
      totalSlots: p.isVip ? 4 : 10,
      firstHalfIssued: p.firstHalfIssued,
      slots: p.slots  // [{value:1..N, filled:true/false}]
    });

    // 6) Mostrar cabecera cliente
    TxtCliente.text = `${c.name} • ${this.maskPhone(c.phone)}`;

    showAlert("Visita registrada", "success");
  }
}
