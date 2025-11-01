export default {
  async processData() {
    try {
      let row = null;
      const main = getClientVisitsQuery.data;
      if (Array.isArray(main) && main.length) {
        row = main[0];
      } else {
        const fb = await getFallbackVisitsCount.run();
        row = Array.isArray(fb) && fb.length ? fb[0] : null;
      }

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
        };
        await storeValue('visitsUI', empty);
        return empty;
      }

      const isVip = !!row.isVip;
      const totalSlots = Number(row.totalSlots || (isVip ? 4 : 10));
      const currentVisits = Number(row.currentVisits || 0);
      const halfIssued = !!row.halfIssued;
      const freeIssued = !!row.freeIssued;

      const slots = Array.from({ length: totalSlots }, (_, i) => ({
        id: i + 1,
        value: i + 1,
        filled: i + 1 <= currentVisits,
      }));

      let headerText = '';
      let prize1 = null, prize2 = null;

      if (isVip) {
        const target = 4;
        prize1 = {
          text: `${target} para Servicio Gratis (VIP)`,
          completed: currentVisits >= target
        };
        headerText = currentVisits < target
          ? `VIP: ¡Solo ${target - currentVisits} visitas para el Gratis!`
          : '¡Premio VIP listo para canjear!';
      } else {
        const target50 = 5, targetFree = 10;

        // "Completado" si YA hay reward emitida en el ciclo o si el conteo ya alcanzó
        const halfDone = halfIssued || currentVisits >= target50;
        const freeDone = freeIssued || currentVisits >= targetFree;

        prize1 = { text: `${target50} para 50% de Descuento`, completed: halfDone };
        prize2 = { text: `${targetFree} para Servicio Gratis`, completed: freeDone };

        if (!halfDone)       headerText = `¡Solo ${target50 - currentVisits} para 50%!`;
        else if (!freeDone)  headerText = `¡Solo ${targetFree - currentVisits} para Gratis!`;
        else                 headerText = '¡Ambos premios listos para canjear!';
      }

      const state = {
        ...row,
        isVip,
        totalSlots,
        currentVisits,
        halfIssued,
        freeIssued,
        slots,
        prize1,
        prize2,
        headerText,
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
      };
      await storeValue('visitsUI', fallback);
      return fallback;
    }
  }
};
