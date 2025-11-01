export default {
  login: async () => {
    const data = await q_find_business_by_email.run();

    if (!data || !data.length) {
      showAlert("Correo no encontrado", "warning");
      return;
    }

    const user = data[0];

    await Auth.setSession({
      userId: user.user_id,
      role: user.user_role,
      email: user.user_email,
      businessId: user.business_id,
      businessName: user.business_name
    });

    showAlert(`Bienvenido a ${user.business_name}`, "success");
    navigateTo("Dashboard");
  }
};
