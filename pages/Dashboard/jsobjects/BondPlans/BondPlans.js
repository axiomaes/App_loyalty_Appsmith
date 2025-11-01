export default {
  // ==== CONFIG / HELPERS =====================================================
  isAllowed() {
    const r = (Auth.role && Auth.role()) || '';
    return ['ADMIN', 'SUPERADMIN', 'OWNER'].includes(r);
  },

  euroFromCents(cents) {
    const n = Number(cents ?? 0) / 100;
    const v = Number.isFinite(n) ? n : 0;
    return v.toLocaleString('es-ES', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    });
  },

  toInt(v, def = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : def;
  },

  // confirm wrapper (evita lint con showConfirm)
  _confirm(msg = '¿Confirmas?') {
    const fn = typeof confirm === 'function' ? confirm : null;
    return Promise.resolve(fn ? !!fn(msg) : true); // si no hay confirm(), continúa
  },

  // ==== DATASET PARA LA TABLA ===============================================
  dataset() {
    const rows = Array.isArray(q_bondplans_list.data) ? q_bondplans_list.data : [];
    return rows.map(r => ({
      ...r,
      priceEuro: this.euroFromCents(r.priceCents)
    }));
  },

  // ==== MODAL CREAR/EDITAR ===================================================
  _editingId: null,

  openCreate() {
    this._editingId = null;
    InpBPCode.setValue('');
    InpBPName.setValue('');
    InpBPPrice.setValue('');          // euros (entero)
    InpBPDur.setValue(30);
    InpBPGStart.setValue(1);
    InpBPGEend.setValue(7);
    SwBPActive.setValue(true);
    showModal('Modal_BondPlan');
  },

  openEdit(row = BondPlansTable.selectedRow) {
    if (!row) return;
    this._editingId = row.id;
    InpBPCode.setValue(row.code ?? '');
    InpBPName.setValue(row.name ?? '');
    InpBPPrice.setValue(String(this.toInt(row.priceCents) / 100)); // mostrar euros
    InpBPDur.setValue(this.toInt(row.durationDays, 30));
    InpBPGStart.setValue(this.toInt(row.graceStartDay, 1));
    InpBPGEend.setValue(this.toInt(row.graceEndDay, 7));
    SwBPActive.setValue(Boolean(row.isActive));
    showModal('Modal_BondPlan');
  },

  async save() {
    if (!this.isAllowed()) { showAlert('No autorizado', 'error'); return; }

    const code = (InpBPCode.text || '').trim();
    const name = (InpBPName.text || '').trim();
    const priceEur = this.toInt(InpBPPrice.text, 0);

    if (!code || !name) { showAlert('Código y nombre son obligatorios.', 'warning'); return; }
    if (priceEur < 0) { showAlert('El precio debe ser ≥ 0.', 'warning'); return; }

    const payload = {
      code,
      name,
      priceCents: priceEur * 100,
      durationDays: this.toInt(InpBPDur.text, 30),
      graceStartDay: this.toInt(InpBPGStart.text, 1),
      graceEndDay: this.toInt(InpBPGEend.text, 7),
      isActive: !!SwBPActive.isSwitchedOn,
      id: this._editingId
    };

    const res = this._editingId
      ? await q_bondplans_update.run(payload)
      : await q_bondplans_insert.run(payload);

    const op = res?.[0]?.op || null;

    await q_bondplans_list.run();
    closeModal('Modal_BondPlan');

    if (op === 'inserted') showAlert('Bono creado.', 'success');
    else if (op === 'updated') showAlert('Bono actualizado.', 'success');
    else showAlert('Guardado.', 'success');
  },

  async remove(row = BondPlansTable.selectedRow) {
    if (!this.isAllowed() || !row) return;

    const ok = await this._confirm('¿Eliminar este tipo de bono? No se borrará si está en uso.');
    if (!ok) return;

    const res = await q_bondplans_delete.run({ id: row.id });
    await q_bondplans_list.run();

    const status = res?.[0]?.status || null;
    if (status === 'deleted') showAlert('Bono eliminado.', 'success');
    else if (status === 'in_use') showAlert('No se puede borrar: el plan está en uso.', 'warning');
    else showAlert('No encontrado o sin cambios.', 'warning');
  },

  // ==== OPCIONES PARA EL SELECT "TIPO BONO" (VIPs desde BondPlan) ===========
  vipSelectOptions() {
    const rows = Array.isArray(q_bondplans_list.data) ? q_bondplans_list.data : [];
    const isVip = (r) =>
      /vip/i.test(String(r?.code || "")) || /vip/i.test(String(r?.name || ""));

    const vipRows = rows.filter(r => r.isActive && isVip(r));

    return vipRows
      .sort((a, b) => String(a.code).localeCompare(String(b.code)))
      .map(r => ({
        value: `VIP:${r.code}:${r.id}`,
        label: `${r.name} — ${this.euroFromCents(r.priceCents)}`
      }));
  }
};
