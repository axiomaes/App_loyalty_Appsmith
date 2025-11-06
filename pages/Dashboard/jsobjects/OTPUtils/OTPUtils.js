export default {
  // ---- SHA-256 compatible con todos los entornos ----
  async sha256(str) {
    try {
      if (typeof window !== "undefined" && window.crypto?.subtle) {
        const encoder = new TextEncoder();
        const data = encoder.encode(str);
        const hashBuffer = await window.crypto.subtle.digest("SHA-256", data);
        return Array.from(new Uint8Array(hashBuffer))
          .map(b => b.toString(16).padStart(2, "0"))
          .join("");
      }
      if (typeof require !== "undefined") {
        const crypto = require("crypto");
        return crypto.createHash("sha256").update(String(str)).digest("hex");
      }
      throw new Error("SHA-256 no disponible en este entorno");
    } catch (e) {
      console.error("Error generando SHA-256:", e);
      throw e;
    }
  },

  // ---- Generador simple de código ----
  genCode(len = 6) {
    return Math.floor(Math.random() * 10 ** len)
      .toString()
      .padStart(len, "0");
  },

  // ---- Crear OTP y guardar tiempo de expiración ----
  async startOtp({ businessId, phone, ttlMin = 10 }) {
    const code = this.genCode(6);
    const codeHash = await this.sha256(code);

    const now = Date.now();
    const expiry = now + ttlMin * 60 * 1000; // milisegundos

    await storeValue("otp_phone", phone, false);
    await storeValue("otp_hash", codeHash, false);
    await storeValue("otp_code_plain", code, false);
    await storeValue("otp_ttl_min", ttlMin, false);
    await storeValue("otp_expiry_ts", expiry, false);
    await storeValue("otp_verified", false, false);

    return { code, codeHash, ttlMin, expiry };
  },

  // ---- Verificar OTP con chequeo de expiración ----
  async checkOtp(inputCode, codeHashFromDb) {
    if (!inputCode || !codeHashFromDb) return false;

    // 1. Verificar expiración
    const expiry = appsmith.store?.otp_expiry_ts;
    if (expiry && Date.now() > expiry) {
      showAlert("El código ha expirado. Solicita uno nuevo.", "warning");
      return false;
    }

    // 2. Verificar hash
    const hashInput = await this.sha256(inputCode.trim());
    return hashInput === codeHashFromDb;
  },

  // ---- Utilidad extra: limpiar OTP ----
  async clearOtp() {
    await storeValue("otp_phone", null);
    await storeValue("otp_hash", null);
    await storeValue("otp_code_plain", null);
    await storeValue("otp_ttl_min", null);
    await storeValue("otp_expiry_ts", null);
    await storeValue("otp_verified", false);
  }
};
