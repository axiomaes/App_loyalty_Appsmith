export default {
	async processData() {
		try {
			// 1) orígenes (principal y fallback)
			let row = null;
			const main = getClientVisitsQuery.data;
			if (Array.isArray(main) && main.length) {
				row = main[0];
			} else {
				const fb = await getFallbackVisitsCount.run();
				row = Array.isArray(fb) && fb.length ? fb[0] : null;
			}

			// helper numérico seguro
			const toNum = (v, def = 0) => {
				const n = Number(v);
				return Number.isFinite(n) ? n : def;
			};

			// 2) vacío → estado mínimo
			if (!row) {
				const empty = {
					planName: 'Sin bono',
					totalSlots: 0,
					currentVisits: 0,
					cycleStart: null,
					isVip: false,
					halfIssued: false,
					freeIssued: false,
					headerText: 'Cliente sin Bono y sin Visitas',
					slots: [],
					prize1: null, prize2: null,
					// extras opcionales
					remaining: null,
					nextTarget: null,
					progressPct: 0,
					status: 'empty',
				};
				await storeValue('visitsUI', empty);
				return empty;
			}

			// 3) normaliza datos base
			const isVipRaw = !!row.isVip;
			const totalSlots = Math.max(0, toNum(row.totalSlots, isVipRaw ? 4 : 10));
			const currentVisitsRaw = Math.max(0, toNum(row.currentVisits, 0));
			const currentVisits = Math.min(currentVisitsRaw, totalSlots || currentVisitsRaw); // clamp
			const halfIssued = !!row.halfIssued;
			const freeIssued = !!row.freeIssued;

			// slots clamped a totalSlots (si totalSlots==0, array vacío)
			const slots = Array.from({ length: Math.max(0, totalSlots) }, (_, i) => ({
				id: i + 1,
				value: i + 1,
				filled: i + 1 <= currentVisits,
			}));

			// 4) objetivos y mensajes
			let headerText = '';
			let prize1 = null, prize2 = null;
			let remaining = null;
			let nextTarget = null;
			let progressPct = 0;
			let status = 'in_progress';

			if (isVipRaw) {
				const target = 4;
				const completed = currentVisits >= target;
				prize1 = {
					text: `${target} para Servicio Gratis (VIP)`,
					completed
				};
				remaining = Math.max(0, target - currentVisits);
				nextTarget = completed ? null : target;
				headerText = completed
					? '¡Premio VIP listo para canjear!'
				: `VIP: ¡Solo ${remaining} visitas para el Gratis!`;
				progressPct = target > 0 ? Math.min(100, Math.round((currentVisits / target) * 100)) : 0;
				status = completed ? 'ready' : 'in_progress';
			} else {
				const target50 = 5, targetFree = 10;

				const halfDone = halfIssued || currentVisits >= target50;
				const freeDone = freeIssued || currentVisits >= targetFree;

				prize1 = { text: `${target50} para 50% de Descuento`, completed: halfDone };
				prize2 = { text: `${targetFree} para Servicio Gratis`, completed: freeDone };

				if (!halfDone) {
					remaining = Math.max(0, target50 - currentVisits);
					nextTarget = target50;
					headerText = `¡Solo ${remaining} para 50%!`;
					progressPct = Math.min(100, Math.round((currentVisits / target50) * 100));
					status = 'in_progress';
				} else if (!freeDone) {
					remaining = Math.max(0, targetFree - currentVisits);
					nextTarget = targetFree;
					headerText = `¡Solo ${remaining} para Gratis!`;
					progressPct = Math.min(100, Math.round((currentVisits / targetFree) * 100));
					status = 'half_ready';
				} else {
					remaining = 0;
					nextTarget = null;
					headerText = '¡Ambos premios listos para canjear!';
					progressPct = 100;
					status = 'ready';
				}
			}

			// 5) estado final
			const state = {
				...row,
				isVip: isVipRaw,
				totalSlots,
				currentVisits,
				halfIssued,
				freeIssued,
				slots,
				prize1,
				prize2,
				headerText,
				// extras útiles (no rompen nada si no los usas)
				remaining,
				nextTarget,
				progressPct,
				status,
			};

			await storeValue('visitsUI', state);
			return state;

		} catch (e) {
			console.error('visitsLogic.processData error:', e);
			const fallback = {
				planName: 'Error',
				totalSlots: 0,
				currentVisits: 0,
				cycleStart: null,
				isVip: false,
				halfIssued: false,
				freeIssued: false,
				headerText: 'Error de Carga',
				slots: [],
				prize1: null, prize2: null,
				remaining: null,
				nextTarget: null,
				progressPct: 0,
				status: 'error',
			};
			await storeValue('visitsUI', fallback);
			return fallback;
		}
	}
};
