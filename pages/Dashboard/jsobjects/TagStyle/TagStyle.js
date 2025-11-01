export default {
  // etiqueta legible
  pretty(tag) {
    const t = String(tag || "").toUpperCase();
    const map = {
      BONO_VIP_A: "Bono VIP A",
      BONO_VIP_B: "Bono VIP B",
      BONO_VIP_C: "Bono VIP C",
      BONO_TARJETA: "Bono Tarjeta",
      BONO_FAMILIA: "Bono Familia",
      ESPORADICO: "Esporádico",
    };
    return map[t] || "—";
  },

  // colores solicitados
  fg(tag) { // color de texto
    const t = String(tag || "");
    return /VIP/i.test(t) ? "#ffffff" : "#000000"; // VIP = blanco, resto = negro
  },

  bg(tag) { // color de fondo
    const t = String(tag || "");
    return /VIP/i.test(t) ? "#3B82F6" : "#ffffff"; // VIP = azul, resto = blanco
  },

  // ¿es cliente VIP? (cubre cualquier tag que contenga "VIP")
  isVip(tag) {
    return /VIP/i.test(String(tag || ""));
  }
};
