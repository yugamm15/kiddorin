import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Toaster } from 'react-hot-toast';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Stock from './pages/Stock';
import Inventory from './pages/Inventory';
import BarcodePage from './pages/Barcode';
import Billing from './pages/Billing';
import Reports from './pages/Reports';
import Branches from './pages/Branches';
import Settings from './pages/Settings';
import Dealers from './pages/Dealers';
import Exchanges from './pages/Exchanges';
import AdminLogin from './pages/AdminLogin';
import Catalog from './pages/Catalog';
import Expenses from './pages/Expenses';

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  
  if (loading) return <div>Loading...</div>;
  if (!user) return <Navigate to="/login" />;
  
  return children;
};

const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/admin" element={<AdminLogin />} />
      
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Dashboard />} />
        <Route path="stock" element={<Stock />} />
        <Route path="inventory" element={<Inventory />} />
        <Route path="barcode" element={<BarcodePage />} />
        <Route path="billing" element={<Billing />} />
        <Route path="exchanges" element={<Exchanges />} />
        <Route path="reports" element={<Reports />} />
        <Route path="branches" element={<Branches />} />
        <Route path="dealers" element={<Dealers />} />
        <Route path="catalog" element={<Catalog />} />
        <Route path="expenses" element={<Expenses />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <Router>
        <AppRoutes />
        <Toaster 
          position="bottom-right"
          toastOptions={{
            style: {
              background: '#FFFFFF',
              color: '#000000',
              fontFamily: 'Montserrat, sans-serif',
              fontSize: '12px',
              borderRadius: '2px',
              border: '1px solid #C5A059',
              boxShadow: '0 10px 30px rgba(0, 0, 0, 0.05)'
            },
          }}
        />
      </Router>
    </AuthProvider>
  );
}

export default App;
