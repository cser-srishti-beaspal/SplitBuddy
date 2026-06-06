import React, { useEffect, useState, createContext, useContext } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Users, 
  User, 
  Settings, 
  LogOut, 
  Plus, 
  Download,
  AlertCircle
} from 'lucide-react';
import supabase from '../supabaseClient';
import { Profile } from '../types';
import ExpenseForm from './ExpenseForm';

// Create a context so sub-pages can trigger layouts/modals and get user profile
interface LayoutContextProps {
  profile: Profile | null;
  deferredPrompt: any;
  installApp: () => void;
  triggerRefresh: () => void;
  refreshKey: number;
}

const LayoutContext = createContext<LayoutContextProps>({
  profile: null,
  deferredPrompt: null,
  installApp: () => {},
  triggerRefresh: () => {},
  refreshKey: 0,
});

export const useAppLayout = () => useContext(LayoutContext);

export default function Layout() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const navigate = useNavigate();

  const triggerRefresh = () => setRefreshKey(prev => prev + 1);

  // Load User Profile
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setLoading(false);
          return;
        }

        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();

        if (error) throw error;
        setProfile(data);
      } catch (err) {
        console.error('Error fetching user profile:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session) {
        const { data } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single();
        setProfile(data);
      } else if (event === 'SIGNED_OUT') {
        setProfile(null);
        navigate('/auth');
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [navigate]);

  // Listen for PWA Install Prompt
  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      // Prevent Chrome 67 and earlier from automatically showing the prompt
      e.preventDefault();
      // Stash the event so it can be triggered later.
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const installApp = () => {
    if (!deferredPrompt) return;
    // Show the prompt
    deferredPrompt.prompt();
    // Wait for the user to respond to the prompt
    deferredPrompt.userChoice.then((choiceResult: { outcome: string }) => {
      if (choiceResult.outcome === 'accepted') {
        console.log('User accepted the install prompt');
      } else {
        console.log('User dismissed the install prompt');
      }
      setDeferredPrompt(null);
    });
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  if (loading) {
    return (
      <div style={{
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh', 
        backgroundColor: 'var(--bg-primary)',
        color: 'var(--primary)'
      }}>
        <div style={{ textAlign: 'center' }}>
          <h3 style={{ marginTop: '12px', fontFamily: 'var(--font-family-display)' }}>Loading SplitBuddy...</h3>
        </div>
      </div>
    );
  }

  return (
    <LayoutContext.Provider value={{ profile, deferredPrompt, installApp, triggerRefresh, refreshKey }}>
      <div className="app-container">
        
        {/* DESKTOP SIDEBAR */}
        <aside className="desktop-sidebar">
          <div className="sidebar-logo">
            <img src="/logo.svg" alt="SplitBuddy Logo" />
            <h1>SplitBuddy</h1>
          </div>
          
          <nav className="sidebar-nav">
            <NavLink to="/" className={({ isActive }) => `sidebar-nav-item ${isActive ? 'active' : ''}`} end>
              <LayoutDashboard size={20} />
              Dashboard
            </NavLink>
            <NavLink to="/groups" className={({ isActive }) => `sidebar-nav-item ${isActive ? 'active' : ''}`}>
              <Users size={20} />
              Groups
            </NavLink>
            <NavLink to="/friends" className={({ isActive }) => `sidebar-nav-item ${isActive ? 'active' : ''}`}>
              <User size={20} />
              Friends
            </NavLink>
            <NavLink to="/profile" className={({ isActive }) => `sidebar-nav-item ${isActive ? 'active' : ''}`}>
              <Settings size={20} />
              Settings & Install
            </NavLink>

            {deferredPrompt && (
              <button 
                onClick={installApp} 
                className="sidebar-nav-item" 
                style={{ 
                  marginTop: 'auto', 
                  backgroundColor: 'var(--primary-glow)', 
                  border: '1px solid var(--primary)',
                  color: 'var(--primary)',
                  cursor: 'pointer'
                }}
              >
                <Download size={20} />
                Install App
              </button>
            )}
            
            <button 
              onClick={() => setShowAddExpense(true)}
              className="btn btn-primary" 
              style={{ marginTop: deferredPrompt ? '12px' : 'auto', width: '100%' }}
            >
              <Plus size={18} />
              Add Expense
            </button>
          </nav>

          <div className="sidebar-user">
            <div className="sidebar-user-info">
              <img 
                className="sidebar-user-avatar" 
                src={profile?.avatar_url || `https://api.dicebear.com/7.x/adventurer/svg?seed=${profile?.id}`} 
                alt="User Avatar" 
              />
              <div>
                <div className="sidebar-user-name">{profile?.name}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Logged In</div>
              </div>
            </div>
            <button className="logout-btn" onClick={handleLogout} title="Log Out">
              <LogOut size={18} />
            </button>
          </div>
        </aside>

        {/* MAIN BODY SCROLL AREA */}
        <main className="main-content">
          {deferredPrompt && (
            <div 
              style={{
                backgroundColor: 'var(--primary-glow)',
                borderBottom: '1px solid var(--primary)',
                padding: '10px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '13px'
              }}
              className="mobile-only-banner"
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertCircle size={16} color="var(--primary)" />
                <span>Get app on your home screen!</span>
              </div>
              <button 
                onClick={installApp} 
                className="btn btn-primary" 
                style={{ padding: '6px 12px', fontSize: '12px' }}
              >
                Install
              </button>
            </div>
          )}
          <Outlet />
        </main>

        {/* MOBILE BOTTOM NAV BAR */}
        <nav className="mobile-bottom-nav">
          <NavLink to="/" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} end>
            <LayoutDashboard />
            Dashboard
          </NavLink>
          <NavLink to="/groups" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <Users />
            Groups
          </NavLink>
          
          {/* Floating plus button in center */}
          <div className="nav-item nav-item-center" onClick={() => setShowAddExpense(true)}>
            <div className="nav-item-center-btn">
              <Plus size={24} strokeWidth={3} />
            </div>
          </div>

          <NavLink to="/friends" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <User />
            Friends
          </NavLink>
          <NavLink to="/profile" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <Settings />
            Settings
          </NavLink>
        </nav>

        {/* GLOBAL ADD EXPENSE MODAL */}
        {showAddExpense && (
          <ExpenseForm 
            onClose={() => {
              setShowAddExpense(false);
              triggerRefresh();
            }} 
          />
        )}
      </div>
    </LayoutContext.Provider>
  );
}
