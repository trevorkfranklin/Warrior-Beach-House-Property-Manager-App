import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, ArrowLeftRight, Upload, Home, DollarSign, TrendingUp,
  CalendarDays, LogOut, ShieldCheck, Bell, MessageSquare, Waves,
} from 'lucide-react';
import { useAuth } from '../context/Auth';
import { useNotificationCount } from '../pages/Notifications';

const navItems = [
  { to: '/',                  label: 'Dashboard',        icon: LayoutDashboard },
  { to: '/transactions',      label: 'Transactions',     icon: ArrowLeftRight },
  { to: '/import',            label: 'Import',           icon: Upload },
  { to: '/property',          label: 'Property',         icon: Home },
  { to: '/reservations',      label: 'Reservations',     icon: CalendarDays },
  { to: '/property-taxes',    label: 'Property Taxes',   icon: DollarSign },
  { to: '/hoa-dues',          label: 'HOA Dues',         icon: Home },
  { to: '/projected-cashflow',label: 'Projected Cashflow',icon: TrendingUp },
  { to: '/chat',              label: 'AI Assistant',     icon: MessageSquare },
  { to: '/notifications',     label: 'Notifications',    icon: Bell },
  { to: '/users',             label: 'Users',            icon: ShieldCheck, adminOnly: true },
];

export default function Sidebar() {
  const { session, logout, isAdmin } = useAuth();
  const pendingCount = useNotificationCount();

  return (
    <aside className="w-64 h-screen flex flex-col flex-shrink-0 bg-navy-900 border-r border-navy-700">
      <div className="flex items-center gap-3 px-5 py-6 border-b border-navy-700 flex-shrink-0">
        <div className="w-11 h-11 bg-emerald-500 rounded-xl flex items-center justify-center flex-shrink-0">
          <Waves size={22} className="text-white" />
        </div>
        <div>
          <div className="font-bold text-white text-base leading-tight">Warrior Beach House</div>
          <div className="text-xs text-slate-500">18611 Warrior Rd, Galveston</div>
        </div>
      </div>

      {session && (
        <div className="px-3 pb-2 border-b border-navy-700 pt-3 flex items-center justify-between">
          <div className="min-w-0">
            <div className="text-xs text-white font-medium truncate">{session.username}</div>
            <div className="text-xs text-slate-500">{session.role === 'admin' ? 'Admin' : 'Viewer'}</div>
          </div>
          <button onClick={logout} title="Sign out" className="text-slate-500 hover:text-red-400 flex-shrink-0 ml-2">
            <LogOut size={15} />
          </button>
        </div>
      )}

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {navItems.filter(item => !item.adminOnly || isAdmin).map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive ? 'bg-navy-700 text-emerald-400' : 'text-slate-300 hover:bg-navy-800 hover:text-white'
              }`
            }>
            <Icon size={18} />
            <span className="flex-1">{label}</span>
            {to === '/notifications' && pendingCount > 0 && (
              <span className="bg-yellow-400 text-navy-900 text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0">
                {pendingCount > 9 ? '9+' : pendingCount}
              </span>
            )}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
