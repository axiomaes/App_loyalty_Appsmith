export default {
  // ===== Helpers de widgets / confirm =======================================
  _w(name) { return globalThis[name]; },                  // acceso seguro a widgets
  _confirm(msg = "¿Confirmas?") {
    const fn = typeof globalThis.confirm === "function" ? globalThis.confirm : null;
    return Promise.resolve(fn ? !!fn(msg) : true);
  },

  // ===================== 🔧 UTILIDADES ======================================
  lastVisitAt() {
    const rows = q_visitas_historial?.data || [];
    const iso = rows?.[0]?.fecha;  // tu query expone "fecha"
    return iso ? new Date(iso) : null;
  },

  canAddNow() {
    if (Auth.isAdmin()) return true; // usa Auth centralizado
    const last = this.lastVisitAt();
    if (!last) return true;
    const hours = (Date.now() - last.getTime()) / 3600000;
    return hours >= 48;
  },

  openModal() {
    resetWidget?.('SelReason', true);
    resetWidget?.('TxtNotes', true);
    resetWidget?.('NumCount', true);
    resetWidget?.('ChkForce', true);
    showModal(Modal_add_visit.name);
  },

  baseNotes() {
    const sel = this._w('SelReason');
    const txt = this._w('TxtNotes');

    const label =
      (sel && typeof sel.selectedOptionLabel === "string" && sel.selectedOptionLabel)
        ? sel.selectedOptionLabel
        : "Visita manual";

    const extra = (txt?.text || "").trim();
    return extra ? `${label} · ${extra}` : label;
  },

  // ===================== ⚙️ INSERCIÓN BASE ==================================
  async _runInsert({ customerId, notes, count = 1, force = false }) {
    if (!customerId) {
      showAlert("Selecciona un cliente.", "warning");
      return;
    }

    await q_visit_code_qr.run({
      customerId,
      notes,
      isAdminLike: Auth.isAdmin(),
      force: !!force,
      count: Number(count)
    });

    await Promise.all([
      q_cliente_detalle.run({ id: customerId }),
      q_visitas_historial.run({ customerId, limit: 500, offset: 0 })
    ]);
  },

  // ===================== 🧾 MANUAL ==========================================
  async createManual() {
    const customerId = appsmith.store.selCustomerId || appsmith.store.editingCustomer?.id;
    if (!customerId) return showAlert("Selecciona un cliente.", "warning");

    if (!Auth.isAdmin() && !this.canAddNow()) {
      showAlert("Solo puedes registrar una visita cada 48 horas.", "warning");
      return;
    }

    const notes = this.baseNotes();
    const num = this._w('NumCount');
    const chk = this._w('ChkForce');

    const count = Auth.isAdmin() ? Number(num?.value || 1) : 1;
    const force = Auth.isAdmin() && !!(chk?.isChecked);

    try {
      await this._runInsert({ customerId, notes, count, force });
      closeModal(Modal_add_visit.name);
      showAlert("Visita registrada.", "success");
    } catch (e) {
      showAlert(e?.message || "No se pudo registrar.", "error");
    }
  },

  // ===================== 📱 DESDE QR ========================================
  parseCustomerIdFromQr(text) {
    const s = String(text || "").trim();
    if (!s) return null;

    // AXIOMA:VISIT:CID=<uuid>
    let m = s.match(/AXIOMA:VISIT:CID=([0-9a-f-]{36})/i);
    if (m) return m[1];

    // /customers/<uuid>
    m = s.match(/\/customers\/([0-9a-f-]{36})(?:[\/?]|$)/i);
    if (m) return m[1];

    // /public/customers/<uuid>
    m = s.match(/\/public\/customers\/([0-9a-f-]{36})(?:[\/?]|$)/i);
    if (m) return m[1];

    return null;
  },

  async createFromQr(scannedText) {
    const cid = this.parseCustomerIdFromQr(scannedText);
    if (!cid) return showAlert("QR inválido.", "warning");

    const selectedId = appsmith.store.selCustomerId || appsmith.store.editingCustomer?.id;
    if (selectedId && selectedId !== cid) {
      const ok = await this._confirm("El QR pertenece a otro cliente. ¿Registrar igualmente?");
      if (!ok) return;
    }

    if (!Auth.isAdmin() && !this.canAddNow()) {
      showAlert("Solo puedes registrar una visita cada 48 horas.", "warning");
      return;
    }

    try {
      await this._runInsert({
        customerId: cid,
        notes: "Visita por QR",
        count: 1,
        force: false
      });
      closeModal(Modal_add_visit.name);
      showAlert("Visita registrada por QR.", "success");
    } catch (e) {
      showAlert(e?.message || "No se pudo registrar desde QR.", "error");
    }
  }
};
