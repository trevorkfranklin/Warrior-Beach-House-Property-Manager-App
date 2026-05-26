import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/Auth';
import { useAutoSimpleFINSync } from './hooks/useAutoSimpleFINSync';
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

function AppRoutes() {
  const { session, needsSetup } = useAuth();
  useAutoSimpleFINSync();

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
