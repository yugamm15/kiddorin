import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Layout = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const branchNavItems = [
    { path: '/stock', name: 'Stock Insertion', icon: <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M20 7H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z"/><path d="M16 3H8a2 2 0 00-2 2v2h12V5a2 2 0 00-2-2z"/></svg> },
    { path: '/inventory', name: 'Inventory', icon: <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h4"/></svg> },
    { path: '/barcode', name: 'Barcodes', icon: <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M3 5v14M7 5v14M11 5v14M15 5v10M19 5v10M3 19h4M15 15h4v4h-4z"/></svg> },
    { path: '/billing', name: 'Billing / POS', icon: <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M9 14l6-6M4 4h16v2H4zM4 8h16v12H4z"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="14" r="1"/></svg> },
    { path: '/exchanges', name: 'Returns / Exchange', icon: <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg> },
    { path: '/reports', name: 'Reports', icon: <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M18 20V10M12 20V4M6 20v-6"/></svg> },
  ];

  const superAdminNavItems = [
    { path: '/', name: 'Dashboard', icon: null },
    { path: '/branches', name: 'Branches', icon: null },
    { path: '/dealers', name: 'Dealers', icon: null },
    { path: '/catalog', name: 'Catalog (Cat & Size)', icon: null },
    { path: '/expenses', name: 'Expenses', icon: null },
    { path: '/reports', name: 'Reports', icon: null },
  ];

  const activeNav = user?.role === 'superadmin' ? superAdminNavItems : branchNavItems;
  const splitIdx = Math.ceil(activeNav.length / 2);
  const leftNav = activeNav.slice(0, splitIdx);
  const rightNav = activeNav.slice(splitIdx);

  return (
    <div id="app" className="top-nav-layout">
      <div className="utility-bar">
        <div className="utility-left">
          {user?.role === 'superadmin' ? '🌐 SUPER ADMIN PORTAL' : `📍 ${user?.branch?.name || 'Main Store'}`}
        </div>
        <div className="utility-right">
          <button className="logout-text" onClick={handleLogout}>LOGOUT</button>
        </div>
      </div>
      
      <header className="luxury-header">
        <button 
          className="hamburger" 
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        >
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d={isMobileMenuOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
          </svg>
        </button>

        <nav className={`nav-left ${isMobileMenuOpen ? 'open' : ''}`}>
          {leftNav.map((item) => (
            <NavLink key={item.path} to={item.path} className={({ isActive }) => `header-link ${isActive ? 'active' : ''}`} onClick={() => setIsMobileMenuOpen(false)}>
              {item.name}
            </NavLink>
          ))}
        </nav>
        
        <div className="nav-center brand-logo" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
          <img src="/images/logo%20black.png" alt="Kiddorin Logo" className="navbar-logo" />
        </div>

        <nav className={`nav-right ${isMobileMenuOpen ? 'open' : ''}`}>
          {rightNav.map((item) => (
            <NavLink key={item.path} to={item.path} className={({ isActive }) => `header-link ${isActive ? 'active' : ''}`} onClick={() => setIsMobileMenuOpen(false)}>
              {item.name}
            </NavLink>
          ))}
        </nav>
      </header>
      
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
};

export default Layout;
