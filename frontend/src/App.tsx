import { Navigate, Route, Routes } from "react-router-dom";

import { ModulePlaceholder } from "./components/common/ModulePlaceholder";
import { AppLayout } from "./components/layout/AppLayout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { useAuth } from "./context/auth-context";
import { AdminDashboard } from "./pages/dashboards/AdminDashboard";
import { EmployeeDashboard } from "./pages/dashboards/EmployeeDashboard";
import { HrDashboard } from "./pages/dashboards/HrDashboard";
import { DepartmentsPage } from "./pages/DepartmentsPage";
import { EmployeesPage } from "./pages/EmployeesPage";
import { KanbanPage } from "./pages/KanbanPage";
import { Login } from "./pages/Login";
import { ProfilePage } from "./pages/ProfilePage";
import { CreateProjectPage } from "./pages/projects/CreateProjectPage";
import { EditProjectPage } from "./pages/projects/EditProjectPage";
import { HrProjectsPage } from "./pages/projects/HrProjectsPage";
import { MyProjectsPage } from "./pages/projects/MyProjectsPage";
import { ProjectDetailsPage } from "./pages/projects/ProjectDetailsPage";
import { ProjectListPage } from "./pages/projects/ProjectListPage";
import { ProjectViewPage } from "./pages/projects/ProjectViewPage";
import { MyTasksPage } from "./pages/tasks/MyTasksPage";
import { CreateUserPage } from "./pages/users/CreateUserPage";
import { EditUserPage } from "./pages/users/EditUserPage";
import { UserListPage } from "./pages/users/UserListPage";
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

      {/* Any authenticated user — own profile. */}
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<ProfilePage />} />
      </Route>

      {/* ADMIN */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute allowedRoles={["ADMIN"]}>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<AdminDashboard />} />
        <Route path="users" element={<UserListPage />} />
        <Route path="users/new" element={<CreateUserPage />} />
        <Route path="users/:id" element={<EditUserPage />} />
        <Route path="projects" element={<ProjectListPage />} />
        <Route path="projects/new" element={<CreateProjectPage />} />
        <Route path="projects/:id" element={<ProjectDetailsPage />} />
        <Route path="projects/:id/edit" element={<EditProjectPage />} />
        <Route path="kanban" element={<KanbanPage />} />
        <Route path="departments" element={<DepartmentsPage />} />
        <Route
          path="leave"
          element={<ModulePlaceholder title="Leave Management" />}
        />
        <Route path="reports" element={<ModulePlaceholder title="Reports" />} />
        <Route
          path="settings"
          element={<ModulePlaceholder title="Settings" />}
        />
      </Route>

      {/* HR */}
      <Route
        path="/hr"
        element={
          <ProtectedRoute allowedRoles={["HR"]}>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<HrDashboard />} />
        <Route path="projects" element={<HrProjectsPage />} />
        <Route path="projects/:id" element={<ProjectViewPage />} />
        <Route path="kanban" element={<KanbanPage />} />
        <Route path="employees" element={<EmployeesPage />} />
        <Route
          path="leave"
          element={<ModulePlaceholder title="Leave Management" />}
        />
        <Route path="reports" element={<ModulePlaceholder title="Reports" />} />
      </Route>

      {/* EMPLOYEE */}
      <Route
        path="/employee"
        element={
          <ProtectedRoute allowedRoles={["EMPLOYEE"]}>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<EmployeeDashboard />} />
        <Route path="projects" element={<MyProjectsPage />} />
        <Route path="projects/:id" element={<ProjectViewPage />} />
        <Route path="tasks" element={<MyTasksPage />} />
        <Route path="kanban" element={<KanbanPage />} />
      </Route>

      <Route path="/" element={<RootRedirect />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
