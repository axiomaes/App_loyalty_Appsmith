export default {
  async runChange() {
    const userId = appsmith.store.userId;
    const businessId = Auth.businessId();
    const current = InputPassActual.text || "";
    const next1   = InputPassNueva.text || "";
    const next2   = InputPassNueva2.text || "";

    if (!userId || !businessId) {
      showAlert("Sesión inválida. Vuelve a iniciar sesión.", "error");
      return;
    }
    if (!current || !next1 || !next2) {
      showAlert("Completa todos los campos.", "warning");
      return;
    }
    if (next1 !== next2) {
      showAlert("Las contraseñas nuevas no coinciden.", "warning");
      return;
    }
    if (next1.length < 8) {
      showAlert("La nueva contraseña debe tener al menos 8 caracteres.", "warning");
      return;
    }

    // 1) Verificar contraseña actual
    const ok = await q_verify_password.run({ currentPassword: current });
    if (!ok || !ok.length) {
      showAlert("La contraseña actual no es correcta.", "error");
      return;
    }

    // 2) Actualizar contraseña
    const upd = await q_change_password.run({ newPassword: next1 });

    // 3) Feedback
    const u = upd && upd[0];
    showAlert(`Contraseña actualizada para ${u?.email || "tu usuario"}`, "success");

    // Limpia inputs
    resetWidget("InputPassActual", true);
    resetWidget("InputPassNueva", true);
    resetWidget("InputPassNueva2", true);
    closeModal("ModalCambiarPassword");
  }
};
