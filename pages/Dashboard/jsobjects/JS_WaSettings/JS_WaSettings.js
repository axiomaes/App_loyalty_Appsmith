export default {
	// ===== Claves en store =====
	KEY_OWNER: "ownerPhone",
	KEY_MODE: "wa_mode",              // 'vip' | 'client' | 'both'
	KEY_APPROVED: "wa_bi_approved",   // true cuando Twilio apruebe Business-Initiated

	// ===== Helpers =====
	_digits(s){ return String(s||"").replace(/\D/g,""); },
	_e164(s){
		const raw = String(s || "").trim();
		if (!raw) return "";
		let d = raw.replace(/\D/g,"");
		if (!d) return "";
		// normaliza: +34 por defecto si vienen 9 dígitos ES
		if (raw.startsWith("00")) d = d.slice(2);     // 0034... -> 34...
		if (d.length === 9) return `+34${d}`;         // 9 dígitos -> España
		if (raw.startsWith("+")) return `+${d}`;      // ya venía con +
		if (d.startsWith("34") && d.length === 11) return `+${d}`;
		return `+${d}`;                                // fallback
	},

	// ===== Queries (tus nombres reales) =====
	_getQueryGet(){   return (typeof q_settings_get?.run === "function") ? q_settings_get : null; },
	_getQueryUpsert(){return (typeof q_wa_settings_upsert?.run === "function") ? q_wa_settings_upsert : null; },

	// ===== Modo actual =====
	mode() {
		const m = appsmith.store?.[this.KEY_MODE];
		return (m === "client" || m === "both") ? m : "vip";
	},
	isVip(){ return this.mode()==="vip"; },
	isBoth(){ return this.mode()==="both"; },

	ownerE164(){ return this._e164(appsmith.store?.[this.KEY_OWNER] || "+34682686605"); },

	// ===== Cargar configuración =====
	async load() {
		let row = {};
		try {
			const Q_GET = this._getQueryGet();
			if (Q_GET) {
				const res = await Q_GET.run();
				row = Array.isArray(res) && res[0] ? res[0] : {};
			} else {
				console.warn("⚠️ No existe query de lectura q_settings_get. Uso store.");
			}
		} catch (e) {
			console.warn("q_settings_get falló (uso store):", e);
		}

		await storeValue(this.KEY_OWNER,    row.owner_phone ?? appsmith.store?.[this.KEY_OWNER]    ?? "+34682686605");
		await storeValue(this.KEY_MODE,     row.wa_mode      ?? appsmith.store?.[this.KEY_MODE]     ?? "vip");
		await storeValue(this.KEY_APPROVED, row.bi_approved  ?? appsmith.store?.[this.KEY_APPROVED] ?? false);

		// Reflejar widgets (si existen)
		try {
			InputOwnerPhone?.setValue?.(appsmith.store[this.KEY_OWNER]);
			SwitchSendBoth?.setValue?.(this.mode()==="both");
			SwitchVipOnly?.setValue?.(this.mode()==="vip");
		} catch (_) {}

		showAlert("Configuración cargada.", "info");
	},

	// ===== Guardar desde los widgets =====
	async save() {
		const raw = (InputOwnerPhone?.text ?? appsmith.store?.[this.KEY_OWNER] ?? "").trim();
		const e164 = this._e164(raw);
		if (!e164) { showAlert("Número del dueño inválido.", "error"); return; }

		// Resolución: both > vip > client
		const both = !!SwitchSendBoth?.isSwitchedOn;
		const vip  = !!SwitchVipOnly?.isSwitchedOn;
		const mode = both ? "both" : (vip ? "vip" : "client");

		// ---- TIPADO CORRECTO PARA EL UPSERT ----
		const payload = {
			owner_phone: String(e164),                        // ::text
			wa_mode: String(mode),                            // ::text
			bi_approved: !!appsmith.store?.[this.KEY_APPROVED]// ::boolean
		};

		let persisted = false;
		try {
			const Q_UPSERT = this._getQueryUpsert();
			if (Q_UPSERT) {
				await Q_UPSERT.run(payload);
				persisted = true;
			} else {
				console.warn("⚠️ No existe query de upsert q_wa_settings_upsert. Guardo en store.");
			}
		} catch (e) {
			console.warn("q_wa_settings_upsert falló (guardo en store):", e);
		}

		await storeValue(this.KEY_OWNER, e164);
		await storeValue(this.KEY_MODE, mode);

		// reflejar widgets por si algo cambió
		try {
			InputOwnerPhone?.setValue?.(e164);
			SwitchSendBoth?.setValue?.(mode==="both");
			SwitchVipOnly?.setValue?.(mode==="vip");
		} catch (_){}

		showAlert(persisted ? "Configuración guardada en la base de datos." : "Configuración guardada.", "success");
	},

	// ===== Marcar aprobación Business-Initiated =====
	async setBiApproved(val) {
		const v = !!val;

		// payload tipado
		const payload = {
			owner_phone: String(this.ownerE164() || "+34682686605"), // ::text
			wa_mode: String(this.mode()),                              // ::text
			bi_approved: !!v                                           // ::boolean
		};

		let persisted = false;
		try {
			const Q_UPSERT = this._getQueryUpsert();
			if (Q_UPSERT) {
				await Q_UPSERT.run(payload);
				persisted = true;
			} else {
				console.warn("⚠️ No existe query de upsert q_wa_settings_upsert. Guardo en store.");
			}
		} catch (e) {
			console.warn("setBiApproved upsert falló:", e);
		}

		await storeValue(this.KEY_APPROVED, v);
		showAlert(persisted ? "Estado BI actualizado en DB." : "Estado BI actualizado.", "success");
	},

	// ===== Envío de prueba al dueño =====
	async testOwner() {
		// lee primero del input para permitir probar sin guardar
		const raw = (InputOwnerPhone?.text || appsmith.store?.[this.KEY_OWNER] || "").trim();
		const e164 = this._e164(raw);
		const toDigits = this._digits(e164);
		if (!toDigits || toDigits.length < 9) {
			showAlert("Número del dueño inválido.", "error");
			return;
		}

		await wa_send.run({
			to: toDigits,
			contentSidOverride: "HX3b91ea6167d412d8eacc07312603e58a",
			contentLanguage: "es",
			templateVars: {
				"1": "Prueba Admin",
				"2": "VIP",
				"3": "€ 0",
				"4": moment().format("DD/MM/YYYY"),
				"5": "123456",
				"6": "10"
			}
		});
		showAlert("Mensaje de prueba enviado al dueño.", "info");
	}
};
