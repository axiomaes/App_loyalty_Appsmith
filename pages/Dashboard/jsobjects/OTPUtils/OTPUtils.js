export default {
  async sha256(str) {
    const enc = new TextEncoder();
    const buf = await crypto.subtle.digest("SHA-256", enc.encode(str));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,"0")).join("");
  },

  genCode(len = 6) {
    return Math.floor(Math.random() * 10**len).toString().padStart(len, "0");
  },

  async startOtp({ businessId, phone, ttlMin = 10 }) {
    const code = this.genCode(6);
    const codeHash = await this.sha256(code);
    storeValue("otp_phone", phone, false);
    storeValue("otp_hash", codeHash, false);
    storeValue("otp_code_plain", code, false); // solo para componer el mensaje a enviar por WhatsApp
    storeValue("otp_ttl_min", ttlMin, false);
    return { code, codeHash, ttlMin };
  },

  async checkOtp(inputCode, codeHashFromDb) {
    const hashInput = await this.sha256(inputCode.trim());
    return hashInput === codeHashFromDb;
  }
};
