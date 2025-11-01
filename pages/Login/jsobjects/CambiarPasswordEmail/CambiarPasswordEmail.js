export default {
  async run() {
    const email   = (InputEmail.text || "").trim();
    const current = InputPassActual.text || "";
    const next1   = InputPassNueva.text || "";
    const next2   = InputPassNueva2.text || "";

    if (!email || !current || !next1 || !next2) { showAlert("Completa todos los campos.", "warning"); return; }
    if (next1 !== next2) { showAlert("Las contraseñas nuevas no coinciden.", "warning"); return; }
    if (next1.length < 8) { showAlert("La nueva contraseña debe tener al menos 8 caracteres.", "warning"); return; }

    const ok = await q_verify_password_by_email.run({ email, currentPassword: current });
    if (!ok || !ok.length) { showAlert("La contraseña actual o el email no coinciden.", "error"); return; }

    const upd = await q_change_password_by_email.run({ email, newPassword: next1 });
    showAlert(`Contraseña actualizada para ${upd?.[0]?.email || email}`, "success");

    resetWidget("InputEmail", true);
    resetWidget("InputPassActual", true);
    resetWidget("InputPassNueva", true);
    resetWidget("InputPassNueva2", true);
    closeModal("ModalCambiarPassword");
  }
};
