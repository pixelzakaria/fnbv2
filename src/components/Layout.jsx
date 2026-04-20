import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { auth } from '../firebase';
import { signOut } from 'firebase/auth';
import {
  LayoutDashboard, Boxes, ArrowRightLeft, ScrollText,
  Users, Store, LogOut, Menu, X, PackageCheck, Undo2, BarChart3, Truck
} from 'lucide-react';

export default function Layout({ children }) {
  const { user, role } = useAuth(); // Extracted 'user' here
  const location = useLocation();
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/login');
  };

  // Define links with their respective icons
  const adminLinks = [
    { name: 'Dashboard', path: '/admin', icon: LayoutDashboard },
    { name: 'Master Inventory', path: '/admin/inventory', icon: Boxes },
    { name: 'Transfer Stock', path: '/admin/transfer', icon: ArrowRightLeft },
    { name: 'In Transit', path: '/admin/transit', icon: Truck }, // <--- ADD THIS
    { name: 'Confirm Returns', path: '/admin/returns', icon: Undo2 },
    { name: 'Audit Logs', path: '/admin/logs', icon: ScrollText },
    { name: 'Manage Users', path: '/admin/users', icon: Users },
    { name: 'Reports', path: '/admin/reports', icon: BarChart3 },
  ];

  const substockLinks = [
    { name: 'Dashboard', path: '/substock', icon: LayoutDashboard },
    { name: 'Pending Deliveries', path: '/substock/deliveries', icon: PackageCheck },
    { name: 'Dispatch & Returns', path: '/substock/dispatch', icon: ArrowRightLeft },
    { name: 'Return to Warehouse', path: '/substock/return-to-warehouse', icon: Undo2 },
  ];

  const viewerLinks = [
    { name: 'Dashboard', path: '/admin', icon: LayoutDashboard },
    { name: 'Audit Logs', path: '/admin/logs', icon: ScrollText },
    { name: 'Reports', path: '/admin/reports', icon: BarChart3 },
  ];

  const barLinks = [
    { name: 'My Station', path: '/bar/dashboard', icon: Store },
  ];

  const getLinks = () => {
    if (role === 'admin') return adminLinks;
    if (role === 'viewer') return viewerLinks;
    if (role === 'bar') return barLinks;
    return substockLinks;
  };

  const links = getLinks();
  const closeMenu = () => setIsMobileMenuOpen(false);

  // Split links for mobile App-like navigation (Max 3 in bottom bar + "More" Menu)
  const MAX_BOTTOM_LINKS = 3;
  const bottomNavLinks = links.slice(0, MAX_BOTTOM_LINKS);
  const drawerLinks = links.slice(MAX_BOTTOM_LINKS);

  // --- DYNAMIC THEME ENGINE ---
  const theme = {
    admin: {
      logo: '/logowhite.png',
      sidebar: 'bg-blue-900 text-white',
      subtitle: 'text-blue-300',
      btn: 'bg-blue-800 text-white active:bg-blue-700',
      border: 'border-blue-800',
      activeLink: 'bg-blue-600 text-white shadow-lg shadow-blue-900/50',
      inactiveLink: 'text-blue-200 hover:bg-blue-800 hover:text-white',
      iconActive: 'text-white',
      iconInactive: 'text-blue-300',
      logout: 'text-red-300 hover:bg-red-500 hover:text-white active:bg-red-600'
    },
    substock: {
      logo: '/logowhite.png',
      sidebar: 'bg-emerald-900 text-white',
      subtitle: 'text-emerald-300',
      btn: 'bg-emerald-800 text-white active:bg-emerald-700',
      border: 'border-emerald-800',
      activeLink: 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/50',
      inactiveLink: 'text-emerald-200 hover:bg-emerald-800 hover:text-white',
      iconActive: 'text-white',
      iconInactive: 'text-emerald-300',
      logout: 'text-red-300 hover:bg-red-500 hover:text-white active:bg-red-600'
    },
    bar: {
      logo: '/logoblack.png',
      sidebar: 'bg-amber-400 text-amber-950',
      subtitle: 'text-amber-800',
      btn: 'bg-amber-500 text-amber-950 active:bg-amber-600',
      border: 'border-amber-500',
      activeLink: 'bg-amber-600 text-white shadow-lg shadow-amber-900/20',
      inactiveLink: 'text-amber-800 hover:bg-amber-500 hover:text-amber-950',
      iconActive: 'text-white',
      iconInactive: 'text-amber-700',
      logout: 'text-red-600 hover:bg-red-600 hover:text-white active:bg-red-700'
    },
    viewer: {
      logo: '/logoblack.png',
      sidebar: 'bg-white text-gray-900',
      subtitle: 'text-gray-500',
      btn: 'bg-gray-100 text-gray-900 active:bg-gray-200',
      border: 'border-gray-200',
      activeLink: 'bg-gray-900 text-white shadow-lg',
      inactiveLink: 'text-gray-500 hover:bg-gray-100 hover:text-gray-900',
      iconActive: 'text-white',
      iconInactive: 'text-gray-400',
      logout: 'text-red-600 hover:bg-red-50 active:bg-red-100'
    }
  }[role] || {
    // Fallback
    logo: '/logowhite.png',
    sidebar: 'bg-gray-900 text-white',
    subtitle: 'text-blue-400',
    btn: 'bg-gray-800 text-white active:bg-gray-700',
    border: 'border-gray-800',
    activeLink: 'bg-blue-600 text-white shadow-lg shadow-blue-900/50',
    inactiveLink: 'text-gray-400 hover:bg-gray-800 hover:text-white',
    iconActive: 'text-white',
    iconInactive: 'text-gray-400',
    logout: 'text-red-400 hover:bg-red-500 hover:text-white active:bg-red-600'
  };

  const getRoleTitle = () => {
    if (role === 'admin') return 'Admin Portal';
    if (role === 'viewer') return 'System Viewer';
    if (role === 'bar') return 'Bar Lead';
    return 'Zone Manager';
  };

  return (
    <div className="flex h-[100dvh] bg-gray-50 overflow-hidden">

      {/* --- MOBILE TOP BAR --- */}
      <div className={`md:hidden fixed top-0 left-0 right-0 h-16 flex flex-col justify-center px-4 z-20 shadow-sm ${theme.sidebar}`}>
        <img src={theme.logo} alt="Festival F&B" className="h-5 w-auto object-contain self-start" />
        <div className={`flex items-center justify-between mt-1 ${theme.subtitle}`}>
          <span className="text-[10px] font-bold uppercase tracking-wider">{getRoleTitle()}</span>
          <span className="text-[10px] font-medium lowercase tracking-normal opacity-80 truncate ml-2">
            {user?.email}
          </span>
        </div>
      </div>

      {/* --- MOBILE APP-STYLE BOTTOM NAVIGATION --- */}
      <div className={`md:hidden fixed bottom-0 left-0 right-0 h-[68px] z-40 flex justify-around items-center border-t shadow-[0_-4px_20px_rgba(0,0,0,0.15)] pb-safe ${theme.sidebar} ${theme.border}`}>
        {bottomNavLinks.map((link) => {
          const isActive = location.pathname === link.path;
          const Icon = link.icon;
          // Keep names short for bottom tabs (e.g. "Transfer Stock" -> "Transfer")
          const shortName = link.name.includes(' ') && link.name.length > 10 ? link.name.split(' ')[0] : link.name;

          return (
            <Link
              key={link.path}
              to={link.path}
              className={`flex flex-col items-center justify-center w-full h-full space-y-1 transition-all ${isActive ? (role === 'viewer' ? 'text-gray-900' : theme.iconActive) : theme.iconInactive}`}
            >
              <Icon size={22} className={isActive ? 'opacity-100' : 'opacity-70'} />
              <span className={`text-[9px] font-black uppercase tracking-wider ${isActive ? 'opacity-100' : 'opacity-70'}`}>
                {shortName}
              </span>
            </Link>
          );
        })}

        {/* The "More" Drawer Toggle Button */}
        <button
          onClick={() => setIsMobileMenuOpen(true)}
          className={`flex flex-col items-center justify-center w-full h-full space-y-1 transition-all ${isMobileMenuOpen ? (role === 'viewer' ? 'text-gray-900' : theme.iconActive) : theme.iconInactive}`}
        >
          <Menu size={22} className={isMobileMenuOpen ? 'opacity-100' : 'opacity-70'} />
          <span className={`text-[9px] font-black uppercase tracking-wider ${isMobileMenuOpen ? 'opacity-100' : 'opacity-70'}`}>
            More
          </span>
        </button>
      </div>

      {/* --- MOBILE OVERLAY --- */}
      {isMobileMenuOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/60 z-40 backdrop-blur-sm"
          onClick={closeMenu}
        />
      )}

      {/* --- SIDEBAR (Desktop Fixed, Mobile Slide-out Drawer) --- */}
      <div className={`
        fixed inset-y-0 left-0 z-50 w-72 md:w-64 flex flex-col shadow-2xl 
        transform transition-transform duration-300 ease-in-out md:relative md:translate-x-0
        ${theme.sidebar}
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>

        {/* Desktop Sidebar Header */}
        <div className="hidden md:block p-6 mb-2">
          <img src={theme.logo} alt="Festival F&B" className="h-7 w-auto object-contain mb-2" />
          <p className={`${theme.subtitle} text-xs font-bold uppercase tracking-wider mt-1`}>
            {getRoleTitle()}
          </p>
          <p className={`${theme.subtitle} text-[11px] font-medium opacity-75 mt-1 truncate`}>
            {user?.email}
          </p>
        </div>

        {/* Mobile Drawer Header */}
        <div className={`md:hidden flex justify-between items-center p-4 border-b ${theme.border}`}>
          <div className="flex flex-col">
            <span className="font-black tracking-widest text-sm uppercase">Menu</span>
            <span className={`${theme.subtitle} text-[10px] font-medium truncate mt-0.5`}>{user?.email}</span>
          </div>
          <button onClick={closeMenu} className={`p-2 rounded-lg ${theme.btn}`}>
            <X size={20} />
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 px-4 py-4 space-y-2 overflow-y-auto">

          {/* Desktop Links (Shows All) */}
          <div className="hidden md:block space-y-2">
            {links.map((link) => {
              const isActive = location.pathname === link.path;
              const Icon = link.icon;
              return (
                <Link
                  key={link.path}
                  to={link.path}
                  className={`flex items-center gap-4 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${isActive ? theme.activeLink : theme.inactiveLink
                    }`}
                >
                  <Icon size={20} className={isActive ? theme.iconActive : theme.iconInactive} />
                  {link.name}
                </Link>
              );
            })}
          </div>

          {/* Mobile Drawer Links (Shows only what didn't fit in bottom nav) */}
          <div className="md:hidden space-y-2">
            {drawerLinks.length > 0 ? drawerLinks.map((link) => {
              const isActive = location.pathname === link.path;
              const Icon = link.icon;
              return (
                <Link
                  key={link.path}
                  to={link.path}
                  onClick={closeMenu}
                  className={`flex items-center gap-4 px-4 py-4 rounded-xl text-sm font-medium transition-all duration-200 ${isActive ? theme.activeLink : theme.inactiveLink
                    }`}
                >
                  <Icon size={20} className={isActive ? theme.iconActive : theme.iconInactive} />
                  {link.name}
                </Link>
              );
            }) : (
              <p className={`text-xs italic px-4 py-2 ${theme.subtitle}`}>All tools available in bottom bar.</p>
            )}
          </div>
        </nav>

        {/* Logout Button */}
        <div className={`p-4 border-t ${theme.border}`}>
          <button
            onClick={handleLogout}
            className={`flex items-center gap-4 w-full text-left px-4 py-4 md:py-3 text-sm font-medium rounded-xl transition-colors duration-200 ${theme.logout}`}
          >
            <LogOut size={20} />
            Sign Out
          </button>
        </div>
      </div>

      {/* --- MAIN CONTENT AREA --- */}
      {/* Added pb-[68px] on mobile so bottom content doesn't hide behind the new nav bar */}
      <div className="flex-1 flex flex-col min-w-0 pt-16 pb-[68px] md:pt-0 md:pb-0 overflow-hidden bg-gray-50">
        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          {children}
        </main>
      </div>

    </div>
  );
}