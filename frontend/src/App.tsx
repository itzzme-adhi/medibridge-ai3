import {
  useState,
  useEffect,
  useCallback,
  type ReactNode,
  type FormEvent,
} from "react";
import {
  Routes,
  Route,
  Navigate,
  Link,
  NavLink,
  useNavigate,
  useLocation,
  useParams,
} from "react-router-dom";
import {
  Activity,
  ArrowUpRight,
  ArrowRight,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  FileText,
  HeartPulse,
  LayoutDashboard,
  LockKeyhole,
  Plus,
  Search,
  Share2,
  ShieldCheck,
  Trash2,
  UploadCloud,
  Pill,
  ShieldAlert,
  QrCode,
  History,
  LogOut,
  Menu,
  Download,
  Eye,
  ChevronRight,
  Sparkles,
  RefreshCw,
  Settings,
  Copy,
  X,
  LoaderCircle,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import {
  api,
  base,
  supabase,
  token,
  uploadFile,
  download,
  type MedicalRecord,
  type Analysis,
  type Extraction,
  type Event,
  type Medication,
  type Allergy,
  type Grant,
  type Emergency,
  type Audit,
} from "./api";
import "./App.css";

type Profile = { display_name: string; mode: string };
type Health = { mode: string; ocr_available: boolean; ai_mode: string };
type Alerts = {
  notice: string;
  items: { title: string; detail: string; record_id: string }[];
  synthetic_examples: { title: string; detail: string }[];
};
type Bundle = {
  records: MedicalRecord[];
  timeline: Event[];
  medications: Medication[];
  allergies: Allergy[];
  shares: Grant[];
  audit: Audit[];
  alerts: Alerts;
  profile: Profile;
};
const types = [
  "Prescription",
  "Lab Report",
  "Consultation",
  "Discharge Summary",
  "Scan",
  "Other",
];
const nav = [
  ["dashboard", "Overview", LayoutDashboard],
  ["records", "Medical records", FileText],
  ["timeline", "Health timeline", CalendarDays],
  ["medications", "Medications", Pill],
  ["allergies", "Allergies", ShieldAlert],
  ["alerts", "Review & safety", Activity],
  ["sharing", "Doctor access", Share2],
  ["emergency", "Emergency card", QrCode],
  ["audit", "Access history", History],
] as const;
const fmt = (date: string | null) =>
  date
    ? new Date(
        date.length === 10 ? date + "T12:00:00" : date,
      ).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "Date not documented";
const message = (e: unknown) =>
  e instanceof Error ? e.message : "Something went wrong. Please retry.";
function Spinner() {
  return (
    <div className="empty-state" role="status">
      <LoaderCircle className="spin" /> Loading your workspace…
    </div>
  );
}
function ErrorBox({ error, retry }: { error: string; retry?: () => void }) {
  return (
    <div className="notice error" role="alert">
      <ShieldAlert size={20} />
      <span>{error}</span>
      {retry && (
        <button onClick={retry} className="text-button">
          Retry
        </button>
      )}
    </div>
  );
}
function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="empty-state">
      <FileText size={28} />
      <p>{children}</p>
    </div>
  );
}
function Brand() {
  return (
    <Link className="logo" to="/">
      <span className="logo-icon">
        <HeartPulse size={25} />
      </span>
      <div>
        <strong>
          MediBridge<span className="ai-tag">AI</span>
        </strong>
        <small>YOUR HEALTH, CONNECTED</small>
      </div>
    </Link>
  );
}
function Status({ status }: { status: string }) {
  return (
    <span
      className={`record-status ${status === "reviewed" ? "reviewed" : ""}`}
    >
      {status === "reviewed"
        ? "Reviewed"
        : status === "needs_review"
          ? "Needs review"
          : status === "uploaded"
            ? "Ready to analyze"
            : status.replaceAll("_", " ")}
    </span>
  );
}
function Section({
  title,
  subtitle,
  action,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={"surface " + className}>
      <div className="section-heading">
        <div>
          <h3>{title}</h3>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
function RecordRow({ r }: { r: MedicalRecord }) {
  return (
    <Link className="record-row" to={"/records/" + r.id}>
      <div className="record-icon">
        <FileText size={19} />
      </div>
      <div className="record-info">
        <strong>{r.title}</strong>
        <span>
          {r.type} · {fmt(r.date)}
        </span>
      </div>
      <Status status={r.status} />
      <ChevronRight size={16} />
    </Link>
  );
}
function useLoad<T>(path: string, initial: T) {
  const [data, setData] = useState(initial),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const reload = useCallback(() => {
    setLoading(true);
    setError("");
    api<T>(path)
      .then(setData)
      .catch((e) => setError(message(e)))
      .finally(() => setLoading(false));
  }, [path]);
  useEffect(reload, [reload]);
  return { data, setData, error, loading, reload };
}

export default function App() {
  const [ready, setReady] = useState(false),
    [signed, setSigned] = useState(false),
    [health, setHealth] = useState<Health | null>(null),
    [error, setError] = useState("");
  const navigate = useNavigate();
  const boot = useCallback(() => {
    setError("");
    api<Health>("/health")
      .then(async (h) => {
        setHealth(h);
        setSigned(Boolean(await token()));
        setReady(true);
      })
      .catch((e) => {
        setError(message(e));
        setReady(true);
      });
  }, []);
  useEffect(() => {
    boot();
    const expired = () => {
      localStorage.removeItem("medibridge-demo-token");
      setSigned(false);
      navigate("/login");
    };
    window.addEventListener("session-expired", expired);
    const subscription = supabase?.auth.onAuthStateChange((_event, session) =>
      setSigned(Boolean(session)),
    );
    return () => {
      window.removeEventListener("session-expired", expired);
      subscription?.data.subscription.unsubscribe();
    };
  }, [boot, navigate]);
  async function enterDemo() {
    const result = await api<{ access_token: string }>(
      "/demo/session",
      "POST",
      {},
    );
    localStorage.setItem("medibridge-demo-token", result.access_token);
    setSigned(true);
    navigate("/dashboard");
  }
  async function logout() {
    await api("/session", "DELETE");
    if (supabase) await supabase.auth.signOut();
    localStorage.removeItem("medibridge-demo-token");
    setSigned(false);
    navigate("/");
  }
  if (!ready) return <Spinner />;
  return (
    <Routes>
      <Route path="/doctor" element={<GuestPortal emergency={false} />} />
      <Route path="/emergency-access" element={<GuestPortal emergency />} />
      <Route
        path="/"
        element={
          signed ? (
            <Navigate to="/dashboard" replace />
          ) : (
            <Landing
              health={health}
              error={error}
              retry={boot}
              enterDemo={enterDemo}
            />
          )
        }
      />
      <Route
        path="/login"
        element={
          signed ? (
            <Navigate to="/dashboard" replace />
          ) : (
            <Auth health={health} enterDemo={enterDemo} />
          )
        }
      />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route
        path="/*"
        element={
          signed ? (
            <Workspace logout={logout} />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
    </Routes>
  );
}
function Landing({
  health,
  error,
  retry,
  enterDemo,
}: {
  health: Health | null;
  error: string;
  retry: () => void;
  enterDemo: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [fail, setFail] = useState("");
  async function demo() {
    setBusy(true);
    try {
      await enterDemo();
    } catch (e) {
      setFail(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="landing">
      <header className="public-header">
        <Brand />
        <div className="actions">
          <a href="#features" className="text-button">
            Why MediBridge
          </a>
          <Link to="/login" className="secondary-button">
            Sign in <ArrowUpRight size={16} />
          </Link>
        </div>
      </header>
      <main className="landing-main">
        <div className="landing-copy">
          <span className="hero-tag">
            <span className="online-dot" /> A CLEARER PICTURE OF YOU
          </span>
          <h1>
            One patient.
            <br />
            One medical timeline.
            <br />
            <em>Complete control.</em>
          </h1>
          <p>
            Your health story deserves to stay together. Turn scattered
            documents into an organized history, and share the right information
            with the right people.
          </p>
          <div className="actions">
            <Link className="primary-button" to="/login">
              Create your health space <ArrowRight size={17} />
            </Link>
            {health?.mode === "demo" && (
              <button
                className="secondary-button"
                onClick={demo}
                disabled={busy}
              >
                {busy ? "Opening your demo…" : "Explore live demo"}
                <ArrowUpRight size={17} />
              </button>
            )}
          </div>
          <p className="small">
            {health?.mode === "demo"
              ? "Local demo · Synthetic records · No signup required"
              : "Patient-controlled records and time-limited sharing"}
          </p>
          {(error || fail) && <ErrorBox error={error || fail} retry={retry} />}
        </div>
        <div className="landing-visual">
          <div className="orbit o1" />
          <div className="orbit o2" />
          <div className="orbit o3" />
          <HeartPulse size={140} strokeWidth={0.7} />
          <div className="floating-card fc1">
            <FileText />
            <div>
              <strong>A connected timeline</strong>
              <small>Every record has a place</small>
            </div>
            <CheckCircle2 size={17} />
          </div>
          <div className="floating-card fc2">
            <ShieldCheck />
            <div>
              <strong>Shared on your terms</strong>
              <small>You choose. You control.</small>
            </div>
          </div>
        </div>
      </main>
      <div id="features" className="landing-features">
        {[
          [
            FileText,
            "01",
            "Bring your records together",
            "Prescriptions, lab results, scans and more.",
          ],
          [
            Sparkles,
            "02",
            "Make information readable",
            "Extract text and review every detail.",
          ],
          [
            Share2,
            "03",
            "Share with confidence",
            "Choose records. Set an expiry. Revoke access.",
          ],
        ].map(([Icon, n, title, desc]) => {
          const I = Icon as typeof FileText;
          return (
            <div key={String(n)}>
              <span className="feature-number">{String(n)}</span>
              <I size={22} />
              <h3>{String(title)}</h3>
              <p>{String(desc)}</p>
            </div>
          );
        })}
      </div>
      <footer className="footer">
        Built for patient control · Hackathon prototype · Not for clinical
        decisions
      </footer>
    </div>
  );
}
function Auth({
  health,
  enterDemo,
}: {
  health: Health | null;
  enterDemo: () => Promise<void>;
}) {
  const [signup, setSignup] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [note, setNote] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setNote("");
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      if (!supabase)
        throw new Error(
          "Cloud sign-in is not configured. Use the synthetic demo below.",
        );
      const credentials = {
        email: String(f.get("email")),
        password: String(f.get("password")),
      };
      const result = signup
        ? await supabase.auth.signUp({
            ...credentials,
            options: { emailRedirectTo: location.origin + "/dashboard" },
          })
        : await supabase.auth.signInWithPassword(credentials);
      if (result.error) throw result.error;
      if (signup && !result.data.session)
        setNote("Check your email to confirm your account, then sign in.");
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function reset(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!supabase) return;
    const email = String(new FormData(e.currentTarget).get("email"));
    setBusy(true);
    setError("");
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: location.origin + "/reset-password",
      });
      if (error) throw error;
      setNote(
        "If an account exists, password-reset instructions will arrive by email.",
      );
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <Brand />
      <div className="surface auth-card">
        <span className="hero-tag">
          <LockKeyhole size={14} /> YOUR PRIVATE HEALTH SPACE
        </span>
        <h1>{signup ? "Start your health story." : "Welcome back."}</h1>
        <p>One place for the records that matter.</p>
        <form onSubmit={submit}>
          <label>
            Email
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@example.com"
            />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              autoComplete={signup ? "new-password" : "current-password"}
              minLength={8}
              required
              placeholder="At least 8 characters"
            />
          </label>
          <button className="primary-button wide" disabled={busy || !supabase}>
            {signup ? "Create account" : "Sign in"}
            <ArrowRight size={17} />
          </button>
        </form>
        <button className="text-button" onClick={() => setSignup(!signup)}>
          {signup
            ? "Already have an account? Sign in"
            : "New here? Create an account"}
        </button>
        {supabase && (
          <details>
            <summary>Forgot password?</summary>
            <form onSubmit={reset}>
              <label>
                Email
                <input type="email" name="email" required />
              </label>
              <button disabled={busy} className="secondary-button">
                Send reset email
              </button>
            </form>
          </details>
        )}
        {health?.mode === "demo" && (
          <div className="demo-entry">
            <p>Try the complete workflow with fictional records.</p>
            <button
              className="secondary-button wide"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  await enterDemo();
                } catch (e) {
                  setError(message(e));
                  setBusy(false);
                }
              }}
            >
              {busy ? "Opening demo…" : "Explore demo workspace"}
              <Sparkles size={16} />
            </button>
          </div>
        )}
        {!supabase && (
          <p className="small">
            Cloud accounts require Supabase configuration. Demo sessions persist
            for 24 hours on this server.
          </p>
        )}
        {error && <ErrorBox error={error} />}
        {note && (
          <div className="notice" role="status">
            {note}
          </div>
        )}
      </div>
      <Link to="/" className="text-button">
        ← Back to MediBridge
      </Link>
    </div>
  );
}
function ResetPassword() {
  const [note, setNote] = useState(""),
    [error, setError] = useState("");
  return (
    <div className="auth-page">
      <Brand />
      <Section title="Choose a new password">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              if (!supabase)
                throw new Error("Cloud authentication is not configured.");
              const { error } = await supabase.auth.updateUser({
                password: String(new FormData(e.currentTarget).get("password")),
              });
              if (error) throw error;
              setNote("Password updated. You can now open your workspace.");
            } catch (e) {
              setError(message(e));
            }
          }}
        >
          <label>
            New password
            <input
              name="password"
              type="password"
              minLength={8}
              required
              autoComplete="new-password"
            />
          </label>
          <button className="primary-button">Update password</button>
        </form>
        {note && (
          <p role="status">
            {note} <Link to="/dashboard">Open workspace</Link>
          </p>
        )}
        {error && <ErrorBox error={error} />}
      </Section>
    </div>
  );
}
function Workspace({ logout }: { logout: () => Promise<void> }) {
  const [data, setData] = useState<Bundle | null>(null),
    [error, setError] = useState(""),
    [menu, setMenu] = useState(false),
    [busy, setBusy] = useState(true);
  const location = useLocation();
  const refresh = useCallback(async () => {
    setError("");
    try {
      const [
        records,
        timeline,
        medications,
        allergies,
        shares,
        audit,
        alerts,
        profile,
      ] = await Promise.all([
        api<MedicalRecord[]>("/records"),
        api<Event[]>("/timeline"),
        api<Medication[]>("/medications"),
        api<Allergy[]>("/allergies"),
        api<Grant[]>("/shares"),
        api<Audit[]>("/audit-logs"),
        api<Alerts>("/alerts"),
        api<Profile>("/me"),
      ]);
      setData({
        records,
        timeline,
        medications,
        allergies,
        shares,
        audit,
        alerts,
        profile,
      });
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  useEffect(() => setMenu(false), [location.pathname]);
  const current = nav.find((n) => location.pathname === "/" + n[0]);
  const title =
    current?.[1] ||
    (location.pathname === "/upload"
      ? "Upload a document"
      : location.pathname === "/settings"
        ? "Profile settings"
        : "Document review");
  return (
    <div className="app-shell">
      <aside className={`sidebar ${menu ? "sidebar-open" : ""}`}>
        <Brand />
        <div className="nav-caption">YOUR WORKSPACE</div>
        <nav aria-label="Main navigation">
          {nav.map(([id, label, Icon], i) => (
            <NavLink
              key={id}
              to={"/" + id}
              className={({ isActive }) =>
                "nav-link " +
                (isActive ? "selected" : "") +
                (i === 6 ? " nav-break" : "")
              }
            >
              <Icon size={18} />
              <span>{label}</span>
              {id === "alerts" && !!data?.alerts.items.length && (
                <span className="nav-count">{data.alerts.items.length}</span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <ShieldCheck size={20} />
          <div>
            <strong>Always in your hands</strong>
            <small>You decide who sees what.</small>
          </div>
        </div>
        <div className="sidebar-user">
          <div className="avatar">
            {data?.profile.display_name
              .split(" ")
              .map((s) => s[0])
              .join("")
              .slice(0, 2) || "P"}
          </div>
          <div>
            <strong>{data?.profile.display_name || "Patient"}</strong>
            <small>Patient workspace</small>
          </div>
          <button
            className="icon-button"
            aria-label="Sign out"
            onClick={() => logout().catch((e) => setError(message(e)))}
          >
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      <main className="main-content">
        <header className="topbar">
          <div className="heading-group">
            <button
              className="mobile-menu"
              aria-label="Toggle navigation"
              aria-expanded={menu}
              onClick={() => setMenu(!menu)}
            >
              <Menu />
            </button>
            <div>
              <p className="eyebrow">YOUR HEALTH / {title.toUpperCase()}</p>
              <h1>
                {location.pathname === "/dashboard"
                  ? "Your health, in perspective."
                  : title}
              </h1>
            </div>
          </div>
          <div className="actions top-actions">
            <span className="mode-badge">
              <span className="online-dot" />
              {data?.profile.mode === "demo" ? "Synthetic demo" : "Connected"}
            </span>
            <NavLink
              to="/settings"
              className="icon-button"
              aria-label="Profile settings"
            >
              <Settings size={19} />
            </NavLink>
            <Link to="/upload" className="primary-button">
              <Plus size={17} /> Add record
            </Link>
          </div>
        </header>
        {error && <ErrorBox error={error} retry={refresh} />}
        {busy ? (
          <Spinner />
        ) : data ? (
          <Routes>
            <Route path="/dashboard" element={<Dashboard data={data} />} />
            <Route
              path="/records"
              element={<Records records={data.records} />}
            />
            <Route
              path="/records/:id"
              element={<RecordDetail refresh={refresh} />}
            />
            <Route
              path="/upload"
              element={
                <Upload demo={data.profile.mode === "demo"} refresh={refresh} />
              }
            />
            <Route
              path="/timeline"
              element={<Timeline events={data.timeline} />}
            />
            <Route
              path="/medications"
              element={<Medications items={data.medications} />}
            />
            <Route
              path="/allergies"
              element={<Allergies items={data.allergies} />}
            />
            <Route path="/alerts" element={<Safety data={data.alerts} />} />
            <Route
              path="/sharing"
              element={<Sharing data={data} refresh={refresh} />}
            />
            <Route
              path="/emergency"
              element={<EmergencyEditor refresh={refresh} />}
            />
            <Route
              path="/audit"
              element={<AuditHistory refresh={refresh} items={data.audit} />}
            />
            <Route
              path="/settings"
              element={
                <ProfileSettings profile={data.profile} refresh={refresh} />
              }
            />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        ) : null}
        <footer className="footer">
          <span>MediBridge AI</span>
          <span>Patient-reviewed information · Not for clinical decisions</span>
          <span>Bits and Bites · 2026</span>
        </footer>
      </main>
    </div>
  );
}
function Dashboard({ data: d }: { data: Bundle }) {
  const active = d.shares.filter(
    (g) => !g.revoked && new Date(g.expires_at) > new Date(),
  ).length;
  const reviewed = d.records.filter((r) => r.status === "reviewed").length;
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <div className="hero-tag">
            <Activity size={14} /> EVERY CHAPTER OF YOUR HEALTH
          </div>
          <h2>
            Your medical history.
            <br />
            <em>Beautifully connected.</em>
          </h2>
          <p>
            Good to see you, {d.profile.display_name.split(" ")[0]}. Your
            records, your timeline, your decisions. A clearer view starts here.
          </p>
          <Link className="primary-button light" to="/timeline">
            Explore your timeline <ArrowUpRight size={16} />
          </Link>
        </div>
        <div className="hero-art">
          <div className="orbit o1" />
          <div className="orbit o2" />
          <HeartPulse size={115} strokeWidth={0.8} />
          <div className="art-caption">
            <span className="online-dot" /> ONE CONNECTED HEALTH STORY
          </div>
        </div>
      </section>
      <section className="stats-grid">
        {[
          [
            FileText,
            d.records.length,
            "Medical records",
            `${reviewed} reviewed and organized`,
            "/records",
          ],
          [
            CalendarDays,
            d.timeline.length,
            "Timeline events",
            "Every document tells a story",
            "/timeline",
          ],
          [
            Share2,
            active,
            "Active permissions",
            "Access stays in your control",
            "/sharing",
          ],
        ].map(([I, num, title, caption, to]) => {
          const Icon = I as typeof FileText;
          return (
            <Link className="stat-card" key={String(title)} to={String(to)}>
              <div className="stat-head">
                <span>{String(title)}</span>
                <Icon size={18} />
              </div>
              <strong>{String(num).padStart(2, "0")}</strong>
              <div className="stat-foot">
                <span>{String(caption)}</span>
                <ArrowUpRight size={16} />
              </div>
            </Link>
          );
        })}
      </section>
      <div className="dashboard-grid">
        <Section
          title="Your latest records"
          subtitle="A little more clarity, one document at a time."
          action={
            <Link className="text-button" to="/records">
              View all <ArrowRight size={14} />
            </Link>
          }
        >
          {d.records.length ? (
            d.records.slice(0, 4).map((r) => <RecordRow key={r.id} r={r} />)
          ) : (
            <Empty>Add your first medical document.</Empty>
          )}
        </Section>
        <Section
          title="In your hands"
          subtitle="Small actions. A more connected health story."
          className="quick-panel"
        >
          <Link to="/upload">
            <span className="quick-icon">
              <UploadCloud size={20} />
            </span>
            <div>
              <strong>Bring a record in</strong>
              <small>Upload a document</small>
            </div>
            <ArrowUpRight size={17} />
          </Link>
          <Link to="/sharing">
            <span className="quick-icon">
              <Share2 size={20} />
            </span>
            <div>
              <strong>Connect with a doctor</strong>
              <small>Share just what matters</small>
            </div>
            <ArrowUpRight size={17} />
          </Link>
          <Link to="/emergency">
            <span className="quick-icon">
              <QrCode size={20} />
            </span>
            <div>
              <strong>Be ready, just in case</strong>
              <small>Create your emergency card</small>
            </div>
            <ArrowUpRight size={17} />
          </Link>
        </Section>
      </div>
      <div className="dashboard-grid lower-grid">
        <Section
          title="A moment for review"
          subtitle="Your review turns extracted text into your timeline."
        >
          {d.alerts.items.length ? (
            <Link
              className="review-notice"
              to={"/records/" + d.alerts.items[0].record_id}
            >
              <div className="review-icon">
                <Sparkles size={22} />
              </div>
              <div>
                <strong>
                  {d.alerts.items.length} document
                  {d.alerts.items.length !== 1 ? "s" : ""} waiting for you
                </strong>
                <p>Check the source, confirm the details.</p>
              </div>
              <ArrowRight size={18} />
            </Link>
          ) : (
            <div className="notice">
              <CheckCircle2 size={18} /> Your documents are reviewed.
            </div>
          )}
        </Section>
        <Section
          title="Recent activity"
          action={
            <Link className="text-button" to="/audit">
              All activity <ArrowRight size={14} />
            </Link>
          }
        >
          {d.audit.slice(0, 2).map((a) => (
            <div className="activity-row" key={a.id}>
              <span className="activity-dot" />
              <div>
                <strong>{a.action.replaceAll("_", " ")}</strong>
                <small>
                  {fmt(a.created_at)} · {a.actor.replaceAll("_", " ")}
                </small>
              </div>
            </div>
          ))}
        </Section>
      </div>
    </>
  );
}
function Records({ records }: { records: MedicalRecord[] }) {
  const [query, setQuery] = useState(""),
    [type, setType] = useState("All"),
    [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  const filtered = records.filter(
    (r) =>
      r.title.toLowerCase().includes(query.toLowerCase()) &&
      (type === "All" || r.type === type) &&
      (!from || (!!r.date && r.date >= from)) &&
      (!to || (!!r.date && r.date <= to)),
  );
  return (
    <Section
      title="Your medical library"
      subtitle={`${records.length} records, together in one place.`}
    >
      <div className="filters">
        <div className="search-box">
          <Search size={18} />
          <input
            aria-label="Search records"
            placeholder="Search your records…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select
          aria-label="Filter record type"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          {["All", ...types].map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <input
          type="date"
          aria-label="From date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
        <input
          type="date"
          aria-label="To date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
      </div>
      {filtered.length ? (
        filtered.map((r) => <RecordRow key={r.id} r={r} />)
      ) : (
        <Empty>No records match these filters.</Empty>
      )}
    </Section>
  );
}
function Upload({
  demo,
  refresh,
}: {
  demo: boolean;
  refresh: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(0),
    [error, setError] = useState(""),
    [stage, setStage] = useState("");
  const navigate = useNavigate();
  async function add(file: File | undefined) {
    if (!file || busy) return;
    setBusy(true);
    setError("");
    setStage("Uploading your document");
    try {
      const record = await uploadFile(file, setProgress);
      setStage("Reading your document");
      try {
        await api("/records/" + record.id + "/analyze", "POST", {});
      } catch (e) {
        setError(message(e));
      }
      await refresh();
      navigate("/records/" + record.id);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Section
      title="A new chapter in your health story"
      subtitle="Upload a prescription, lab report, consultation, scan or discharge summary."
      className="upload-surface"
    >
      <label
        className={"drop-zone " + (busy ? "disabled" : "")}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          add(e.dataTransfer.files[0]);
        }}
      >
        <div className="upload-icon">
          {busy ? (
            <LoaderCircle size={32} className="spin" />
          ) : (
            <UploadCloud size={32} />
          )}
        </div>
        <strong>{busy ? stage : "Drop your document here"}</strong>
        <span>
          {busy
            ? `${progress}% uploaded · Please keep this page open`
            : "or choose a file from your device"}
        </span>
        <input
          aria-label="Upload medical document"
          type="file"
          disabled={busy}
          accept=".pdf,.png,.jpg,.jpeg"
          onChange={(e) => add(e.target.files?.[0])}
        />
        <span className="file-formats">
          PDF · PNG · JPG · Up to 10 MB · Up to 20 PDF pages
        </span>
      </label>
      {busy && <progress max={100} value={progress} />}
      {error && <ErrorBox error={error} />}
      <div className="notice">
        <LockKeyhole size={18} />
        {demo
          ? "Demo mode stores documents on this server. Upload fictional data only."
          : "Documents are stored privately and retrieved through authorized requests."}
      </div>
      <div className="feature-cards">
        <div>
          <FileText />
          <strong>Keep the original</strong>
          <span>Your document remains the source of truth.</span>
        </div>
        <div>
          <CheckCircle2 />
          <strong>You have the final say</strong>
          <span>
            Review extracted details before adding them to your timeline.
          </span>
        </div>
      </div>
      {demo && (
        <div className="demo-samples">
          <h4>Need a sample? Try a fictional record.</h4>
          <div className="actions">
            {["prescription", "blood-test", "consultation", "discharge"].map(
              (k) => (
                <a
                  className="secondary-button"
                  href={base + "/api/demo/samples/" + k}
                  key={k}
                >
                  <Download size={14} />
                  {k.replace("-", " ")}
                </a>
              ),
            )}
          </div>
          <p className="small">
            Sample files use deterministic extraction. Other files use real OCR
            with manual review unless an AI provider is configured.
          </p>
        </div>
      )}
    </Section>
  );
}
function Timeline({ events }: { events: Event[] }) {
  const [type, setType] = useState("All"),
    [order, setOrder] = useState("newest");
  let items = events.filter((e) => type === "All" || e.type === type);
  if (order === "oldest") items = [...items].reverse();
  return (
    <Section
      title="Every chapter, together"
      subtitle="Only reviewed records appear here. Missing dates stay explicitly undated."
      action={
        <div className="actions">
          <select
            aria-label="Timeline type"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            {["All", ...types].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <select
            aria-label="Timeline order"
            value={order}
            onChange={(e) => setOrder(e.target.value)}
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
        </div>
      }
    >
      {items.length ? (
        <div className="timeline">
          {items.map((e) => (
            <Link
              to={"/records/" + e.record_id}
              className="timeline-entry"
              key={e.id}
            >
              <div className="timeline-marker" />
              <div>
                <time>{fmt(e.date)}</time>
                <h4>{e.title}</h4>
                <p>
                  {e.type} · {e.provider || "Provider not documented"}
                </p>
                <span className="text-button">
                  View source <ArrowUpRight size={13} />
                </span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <Empty>Review a document to add its event to your timeline.</Empty>
      )}
    </Section>
  );
}
function Medications({ items }: { items: Medication[] }) {
  const [filter, setFilter] = useState("all");
  return (
    <Section
      title="Your medication history"
      subtitle="A prescription does not automatically mean a medication is current."
      action={
        <select
          aria-label="Medication status"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          {["all", "current", "historical", "unknown"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      }
    >
      <div className="notice">
        <Pill size={19} /> Confirm current use with your healthcare
        professional. Do not change treatment based on this app.
      </div>
      {items.filter((m) => filter === "all" || m.status === filter).length ? (
        <div className="clinical-grid">
          {items
            .filter((m) => filter === "all" || m.status === filter)
            .map((m, i) => (
              <article className="clinical-card" key={m.id || i}>
                <Pill size={23} />
                <span className="record-status">
                  {m.status === "unknown"
                    ? "Current use unconfirmed"
                    : m.status}
                </span>
                <h3>{m.name}</h3>
                <p>
                  {m.dosage || "Dosage not documented"} ·{" "}
                  {m.frequency || "Frequency not documented"}
                </p>
                <p>
                  {fmt(m.start_date)} → {fmt(m.end_date)}
                </p>
                {m.record_id && (
                  <Link className="text-button" to={"/records/" + m.record_id}>
                    Reviewed source <ArrowUpRight size={14} />
                  </Link>
                )}
              </article>
            ))}
        </div>
      ) : (
        <Empty>No reviewed medications in this category.</Empty>
      )}
    </Section>
  );
}
function Allergies({ items }: { items: Allergy[] }) {
  return (
    <Section
      title="Allergies & sensitivities"
      subtitle="Documented information, reviewed by you."
    >
      {items.length ? (
        <div className="clinical-grid">
          {items.map((a, i) => (
            <article key={a.id || i} className="clinical-card">
              <ShieldAlert size={23} />
              <h3>{a.name}</h3>
              <p>Documented severity: {a.severity}</p>
              <blockquote>
                {a.source_text || "Source quote not provided."}
              </blockquote>
              {a.record_id && (
                <Link className="text-button" to={"/records/" + a.record_id}>
                  View source <ArrowUpRight size={14} />
                </Link>
              )}
            </article>
          ))}
        </div>
      ) : (
        <Empty>
          No reviewed allergy information. This does not mean you have no
          allergies.
        </Empty>
      )}
    </Section>
  );
}
function Safety({ data }: { data: Alerts }) {
  return (
    <>
      <Section
        title="Review comes first"
        subtitle="Resolve uncertain information against the original document."
      >
        <div className="notice warning">
          <ShieldAlert size={20} />
          {data.notice}
        </div>
        {data.items.length ? (
          data.items.map((a) => (
            <Link
              className="record-row"
              key={a.record_id}
              to={"/records/" + a.record_id}
            >
              <Sparkles size={20} />
              <div className="record-info">
                <strong>{a.title}</strong>
                <span>{a.detail}</span>
              </div>
              <ArrowRight size={17} />
            </Link>
          ))
        ) : (
          <Empty>No documents waiting for review.</Empty>
        )}
      </Section>
      <Section
        title="Safety alert demonstration"
        subtitle="Synthetic examples only. These are not findings about your medications."
        className="mt"
      >
        {data.synthetic_examples.map((a, i) => (
          <div className="activity-row" key={i}>
            <ShieldAlert size={18} />
            <div>
              <strong>{a.title}</strong>
              <small>{a.detail}</small>
            </div>
            <span className="record-status">Demo</span>
          </div>
        ))}
      </Section>
    </>
  );
}
function RecordDetail({ refresh }: { refresh: () => Promise<void> }) {
  const { id } = useParams();
  const [r, setR] = useState<MedicalRecord | null>(null),
    [analysis, setAnalysis] = useState<Analysis | null>(null),
    [ex, setEx] = useState<Extraction | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false),
    [confirmed, setConfirmed] = useState(false);
  const navigate = useNavigate();
  const load = useCallback(async () => {
    setError("");
    setR(null);
    setAnalysis(null);
    setEx(null);
    try {
      const record = await api<MedicalRecord>("/records/" + id);
      setR(record);
      if (["needs_review", "reviewed"].includes(record.status)) {
        const result = await api<Analysis>("/records/" + id + "/analysis");
        setAnalysis(result);
        setEx(result.extraction);
      }
    } catch (e) {
      setError(message(e));
    }
  }, [id]);
  useEffect(() => {
    load();
  }, [load]);
  async function analyze() {
    setBusy(true);
    setError("");
    try {
      const result = await api<Analysis>(
        "/records/" + id + "/analyze",
        "POST",
        {},
      );
      setAnalysis(result);
      setEx(result.extraction);
      await refresh();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!ex) return;
    setBusy(true);
    setError("");
    try {
      const result = await api<Analysis>(
        "/records/" + id + "/analysis",
        "PATCH",
        { extraction: ex, confirmed },
      );
      setAnalysis(result);
      setEx(result.extraction);
      setSaved(true);
      setR(r ? { ...r, status: "reviewed" } : r);
      await refresh();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (
      !window.confirm(
        "Delete this document and its extracted timeline information? Existing grants will lose access to this record.",
      )
    )
      return;
    setBusy(true);
    try {
      await api("/records/" + id, "DELETE");
      await refresh();
      navigate("/records");
    } catch (e) {
      setError(message(e));
      setBusy(false);
    }
  }
  if (!r) return error ? <ErrorBox error={error} retry={load} /> : <Spinner />;
  return (
    <>
      <div className="detail-heading">
        <div>
          <Link to="/records" className="text-button">
            ← Your medical library
          </Link>
          <h2>{r.title}</h2>
          <p>
            {r.type} · {Math.ceil(r.size / 1024)} KB ·{" "}
            <Status status={r.status} />
          </p>
        </div>
        <div className="actions">
          <button
            className="secondary-button"
            onClick={() =>
              download(
                "/records/" + id + "/file",
                r.filename,
                undefined,
                true,
              ).catch((e) => setError(message(e)))
            }
          >
            <Eye size={16} /> Preview
          </button>
          <button
            className="secondary-button"
            onClick={() =>
              download("/records/" + id + "/file", r.filename).catch((e) =>
                setError(message(e)),
              )
            }
          >
            <Download size={16} /> Download
          </button>
          <button
            className="icon-button danger"
            aria-label="Delete document"
            disabled={busy}
            onClick={remove}
          >
            <Trash2 size={18} />
          </button>
        </div>
      </div>
      {error && <ErrorBox error={error} />}
      {saved && (
        <div role="status" className="notice">
          <CheckCircle2 size={20} /> Review saved. Your timeline and clinical
          summaries are updated.
        </div>
      )}
      {!ex ? (
        <Section
          title="Ready to read your document"
          subtitle="Text extraction runs first. You review the information before it enters your timeline."
        >
          <button className="primary-button" disabled={busy} onClick={analyze}>
            {busy ? (
              <LoaderCircle className="spin" size={17} />
            ) : (
              <Sparkles size={17} />
            )}{" "}
            {busy ? "Reading document…" : "Analyze document"}
          </button>
        </Section>
      ) : (
        <div className="review-grid">
          <Section
            title="Review extracted details"
            subtitle={
              analysis?.mode === "synthetic_fixture"
                ? "Synthetic sample extraction · not live AI inference"
                : analysis?.mode === "manual_review"
                  ? "OCR text extracted · structured fields need manual entry"
                  : "AI output is unverified · compare every field with the original"
            }
          >
            <form onSubmit={save}>
              <div className="notice warning">
                <ShieldAlert size={18} />{" "}
                {ex.uncertain_fields.join(" ") ||
                  "Review all extracted facts. Missing fields should remain empty."}
              </div>
              <div className="form-grid">
                <label>
                  Document type
                  <select
                    value={ex.document_type}
                    onChange={(e) =>
                      setEx({ ...ex, document_type: e.target.value })
                    }
                  >
                    {types.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Document date
                  <input
                    type="date"
                    value={ex.document_date || ""}
                    onChange={(e) =>
                      setEx({ ...ex, document_date: e.target.value || null })
                    }
                  />
                </label>
              </div>
              <label>
                Healthcare provider
                <input
                  value={ex.provider || ""}
                  placeholder="Not documented"
                  onChange={(e) =>
                    setEx({ ...ex, provider: e.target.value || null })
                  }
                />
              </label>
              <label>
                Documented diagnoses or conditions
                <textarea
                  value={ex.diagnoses.join("\n")}
                  placeholder="One per line. Leave empty if not documented."
                  onChange={(e) =>
                    setEx({
                      ...ex,
                      diagnoses: e.target.value.split("\n").filter(Boolean),
                    })
                  }
                />
              </label>
              <div className="section-heading">
                <h4>Medications</h4>
                <button
                  type="button"
                  className="text-button"
                  onClick={() =>
                    setEx({
                      ...ex,
                      medications: [
                        ...ex.medications,
                        {
                          name: "",
                          dosage: "",
                          frequency: "",
                          status: "unknown",
                          start_date: null,
                          end_date: null,
                          source_text: "",
                        },
                      ],
                    })
                  }
                >
                  <Plus size={14} /> Add
                </button>
              </div>
              {ex.medications.map((m, i) => {
                const change = (key: keyof Medication, value: string | null) =>
                  setEx({
                    ...ex,
                    medications: ex.medications.map((v, j) =>
                      j === i ? { ...v, [key]: value } : v,
                    ),
                  });
                return (
                  <div className="nested-form" key={i}>
                    <div className="form-grid">
                      <label>
                        Medication name
                        <input
                          required
                          value={m.name}
                          onChange={(e) => change("name", e.target.value)}
                        />
                      </label>
                      <label>
                        Dosage
                        <input
                          value={m.dosage}
                          onChange={(e) => change("dosage", e.target.value)}
                        />
                      </label>
                      <label>
                        Frequency
                        <input
                          value={m.frequency}
                          onChange={(e) => change("frequency", e.target.value)}
                        />
                      </label>
                      <label>
                        Current use
                        <select
                          value={m.status}
                          onChange={(e) => change("status", e.target.value)}
                        >
                          <option value="unknown">Not confirmed</option>
                          <option value="current">Confirmed current</option>
                          <option value="historical">Historical</option>
                        </select>
                      </label>
                      <label>
                        Start date
                        <input
                          type="date"
                          value={m.start_date || ""}
                          onChange={(e) =>
                            change("start_date", e.target.value || null)
                          }
                        />
                      </label>
                      <label>
                        End date
                        <input
                          type="date"
                          value={m.end_date || ""}
                          onChange={(e) =>
                            change("end_date", e.target.value || null)
                          }
                        />
                      </label>
                    </div>
                    <label>
                      Supporting source text
                      <textarea
                        value={m.source_text}
                        onChange={(e) => change("source_text", e.target.value)}
                      />
                    </label>
                    <button
                      type="button"
                      className="text-button danger"
                      onClick={() =>
                        setEx({
                          ...ex,
                          medications: ex.medications.filter((_, j) => j !== i),
                        })
                      }
                    >
                      Remove medication
                    </button>
                  </div>
                );
              })}
              <div className="section-heading">
                <h4>Allergies</h4>
                <button
                  type="button"
                  className="text-button"
                  onClick={() =>
                    setEx({
                      ...ex,
                      allergies: [
                        ...ex.allergies,
                        { name: "", severity: "unknown", source_text: "" },
                      ],
                    })
                  }
                >
                  <Plus size={14} /> Add
                </button>
              </div>
              {ex.allergies.map((a, i) => {
                const change = (key: keyof Allergy, value: string) =>
                  setEx({
                    ...ex,
                    allergies: ex.allergies.map((v, j) =>
                      j === i ? { ...v, [key]: value } : v,
                    ),
                  });
                return (
                  <div className="nested-form" key={i}>
                    <div className="form-grid">
                      <label>
                        Allergen
                        <input
                          required
                          value={a.name}
                          onChange={(e) => change("name", e.target.value)}
                        />
                      </label>
                      <label>
                        Documented severity
                        <select
                          value={a.severity}
                          onChange={(e) => change("severity", e.target.value)}
                        >
                          {["unknown", "mild", "moderate", "severe"].map(
                            (s) => (
                              <option key={s}>{s}</option>
                            ),
                          )}
                        </select>
                      </label>
                    </div>
                    <label>
                      Supporting source text
                      <textarea
                        value={a.source_text}
                        onChange={(e) => change("source_text", e.target.value)}
                      />
                    </label>
                    <button
                      type="button"
                      className="text-button danger"
                      onClick={() =>
                        setEx({
                          ...ex,
                          allergies: ex.allergies.filter((_, j) => j !== i),
                        })
                      }
                    >
                      Remove allergy
                    </button>
                  </div>
                );
              })}
              <div className="section-heading">
                <h4>Laboratory findings</h4>
                <button
                  type="button"
                  className="text-button"
                  onClick={() =>
                    setEx({
                      ...ex,
                      labs: [
                        ...ex.labs,
                        {
                          name: "",
                          value: "",
                          reference_range: "",
                          source_text: "",
                        },
                      ],
                    })
                  }
                >
                  <Plus size={14} /> Add
                </button>
              </div>
              {ex.labs.map((lab, i) => (
                <div className="nested-form" key={i}>
                  <div className="form-grid">
                    {(
                      [
                        "name",
                        "value",
                        "reference_range",
                        "source_text",
                      ] as const
                    ).map((key) => (
                      <label key={key}>
                        {key.replaceAll("_", " ")}
                        <input
                          value={lab[key]}
                          onChange={(e) =>
                            setEx({
                              ...ex,
                              labs: ex.labs.map((v, j) =>
                                j === i ? { ...v, [key]: e.target.value } : v,
                              ),
                            })
                          }
                        />
                      </label>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="text-button danger"
                    onClick={() =>
                      setEx({ ...ex, labs: ex.labs.filter((_, j) => j !== i) })
                    }
                  >
                    Remove finding
                  </button>
                </div>
              ))}
              <label>
                Documented procedures
                <textarea
                  value={ex.procedures.join("\n")}
                  onChange={(e) =>
                    setEx({
                      ...ex,
                      procedures: e.target.value.split("\n").filter(Boolean),
                    })
                  }
                />
              </label>
              <label>
                Documented follow-up instructions
                <textarea
                  value={ex.follow_up.join("\n")}
                  onChange={(e) =>
                    setEx({
                      ...ex,
                      follow_up: e.target.value.split("\n").filter(Boolean),
                    })
                  }
                />
              </label>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={confirmed}
                  required
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                I checked these details against the original document. This is a
                personal review, not a clinical verification.
              </label>
              <button className="primary-button" disabled={busy || !confirmed}>
                <Check size={18} />
                {busy ? "Saving…" : "Confirm & update timeline"}
              </button>
            </form>
          </Section>
          <Section
            title="Source text"
            subtitle={`Read using ${analysis?.method || "text extraction"}. The original document remains authoritative.`}
            className="source-panel"
          >
            <pre className="source-text">{ex.source_text}</pre>
            <details>
              <summary>Original extraction before corrections</summary>
              <ExtractionSummary ex={analysis!.original_extraction} />
            </details>
          </Section>
        </div>
      )}
    </>
  );
}
function ExtractionSummary({ ex }: { ex: Extraction }) {
  return (
    <div className="extraction-summary">
      <p>
        <strong>{ex.document_type}</strong> · {fmt(ex.document_date)}
      </p>
      <p>{ex.provider || "Provider not documented"}</p>
      <h4>Conditions</h4>
      <p>{ex.diagnoses.join(", ") || "Not documented"}</p>
      <h4>Medications</h4>
      {ex.medications.length ? (
        ex.medications.map((m, i) => (
          <p key={i}>
            {m.name} · {m.dosage} · {m.frequency} · {m.status}
          </p>
        ))
      ) : (
        <p>Not documented</p>
      )}
      <h4>Allergies</h4>
      <p>
        {ex.allergies.map((a) => a.name + " (" + a.severity + ")").join(", ") ||
          "Not documented"}
      </p>
      <h4>Lab findings</h4>
      {ex.labs.map((l, i) => (
        <p key={i}>
          {l.name}: {l.value} · reference{" "}
          {l.reference_range || "not documented"}
        </p>
      ))}
      <h4>Procedures & follow-up</h4>
      <p>
        {[...ex.procedures, ...ex.follow_up].join(" · ") || "Not documented"}
      </p>
      <div className="notice warning">
        Unverified extraction. {ex.uncertain_fields.join(" ")}
      </div>
    </div>
  );
}
function ShareLink({ url }: { url: string }) {
  const [note, setNote] = useState("");
  return (
    <div className="share-result">
      <p>Copy this link now. The raw access token is shown only once.</p>
      <input
        readOnly
        aria-label="Generated access link"
        value={url}
        onFocus={(e) => e.target.select()}
      />
      <div className="actions">
        <button
          className="secondary-button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setNote("Link copied");
            } catch {
              setNote("Select the link above and copy it.");
            }
          }}
        >
          <Copy size={15} /> Copy link
        </button>
        <a className="text-button" target="_blank" rel="noreferrer" href={url}>
          Open access page <ArrowUpRight size={15} />
        </a>
      </div>
      {note && (
        <p role="status" className="small">
          {note}
        </p>
      )}
    </div>
  );
}
function Sharing({
  data,
  refresh,
}: {
  data: Bundle;
  refresh: () => Promise<void>;
}) {
  const [selected, setSelected] = useState<string[]>([]),
    [hours, setHours] = useState(24),
    [label, setLabel] = useState(""),
    [link, setLink] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const grant = await api<Grant>("/shares", "POST", {
        label,
        record_ids: selected,
        expires_hours: hours,
      });
      setLink(location.origin + "/doctor#access=" + grant.token);
      await refresh();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="dashboard-grid">
      <Section
        title="Care, connected on your terms"
        subtitle="Select exactly which records a doctor can view."
      >
        <form onSubmit={submit}>
          <label>
            Share label
            <input
              required
              maxLength={100}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Cardiology consultation"
            />
          </label>
          <label>
            Access expires in
            <select
              value={hours}
              onChange={(e) => setHours(Number(e.target.value))}
            >
              <option value={1}>1 hour</option>
              <option value={24}>24 hours</option>
              <option value={72}>3 days</option>
              <option value={168}>7 days</option>
            </select>
          </label>
          <fieldset>
            <legend>Records to include</legend>
            {data.records.map((r) => (
              <label key={r.id} className="check-label record-choice">
                <input
                  type="checkbox"
                  checked={selected.includes(r.id)}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? [...selected, r.id]
                        : selected.filter((id) => id !== r.id),
                    )
                  }
                />
                <FileText size={18} />
                <div>
                  <strong>{r.title}</strong>
                  <small>
                    {r.type} · {fmt(r.date)}
                  </small>
                </div>
              </label>
            ))}
          </fieldset>
          <div className="notice">
            <LockKeyhole size={19} />
            Anyone holding this link can view the selected records until expiry
            or revocation. Guest doctors are not identity-verified.
          </div>
          <button
            className="primary-button"
            disabled={busy || !selected.length}
          >
            <Share2 size={17} />
            {busy ? "Creating…" : "Generate read-only link"}
          </button>
        </form>
        {link && <ShareLink url={link} />}
        {error && <ErrorBox error={error} />}
      </Section>
      <Section
        title="Your permissions"
        subtitle="Access is checked each time a shared document is requested."
      >
        {data.shares.length ? (
          data.shares.map((g) => {
            const active = !g.revoked && new Date(g.expires_at) > new Date();
            return (
              <article className="grant" key={g.id}>
                <div className="section-heading">
                  <h4>{g.label}</h4>
                  <span className="record-status">
                    {g.revoked ? "Revoked" : active ? "Active" : "Expired"}
                  </span>
                </div>
                <p>{g.record_ids.length} selected records · Read only</p>
                <p>Expires {new Date(g.expires_at).toLocaleString()}</p>
                {active && (
                  <button
                    className="text-button danger"
                    onClick={async () => {
                      try {
                        await api("/shares/" + g.id, "DELETE");
                        setLink("");
                        await refresh();
                      } catch (e) {
                        setError(message(e));
                      }
                    }}
                  >
                    Revoke access
                  </button>
                )}
              </article>
            );
          })
        ) : (
          <Empty>No permissions yet. Your records are yours to share.</Empty>
        )}
        <p className="small mt">
          Revocation blocks future requests. It cannot erase files someone
          already downloaded.
        </p>
      </Section>
    </div>
  );
}
const emergencyFields = [
  ["display_name", "Display name"],
  ["blood_group", "Blood group"],
  ["allergies", "Allergies"],
  ["medications", "Current medications"],
  ["conditions", "Emergency conditions"],
  ["contact_name", "Emergency contact name"],
  ["contact_phone", "Emergency contact phone"],
] as const;
const blankEmergency: Emergency = {
  display_name: "",
  blood_group: "Unknown",
  allergies: "",
  medications: "",
  conditions: "",
  contact_name: "",
  contact_phone: "",
  include: [],
};
function EmergencyEditor({ refresh }: { refresh: () => Promise<void> }) {
  const { data, setData, error, loading } = useLoad<Emergency>(
    "/emergency-profile",
    blankEmergency,
  );
  const grants = useLoad<Grant[]>("/emergency-access", []);
  const [link, setLink] = useState(""),
    [busy, setBusy] = useState(false),
    [fail, setFail] = useState(""),
    [note, setNote] = useState("");
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFail("");
    try {
      await api("/emergency-profile", "PATCH", data);
      setNote("Emergency profile saved.");
      await refresh();
    } catch (e) {
      setFail(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function generate() {
    setBusy(true);
    setFail("");
    try {
      await api("/emergency-profile", "PATCH", data);
      const g = await api<{ token: string }>("/emergency-access", "POST", {
        expires_days: 30,
      });
      setLink(location.origin + "/emergency-access#access=" + g.token);
      setNote("New QR created. Any previous QR has been revoked.");
      grants.reload();
      await refresh();
    } catch (e) {
      setFail(message(e));
    } finally {
      setBusy(false);
    }
  }
  if (loading) return <Spinner />;
  if (error) return <ErrorBox error={error} />;
  return (
    <div className="dashboard-grid">
      <Section
        title="Only what matters in a moment"
        subtitle="Choose each field you want your emergency QR to reveal."
      >
        <form onSubmit={save}>
          {emergencyFields.map(([key, label]) => (
            <div className="emergency-field" key={key}>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={data.include.includes(key)}
                  onChange={(e) =>
                    setData({
                      ...data,
                      include: e.target.checked
                        ? [...data.include, key]
                        : data.include.filter((k) => k !== key),
                    })
                  }
                />
                Share {label.toLowerCase()}
              </label>
              <label className="sr-only" htmlFor={"emergency-" + key}>
                {label}
              </label>
              {key === "blood_group" ? (
                <select
                  id={"emergency-" + key}
                  value={data[key]}
                  onChange={(e) => setData({ ...data, [key]: e.target.value })}
                >
                  {[
                    "Unknown",
                    "A+",
                    "A-",
                    "B+",
                    "B-",
                    "AB+",
                    "AB-",
                    "O+",
                    "O-",
                  ].map((g) => (
                    <option key={g}>{g}</option>
                  ))}
                </select>
              ) : (
                <input
                  id={"emergency-" + key}
                  value={data[key]}
                  placeholder={label}
                  maxLength={
                    ["medications", "conditions"].includes(key) ? 2000 : 1000
                  }
                  onChange={(e) => setData({ ...data, [key]: e.target.value })}
                />
              )}
            </div>
          ))}
          <button className="primary-button" disabled={busy}>
            <Check size={17} /> Save approved profile
          </button>
        </form>
        {note && (
          <div className="notice" role="status">
            {note}
          </div>
        )}
        {fail && <ErrorBox error={fail} />}
      </Section>
      <Section
        title="Your emergency card"
        subtitle="Limited information. Available to someone with your QR."
      >
        <div className="emergency-preview">
          <HeartPulse size={35} />
          <h3>
            {data.include.includes("display_name") && data.display_name
              ? data.display_name
              : "Emergency profile"}
          </h3>
          <p>Only {data.include.length} selected fields will be visible.</p>
          {link ? (
            <div className="qr">
              <QRCodeSVG value={link} size={196} marginSize={4} />
            </div>
          ) : (
            <div className="qr-placeholder">
              <QrCode size={80} strokeWidth={1} />
              <p>Create your QR when you are ready.</p>
            </div>
          )}
        </div>
        <div className="notice warning">
          <ShieldAlert size={19} />
          Anyone with this QR can open approved details. Keep it private. Your
          full record library is never included.
        </div>
        <div className="actions">
          <button
            className="primary-button"
            disabled={busy || !data.include.length}
            onClick={generate}
          >
            <QrCode size={17} />
            {link ? "Rotate QR" : "Generate QR"}
          </button>
          <button
            className="secondary-button"
            disabled={busy || !grants.data.some((g) => !g.revoked)}
            onClick={async () => {
              try {
                await api("/emergency-access", "DELETE");
                setLink("");
                grants.reload();
                setNote("Emergency access revoked.");
                await refresh();
              } catch (e) {
                setFail(message(e));
              }
            }}
          >
            Revoke
          </button>
        </div>
        {link && <ShareLink url={link} />}
        <p className="small mt">
          Expires in 30 days. A QR pointing to localhost can only open on the
          machine running the app. Use an HTTPS deployment for phone access.
        </p>
        {grants.error && <ErrorBox error={grants.error} />}
      </Section>
    </div>
  );
}
function AuditHistory({
  items,
  refresh,
}: {
  items: Audit[];
  refresh: () => Promise<void>;
}) {
  return (
    <Section
      title="A transparent view of access"
      subtitle="Recorded by the server. Latest 300 events."
      action={
        <button className="text-button" onClick={refresh}>
          <RefreshCw size={15} /> Refresh
        </button>
      }
    >
      {items.length ? (
        items.map((a) => (
          <div className="activity-row" key={a.id}>
            <span className="activity-dot" />
            <div>
              <strong>{a.action.replaceAll("_", " ")}</strong>
              <small>
                {a.actor.replaceAll("_", " ")} ·{" "}
                {new Date(a.created_at).toLocaleString()}
              </small>
            </div>
            {a.record_id && (
              <Link aria-label="View record" to={"/records/" + a.record_id}>
                <ArrowUpRight size={16} />
              </Link>
            )}
          </div>
        ))
      ) : (
        <Empty>No access events yet.</Empty>
      )}
    </Section>
  );
}
function ProfileSettings({
  profile,
  refresh,
}: {
  profile: Profile;
  refresh: () => Promise<void>;
}) {
  const [name, setName] = useState(profile.display_name),
    [note, setNote] = useState("");
  return (
    <Section
      title="Make this space yours"
      subtitle="Your display name is separate from your emergency profile."
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api("/me", "PATCH", { display_name: name });
            await refresh();
            setNote("Profile saved.");
          } catch (e) {
            setNote(message(e));
          }
        }}
      >
        <label>
          Display name
          <input
            value={name}
            required
            maxLength={100}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <button className="primary-button">Save changes</button>
      </form>
      {note && (
        <div className="notice" role="status">
          {note}
        </div>
      )}
    </Section>
  );
}
function GuestPortal({ emergency }: { emergency: boolean }) {
  const location = useLocation();
  const access =
    new URLSearchParams(location.hash.slice(1)).get("access") || "";
  type Guest = {
    profile?: Record<string, string>;
    notice?: string;
    label?: string;
    expires_at: string;
    records?: MedicalRecord[];
    timeline?: Event[];
    medications?: Medication[];
    allergies?: Allergy[];
    extractions?: Analysis[];
  };
  const [data, setData] = useState<Guest | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const refresh = useCallback(() => {
    if (!access) {
      setError(
        "This link is missing its access token. Ask the patient for a new link.",
      );
      setLoading(false);
      return;
    }
    api<Guest>(emergency ? "/emergency" : "/shared", "GET", undefined, access)
      .then((r) => {
        setData(r);
        setError("");
      })
      .catch((e) => {
        setData(null);
        setError(message(e));
      })
      .finally(() => setLoading(false));
  }, [access, emergency]);
  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 10000);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [refresh]);
  useEffect(() => {
    if (!data) return;
    const timeout = setTimeout(
      () => {
        setData(null);
        setError("This access link has expired.");
      },
      Math.min(
        2147483647,
        Math.max(0, new Date(data.expires_at).getTime() - Date.now()),
      ),
    );
    return () => clearTimeout(timeout);
  }, [data]);
  return (
    <div className="guest-page">
      <header className="public-header">
        <Brand />
        <span className="mode-badge">
          <LockKeyhole size={14} />{" "}
          {emergency ? "Limited emergency access" : "Read-only doctor access"}
        </span>
      </header>
      <main>
        <div className="guest-heading">
          <p className="eyebrow">PATIENT-CONTROLLED ACCESS</p>
          <h1>
            {emergency
              ? "Information for the moment."
              : data?.label || "Shared medical records"}
          </h1>
          <p>
            {emergency
              ? "Only details approved by the patient appear below."
              : "Only selected records are available. Guest link access does not verify professional identity."}
          </p>
        </div>
        {loading ? (
          <Spinner />
        ) : error ? (
          <ErrorBox error={error} retry={refresh} />
        ) : (
          data && (
            <>
              {emergency ? (
                <Section
                  title="Emergency medical profile"
                  subtitle={data.notice}
                >
                  <div className="emergency-summary">
                    {Object.entries(data.profile || {}).map(([k, v]) => (
                      <div key={k}>
                        <small>{k.replaceAll("_", " ")}</small>
                        <strong>{v || "Not supplied"}</strong>
                      </div>
                    ))}
                  </div>
                </Section>
              ) : (
                <>
                  <Section
                    title="Authorized documents"
                    subtitle="Each download checks that the patient's permission is still active."
                  >
                    {data.records?.length ? (
                      data.records.map((r) => (
                        <div key={r.id} className="record-row">
                          <div className="record-icon">
                            <FileText size={20} />
                          </div>
                          <div className="record-info">
                            <strong>{r.title}</strong>
                            <span>
                              {r.type} · {fmt(r.date)}
                            </span>
                          </div>
                          <Status status={r.status} />
                          <button
                            className="secondary-button"
                            onClick={() =>
                              download(
                                "/shared/records/" + r.id + "/file",
                                r.filename,
                                access,
                                true,
                              ).catch((e) => {
                                setData(null);
                                setError(message(e));
                              })
                            }
                          >
                            <Eye size={16} /> View
                          </button>
                        </div>
                      ))
                    ) : (
                      <Empty>
                        No records are currently available in this grant.
                      </Empty>
                    )}
                  </Section>
                  <div className="dashboard-grid mt">
                    <Section title="Medication summary">
                      {data.medications?.length ? (
                        data.medications.map((m, i) => (
                          <div className="clinical-card" key={i}>
                            <h4>{m.name}</h4>
                            <p>
                              {m.dosage} · {m.frequency}
                            </p>
                            <p>Current use: {m.status}</p>
                          </div>
                        ))
                      ) : (
                        <Empty>
                          No reviewed medication information in the shared
                          records.
                        </Empty>
                      )}
                    </Section>
                    <Section title="Allergy summary">
                      {data.allergies?.length ? (
                        data.allergies.map((a, i) => (
                          <div className="clinical-card" key={i}>
                            <h4>{a.name}</h4>
                            <p>Severity: {a.severity}</p>
                          </div>
                        ))
                      ) : (
                        <Empty>
                          No reviewed allergy information in the shared records.
                        </Empty>
                      )}
                    </Section>
                  </div>
                  <Section title="Shared timeline" className="mt">
                    {data.timeline?.map((e) => (
                      <div className="activity-row" key={e.id}>
                        <CalendarDays size={18} />
                        <div>
                          <strong>{e.title}</strong>
                          <small>
                            {fmt(e.date)} · {e.type}
                          </small>
                        </div>
                      </div>
                    ))}
                  </Section>
                  <Section
                    title="Extraction details"
                    subtitle="Extracted facts require review. Consult the original source."
                    className="mt"
                  >
                    {data.extractions?.map((a) => (
                      <details key={a.record_id}>
                        <summary>
                          {
                            data.records?.find((r) => r.id === a.record_id)
                              ?.title
                          }{" "}
                          · {a.reviewed ? "Patient reviewed" : "Unreviewed"} ·{" "}
                          {a.mode === "synthetic_fixture"
                            ? "Synthetic demonstration"
                            : a.mode.replaceAll("_", " ")}
                        </summary>
                        <ExtractionSummary ex={a.extraction} />
                        <details>
                          <summary>Supporting source text</summary>
                          <pre className="source-text">
                            {a.extraction.source_text}
                          </pre>
                        </details>
                      </details>
                    ))}
                  </Section>
                </>
              )}
              <p className="small mt">
                Access expires {new Date(data.expires_at).toLocaleString()}.
                Access events are logged.
              </p>
            </>
          )
        )}
      </main>
      <footer className="footer">
        MediBridge AI · Not for clinical decisions
      </footer>
    </div>
  );
}
