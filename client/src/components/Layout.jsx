import { useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Users, ClipboardCheck, BarChart3, Wallet, Settings, Search, Menu, LogOut, UserCog,
} from "lucide-react";
import { api } from "../api";
import { useAuth } from "../auth.jsx";

const links = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/officers", label: "Officers", icon: Users },
  { to: "/attendance", label: "Daily Attendance", icon: ClipboardCheck },
  { to: "/reports", label: "Monthly Reports", icon: BarChart3 },
  { to: "/salary", label: "Salary", icon: Wallet },
  { to: "/settings", label: "Settings", icon: Settings, admin: true },
  { to: "/settings#user-management", label: "User Management", icon: UserCog, admin: true },
];

export default function Layout({ children }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { user, isAdmin, logout } = useAuth();
  const visibleLinks = links.filter((link) => !link.admin || isAdmin);

  useEffect(() => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        setResults(await api.search(q.trim()));
      } catch {
        setResults([]);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  async function signOut() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="app">
      <aside className={`sidebar ${open ? "open" : ""}`}>
        <div className="brand">
          <div className="brand-mark">OF</div>
          <div>
            <h1>OfficerFlow</h1>
            <p>HR & Attendance</p>
          </div>
        </div>
        {visibleLinks.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.to === "/"}
            className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
            onClick={() => setOpen(false)}
          >
            <link.icon size={18} />
            {link.label}
          </NavLink>
        ))}
        <div className="sidebar-foot">
          <div>{user?.display_name || user?.username} · {user?.role === "admin" ? "Admin" : "Boss"}</div>
          <button className="nav-link" type="button" onClick={signOut} style={{ width: "100%", marginTop: 8 }}>
            <LogOut size={18} /> Sign out
          </button>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <button className="menu-btn" onClick={() => setOpen((v) => !v)} aria-label="Menu">
            <Menu />
          </button>
          <div className="search-wrap">
            <Search size={16} className="search-icon" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, officer ID, phone or CNIC"
            />
            {q && (
              <div className="search-results">
                {results.length === 0 ? (
                  <div>No officers found.</div>
                ) : (
                  results.map((o) => (
                    <a
                      key={o.id}
                      href={`/officers/${o.id}`}
                      onClick={(e) => {
                        e.preventDefault();
                        setQ("");
                        navigate(`/officers/${o.id}`);
                      }}
                    >
                      <strong>{o.name}</strong> · {o.officer_code}
                      <div style={{ fontSize: 12, color: "#5c6b80" }}>
                        {o.phone || "No phone"} · {o.cnic || "No CNIC"}
                      </div>
                    </a>
                  ))
                )}
              </div>
            )}
          </div>
        </header>
        <div className="page">{children}</div>
      </div>
    </div>
  );
}
