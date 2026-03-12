function parseEventIds(value) {
  if (Array.isArray(value)) {
    return value.map(Number).filter(Boolean);
  }

  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed.map(Number).filter(Boolean) : [];
  } catch (error) {
    return [];
  }
}

function parseJson(value, fallback) {
  if (value == null) {
    return fallback;
  }

  if (typeof value === "object") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

function mapRegistrationRow(row, eventLookup) {
  const eventIds = parseEventIds(row.selected_event_ids);
  const events = eventIds
    .map((eventId) => eventLookup.get(eventId))
    .filter(Boolean);

  return {
    id: row.id,
    participantName: row.participant_name,
    teamName: row.team_name,
    collegeName: row.college_name,
    department: row.department,
    yearOfStudy: row.year_of_study,
    email: row.email,
    phone: row.phone,
    teamMembers: parseJson(row.team_members, []),
    selectedEventIds: eventIds,
    selectedEvents: events,
    teamSize: row.team_size,
    paymentMode: row.payment_mode,
    transactionId: row.transaction_id,
    paymentNotes: row.payment_notes,
    paymentProofUrl: row.payment_proof_path ? `/uploads/${row.payment_proof_path}` : null,
    status: row.status,
    adminNotes: row.admin_notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

module.exports = {
  parseEventIds,
  mapRegistrationRow,
};
