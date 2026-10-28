import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { DataProvider } from './lib/data';
import Layout from './components/Layout';
import Join from './pages/Join';
import NeedInvite from './pages/NeedInvite';
import Dashboard from './pages/Dashboard';
import Professors from './pages/Professors';
import ProfessorForm from './pages/ProfessorForm';
import ProfessorDetail from './pages/ProfessorDetail';
import Activity from './pages/Activity';
import More from './pages/More';
import Templates from './pages/Templates';
import Settings from './pages/Settings';
import Admin from './pages/Admin';

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="grid min-h-screen place-items-center muted">Loading…</div>;
  }

  return (
    <Routes>
      <Route path="/join" element={<Join />} />
      {user ? (
        <Route element={<DataProvider><Layout /></DataProvider>}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/professors" element={<Professors />} />
          <Route path="/professors/new" element={<ProfessorForm />} />
          <Route path="/professors/:id" element={<ProfessorDetail />} />
          <Route path="/professors/:id/edit" element={<ProfessorForm />} />
          <Route path="/activity" element={<Activity />} />
          <Route path="/more" element={<More />} />
          <Route path="/templates" element={<Templates />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/admin" element={user.role === 'admin' ? <Admin /> : <Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      ) : (
        <Route path="*" element={<NeedInvite />} />
      )}
    </Routes>
  );
}
