export default {
  // Centraliza parámetros de negocio y rango de fechas
  params() {
    const bid = appsmith.store.businessId ?? null;

    // Admite DateRangePicker o DateIni/DateFin simples
    const rawStart =
      DateIni?.selectedDate?.start ??
      DateIni?.selectedDate ??
      new Date();

    const rawEnd =
      DateFin?.selectedDate?.end ??
      DateFin?.selectedDate ??
      DateIni?.selectedDate?.end ??
      rawStart;

    // Normaliza el orden de fechas
    let d1 = moment(rawStart);
    let d2 = moment(rawEnd);
    if (d1.isAfter(d2)) [d1, d2] = [d2, d1];

    // Fechas para comparaciones por día (::date)
    const startDate = d1.format("YYYY-MM-DD");
    const endDate   = d2.format("YYYY-MM-DD");

    // Ventana de tiempo [t1, t2) exacta (para timestamptz)
    const t1 = d1.clone().startOf("day").toISOString();
    const t2 = d2.clone().add(1, "day").startOf("day").toISOString();

    return { bid, startDate, endDate, t1, t2 };
  },

  async refresh() {
    const p = this.params();

    // Asegura que haya businessId antes de correr queries
    if (!p.bid) {
      showAlert("⚠️ Falta businessId en store", "warning");
      return;
    }

    // Ejecuta en paralelo las queries principales
    await Promise.allSettled([
      q_admin_visits_by_day.run(p),   // usa startDate/endDate
      q_admin_new_customers.run(p),   // usa startDate/endDate
      q_admin_bond_payments.run(p),   // usa t1/t2
      q_admin_kpis.run(p)             // usa ambos tipos
    ]);
  }
};
