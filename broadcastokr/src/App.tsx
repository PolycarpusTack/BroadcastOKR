import { Routes, Route, Navigate } from 'react-router-dom';
import { DashboardPage } from './pages/DashboardPage';
import { GoalsPage } from './pages/GoalsPage';
import { TasksPage } from './pages/TasksPage';
import { TeamPage } from './pages/TeamPage';
import { ReportsPage } from './pages/ReportsPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/goals" element={<GoalsPage />} />
      <Route path="/tasks" element={<TasksPage />} />
      <Route path="/team" element={<TeamPage />} />
      <Route path="/reports" element={<ReportsPage />} />
    </Routes>
  );
}
