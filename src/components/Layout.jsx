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

  const navItems = [
    { path: '/', name: 'Dashboard', icon: <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg> },
    { path: '/stock', name: 'Stock Insertion', icon: <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M20 7H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z"/><path d="M16 3H8a2 2 0 00-2 2v2h12V5a2 2 0 00-2-2z"/></svg> },
    { path: '/inventory', name: 'Inventory', icon: <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h4"/></svg> },
    { path: '/barcode', name: 'Barcodes', icon: <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M3 5v14M7 5v14M11 5v14M15 5v10M19 5v10M3 19h4M15 15h4v4h-4z"/></svg> },
    { path: '/billing', name: 'Billing / POS', icon: <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M9 14l6-6M4 4h16v2H4zM4 8h16v12H4z"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="14" r="1"/></svg> },
    { path: '/dealers', name: 'Dealers', icon: <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg> },
    { path: '/reports', name: 'Reports', icon: <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M18 20V10M12 20V4M6 20v-6"/></svg> },
    { path: '/branches', name: 'Branches', icon: <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> },
  ];

  const leftNav = navItems.slice(0, 4);
  const rightNav = navItems.slice(4);

  return (
    <div id="app" className="top-nav-layout">
      <div className="utility-bar">
        <div className="utility-left">📍 {user?.branch?.name || 'Main Store'}</div>
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
        
        <div className="nav-center brand-logo">
          Kiddor<span>in</span>
          <div className="brand-tag">The World in Their Wardrobe</div>
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
