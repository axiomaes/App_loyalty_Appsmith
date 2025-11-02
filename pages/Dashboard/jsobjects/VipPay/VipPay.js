export default {
  // ---------- utilidades ----------
  _isUuid(id){ return typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id); },
  currentPeriod(){ return moment().format('YYYY-MM'); },

  // +E164 con fallback ES (+34) si vienen 9 dígitos que empiezan por 6/7/8/9
  formatPhone(raw){
    const d = String(raw || '').replace(/\D+/g,'');
    if (!d) return '';
    if (/^[6789]\d{8}$/.test(d)) return `+34${d}`;
    if (d.startsWith('00')) return `+${d.slice(2)}`;
    return d.startsWith('+') ? d : `+${d}`;
  },

  // cliente actual desde store (detalle/selección)
  currentCustomer(){
    return appsmith.store.editingCustomer
        || appsmith.store.clienteDetalle
        || {};
  },

  // lista de planes para Select (ajusta a tu fuente real)
  plans(){
    // si ya tienes un helper: JS_BondPayHelper.vipPlans()
    const list = (JS_BondPayHelper?.vipPlans?.() || []);
    return list.map(p => ({
      label: `${p.name} · € ${JS_BondPayHelper?._toIntEuros?.(p.price_eur)}`,
      value: String(p.id)
    }));
  },

  // plan por defecto: si el cliente ya tiene uno, devuélvelo; si no, null
  defaultPlan(){
    const c = this.currentCustomer();
    // si guardas plan en detalle, intenta leerlo (ajusta la clave)
    const vipPlanId = c.vipPlanId || c.planId || null;
    return vipPlanId ? String(vipPlanId) : null;
  },

  // ---------- abrir modal VIP ----------
  async open(fromRow){
    try{
      const id = fromRow?.id || appsmith.store.selCustomerId;
      if (!this._isUuid(id)) {
        showAlert("No se pudo determinar el cliente.", "warning");
        return;
      }

      // Refresca detalle si hace falta
      const detRes = await q_cliente_detalle.run({ id });
      const det = Array.isArray(detRes) ? (detRes[0] || {}) : (detRes || {});
      await storeValue('editingCustomer', det);
      await storeValue('vipPay', {
        period: this.currentPeriod(),
        method: 'CASH', // o el valor que uses para "Efectivo"
        notes: ''
      });

      await showModal(Modal_pago_vip.name);
    }catch(e){
      console.error('VipPay.open error:', e);
      showAlert("No se pudo abrir Pago VIP.", "error");
    }
  }
};
