import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/Auth';
import { useAutoSimpleFINSync } from './hooks/useAutoSimpleFINSync';
import { useCFSAutoGenerate } from './hooks/useCFSAutoGenerate';
import Login from './pages/Login';
import Users from './pages/Users';
import Notifications from './pages/Notifications';
import Chat from './pages/Chat';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Transactions from './pages/Transactions';
import Import from './pages/Import';
import Property from './pages/Property';
import PropertyTaxes from './pages/PropertyTaxes';
import HOADues from './pages/HOADues';
import Reservations from './pages/Reservations';
import ProjectedCashflow from './pages/ProjectedCashflow';
import CashflowDetails from './pages/CashflowDetails';
import Owners from './pages/Owners';
import Migrate from './pages/Migrate';

function AppRoutes() {
  const { session, loading, needsSetup } = useAuth();
  useAutoSimpleFINSync();
  useCFSAutoGenerate();

  if (loading) return (
    <div className="h-screen bg-navy-900 flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!session || needsSetup) return <Login />;

  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/"                   element={<Dashboard />} />
          <Route path="/transactions"       element={<Transactions />} />
          <Route path="/import"             element={<Import />} />
          <Route path="/property"           element={<Property />} />
          <Route path="/reservations"       element={<Reservations />} />
          <Route path="/owners"             element={<Owners />} />
          <Route path="/property-taxes"     element={<PropertyTaxes />} />
          <Route path="/hoa-dues"           element={<HOADues />} />
          <Route path="/projected-cashflow" element={<ProjectedCashflow />} />
          <Route path="/cashflow-details"   element={<CashflowDetails />} />
          <Route path="/users"              element={<Users />} />
          <Route path="/notifications"      element={<Notifications />} />
          <Route path="/chat"               element={<Chat />} />
          <Route path="/migrate"            element={<Migrate />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
