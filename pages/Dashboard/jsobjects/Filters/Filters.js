export default {
  DEFAULT_N: 5,

  // --- Internos --------------------------------------------------------------
  _fmt(d) { return moment(d).format("YYYY-MM-DD"); },
  _isValidISO(s) { return typeof s === "string" && moment(s, "YYYY-MM-DD", true).isValid(); },

  // Devuelve 'YYYY-MM-DD' garantizado (o default)
  fromISO() {
    const s = appsmith.store.filters_from;
    return this._isValidISO(s)
      ? s
      : this._fmt(moment().subtract(this.DEFAULT_N - 1, "days"));
  },

  toISO() {
    const s = appsmith.store.filters_to;
    return this._isValidISO(s)
      ? s
      : this._fmt(moment());
  },

  // Rango normalizado (si el usuario invirtió, lo ordena)
  range() {
    let d1 = moment(this.fromISO(), "YYYY-MM-DD");
    let d2 = moment(this.toISO(), "YYYY-MM-DD");
    if (d1.isAfter(d2)) [d1, d2] = [d2, d1];
    return { from: this._fmt(d1), to: this._fmt(d2) };
  },

  // Timestamps delimitados en ventana [t1, t2) (fin EXCLUSIVO)
  tRange() {
    const { from, to } = this.range();
    const t1 = moment(from, "YYYY-MM-DD").startOf("day").toISOString();
    const t2 = moment(to,   "YYYY-MM-DD").add(1, "day").startOf("day").toISOString();
    return { t1, t2 };
  },

  // Conveniencias individuales
  fromStart() { return this.tRange().t1; },
  toEndExclusive() { return this.tRange().t2; }, // preferible a endOf('day')

  // Persistencia segura (ordena y valida)
  async setRange(from, to) {
    const f = this._isValidISO(from) ? from : this.fromISO();
    const t = this._isValidISO(to)   ? to   : this.toISO();
    let d1 = moment(f, "YYYY-MM-DD"), d2 = moment(t, "YYYY-MM-DD");
    if (d1.isAfter(d2)) [d1, d2] = [d2, d1];
    await Promise.all([
      storeValue("filters_from", this._fmt(d1)),
      storeValue("filters_to",   this._fmt(d2))
    ]);
    return this.range();
  },

  // Últimos N días (incluye hoy). n=5 -> de hoy-4 a hoy
  resetLastNDays(n = this.DEFAULT_N) {
    const to = this._fmt(moment());
    const from = this._fmt(moment(to, "YYYY-MM-DD").subtract(n - 1, "days"));
    return this.setRange(from, to);
  },

  // Mueve el rango actual N días (positivo o negativo)
  shift(days = 0) {
    const { from, to } = this.range();
    const newFrom = this._fmt(moment(from, "YYYY-MM-DD").add(days, "days"));
    const newTo   = this._fmt(moment(to,   "YYYY-MM-DD").add(days, "days"));
    return this.setRange(newFrom, newTo);
  },

  // Presets útiles
  setToday() {
    const d = this._fmt(moment());
    return this.setRange(d, d);
  },

  setThisMonth() {
    const start = this._fmt(moment().startOf("month"));
    const end   = this._fmt(moment().endOf("month"));
    return this.setRange(start, end);
  },

  setPrevMonth() {
    const start = this._fmt(moment().subtract(1, "month").startOf("month"));
    const end   = this._fmt(moment().subtract(1, "month").endOf("month"));
    return this.setRange(start, end);
  },

  // Info de apoyo para UI / KPIs
  lengthDays() {
    const { from, to } = this.range();
    return moment(to).diff(moment(from), "days") + 1; // inclusivo
  },

  label() {
    const { from, to } = this.range();
    return (from === to) ? from : `${from} → ${to}`;
  },

  // Limpia (volverá a defaults)
  clear() {
    return Promise.all([
      storeValue("filters_from", undefined),
      storeValue("filters_to", undefined)
    ]);
  }
};
