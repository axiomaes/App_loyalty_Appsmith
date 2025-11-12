export default {
	// ====== MASKING ======
	maskPhone(s) {
		if (!s) return "";
		const raw = String(s).trim();
		const plus = raw.startsWith("+") ? "+" : "";
		const d = raw.replace(/\D/g, "");

		if (d.length <= 3) return plus + "***";
		if (d.length <= 6) return plus + "****" + d.slice(-2);
		if (d.length <= 9) return plus + "**** *** " + d.slice(-2);

		const keepCC = plus ? d.slice(0, Math.min(3, d.length - 3)) : "";
		const tail = d.slice(-3);
		const maskedLen = Math.max(d.length - keepCC.length - 3, 0);
		return (plus ? "+" + keepCC + " " : "") + "*".repeat(Math.min(maskedLen, 8)) + " " + tail;
	},

	maskEmail(s) {
		if (!s) return "";
		const str = String(s).trim();
		const [userPart = "", domain = ""] = str.split("@");
		if (!domain) return this.maskPhone(str);

		const [user, plusTag = ""] = userPart.split("+");
		const first = user.slice(0, 1) || "*";
		const last  = user.length > 2 ? user.slice(-1) : "";
		const masked = user.length <= 2 ? "***" : `${first}***${last}`;
		const tag = plusTag ? "+…" : "";
		return `${masked}${tag}@${domain}`;
	},

	// ====== TAGS ======
	_TAG_MAP: {
		BONO_FAMILIA: "Bono Familia",
		BONO_VIP_A:   "Bono VIP A",
		BONO_VIP_B:   "Bono VIP B",
		BONO_VIP_C:   "Bono VIP C",
		BONO_TARJETA: "Bono Tarjeta",
		VIP:          "VIP",
		FRIEND:       "Amigo",
		NEW:          "Nuevo",
		ESPORADICO:   "Esporádico",
		NONE:         "—",
	},

	tagLabel(t) {
		if (!t) return "—";
		const key = String(t).toUpperCase();
		return this._TAG_MAP[key] ?? t ?? "—";
	},

	tagColor(t) {
		const key = String(t || "").toUpperCase();
		switch (key) {
			case "BONO_TARJETA": return "#ff00c8";
			case "BONO_FAMILIA": return "#00c2a8";
			case "BONO_VIP_A":   return "#6366f1";
			case "BONO_VIP_B":   return "#8b5cf6";
			case "BONO_VIP_C":   return "#f97316";
			case "VIP":          return "#ef4444";
			case "FRIEND":       return "#22c55e";
			case "NEW":          return "#3b82f6";
			case "ESPORADICO":   return "#64748b";
			default:             return "#a3a3a3";
		}
	},

	_contrastOn(bgHex) {
		try {
			const hex = bgHex.replace("#", "");
			const r = parseInt(hex.substring(0, 2), 16);
			const g = parseInt(hex.substring(2, 4), 16);
			const b = parseInt(hex.substring(4, 6), 16);
			const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
			return luminance > 0.6 ? "#111111" : "#FFFFFF";
		} catch {
			return "#FFFFFF";
		}
	},

	tagBadge(t) {
		const bg = this.tagColor(t);
		const fg = this._contrastOn(bg);
		return { text: this.tagLabel(t), bg, fg };
	},

	// ====== ACTIVO ======
	deriveActivo(row = {}, days = 90) {
		if (row.activo_raw !== null && row.activo_raw !== undefined)
			return !!row.activo_raw;

		const last =
					row.lastVisitAt || row.last_visit_at || row.ultimaVisita || null;
		if (last) {
			const diff = moment().diff(moment(last), "days");
			if (!isNaN(diff)) return diff <= days;
		}

		const strongTags = [
			"BONO_FAMILIA",
			"BONO_VIP_A",
			"BONO_VIP_B",
			"BONO_VIP_C",
			"BONO_TARJETA",
			"VIP",
		];
		return strongTags.includes(String(row.tag || "").toUpperCase());
	},

	// ====== FORMATO Y NÚMEROS ======
	euro(n) {
		const v = Number(n ?? 0) / 100;

		// Usa Intl si está disponible; si no, hace un formateo manual.
		try {
			if (typeof Intl === "object" && typeof Intl.NumberFormat === "function") {
				return new Intl.NumberFormat("es-ES", {
					style: "currency",
					currency: "EUR",
					minimumFractionDigits: 0,
					maximumFractionDigits: 0,
				}).format(v);
			}
		} catch (_) { /* noop */ }

		// Fallback: miles con punto y sin decimales, sufijo €
		const s = Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
		return `${s} €`;
	},

	formatDate(iso) {
		return iso ? moment(iso).format("DD/MM/YYYY") : "";
	},


	// ====== UUID & VALIDATION ======
	isUuid(s) {
		return (
			typeof s === "string" &&
			/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)
		);
	}
};
