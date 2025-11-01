export default {
  // Normaliza a número seguro (entero) y evita NaN
  _toInt(v) {
    const n = Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : 0;
  },

  // Normaliza a euros (cents → €) con 2 decimales
  _toEur(cents) {
    const n = Number(cents);
    const eur = Number.isFinite(n) ? n / 100 : 0;
    // devuelve número, no string (para charts es mejor número)
    return Math.round(eur * 100) / 100;
  },

  dataset() {
    const k = (q_admin_visits_by_day.data && q_admin_visits_by_day.data[0]) || {};

    const visits        = this._toInt(k.visits);
    const newCustomers  = this._toInt(k.new_customers);
    const bondPayments  = this._toInt(k.bond_payments);
    const importeEur    = this._toEur(k.amount_cents);
    const waQr          = 0; // por ahora deshabilitado

    return [
      { x: "Servicios",        y: visits },
      { x: "Nuevos clientes",  y: newCustomers },
      { x: "Pagos de bonos",   y: bondPayments },
      { x: "Importe (€)",      y: importeEur },
      { x: "WhatsApp QR",      y: waQr }
    ];
  }
};
