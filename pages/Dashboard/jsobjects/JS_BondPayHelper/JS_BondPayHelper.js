export default {
	// === Lee un plan por id desde q_bondplans_list =============================
	_plan(planId) {
		const rows = q_bondplans_list?.data || [];
		const _id = this._extractId(planId); // soporta "VIP:code:id" o solo "id" (UUID)
		return rows.find(r => String(r.id) === String(_id)) || null;
	},

	// --- Parsing: pagos sin decimales (euros enteros) --------------------------
	_toIntEuros(value) {
		// "20,50" -> 21 (redondeo). Si prefieres truncar: usa Math.floor en vez de Math.round
		const s = String(value ?? "").replace(/[^\d,\.\-]/g, "").replace(",", ".");
		const n = Number(s);
		if (Number.isFinite(n)) return Math.round(n); // ENTERO
		const onlyDigits = String(value ?? "").replace(/[^\d\-]/g, "");
		const p = parseInt(onlyDigits, 10);
		return Number.isFinite(p) ? p : 0;
	},

	_eurosToCents(eurInt) {
		const e = this._toIntEuros(eurInt);
		return e * 100;
	},

	// Precio por plan (CENTAVOS). Si pasas € manuales (enteros), los convierte.
	amountCents(planId, overrideEur = null) {
		if (overrideEur != null) return this._eurosToCents(overrideEur);
		const p = this._plan(planId);
		if (!p) return 0;
		// prisma: BondPlan.priceCents (Int)
		if (p.priceCents != null) return Number(p.priceCents);
		// fallback (por si tu listado trajera euros sueltos en algún momento)
		const eurInt = this._toIntEuros(p.price_eur || 0);
		return this._eurosToCents(eurInt);
	},

	// === Chequeo: ¿ya tiene pago para un periodo? ==============================
	async hasPaymentForPeriod(customerId, period) {
		if (!customerId || !period) return false;
		try {
			// Tu acción puede resolverlo por customerId internamente
			const res = await q_bond_has_payment.run({ customerId, period });
			return !!(res && res[0] && res[0].paid);
		} catch (e) {
			console.warn("hasPaymentForPeriod error:", e);
			return false;
		}
	},

	// === Calcula periodo sugerido ==============================================
	async suggestedPeriodForCustomer(
		customerId,
		basePeriod = Logica_Mensual_bonos.currentPeriod()
	) {
		const prev = Logica_Mensual_bonos.prevPeriod(basePeriod);
		const isFirstWeek = Logica_Mensual_bonos.dayOfMonth() <= 7;
		let hasUnpaidPrev = false;

		if (isFirstWeek) {
			const prevIsPaid = await this.hasPaymentForPeriod(customerId, prev);
			hasUnpaidPrev = !prevIsPaid;
		}

		return Logica_Mensual_bonos.suggestedPeriodFor({ hasUnpaidPrev, basePeriod });
	},

	// === Bond helpers: obtener/crear bondId ====================================
	async _bondForCustomer(customerId) {
		if (!customerId) return null;
		try {
			const rows = await q_bond_by_customer.run({ customerId });
			return (rows && rows[0]) || null;
		} catch (e) {
			console.warn("_bondForCustomer error:", e);
			return null;
		}
	},

	async getOrCreateBondId(customerId, planId) {
		const plan = this._plan(planId);
		if (!plan) throw new Error("Plan no encontrado.");

		// ¿ya existe Bond del cliente?
		const current = await this._bondForCustomer(customerId);
		if (current && current.id) {
			// si cambió de plan, actualiza
			if (String(current.planId) !== String(plan.id)) {
				const upd = await q_bond_assign_upsert.run({
					customerId,
					planId: String(plan.id)
				});
				return upd?.[0]?.id || current.id;
			}
			return current.id;
		}

		// no había bond → crea uno
		const ins = await q_bond_assign_upsert.run({
			customerId,
			planId: String(plan.id)
		});
		return ins?.[0]?.id || null;
	},

	// === Construye el payload para q_vip_pay (SIN bondId) ======================
	async buildPayload({ customerId, planId, method = null, notes = null, period = null, amountEur = null }) {
		if (!customerId) throw new Error("Falta customerId");
		if (!planId) throw new Error("Falta planId");

		const plan = this._plan(planId);
		if (!plan) throw new Error("Plan no encontrado o lista de planes sin cargar.");

		// 🔒 Asegura que el cliente tenga un Bond (crea/actualiza si hace falta)
		await this.getOrCreateBondId(customerId, plan.id);

		const amountCents = this.amountCents(plan.id, amountEur);
		const basePeriod  = Logica_Mensual_bonos.currentPeriod();
		const targetPeriod = period || await this.suggestedPeriodForCustomer(customerId, basePeriod);

		// 👇 Tu q_vip_pay espera esto (SIN bondId)
		return {
			customerId,
			period: targetPeriod,
			amountCents,
			method: method || null,
			notes: notes || `Pago ${plan.name} (${targetPeriod})`
		};
	},

	// === Ejecuta el pago =======================================================
	async pay({ customerId, planId, method = null, notes = null, period = null, amountEur = null }) {
		const payload = await this.buildPayload({ customerId, planId, method, notes, period, amountEur });
		const res = await q_vip_pay.run(payload);   // ← tu SQL usa customerId, no bondId
		return res?.[0] || {};
	},

	// === Normaliza móvil a E.164 España (+34XXXXXXXXX) =========================
	normalizePhone(raw = "") {
		const s = String(raw || "").replace(/\D+/g, "");
		if (!s) return "";
		// Si viene como 34XXXXXXXXX o +34XXXXXXXXX
		if (s.startsWith("34") && s.length >= 11) return `+34${s.slice(-9)}`;
		// Si viene con 9 dígitos, asume España
		if (s.length >= 9) return `+34${s.slice(-9)}`;
		return "";
	},

	// === OTP (6 dígitos) =======================================================
	genOtp() {
		return String(Math.floor(100000 + Math.random() * 900000));
	},

	// === Validación del modal de pago ==========================================
	validatePagoVipForm() {
		const errs = [];

		// Móvil (usa el PhoneInput)
		const phoneE164 = this.normalizePhone(PhoneInput.text || "");
		if (!phoneE164) errs.push("Ingresa un móvil válido (+34XXXXXXXXX).");

		// Período
		if (!InputPeriodo.text) errs.push("Selecciona el período.");

		// Método de pago
		if (!SelectMetodoPago.selectedOptionValue) errs.push("Selecciona el método de pago.");

		// Plan
		if (!SelectPlan.selectedOptionValue) errs.push("Selecciona el Bono Plan.");

		// Importe > 0
		const importe = Number(InputImporte.text || 0);
		if (!(importe > 0)) errs.push("El valor debe ser mayor que 0.");

		return { ok: errs.length === 0, phoneE164, errs };
	},

	// === Helper directo para el cliente seleccionado ==========================
	async paySelected({ method = null, notes = null, period = null, amountEur = null } = {}) {
		const customerId =
					appsmith.store?.editingCustomer?.id ||
					appsmith.store?.selCustomerId ||
					Listado_clientes?.selectedRow?.id;

		// Fallbacks: store → SelectPlan → fila de la tabla
		const planIdRaw =
					appsmith.store?.selVipPlanId ||
					SelectPlan?.selectedOptionValue ||
					Listado_clientes?.selectedRow?.vipPlanId ||
					Listado_clientes?.selectedRow?.planId ||
					null;

		const planId = this._extractId(planIdRaw);

		// euros enteros desde store (o parámetro; si no, desde el InputImporte)
		const eurFromStore = appsmith.store?.vipAmountEur;
		const amount = amountEur != null ? amountEur : (eurFromStore ?? InputImporte.text);

		if (!customerId) { showAlert("Selecciona un cliente.", "warning"); return; }
		if (!planId)     { showAlert("Selecciona un plan.", "warning"); return; }

		try {
			const result = await this.pay({ customerId, planId, method, notes, period, amountEur: amount });

			if (result.not_vip) {
				showAlert("El cliente no es VIP según su tag.", "warning");
			} else if (result.updated) {
				showAlert("Pago actualizado para ese periodo.", "success");
			} else if (result.inserted) {
				showAlert("Pago registrado.", "success");
			} else {
				showAlert("No se registró ningún cambio.", "info");
			}

			if (customerId) {
				await q_cliente_detalle.run({ id: customerId });
				await q_visitas_historial.run({
					customerId,
					limit: Table_visitas.pageSize || 50,
					offset: 0
				});
			}
		} catch (e) {
			console.error("paySelected error:", e);
			showAlert(e?.message || "No se pudo registrar el pago.", "error");
		}
	},

	// === Helpers para el modal BondPlan =======================================
	openBondPlanEdit(row) {
		storeValue('bpEdit', row || {});
		showModal(Modal_BondPlan.name);
	},

	openBondPlanCreate() {
		storeValue('bpEdit', {
			code: "",
			name: "",
			priceCents: 0,     // prisma: Int en centavos
			durationDays: 30,
			graceStartDay: 1,
			graceEndDay: 7,
			isActive: true
		});
		showModal(Modal_BondPlan.name);
	},

	// === Semáforo de un cliente/plan puntual ==================================
	async getVipTrafficLight(customerId, planId) {
		const plan = this._plan(planId);
		if (!plan) return { color: "gray", label: "Sin plan" };

		if (!this._isVipPlan(plan)) return { color: "gray", label: "No VIP" };

		const period = Logica_Mensual_bonos.currentPeriod();
		const paid = await this.hasPaymentForPeriod(customerId, period);
		if (!paid) return { color: "red", label: "Inactivo" };

		const hoy = new Date();
		const finMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
		const diffDias = (finMes - hoy) / (1000 * 60 * 60 * 24);
		if (diffDias <= 3) return { color: "orange", label: "Por vencer" };

		return { color: "green", label: "Activo" };
	},

	// === Util: tolera values "VIP:code:id" o solo "id" (UUID) ==================
	_extractId(planId) {
		if (planId == null) return planId;
		const s = String(planId).trim();
		return s.includes(":") ? s.split(":").pop().trim() : s;
	},

	// === ¿el plan es VIP por nombre/código? ===================================
	_isVipPlan(plan) {
		if (!plan) return false;
		return /vip/i.test(String(plan.code || "")) || /vip/i.test(String(plan.name || ""));
	},

	// === ¿VIP habilitado para cliente+plan en un periodo? =====================
	async isVipEnabledFor(customerId, planId, period = Logica_Mensual_bonos.currentPeriod()) {
		const plan = this._plan(planId);
		if (!plan) return false;
		if (!this._isVipPlan(plan)) return true;
		const paid = await this.hasPaymentForPeriod(customerId, period);
		return !!paid;
	},

	// === helper directo con selección actual ==================================
	async isVipEnabledForSelected(period = Logica_Mensual_bonos.currentPeriod()) {
		const customerId = appsmith.store?.editingCustomer?.id || appsmith.store?.selCustomerId;
		const planId = appsmith.store?.selVipPlanId;
		if (!customerId || !planId) return false;
		return this.isVipEnabledFor(customerId, planId, period);
	},

	// === patrón para validar antes de ejecutar acciones VIP ===================
	async requireVipOrWarn({
		customerId = null,
		planId = null,
		period = Logica_Mensual_bonos.currentPeriod(),
		onAllowed = null
	} = {}) {
		const cId = customerId || appsmith.store?.editingCustomer?.id || appsmith.store?.selCustomerId;
		const pId = planId || appsmith.store?.selVipPlanId;
		if (!cId || !pId) {
			showAlert("Selecciona cliente y plan VIP primero.", "warning");
			return false;
		}

		const ok = await this.isVipEnabledFor(cId, pId, period);
		if (!ok) {
			const prev = Logica_Mensual_bonos.prevPeriod(period);
			showAlert(`El bono VIP no está habilitado para ${period}. Registra el pago del mes (o revisa si solo hay pago en ${prev}).`, "warning");
			return false;
		}

		if (typeof onAllowed === "function") await onAllowed();
		return true;
	},

	// === Util: días restantes para fin de mes =================================
	daysToMonthEnd() {
		const hoy = new Date();
		const fin = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
		return Math.floor((fin - hoy) / (1000 * 60 * 60 * 24));
	},

	// === Mapa { customerId -> {color,label,icon} } usando planId ===============
	async refreshVipStatusMap(rows = []) {
		const period = Logica_Mensual_bonos.currentPeriod();
		const daysLeft = this.daysToMonthEnd();
		const yellow = daysLeft <= 3;

		const tasks = (rows || []).map(async (row) => {
			const customerId = row?.id || row?.customerId;
			const planId = row?.planId || row?.vipPlanId;

			const plan = this._plan(planId);
			if (!plan) return [customerId, { color: "gray", label: "Sin plan", icon: "info" }];

			if (!this._isVipPlan(plan)) {
				return [customerId, { color: "gray", label: "No VIP", icon: "info" }];
			}

			const paid = await this.hasPaymentForPeriod(customerId, period);
			if (!paid) {
				return [customerId, { color: "red", label: "Inactivo", icon: "close" }];
			}

			if (yellow) {
				return [customerId, { color: "orange", label: "Por vencer", icon: "warning" }];
			}

			return [customerId, { color: "green", label: "Activo", "icon": "check" }];
		});

		const entries = await Promise.all(tasks);
		const map = Object.fromEntries(entries);
		await storeValue("vipStatusMap", map);
		return map;
	},

	// === Regex local: ¿el tag es VIP? (BONO_VIP_*) =============================
	_isVipTag(tag) {
		return /^BONO_VIP_/i.test(String(tag || ""));
	},

	// === Mapa usando TAG en vez de planId (para Listado_clientes) ==============
	async refreshVipStatusMapForTable(rows = [], opts = {}) {
		const idField = opts.idField || "id";
		const tagField = opts.tagField || "tag";

		const period = Logica_Mensual_bonos.currentPeriod();
		const daysLeft = this.daysToMonthEnd();
		const isYellow = daysLeft <= 3;

		const tasks = (rows || []).map(async (row) => {
			const customerId = row?.[idField];
			const tag = row?.[tagField] || row?.vipTag || row?.customerTag;

			if (!customerId) {
				return [undefined, { color: "gray", label: "Sin id", icon: "info" }];
			}

			if (!this._isVipTag(tag)) {
				return [customerId, { color: "gray", label: "No VIP", icon: "info" }];
			}

			const paid = await this.hasPaymentForPeriod(customerId, period);
			if (!paid) {
				return [customerId, { color: "red", label: "Inactivo", icon: "close" }];
			}

			if (isYellow) {
				return [customerId, { color: "orange", label: "Por vencer", icon: "warning" }];
			}

			return [customerId, { color: "green", label: "Activo", icon: "check" }];
		});

		const entries = await Promise.all(tasks);
		const map = Object.fromEntries(entries.filter(([k]) => k != null));
		await storeValue("vipStatusMap", map);
		return map;
	},

	// 🔹 Planes VIP activos (para llenar el Select)
	vipPlans() {
		const rows = q_bondplans_list?.data || [];
		return rows.filter(p => p.isActive && (/vip/i.test(p.code) || /vip/i.test(p.name)));
	},

	// 🔹 Asignar plan de bono a un cliente (UPSERT en Bond)
	async assignPlan({ customerId, planId }) {
		if (!customerId) throw new Error("Falta customerId");
		if (!planId) throw new Error("Falta planId");
		const plan = this._plan(planId);
		if (!plan) throw new Error("Plan no encontrado.");
		const res = await q_bond_assign_upsert.run({ customerId, planId: String(plan.id) });
		return res?.[0] || { assigned: true };
	},

	// 🔹 Cambio de plan con regla de vigencia
	async changePlan({ customerId, newPlanId, effective = "next", alsoPay = false, method = null, notes = null }) {
		if (!customerId) throw new Error("Falta customerId");
		if (!newPlanId) throw new Error("Selecciona el nuevo plan");

		const period = Logica_Mensual_bonos.currentPeriod();
		const alreadyPaid = await this.hasPaymentForPeriod(customerId, period);

		await this.assignPlan({ customerId, planId: newPlanId });

		if (alreadyPaid && effective === "next") {
			showAlert("Plan cambiado. El nuevo precio aplicará desde el próximo periodo.", "info");
			return { changed: true, appliedFrom: "next" };
		}

		if (!alreadyPaid && effective === "current" && alsoPay) {
			await this.pay({ customerId, planId: newPlanId, method, notes, period });
			showAlert("Plan cambiado y pago del periodo actual registrado.", "success");
			return { changed: true, appliedFrom: "current", paid: true };
		}

		showAlert("Plan cambiado.", "success");
		return { changed: true, appliedFrom: effective, paid: false };
	},

	// 🔹 Helper directo desde selección actual (usa store)
	async changePlanSelected({ newPlanId, effective = "next", alsoPay = false, method = null, notes = null } = {}) {
		const customerId = appsmith.store?.editingCustomer?.id || appsmith.store?.selCustomerId;
		if (!customerId) return showAlert("Selecciona un cliente.", "warning");
		if (!newPlanId) return showAlert("Selecciona el nuevo plan VIP.", "warning");

		try {
			const res = await this.changePlan({ customerId, newPlanId, effective, alsoPay, method, notes });
			await q_cliente_detalle.run({ id: customerId });
			await q_visitas_historial.run({ customerId, limit: Table_visitas.pageSize || 50, offset: 0 });
			return res;
		} catch (e) {
			console.error("changePlanSelected error:", e);
			showAlert(e?.message || "No se pudo cambiar el plan.", "error");
		}
	},

	// ==========================================================================
	// === NUEVO: Apertura del modal VIP y utilidades para bindings =============
	// ==========================================================================

	// Abre el modal de pago VIP garantizando que el cliente y su detalle
	// están cargados en appsmith.store.editingCustomer y selCustomerId.
	async openVipModal(fromRow = null) {
		try {
			const id =
				fromRow?.id ||
				appsmith.store?.editingCustomer?.id ||
				appsmith.store?.selCustomerId ||
				Listado_clientes?.selectedRow?.id;

			if (!id) {
				showAlert("Selecciona un cliente primero.", "warning");
				return;
			}

			// refresca detalle y guarda como fuente única de verdad
			const detRes = await q_cliente_detalle.run({ id });
			const det = Array.isArray(detRes) ? (detRes[0] || {}) : (detRes || {});
			await storeValue("editingCustomer", det);
			await storeValue("selCustomerId", det.id);

			// recordar/preseleccionar plan si ya tenía
			const rememberedPlan =
				appsmith.store?.selVipPlanId ||
				det.vipPlanId ||
				det.planId ||
				null;
			await storeValue("selVipPlanId", rememberedPlan ? String(rememberedPlan) : null);

			// estado del form (periodo por defecto)
			await storeValue("vipPay", {
				period: Logica_Mensual_bonos.currentPeriod(),
				method: "CASH",
				notes: ""
			});

			await showModal(Modal_pago_vip.name);
		} catch (e) {
			console.error("openVipModal error:", e);
			showAlert("No se pudo abrir Pago VIP.", "error");
		}
	},

	// Cliente actual desde el store (para usar en títulos/inputs)
	currentCustomer() {
		return appsmith.store?.editingCustomer || {};
	},

	// Periodo actual (o el elegido en el form)
	currentPeriod() {
		return appsmith.store?.vipPay?.period || Logica_Mensual_bonos.currentPeriod();
	},

	// Opciones para el Select de plan VIP
	planOptions() {
		return this.vipPlans().map(p => ({
			label: `${p.name} · € ${this._toIntEuros(p.price_eur ?? (p.priceCents || 0) / 100)}`,
			value: String(p.id)
		}));
	},

	// Valor por defecto del Select de plan
	defaultPlanValue() {
		return appsmith.store?.selVipPlanId
			|| String((this.currentCustomer()?.vipPlanId || this.currentCustomer()?.planId || ""));
	}
};
