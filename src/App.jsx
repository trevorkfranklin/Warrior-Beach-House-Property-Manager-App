import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/Auth';
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

function AppRoutes() {
  const { session, needsSetup } = useAuth();

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
          <Route path="/property-taxes"     element={<PropertyTaxes />} />
          <Route path="/hoa-dues"           element={<HOADues />} />
          <Route path="/projected-cashflow" element={<ProjectedCashflow />} />
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
