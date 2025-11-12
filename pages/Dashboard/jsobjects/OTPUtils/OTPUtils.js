export default {
	// ===== Helpers de entorno (browser) =====
	_crypto() {
		try { return globalThis && globalThis.crypto ? globalThis.crypto : null; }
		catch (_) { return null; }
	},
	_hasSubtle() {
		const c = this._crypto();
		return !!(c && typeof c.subtle?.digest === "function");
	},

	// ---- SHA-256 compatible con Appsmith (WebCrypto + polyfill TextEncoder) ----
	async sha256(str) {
		if (!this._hasSubtle()) {
			throw new Error("SHA-256 no disponible: WebCrypto/SubtleCrypto no está expuesto en este entorno.");
		}

		// Polyfill seguro para TextEncoder si no existe (UTF-8)
		const TEnc = globalThis.TextEncoder || (function () {
			return class {
				encode(s) {
					// Convierte string a UTF-8 manualmente
					s = String(s);
					const out = [];
					for (let i = 0; i < s.length; i++) {
						let code = s.charCodeAt(i);
						if (code < 0x80) {
							out.push(code);
						} else if (code < 0x800) {
							out.push(0xc0 | (code >> 6));
							out.push(0x80 | (code & 0x3f));
						} else if (code < 0xd800 || code >= 0xe000) {
							out.push(0xe0 | (code >> 12));
							out.push(0x80 | ((code >> 6) & 0x3f));
							out.push(0x80 | (code & 0x3f));
						} else {
							// surrogate pair
							i++;
							code = 0x10000 + (((code & 0x3ff) << 10) | (s.charCodeAt(i) & 0x3ff));
							out.push(0xf0 | (code >> 18));
							out.push(0x80 | ((code >> 12) & 0x3f));
							out.push(0x80 | ((code >> 6) & 0x3f));
							out.push(0x80 | (code & 0x3f));
						}
					}
					return new Uint8Array(out);
				}
			};
		})();


		const enc = new TEnc();
		const data = enc.encode(String(str));
		const buf = await this._crypto().subtle.digest("SHA-256", data);
		return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
	},

	// ---- Generador de código: usa CSPRNG si existe ----
	genCode(len = 6) {
		const L = Math.max(4, Math.min(10, Number(len) || 6)); // entre 4 y 10 dígitos
		const c = this._crypto();
		if (c && typeof c.getRandomValues === "function") {
			const bytes = new Uint8Array(L);
			c.getRandomValues(bytes);
			const digits = Array.from(bytes, b => (b % 10).toString()).join("");
			return digits.slice(0, L).padStart(L, "0");
		}
		// Fallback no críptico (solo si no hay WebCrypto)
		return Math.floor(Math.random() * 10 ** L).toString().padStart(L, "0");
	},

	// ---- Helpers internos ----
	_digits(phone) {
		return String(phone || "").replace(/\D/g, "");
	},
	_clampTtl(ttlMin) {
		const n = Math.floor(Number(ttlMin || 10));
		return Math.max(1, Math.min(30, n)); // entre 1 y 30 min
	},

	// ---- Crear OTP y guardar tiempo de expiración ----
	async startOtp({ businessId, phone, ttlMin = 10 }) {
		const ttl = this._clampTtl(ttlMin);
		const code = this.genCode(6);
		const codeHash = await this.sha256(code);

		const now = Date.now();
		const expiry = now + ttl * 60 * 1000; // ms
		const phoneDigits = this._digits(phone);

		await storeValue("otp_phone_raw", phone ?? null, false);
		await storeValue("otp_phone", phoneDigits || null, false);
		await storeValue("otp_hash", codeHash, false);
		await storeValue("otp_code_plain", code, false);
		await storeValue("otp_ttl_min", ttl, false);
		await storeValue("otp_expiry_ts", expiry, false);
		await storeValue("otp_verified", false, false);

		return { code, codeHash, ttlMin: ttl, expiry, phone: phoneDigits, businessId };
	},

	// ---- Comparación "constante" aproximada ----
	_timingSafeEq(a, b) {
		if (typeof a !== "string" || typeof b !== "string") return false;
		let diff = a.length ^ b.length;
		for (let i = 0; i < Math.max(a.length, b.length); i++) {
			const ca = a.charCodeAt(i % a.length) || 0;
			const cb = b.charCodeAt(i % b.length) || 0;
			diff |= (ca ^ cb);
		}
		return diff === 0;
	},

	// ---- Verificar OTP con chequeo de expiración ----
	async checkOtp(inputCode, codeHashFromDb) {
		const code = String(inputCode || "").trim();
		const storedHash = codeHashFromDb || appsmith.store?.otp_hash;
		if (!code || !storedHash) return false;

		// 1) Expiración
		const expiry = appsmith.store?.otp_expiry_ts;
		if (expiry && Date.now() > Number(expiry)) {
			showAlert("El código ha expirado. Solicita uno nuevo.", "warning");
			return false;
		}

		// 2) Hash
		const hashInput = await this.sha256(code);
		return this._timingSafeEq(hashInput, storedHash);
	},

	// ---- Utilidad extra: limpiar OTP ----
	async clearOtp() {
		await storeValue("otp_phone_raw", null);
		await storeValue("otp_phone", null);
		await storeValue("otp_hash", null);
		await storeValue("otp_code_plain", null);
		await storeValue("otp_ttl_min", null);
		await storeValue("otp_expiry_ts", null);
		await storeValue("otp_verified", false);
	}
};
