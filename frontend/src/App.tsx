import { Navigate, Route, Routes } from "react-router-dom";

import { ProtectedRoute } from "./components/ProtectedRoute";
import { useAuth } from "./context/auth-context";
import { Admin } from "./pages/Admin";
import { Employee } from "./pages/Employee";
import { Hr } from "./pages/Hr";
import { Login } from "./pages/Login";
import { roleHome } from "./types/auth";

/** Sends "/" to the user's home area, or to /login when unauthenticated. */
function RootRedirect() {
  const { isAuthenticated, user } = useAuth();
  return isAuthenticated && user ? (
    <Navigate to={roleHome(user.role)} replace />
  ) : (
    <Navigate to="/login" replace />
  );
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route
        path="/admin"
        element={
          <ProtectedRoute allowedRoles={["ADMIN"]}>
            <Admin />
          </ProtectedRoute>
        }
      />
      <Route
        path="/hr"
        element={
          <ProtectedRoute allowedRoles={["HR"]}>
            <Hr />
          </ProtectedRoute>
        }
      />
      <Route
        path="/employee"
        element={
          <ProtectedRoute allowedRoles={["EMPLOYEE"]}>
            <Employee />
          </ProtectedRoute>
        }
      />

      <Route path="/" element={<RootRedirect />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
