export default {
  // ===== Cache interno (opcional) =====
  _cacheKey(customerId) { return `vipStatus:${customerId}`; },

  // ===== Carga / cacheo de estado =====
  async loadStatus(customerId, { force = false } = {}) {
    if (!Utils.isUuid(customerId)) return null;

    // 1) intenta caché en store
    if (!force) {
      const k = this._cacheKey(customerId);
      const cached = appsmith.store?.[k];
      if (cached && cached.customerId === customerId) return cached;
    }

    // 2) consulta al backend
    const res = await q_vip_status.run({ customerId });
    const row = Array.isArray(res) ? res[0] : res || null;

    // 3) guarda en store (por clave por-customer)
    await storeValue(this._cacheKey(customerId), row);
    // para compatibilidad, también en 'vipStatus' plano si quieres
    await storeValue('vipStatus', row);

    return row;
  },

  // ===== Helpers de estado VIP =====
  isVipTag(tag) {
    const t = String(tag || "");
    return /^BONO_VIP_/i.test(t);
  },

  isAdminLike() {
    return Roles.isOwner() || Roles.isAdmin() || Roles.isSuper();
  },

  // ===== Regla de acceso a visita (bloquea STAFF/BARBER si impago o sin cupo) =====
  /**
   * @param {string} customerId
   * @param {object} opts { blockWhenExhausted: boolean = true }
   * @returns {boolean} true si puede registrar visita
   */
  async mustBeActiveBeforeVisit(customerId, opts = {}) {
    const { blockWhenExhausted = true } = opts;

    const tag = appsmith.store?.editingCustomer?.tag;
    if (!this.isVipTag(tag)) return true;        // no aplica
    if (this.isAdminLike()) return true;         // admin-like puede

    const st = await this.loadStatus(customerId);
    if (!st?.active) {
      showAlert("Bono VIP inactivo: registra el pago del mes para activar.", "warning");
      return false;
    }

    // remaining: atenciones restantes del mes (según tu q_vip_status)
    if (Number(st.remaining || 0) <= 0) {
      showAlert("Bono VIP: ya usó las 4 atenciones del mes.", "info");
      return !blockWhenExhausted;  // si se permite laxo, devuelve true
    }

    return true;
  },

  // ===== Pago de bono (auto-periodo + importe desde plan) =====
  /**
   * Paga el mes para el cliente:
   * - Si no pasas period o amountCents, usa JS_BondPayHelper para calcularlos a partir del plan.
   * - Refresca estado VIP y notifica.
   *
   * @param {object} args { customerId, planId?, period?, amountCents?, method?, notes? }
   */
  async pay(args) {
    const { customerId } = args || {};
    if (!Utils.isUuid(customerId)) throw new Error("customerId inválido");

    // Si no pasan period o amountCents, arma payload completo con helper (requiere q_bondplans_list cargado)
    let payload;
    if (!args?.period || !args?.amountCents) {
      const planId = args?.planId || SelectVIPPlan?.selectedOptionValue;
      if (!Utils.isUuid(planId)) throw new Error("planId inválido o no seleccionado.");

      payload = await JS_BondPayHelper.buildPayload({
        customerId,
        planId,
        method: args?.method || null,
        notes:  args?.notes  || null,
        period: args?.period || null
      });
    } else {
      // Ya viene todo dado
      payload = {
        customerId,
        period: args.period,
        amountCents: Number(args.amountCents || 0),
        method: args?.method || null,
        notes:  args?.notes  || null
      };
    }

    const res = await q_vip_pay.run(payload);

    // Refresca estado VIP + opcionalmente ficha/visitas
    await this.loadStatus(customerId, { force: true });
    try {
      await q_cliente_detalle?.run({ id: customerId });
      if (typeof q_visitas_historial?.run === "function") {
        await q_visitas_historial.run({ customerId, limit: Table_visitas.pageSize || 50, offset: 0 });
      }
    } catch { /* best-effort */ }

    // Mensajería según flags de q_vip_pay
    const r = res?.[0] || {};
    if (r.not_vip) {
      showAlert("El cliente no tiene tag VIP. Actualiza el tag antes de registrar el pago.", "warning");
    } else if (!r.has_bond) {
      showAlert("Este cliente no tiene bono asociado. Asigna un bono (plan) primero.", "warning");
    } else if (r.updated) {
      showAlert("Pago actualizado para ese periodo.", "success");
    } else if (r.inserted) {
      showAlert("Pago registrado.", "success");
    } else {
      showAlert("No se registró ningún cambio.", "info");
    }

    return r;
  },

  // ===== Atajo: pagar con periodo sugerido del helper =====
  async paySuggested({ customerId, planId, method = null, notes = null } = {}) {
    return this.pay({ customerId, planId, method, notes, period: null, amountCents: null });
  }
};
