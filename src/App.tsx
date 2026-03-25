import { useEffect } from "react";
import type { ReactElement } from "react";
import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { trackPageView } from "./analytics";
import { AdminListPage } from "./pages/AdminListPage";
import { AdminLoginPage } from "./pages/AdminLoginPage";
import { AdminPhotoPage } from "./pages/AdminPhotoPage";
import { PublicGlobePage } from "./pages/PublicGlobePage";

function requireAdmin() {
  return !!localStorage.getItem("adminToken");
}

function AdminGuard({ children }: { children: ReactElement }) {
  const location = useLocation();
  if (!requireAdmin()) {
    return <Navigate to="/admin/login" state={{ from: location.pathname }} replace />;
  }
  return children;
}

export default function App() {
  const location = useLocation();

  useEffect(() => {
    trackPageView(`${location.pathname}${location.search}${location.hash}`);
  }, [location.hash, location.pathname, location.search]);

  return (
    <div className="shell">
      <header className="topbar">
        <Link to="/" className="brand">
          GeoPhoto Globe
        </Link>
      </header>
      <Routes>
        <Route path="/" element={<PublicGlobePage />} />
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route
          path="/admin"
          element={
            <AdminGuard>
              <AdminListPage />
            </AdminGuard>
          }
        />
        <Route
          path="/admin/photos/:id"
          element={
            <AdminGuard>
              <AdminPhotoPage />
            </AdminGuard>
          }
        />
      </Routes>
    </div>
  );
}
