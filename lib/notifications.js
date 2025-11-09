async function sendAppointmentReminder(appointment, type) {
  console.warn(
    "⚠️ Notification service not implemented. Appointment:",
    appointment?.id,
    "Type:",
    type
  );
  return { success: false };
}

module.exports = {
  sendAppointmentReminder
};

