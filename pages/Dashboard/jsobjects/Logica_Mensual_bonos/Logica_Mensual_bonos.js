export default {
  // ===== CONFIGURACIÓN BASE =====
  PERIOD_FMT: "YYYY-MM",
  DATE_FMT: "YYYY-MM-DD",

  // ===== PERIODOS =====
  currentPeriod() {
    return moment().format(this.PERIOD_FMT);
  },

  prevPeriod(p = this.currentPeriod()) {
    return moment(p, this.PERIOD_FMT, true)
      .subtract(1, "month")
      .format(this.PERIOD_FMT);
  },

  nextPeriod(p = this.currentPeriod()) {
    return moment(p, this.PERIOD_FMT, true)
      .add(1, "month")
      .format(this.PERIOD_FMT);
  },

  dayOfMonth() {
    return moment().date();
  },

  // ===== VALIDACIÓN / NORMALIZACIÓN =====
  isValidPeriod(p) {
    return moment(p, this.PERIOD_FMT, true).isValid();
  },

  normalize(p) {
    return this.isValidPeriod(p)
      ? moment(p, this.PERIOD_FMT).format(this.PERIOD_FMT)
      : this.currentPeriod();
  },

  compare(a, b) {
    // -1 si a<b, 0 si igual, 1 si a>b
    const ma = moment(a, this.PERIOD_FMT, true);
    const mb = moment(b, this.PERIOD_FMT, true);
    if (ma.isBefore(mb)) return -1;
    if (ma.isAfter(mb)) return 1;
    return 0;
  },

  shift(p, months = 0) {
    return moment(p, this.PERIOD_FMT, true)
      .add(months, "month")
      .format(this.PERIOD_FMT);
  },

  // ===== RANGOS (inicio / fin) =====
  startDate(p = this.currentPeriod()) {
    return moment(p, this.PERIOD_FMT, true)
      .startOf("month")
      .format(this.DATE_FMT);
  },

  endDate(p = this.currentPeriod()) {
    return moment(p, this.PERIOD_FMT, true)
      .endOf("month")
      .format(this.DATE_FMT);
  },

  startISO(p = this.currentPeriod()) {
    return moment(p, this.PERIOD_FMT, true)
      .startOf("month")
      .toISOString();
  },

  endISO(p = this.currentPeriod()) {
    return moment(p, this.PERIOD_FMT, true)
      .endOf("month")
      .toISOString();
  },

  label(p = this.currentPeriod()) {
    return moment(p, this.PERIOD_FMT, true)
      .locale("es")
      .format("MMMM YYYY"); // ejemplo: "octubre 2025"
  },

  // ===== LÓGICA DE PERIODO A PAGAR =====
  /**
   * Regla práctica:
   * - Si estamos del 1 al 7 y el periodo anterior está pendiente -> sugerir anterior.
   * - En otro caso -> actual.
   *
   * opts = {
   *   hasUnpaidPrev: boolean (por ejemplo desde q_bond_payments_pending),
   *   basePeriod:    'YYYY-MM' (opcional)
   * }
   */
  suggestedPeriodFor(opts = {}) {
    const base = opts.basePeriod || this.currentPeriod();
    const prev = this.prevPeriod(base);
    const isFirstWeek = this.dayOfMonth() <= 7;

    if (isFirstWeek && opts.hasUnpaidPrev) {
      return prev;
    }
    return base;
  }
};
