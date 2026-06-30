import { Navigate, Route, Routes } from "react-router-dom";

import { ModulePlaceholder } from "./components/common/ModulePlaceholder";
import { AppLayout } from "./components/layout/AppLayout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { useAuth } from "./context/auth-context";
import { AdminDashboard } from "./pages/dashboards/AdminDashboard";
import { EmployeeDashboard } from "./pages/dashboards/EmployeeDashboard";
import { HrDashboard } from "./pages/dashboards/HrDashboard";
import { ActivityPage } from "./pages/ActivityPage";
import { NotificationsPage } from "./pages/NotificationsPage";
import { DepartmentsPage } from "./pages/DepartmentsPage";
import { DepartmentDetailsPage } from "./pages/DepartmentDetailsPage";
import { HelpDeskPage } from "./pages/HelpDeskPage";
import { EmployeesPage } from "./pages/EmployeesPage";
import { KanbanPage } from "./pages/KanbanPage";
import { Login } from "./pages/Login";
import { QrLogin } from "./pages/QrLogin";
import { ProfilePage } from "./pages/ProfilePage";
import { HelpPage } from "./pages/HelpPage";
import { EmployeeReports } from "./pages/EmployeeReports";
import { ReportsPage } from "./pages/ReportsPage";
import { AnalysisReviewPage } from "./pages/expenses/AnalysisReviewPage";
import { ExpenseDetailsPage } from "./pages/expenses/ExpenseDetailsPage";
import { ExpenseVerificationPage } from "./pages/expenses/ExpenseVerificationPage";
import { ExpensesOverviewPage } from "./pages/expenses/ExpensesOverviewPage";
import { MyExpensesPage } from "./pages/expenses/MyExpensesPage";
import { PendingReviewsPage } from "./pages/expenses/PendingReviewsPage";
import { ProjectExpensesPage } from "./pages/expenses/ProjectExpensesPage";
import { ReimbursementsPage } from "./pages/expenses/ReimbursementsPage";
import { ExpenseReportPage } from "./pages/expenses/ExpenseReportPage";
import { SubmitExpensePage } from "./pages/expenses/SubmitExpensePage";
import { CreateProjectPage } from "./pages/projects/CreateProjectPage";
import { EditProjectPage } from "./pages/projects/EditProjectPage";
import { HrProjectsPage } from "./pages/projects/HrProjectsPage";
import { MyProjectsPage } from "./pages/projects/MyProjectsPage";
import { ProjectDetailsPage } from "./pages/projects/ProjectDetailsPage";
import { ProjectListPage } from "./pages/projects/ProjectListPage";
import { ProjectViewPage } from "./pages/projects/ProjectViewPage";
import { AdminTasksPage } from "./pages/tasks/AdminTasksPage";
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
      <Route path="/qr-login" element={<QrLogin />} />

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

      {/* Any authenticated user — help & user manual (role-aware content). */}
      <Route
        path="/help"
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<HelpPage />} />
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
        <Route path="tasks" element={<AdminTasksPage />} />
        <Route path="expenses" element={<ExpensesOverviewPage />} />
        <Route path="expenses/new" element={<SubmitExpensePage />} />
        <Route path="expenses/projects" element={<ProjectExpensesPage />} />
        <Route
          path="expenses/reimbursements"
          element={<ReimbursementsPage />}
        />
        <Route path="expenses/:id/edit" element={<SubmitExpensePage />} />
        <Route path="expenses/:id/analysis" element={<AnalysisReviewPage />} />
        <Route path="expenses/:id/verify" element={<ExpenseVerificationPage />} />
        <Route path="expenses/:id/report" element={<ExpenseReportPage />} />
        <Route path="expenses/:id" element={<ExpenseDetailsPage />} />
        <Route path="departments" element={<DepartmentsPage />} />
        <Route path="departments/:name" element={<DepartmentDetailsPage />} />
        <Route
          path="leave"
          element={<ModulePlaceholder title="Leave Management" />}
        />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="activity" element={<ActivityPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="helpdesk" element={<HelpDeskPage />} />
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
        <Route path="tasks" element={<MyTasksPage />} />
        <Route path="kanban" element={<KanbanPage />} />
        <Route path="expenses" element={<PendingReviewsPage />} />
        <Route path="expenses/new" element={<SubmitExpensePage />} />
        <Route
          path="expenses/reimbursements"
          element={<ReimbursementsPage />}
        />
        <Route path="expenses/:id/edit" element={<SubmitExpensePage />} />
        <Route path="expenses/:id/analysis" element={<AnalysisReviewPage />} />
        <Route path="expenses/:id/verify" element={<ExpenseVerificationPage />} />
        <Route path="expenses/:id/report" element={<ExpenseReportPage />} />
        <Route path="expenses/:id" element={<ExpenseDetailsPage />} />
        <Route path="employees" element={<EmployeesPage />} />
        <Route
          path="leave"
          element={<ModulePlaceholder title="Leave Management" />}
        />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="activity" element={<ActivityPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="helpdesk" element={<HelpDeskPage />} />
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
        <Route path="expenses" element={<MyExpensesPage />} />
        <Route path="expenses/new" element={<SubmitExpensePage />} />
        <Route path="expenses/:id/edit" element={<SubmitExpensePage />} />
        <Route path="expenses/:id/analysis" element={<AnalysisReviewPage />} />
        <Route path="expenses/:id/verify" element={<ExpenseVerificationPage />} />
        <Route path="expenses/:id/report" element={<ExpenseReportPage />} />
        <Route path="expenses/:id" element={<ExpenseDetailsPage />} />
        <Route path="reports" element={<EmployeeReports />} />
        <Route path="activity" element={<ActivityPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="helpdesk" element={<HelpDeskPage />} />
      </Route>

      <Route path="/" element={<RootRedirect />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
