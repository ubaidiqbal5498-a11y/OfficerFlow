import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import { useAuth } from "./auth.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Officers from "./pages/Officers.jsx";
import OfficerForm from "./pages/OfficerForm.jsx";
import OfficerProfile from "./pages/OfficerProfile.jsx";
import DailyAttendance from "./pages/DailyAttendance.jsx";
import MonthlyReports from "./pages/MonthlyReports.jsx";
import Salary from "./pages/Salary.jsx";
import SettingsPage from "./pages/Settings.jsx";
import Login from "./pages/Login.jsx";

function ProtectedLayout() {
  const { user, ready } = useAuth();
  const location = useLocation();
  if (!ready) return <p className="card-pad">Loading…</p>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return (
    <Layout>
      <Outlet />
    </Layout>
  );
}

function AdminOnly({ children }) {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/officers" element={<Officers />} />
        <Route path="/officers/new" element={<AdminOnly><OfficerForm /></AdminOnly>} />
        <Route path="/officers/:id/edit" element={<AdminOnly><OfficerForm /></AdminOnly>} />
        <Route path="/officers/:id" element={<OfficerProfile />} />
        <Route path="/attendance" element={<DailyAttendance />} />
        <Route path="/reports" element={<MonthlyReports />} />
        <Route path="/salary" element={<Salary />} />
        <Route path="/settings" element={<AdminOnly><SettingsPage /></AdminOnly>} />
        <Route path="/users" element={<AdminOnly><Navigate to="/settings#user-management" replace /></AdminOnly>} />
      </Route>
    </Routes>
  );
}
