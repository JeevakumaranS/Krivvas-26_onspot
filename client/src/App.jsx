import { useEffect, useState } from "react";
import {
  BrowserRouter,
  Link,
  useLocation,
  NavLink,
  Navigate,
  Outlet,
  Route,
  Routes,
  useNavigate,
  useOutletContext,
} from "react-router-dom";
import api, { setAdminToken } from "./api";

const emptyEventForm = {
  title: "",
  description: "",
  venue: "",
  fee: "",
  isTeamEvent: false,
  minTeamMembers: "",
  maxTeamMembers: "",
  isActive: true,
};

function getAdminUsernameFromToken(token) {
  if (!token) {
    return "";
  }

  try {
    const payload = JSON.parse(window.atob(token.split(".")[1]));
    return payload.username || "";
  } catch {
    return "";
  }
}

function AppShell() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<PublicEventsPage />} />
        <Route path="/register" element={<PublicParticipantPage />} />
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route path="/admin" element={<AdminRouteGate />} />
        <Route path="/admin" element={<AdminLayout />}>
          <Route path="overview" element={<AdminOverviewPage />} />
          <Route path="events" element={<AdminEventsPage />} />
          <Route path="counts" element={<AdminCountsPage />} />
          <Route path="participants" element={<AdminParticipantsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

function PublicEventsPage() {
  const [events, setEvents] = useState([]);
  const [previewEvent, setPreviewEvent] = useState(null);
  const [eventSearchTerm, setEventSearchTerm] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    api.get("/public/events").then((response) => setEvents(response.data));
  }, []);

  function continueToRegistration() {
    if (!previewEvent) {
      return;
    }

    sessionStorage.setItem("onspot-selected-event-id", String(previewEvent.id));
    navigate("/register", { state: { eventId: previewEvent.id } });
  }

  const filteredEvents = events.filter((item) => {
    const query = eventSearchTerm.trim().toLowerCase();

    if (!query) {
      return true;
    }

    return item.title.toLowerCase().includes(query) || (item.venue || "").toLowerCase().includes(query);
  });

  return (
    <div className="page">
      <section className="hero">
        <div>
          <p className="eyebrow"> On-Spot Registration</p>
          <h1>KRIVVAS'26</h1>
          {/* <p className="hero-copy">
            Share this public link at the venue. Participants first choose an event, view its details, and then continue to a separate participant form.
          </p> */}
          <div className="hero-actions">
            <a href="#event-selection" className="primary-btn">
              Choose Event
            </a>
            {/* <Link to="/admin/login" className="ghost-btn">
              Admin Panel
            </Link> */}
          </div>
        </div>
        <div className="hero-panel">
          <h2>Registration Desk</h2>
          <div className="mini-stats">
            <div>
              <strong>{events.length}</strong>
              <span>Open events</span>
            </div>
            {/* <div>
              <strong>{events.filter((item) => Number(item.fee) === 0).length}</strong>
              <span>Free entries</span>
            </div> */}
          </div>
          <p className="panel-note">Keep the queue moving with one compact form for event selection and participant details.</p>
        </div>
      </section>

      <section className="section" id="event-selection">
        <div className="section-head">
          <div>
            <p className="eyebrow">Step 1</p>
            <h2>Select an event</h2>
          </div>
          <div className="search-bar event-search">
            <input
              value={eventSearchTerm}
              onChange={(event) => setEventSearchTerm(event.target.value)}
              placeholder="Search by event name or venue"
            />
          </div>
        </div>
        <div className="card-grid">
          {filteredEvents.map((item) => (
            <button
              key={item.id}
              type="button"
              className="event-card"
              onClick={() => setPreviewEvent(item)}
            >
              <span className="tag">Symposium Event</span>
              <h3>{item.title}</h3>
              <div className="event-meta">
                <span>{item.venue}</span>
                <span>{item.isTeamEvent ? `Rs. ${item.fee} per member` : `Rs. ${item.fee}`}</span>
                {item.isTeamEvent ? <span>Team size: {item.minTeamMembers} to {item.maxTeamMembers}</span> : null}
              </div>
            </button>
          ))}
        </div>
        {filteredEvents.length === 0 ? <p className="registration-meta">No events matched your search.</p> : null}
      </section>

      {previewEvent ? (
        <div className="modal-backdrop" onClick={() => setPreviewEvent(null)}>
          <div className="event-modal" onClick={(event) => event.stopPropagation()}>
            <p className="eyebrow">Event Details</p>
            <h2>{previewEvent.title}</h2>
            <p className="registration-meta">{previewEvent.description || "No description provided for this event."}</p>
            <div className="event-meta modal-meta">
              <span>Venue: {previewEvent.venue || "Venue TBA"}</span>
              <span>{previewEvent.isTeamEvent ? `Fee: Rs. ${previewEvent.fee} per member` : `Fee: Rs. ${previewEvent.fee}`}</span>
              {previewEvent.isTeamEvent ? (
                <span>Team size: {previewEvent.minTeamMembers} to {previewEvent.maxTeamMembers}</span>
              ) : null}
            </div>
            <div className="hero-actions">
              <button type="button" className="primary-btn" onClick={continueToRegistration}>
                Continue
              </button>
              <button type="button" className="ghost-btn" onClick={() => setPreviewEvent(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PublicParticipantPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [form, setForm] = useState({
    participantName: "",
    teamName: "",
    collegeName: "",
    department: "",
    phone: "",
    teamSize: "",
  });
  const [teamMembers, setTeamMembers] = useState([]);

  useEffect(() => {
    api.get("/public/events").then((response) => setEvents(response.data));
  }, []);

  const selectedEventId = Number(location.state?.eventId || sessionStorage.getItem("onspot-selected-event-id") || 0);
  const selectedEvent = events.find((item) => item.id === selectedEventId);
  const minTeamSize = Number(selectedEvent?.minTeamMembers || 1);
  const maxTeamSize = Number(selectedEvent?.maxTeamMembers || minTeamSize);
  const parsedTeamSize = Number(form.teamSize || 0);
  const normalizedTeamSize =
    selectedEvent?.isTeamEvent && parsedTeamSize
      ? Math.min(Math.max(parsedTeamSize, minTeamSize), maxTeamSize)
      : selectedEvent?.isTeamEvent
        ? minTeamSize
        : selectedEvent
          ? 1
          : 0;
  const effectiveTeamSize = selectedEvent?.isTeamEvent ? normalizedTeamSize : selectedEvent ? 1 : 0;
  const totalFee = Number(selectedEvent?.fee || 0) * (effectiveTeamSize || 0);

  useEffect(() => {
    if (!selectedEvent?.isTeamEvent) {
      return;
    }

    setForm((current) => {
      const parsedSize = Number(current.teamSize || 0);

      if (!parsedSize) {
        return { ...current, teamSize: String(minTeamSize) };
      }

      if (parsedSize < minTeamSize) {
        return { ...current, teamSize: String(minTeamSize) };
      }

      if (parsedSize > maxTeamSize) {
        return { ...current, teamSize: String(maxTeamSize) };
      }

      return current;
    });
  }, [selectedEvent?.isTeamEvent, minTeamSize, maxTeamSize]);

  useEffect(() => {
    if (!selectedEvent?.isTeamEvent) {
      setTeamMembers([]);
      return;
    }

    const memberCount = Math.max(normalizedTeamSize - 1, 0);
    setTeamMembers((current) =>
      Array.from({ length: memberCount }, (_, index) => ({
        name: current[index]?.name || "",
        phone: current[index]?.phone || "",
        collegeName: current[index]?.sameAsParticipant1 ? form.collegeName : current[index]?.collegeName || "",
        department: current[index]?.sameAsParticipant1 ? form.department : current[index]?.department || "",
        sameAsParticipant1: current[index]?.sameAsParticipant1 ?? true,
      }))
    );
  }, [normalizedTeamSize, selectedEvent?.isTeamEvent, form.collegeName, form.department]);

  function updateTeamMember(index, updates) {
    setTeamMembers((current) =>
      current.map((member, memberIndex) => {
        if (memberIndex !== index) {
          return member;
        }

        const nextMember = { ...member, ...updates };

        if (nextMember.sameAsParticipant1) {
          nextMember.collegeName = form.collegeName;
          nextMember.department = form.department;
        }

        return nextMember;
      })
    );
  }

  function normalizePhoneInput(value) {
    return value.replace(/\D/g, "").slice(0, 10);
  }

  function handleTeamSizeChange(event) {
    const rawValue = event.target.value;

    if (!rawValue) {
      setForm((current) => ({ ...current, teamSize: "" }));
      return;
    }

    setForm((current) => ({
      ...current,
      teamSize: rawValue,
    }));
  }

  function handleTeamSizeBlur() {
    setForm((current) => {
      const nextSize = Number(current.teamSize || 0);

      if (!nextSize) {
        return { ...current, teamSize: String(minTeamSize) };
      }

      const boundedSize = Math.min(Math.max(nextSize, minTeamSize), maxTeamSize);
      return { ...current, teamSize: String(boundedSize) };
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");
    setSuccessMessage("");

    const payload = new FormData();
    Object.entries(form).forEach(([key, value]) => payload.append(key, value));
    payload.append("selectedEventIds", JSON.stringify(selectedEvent ? [selectedEvent.id] : []));
    payload.append(
      "teamMembers",
      JSON.stringify(
        teamMembers.map((member) => ({
          name: member.name,
          phone: member.phone,
          collegeName: member.sameAsParticipant1 ? form.collegeName : member.collegeName,
          department: member.sameAsParticipant1 ? form.department : member.department,
        }))
      )
    );

    try {
      const response = await api.post("/public/register", payload);
      sessionStorage.removeItem("onspot-selected-event-id");
      setSuccessMessage(
        `Registration submitted successfully. Your registration ID is ${response.data.registrationId}. Please proceed to the payment desk now and complete the payment verification process to confirm your entry.`
      );
      setForm({
        participantName: "",
        teamName: "",
        collegeName: "",
        department: "",
        phone: "",
        teamSize: "",
      });
      setTeamMembers([]);
    } catch (error) {
      setMessage(error.response?.data?.message || "Registration failed.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!selectedEventId) {
    return <Navigate to="/" replace />;
  }

  if (!selectedEvent && events.length > 0) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="page">
      <section className="section">
        <div className="section-head">
          <div>
            <p className="eyebrow">Step 2</p>
            <h2>Enter participant details</h2>
          </div>
          <button type="button" className="ghost-btn" onClick={() => navigate("/")}>
            Back to Events
          </button>
        </div>
        {selectedEvent ? (
          <div className="selected-event-banner">
            <strong>{selectedEvent.title}</strong>
            <span>{selectedEvent.isTeamEvent ? `Rs. ${selectedEvent.fee} per member` : `Rs. ${selectedEvent.fee}`}</span>
          </div>
        ) : null}
        <form className="registration-form" onSubmit={handleSubmit}>
          {selectedEvent?.isTeamEvent ? (
            <div className="input-grid">
              <label>
                Team Name
                <input
                  required
                  value={form.teamName}
                  onChange={(event) => setForm({ ...form, teamName: event.target.value })}
                />
              </label>
              <label>
                Team Size
                <input
                  type="number"
                  min={minTeamSize}
                  max={maxTeamSize}
                  required
                  value={form.teamSize}
                  onChange={handleTeamSizeChange}
                  onBlur={handleTeamSizeBlur}
                />
                <span className="field-hint">Allowed team size: {minTeamSize} to {maxTeamSize}</span>
              </label>
            </div>
          ) : null}
          <div className="input-grid">
            <label>
              Participant 1 Name
              <input
                required
                value={form.participantName}
                onChange={(event) => setForm({ ...form, participantName: event.target.value })}
              />
            </label>
            <label>
              College Name
              <input required value={form.collegeName} onChange={(event) => setForm({ ...form, collegeName: event.target.value })} />
            </label>
            <label>
              Department
              <input required value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })} />
            </label>
            <label>
              Mobile Number
              <input
                required
                inputMode="numeric"
                pattern="\d{10}"
                maxLength={10}
                value={form.phone}
                onChange={(event) => setForm({ ...form, phone: normalizePhoneInput(event.target.value) })}
              />
            </label>
          </div>
          {selectedEvent?.isTeamEvent && teamMembers.length > 0 ? (
            <div className="team-members-section">
              <div className="section-head">
                <div>
                  <p className="eyebrow">Team Members</p>
                  <h2>Additional members</h2>
                </div>
              </div>
              <div className="team-member-stack">
                {teamMembers.map((member, index) => (
                  <div className="team-member-card" key={`team-member-${index}`}>
                    <div className="section-head">
                      <div>
                        <p className="eyebrow">Participant {index + 2}</p>
                      </div>
                      <button
                        type="button"
                        className="ghost-btn"
                        onClick={() =>
                          updateTeamMember(index, {
                            sameAsParticipant1: !member.sameAsParticipant1,
                            collegeName: !member.sameAsParticipant1 ? form.collegeName : member.collegeName,
                            department: !member.sameAsParticipant1 ? form.department : member.department,
                          })
                        }
                      >
                        {member.sameAsParticipant1 ? "Use custom college/dept" : "Same as participant 1"}
                      </button>
                    </div>
                    <div className="input-grid">
                      <label>
                        Name
                        <input required value={member.name} onChange={(event) => updateTeamMember(index, { name: event.target.value })} />
                      </label>
                      <label>
                        Mobile Number
                        <input
                          required
                          inputMode="numeric"
                          pattern="\d{10}"
                          maxLength={10}
                          value={member.phone}
                          onChange={(event) => updateTeamMember(index, { phone: normalizePhoneInput(event.target.value) })}
                        />
                      </label>
                      <label>
                        College Name
                        <input
                          required
                          disabled={member.sameAsParticipant1}
                          value={member.sameAsParticipant1 ? form.collegeName : member.collegeName}
                          onChange={(event) => updateTeamMember(index, { collegeName: event.target.value })}
                        />
                      </label>
                      <label>
                        Department
                        <input
                          required
                          disabled={member.sameAsParticipant1}
                          value={member.sameAsParticipant1 ? form.department : member.department}
                          onChange={(event) => updateTeamMember(index, { department: event.target.value })}
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <div className="form-footer">
            <div>
              <strong>{selectedEvent ? selectedEvent.title : "Selected event"}</strong>
              <span>
                {selectedEvent
                  ? selectedEvent.isTeamEvent
                    ? `${effectiveTeamSize || 0} x Rs. ${selectedEvent.fee} = Rs. ${totalFee}`
                    : `Rs. ${selectedEvent.fee}`
                  : ""}
              </span>
            </div>
            <button
              type="submit"
              className="primary-btn"
              disabled={submitting || !selectedEvent || (selectedEvent.isTeamEvent && !form.teamSize)}
            >
              {submitting ? "Submitting..." : "Submit Registration"}
            </button>
          </div>
          {message ? <p className="form-message">{message}</p> : null}
        </form>
      </section>
      {successMessage ? (
        <div
          className="modal-backdrop"
          onClick={() => {
            setSuccessMessage("");
            navigate("/", { replace: true });
          }}
        >
          <div className="event-modal success-modal" onClick={(event) => event.stopPropagation()}>
            <p className="eyebrow">Registration Complete</p>
            <h2>Registration Submitted</h2>
            <p className="registration-meta">{successMessage}</p>
            <div className="hero-actions">
              <button
                type="button"
                className="primary-btn"
                onClick={() => {
                  setSuccessMessage("");
                  navigate("/", { replace: true });
                }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AdminRouteGate() {
  const token = localStorage.getItem("onspot-admin-token");
  return <Navigate to={token ? "/admin/overview" : "/admin/login"} replace />;
}

function AdminLoginPage() {
  const navigate = useNavigate();
  const token = localStorage.getItem("onspot-admin-token");
  const [credentials, setCredentials] = useState({ username: "admin", password: "admin123" });
  const [loginError, setLoginError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (token) {
      navigate("/admin/overview", { replace: true });
    }
  }, [navigate, token]);

  async function handleLogin(event) {
    event.preventDefault();
    setLoginError("");

    try {
      const response = await api.post("/admin/login", credentials);
      localStorage.setItem("onspot-admin-token", response.data.token);
      localStorage.setItem("onspot-admin-username", response.data.admin.username);
      navigate("/admin/overview", { replace: true });
    } catch (error) {
      setLoginError(error.response?.data?.message || "Login failed.");
    }
  }

  return (
    <div className="admin-login-page">
      <div className="login-card">
        <p className="eyebrow">Secure Admin Access</p>
        <h1>Admin Panel</h1>
        <p>Use the seeded credentials initially, then change them in the backend environment before deployment.</p>
        <form onSubmit={handleLogin} className="login-form">
          <label>
            Username
            <input value={credentials.username} onChange={(event) => setCredentials({ ...credentials, username: event.target.value })} />
          </label>
          <label>
            Password
            <div className="password-field">
              <input
                type={showPassword ? "text" : "password"}
                value={credentials.password}
                onChange={(event) => setCredentials({ ...credentials, password: event.target.value })}
              />
              <button type="button" className="ghost-btn password-toggle-btn" onClick={() => setShowPassword((current) => !current)}>
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </label>
          <button type="submit" className="primary-btn">
            Login
          </button>
          {loginError ? <p className="form-message">{loginError}</p> : null}
        </form>
        <Link to="/" className="ghost-btn full-width">
          Back to Registration
        </Link>
      </div>
    </div>
  );
}

function AdminLayout() {
  const navigate = useNavigate();
  const [sidebarHidden, setSidebarHidden] = useState(false);
  const [dashboard, setDashboard] = useState(null);
  const [events, setEvents] = useState([]);
  const [registrations, setRegistrations] = useState([]);
  const [eventForm, setEventForm] = useState(emptyEventForm);
  const [editingEventId, setEditingEventId] = useState(null);
  const storedToken = localStorage.getItem("onspot-admin-token") || "";
  const adminUsername = localStorage.getItem("onspot-admin-username") || getAdminUsernameFromToken(storedToken);

  async function loadAdminData() {
    const [dashboardResponse, eventsResponse, registrationsResponse] = await Promise.all([
      api.get("/admin/dashboard"),
      api.get("/admin/events"),
      api.get("/admin/registrations"),
    ]);
    setDashboard(dashboardResponse.data);
    setEvents(eventsResponse.data);
    setRegistrations(registrationsResponse.data);
  }

  function logout() {
    localStorage.removeItem("onspot-admin-token");
    localStorage.removeItem("onspot-admin-username");
    setAdminToken("");
    navigate("/admin/login", { replace: true });
  }

  useEffect(() => {
    if (!storedToken) {
      navigate("/admin/login", { replace: true });
      return;
    }

    setAdminToken(storedToken);
    localStorage.setItem("onspot-admin-username", adminUsername);

    (async () => {
      try {
        await loadAdminData();
      } catch {
        localStorage.removeItem("onspot-admin-token");
        setAdminToken("");
        navigate("/admin/login", { replace: true });
      }
    })();
  }, [adminUsername, navigate, storedToken]);

  async function handleEventSubmit(event) {
    event.preventDefault();

    if (editingEventId) {
      await api.put(`/admin/events/${editingEventId}`, eventForm);
    } else {
      await api.post("/admin/events", eventForm);
    }

    setEventForm(emptyEventForm);
    setEditingEventId(null);
    await loadAdminData();
  }

  async function deleteEvent(id) {
    await api.delete(`/admin/events/${id}`);
    await loadAdminData();
  }

  function startEditEvent(event) {
    setEditingEventId(event.id);
    setEventForm({
      title: event.title,
      description: event.description || "",
      venue: event.venue || "",
      fee: event.fee || "",
      isTeamEvent: event.isTeamEvent,
      minTeamMembers: event.minTeamMembers || "",
      maxTeamMembers: event.maxTeamMembers || "",
      isActive: event.isActive,
    });
    navigate("/admin/events");
  }

  function resetEventForm() {
    setEditingEventId(null);
    setEventForm(emptyEventForm);
  }

  async function updateRegistrationStatus(id, status, review = {}) {
    await api.patch(`/admin/registrations/${id}/status`, {
      status,
      paymentMode: review.paymentMode || "",
      transactionId: review.transactionId || "",
      adminNotes: status === "approved" ? "Payment verified by admin." : status === "rejected" ? "Registration rejected during verification." : "",
    });
    await loadAdminData();
  }

  async function deleteRegistration(id) {
    await api.delete(`/admin/registrations/${id}`);
    await loadAdminData();
  }

  async function exportData(mode) {
    const response = await fetch(`/api/admin/export?mode=${mode}`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem("onspot-admin-token") || ""}`,
      },
    });

    if (!response.ok) {
      throw new Error("Export failed.");
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = mode === "approved" ? "approved-registrations.xlsx" : "all-registrations.xlsx";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className={`admin-shell ${sidebarHidden ? "sidebar-collapsed" : ""}`}>
      <aside className={`admin-sidebar ${sidebarHidden ? "hidden" : ""}`}>
        <div className="sidebar-brand" onClick={() => setSidebarHidden((current) => !current)} role="button" tabIndex="0" onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSidebarHidden((current) => !current); }}>
          <p className="eyebrow">Krivvas Control Room</p>
          <h1>{adminUsername || "Admin"}</h1>
        </div>
        <nav className="sidebar-nav">
          <NavLink to="/admin/overview" className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`}>
            Overview
          </NavLink>
          <NavLink to="/admin/events" className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`}>
            Events
          </NavLink>
          <NavLink to="/admin/counts" className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`}>
            Event Counts
          </NavLink>
          <NavLink to="/admin/participants" className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`}>
            Participants
          </NavLink>
        </nav>
        <div className="sidebar-actions">
          <button type="button" className="ghost-btn full-width" onClick={() => exportData("approved").catch(() => logout())}>
            Export Approved Only
          </button>
          <button type="button" className="ghost-btn full-width" onClick={() => exportData("all").catch(() => logout())}>
            Export All Data
          </button>
          <button type="button" className="primary-btn full-width" onClick={logout}>
            Logout
          </button>
        </div>
      </aside>

      <main className="admin-main">
        {sidebarHidden && (
          <button type="button" className="sidebar-toggle-btn" onClick={() => setSidebarHidden(false)} title="Show Sidebar">
            ☰
          </button>
        )}
        <Outlet
          context={{
            dashboard,
            events,
            registrations,
            eventForm,
            editingEventId,
            setEventForm,
            handleEventSubmit,
            deleteEvent,
            startEditEvent,
            resetEventForm,
            updateRegistrationStatus,
            deleteRegistration,
            adminUsername,
            reload: loadAdminData,
          }}
        />
      </main>
    </div>
  );
}

function AdminOverviewPage() {
  const { dashboard, events, registrations } = useAdminContext();

  return (
    <div className="admin-page">
      <PageHeader
        eyebrow="Admin Dashboard"
        title="Overview"
      />

      <section className="stats-grid">
        <StatCard label="Total Registrations" value={dashboard?.totals.totalParticipants || 0} />
        <StatCard label="Pending Verification" value={dashboard?.totals.pendingPayments || 0} />
        <StatCard label="Approved" value={dashboard?.totals.approvedCount || 0} />
        <StatCard label="Rejected" value={dashboard?.totals.rejectedCount || 0} />
      </section>

      <section className="admin-grid">
        <div className="table-card">
          <div className="section-head">
            <div>
              <p className="eyebrow">Live Summary</p>
              <h2>Registration snapshot</h2>
            </div>
          </div>
          <div className="overview-stack">
            <OverviewMetric label="Configured events" value={events.length} />
            <OverviewMetric label="Participants in queue" value={registrations.filter((item) => item.status === "pending").length} />
            <OverviewMetric label="Reviewed registrations" value={registrations.filter((item) => item.status !== "pending").length} />
          </div>
        </div>

        <div className="table-card">
          <div className="section-head">
            <div>
              <p className="eyebrow">Recent Registrations</p>
              <h2>Latest participants</h2>
            </div>
          </div>
          <div className="list-stack">
            {registrations.slice(0, 5).map((registration) => (
              <div className="list-row compact" key={registration.id}>
                <div>
                  <strong>{registration.participantName}</strong>
                  <p>{registration.selectedEvents.map((event) => event.title).join(", ")}</p>
                </div>
                <span className={`status status-${registration.status}`}>{registration.status}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function AdminEventsPage() {
  const { events, eventForm, editingEventId, setEventForm, handleEventSubmit, deleteEvent, startEditEvent, resetEventForm } =
    useAdminContext();

  return (
    <div className="admin-page">
      <PageHeader
        eyebrow="Admin Dashboard"
        title="Events"
        description="Create, update, activate, or remove symposium events from a dedicated management page."
      />

      <section className="admin-grid">
        <div className="admin-panel">
          <div className="section-head">
            <div>
              <p className="eyebrow">Event Editor</p>
              <h2>{editingEventId ? "Edit event" : "Create event"}</h2>
            </div>
          </div>
          <form className="registration-form" onSubmit={handleEventSubmit}>
            <div className="input-grid">
              <label>
                Event Name
                <input required value={eventForm.title} onChange={(event) => setEventForm({ ...eventForm, title: event.target.value })} />
              </label>
              <label>
                Venue
                <input value={eventForm.venue} onChange={(event) => setEventForm({ ...eventForm, venue: event.target.value })} />
              </label>
              <label>
                Fee Per Member
                <input type="number" min="0" value={eventForm.fee} onChange={(event) => setEventForm({ ...eventForm, fee: event.target.value })} />
              </label>
              <label className="checkbox-field">
                <input type="checkbox" checked={eventForm.isTeamEvent} onChange={(event) => setEventForm({ ...eventForm, isTeamEvent: event.target.checked })} />
                Team event
              </label>
              {eventForm.isTeamEvent ? (
                <>
                  <label>
                    Minimum Team Members
                    <input
                      type="number"
                      min="2"
                      required
                      value={eventForm.minTeamMembers}
                      onChange={(event) => setEventForm({ ...eventForm, minTeamMembers: event.target.value })}
                    />
                  </label>
                  <label>
                    Maximum Team Members
                    <input
                      type="number"
                      min="2"
                      required
                      value={eventForm.maxTeamMembers}
                      onChange={(event) => setEventForm({ ...eventForm, maxTeamMembers: event.target.value })}
                    />
                  </label>
                </>
              ) : null}
              <label className="checkbox-field">
                <input type="checkbox" checked={eventForm.isActive} onChange={(event) => setEventForm({ ...eventForm, isActive: event.target.checked })} />
                Active event
              </label>
            </div>
            <label>
              Description
              <textarea rows="4" value={eventForm.description} onChange={(event) => setEventForm({ ...eventForm, description: event.target.value })} />
            </label>
            <div className="hero-actions">
              <button type="submit" className="primary-btn">
                {editingEventId ? "Save Changes" : "Create Event"}
              </button>
              <button type="button" className="ghost-btn" onClick={resetEventForm}>
                Reset
              </button>
            </div>
          </form>
        </div>

        <div className="table-card">
          <div className="section-head">
            <div>
              <p className="eyebrow">Configured Events</p>
              <h2>Current event list</h2>
            </div>
          </div>
          <div className="list-stack">
            {events.map((event) => (
              <div className="list-row" key={event.id}>
                <div>
                  <strong>{event.title}</strong>
                  <p>
                    {event.venue || "Venue TBA"}
                  </p>
                  <p>
                    {event.isTeamEvent
                      ? `Team event | ${event.minTeamMembers}-${event.maxTeamMembers} members | Rs. ${event.fee} per member`
                      : `Individual event | Rs. ${event.fee}`}
                  </p>
                </div>
                <div className="row-actions">
                  <button type="button" className="ghost-btn" onClick={() => startEditEvent(event)}>
                    Edit
                  </button>
                  <button type="button" className="danger-btn" onClick={() => deleteEvent(event.id)}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function AdminCountsPage() {
  const { dashboard } = useAdminContext();

  return (
    <div className="admin-page">
      <PageHeader
        eyebrow="Admin Dashboard"
        title="Event Counts"
        description="Track event-wise registrations to understand which sessions are filling up fastest."
      />

      <section className="table-card">
        <div className="list-stack">
          {dashboard?.eventCounts.map((event) => (
            <div className="list-row compact" key={event.id}>
              <div>
                <strong>{event.title}</strong>
                <p>Live registration count</p>
              </div>
              <span className="count-pill">{event.registrations} registrations</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function AdminParticipantsPage() {
  const { registrations, updateRegistrationStatus, deleteRegistration, adminUsername, reload } = useAdminContext();
  const [reviewState, setReviewState] = useState({});
  const [actionMessage, setActionMessage] = useState("");
  const [reviewErrors, setReviewErrors] = useState({});
  const [searchTerm, setSearchTerm] = useState("");

  const filteredRegistrations = registrations.filter((registration) => {
    const query = searchTerm.trim().toLowerCase();

    if (!query) {
      return true;
    }

    return (
      registration.participantName.toLowerCase().includes(query) ||
      registration.phone.toLowerCase().includes(query)
    );
  });

  async function handleStatusChange(registration, status) {
    setActionMessage("");
    setReviewErrors((current) => ({ ...current, [registration.id]: "" }));

    const draft = reviewState[registration.id] || {
      paymentMode: "",
      transactionId: "",
    };

    try {
      await updateRegistrationStatus(registration.id, status, {
        paymentMode: draft.paymentMode,
        transactionId: draft.transactionId,
      });
      setActionMessage(`Updated ${registration.participantName} to ${status}.`);
      setReviewErrors((current) => ({ ...current, [registration.id]: "" }));
    } catch (error) {
      setReviewErrors((current) => ({
        ...current,
        [registration.id]: error.response?.data?.message || "Could not update registration.",
      }));
    }
  }

  async function handleRefresh() {
    setActionMessage("");

    try {
      await reload();
      setActionMessage("Participants refreshed.");
    } catch (error) {
      setActionMessage(error.response?.data?.message || "Refresh failed.");
    }
  }

  async function handleDelete(registration) {
    setActionMessage("");
    setReviewErrors((current) => ({ ...current, [registration.id]: "" }));

    try {
      await deleteRegistration(registration.id);
      setActionMessage(`Removed ${registration.participantName}.`);
    } catch (error) {
      setReviewErrors((current) => ({
        ...current,
        [registration.id]: error.response?.data?.message || "Could not remove registration.",
      }));
    }
  }

  return (
    <div className="admin-page">
      <PageHeader
        eyebrow="Admin Dashboard"
        title="Participants"
        //description="Review participant details and accept, reject, or hold registrations from a single page."
      />

      <section className="table-card">
        <div className="section-head">
          <div>
            <p className="eyebrow">Participant Review</p>
            <h2></h2>
          </div>
          <div className="toolbar-actions">
            <div className="search-bar">
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search by name or phone number"
              />
              <button type="button" className="ghost-btn" onClick={() => setSearchTerm(searchTerm.trim())}>
                Search
              </button>
            </div>
            <button type="button" className="ghost-btn" onClick={handleRefresh}>
              Refresh
            </button>
          </div>
        </div>
        {actionMessage ? <p className="form-message">{actionMessage}</p> : null}
        <div className="list-stack registrations">
          {filteredRegistrations.map((registration) => {
            const selectedPaymentMode = reviewState[registration.id]?.paymentMode || registration.paymentMode || "";
            const transactionIdValue = reviewState[registration.id]?.transactionId || registration.transactionId || "";
            const paymentModeLocked = registration.status === "approved";

            return (
            <div className="registration-row" key={registration.id}>
              <div className="registration-head">
                <div>
                  <strong>{registration.participantName}</strong>
                  <p>{registration.collegeName}</p>
                </div>
                <div className="registration-head-actions">
                  {adminUsername === "jeeva@admin" ? (
                    <button type="button" className="danger-icon-btn" onClick={() => handleDelete(registration)} title="Remove participant">
                      Remove
                    </button>
                  ) : null}
                  <span className={`status status-${registration.status}`}>{registration.status}</span>
                </div>
              </div>
              <p className="registration-meta">Department: {registration.department || "-"} | Mobile: {registration.phone}</p>
              <p className="registration-meta">Event: {registration.selectedEvents.map((item) => item.title).join(", ")}</p>
              {registration.teamName ? <p className="registration-meta">Team Name: {registration.teamName}</p> : null}
              <p className="registration-meta">Team Size: {registration.teamSize || 1}</p>
              {registration.teamMembers?.length ? (
                <div className="team-member-summary">
                  {registration.teamMembers.map((member, index) => (
                    <p className="registration-meta" key={`${registration.id}-member-${index}`}>
                      {member.isLeader ? "Participant 1" : `Participant ${index + 1}`}: {member.name} | {member.phone} | {member.collegeName} | {member.department}
                    </p>
                  ))}
                </div>
              ) : null}
              <div className="review-grid">
                <label>
                  Payment Mode
                  <div className="payment-mode-buttons">
                    <button
                      type="button"
                      className={`ghost-btn payment-mode-btn${
                        selectedPaymentMode === "cash" ? " active" : ""
                      }${paymentModeLocked && selectedPaymentMode === "cash" ? " locked" : ""}`}
                      disabled={paymentModeLocked}
                      onClick={() =>
                        setReviewState((current) => ({
                          ...current,
                          [registration.id]: {
                            ...current[registration.id],
                            paymentMode: "cash",
                            transactionId: "",
                          },
                        }))
                      }
                    >
                      Cash
                    </button>
                    <button
                      type="button"
                      className={`ghost-btn payment-mode-btn${
                        selectedPaymentMode === "upi" ? " active" : ""
                      }${paymentModeLocked && selectedPaymentMode === "upi" ? " locked" : ""}`}
                      disabled={paymentModeLocked}
                      onClick={() =>
                        setReviewState((current) => ({
                          ...current,
                          [registration.id]: {
                            ...current[registration.id],
                            paymentMode: "upi",
                            transactionId: current[registration.id]?.transactionId || "",
                          },
                        }))
                      }
                    >
                      UPI
                    </button>
                  </div>
                </label>
                {selectedPaymentMode === "upi" ? (
                  <label>
                    Transaction ID
                    <input
                      value={transactionIdValue}
                      disabled={paymentModeLocked}
                      onChange={(event) =>
                        setReviewState((current) => ({
                          ...current,
                          [registration.id]: {
                            ...current[registration.id],
                            transactionId: event.target.value,
                          },
                        }))
                      }
                      placeholder="Required for UPI approval"
                    />
                  </label>
                ) : (
                  <div />
                )}
              </div>
              {reviewErrors[registration.id] ? <p className="form-message">{reviewErrors[registration.id]}</p> : null}
              <div className="row-actions">
                <button type="button" className="success-btn" onClick={() => handleStatusChange(registration, "approved")}>
                  Approve
                </button>
                <button type="button" className="danger-btn" onClick={() => handleStatusChange(registration, "rejected")}>
                  Reject
                </button>
                <button type="button" className="ghost-btn" onClick={() => handleStatusChange(registration, "pending")}>
                  Mark Pending
                </button>
              </div>
            </div>
          );
          })}
          {filteredRegistrations.length === 0 ? <p className="registration-meta">No participants matched your search.</p> : null}
        </div>
      </section>
    </div>
  );
}

function PageHeader({ eyebrow, title, description }) {
  return (
    <header className="page-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      <p className="page-header-copy">{description}</p>
    </header>
  );
}

function OverviewMetric({ label, value }) {
  return (
    <div className="overview-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function useAdminContext() {
  return useOutletContext();
}

export default AppShell;
