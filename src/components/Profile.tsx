import React, { useState } from 'react';
import { useAppLayout } from './Layout';
import supabase from '../supabaseClient';
import { 
  Mail, 
  Smartphone, 
  Download, 
  Info,
  LogOut,
  Check,
  Edit2,
  Share2,
  Sparkles
} from 'lucide-react';

export default function Profile() {
  const { profile, deferredPrompt, installApp, triggerRefresh } = useAppLayout();
  
  const [name, setName] = useState(profile?.name || '');
  const [editing, setEditing] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // OS guide tab: 'ios' | 'android'
  const [osTab, setOsTab] = useState<'ios' | 'android'>('ios');

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setUpdating(true);
    setMessage(null);

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ name: name.trim() })
        .eq('id', profile!.id);

      if (error) throw error;
      
      setMessage({ type: 'success', text: 'Name updated successfully!' });
      setEditing(false);
      triggerRefresh();

      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to update profile.' });
    } finally {
      setUpdating(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <div className="page-container">
      {/* Page Title */}
      <div className="page-header">
        <div>
          <h2 className="page-title">Settings</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '2px' }}>
            Manage profile settings and app installation
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        
        {/* User Card */}
        <section className="glass-card" style={{ display: 'flex', gap: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
          <img 
            src={profile?.avatar_url || `https://api.dicebear.com/7.x/adventurer/svg?seed=${profile?.id}`} 
            alt={profile?.name} 
            style={{ width: '80px', height: '80px', borderRadius: '50%', backgroundColor: 'var(--bg-accent)' }}
          />

          <div style={{ flex: 1, minWidth: '200px' }}>
            {editing ? (
              <form onSubmit={handleUpdateProfile} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                  type="text"
                  className="form-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  style={{ padding: '8px 12px' }}
                />
                <button type="submit" className="btn btn-primary" disabled={updating} style={{ padding: '8px 12px' }}>
                  {updating ? 'Saving...' : <Check size={16} />}
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setEditing(false)} style={{ padding: '8px 12px' }}>
                  Cancel
                </button>
              </form>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h3 style={{ fontSize: '20px', fontWeight: 700 }}>{profile?.name}</h3>
                <button 
                  onClick={() => setEditing(true)} 
                  style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
                  title="Edit Name"
                >
                  <Edit2 size={16} />
                </button>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)', fontSize: '13px', marginTop: '6px' }}>
              <Mail size={14} />
              <span>{profile?.email}</span>
            </div>
          </div>
          
          <button onClick={handleLogout} className="btn btn-danger" style={{ alignSelf: 'center' }}>
            <LogOut size={16} />
            Log Out
          </button>
        </section>

        {message && (
          <div 
            style={{ 
              padding: '12px', 
              borderRadius: '8px', 
              fontSize: '13px', 
              backgroundColor: message.type === 'error' ? 'var(--color-owe-bg)' : 'var(--color-owed-bg)', 
              color: message.type === 'error' ? 'var(--color-owe)' : 'var(--color-owed)',
              border: `1px solid ${message.type === 'error' ? 'rgba(244, 63, 94, 0.2)' : 'rgba(16, 185, 129, 0.2)'}`
            }}
          >
            {message.text}
          </div>
        )}

        {/* PWA INSTALLATION OPTIONS */}
        <section className="glass-card">
          <h3 style={{ fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <Smartphone size={20} color="var(--primary)" />
            Install App on Mobile
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '20px' }}>
            SplitBuddy is a Progressive Web App (PWA). You can install it on your smartphone or desktop for full-screen mode, faster loading, and offline access.
          </p>

          {/* Prompt available */}
          {deferredPrompt ? (
            <div 
              style={{ 
                padding: '16px', 
                borderRadius: '12px', 
                backgroundColor: 'var(--primary-glow)', 
                border: '1px solid var(--primary)',
                textAlign: 'center',
                marginBottom: '20px'
              }}
            >
              <Sparkles size={24} color="var(--primary)" style={{ margin: '0 auto 8px' }} />
              <h4 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '4px' }}>Ready to Install!</h4>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '14px' }}>
                Your browser supports one-click installation for this device.
              </p>
              <button onClick={installApp} className="btn btn-primary">
                <Download size={16} />
                Install Application
              </button>
            </div>
          ) : (
            <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: 'var(--bg-tertiary)', fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '20px' }}>
              <Info size={16} />
              <span>If your device has already installed this PWA, you can open it directly from your App Drawer / Home Screen!</span>
            </div>
          )}

          {/* OS Tab instruction manuals */}
          <div className="detail-tab-container" style={{ marginBottom: '16px' }}>
            <div 
              className={`detail-tab ${osTab === 'ios' ? 'active' : ''}`}
              onClick={() => setOsTab('ios')}
            >
              Apple iOS (iPhone/iPad)
            </div>
            <div 
              className={`detail-tab ${osTab === 'android' ? 'active' : ''}`}
              onClick={() => setOsTab('android')}
            >
              Android (Chrome/Samsung)
            </div>
          </div>

          {osTab === 'ios' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13px' }}>
              <div style={{ display: 'flex', gap: '10px' }}>
                <span style={{ width: '22px', height: '22px', borderRadius: '50%', backgroundColor: 'var(--bg-accent)', display: 'flex', alignItems: 'center', justifySelf: 'center', justifyContent: 'center', fontWeight: 'bold' }}>1</span>
                <span>Open **SplitBuddy** website in the native **Safari** browser on your iPhone.</span>
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <span style={{ width: '22px', height: '22px', borderRadius: '50%', backgroundColor: 'var(--bg-accent)', display: 'flex', alignItems: 'center', justifySelf: 'center', justifyContent: 'center', fontWeight: 'bold' }}>2</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                  Tap the **Share** button <Share2 size={16} color="var(--primary)" /> at the bottom navigation bar of Safari.
                </span>
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <span style={{ width: '22px', height: '22px', borderRadius: '50%', backgroundColor: 'var(--bg-accent)', display: 'flex', alignItems: 'center', justifySelf: 'center', justifyContent: 'center', fontWeight: 'bold' }}>3</span>
                <span>Scroll down the share sheet and select **"Add to Home Screen"**.</span>
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <span style={{ width: '22px', height: '22px', borderRadius: '50%', backgroundColor: 'var(--bg-accent)', display: 'flex', alignItems: 'center', justifySelf: 'center', justifyContent: 'center', fontWeight: 'bold' }}>4</span>
                <span>Name it "SplitBuddy" and click **Add**. The icon will appear on your Home Screen!</span>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13px' }}>
              <div style={{ display: 'flex', gap: '10px' }}>
                <span style={{ width: '22px', height: '22px', borderRadius: '50%', backgroundColor: 'var(--bg-accent)', display: 'flex', alignItems: 'center', justifySelf: 'center', justifyContent: 'center', fontWeight: 'bold' }}>1</span>
                <span>Open this website inside **Google Chrome** on your Android smartphone.</span>
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <span style={{ width: '22px', height: '22px', borderRadius: '50%', backgroundColor: 'var(--bg-accent)', display: 'flex', alignItems: 'center', justifySelf: 'center', justifyContent: 'center', fontWeight: 'bold' }}>2</span>
                <span>Tap the **three vertical dots** (menu button) in the top-right corner of Chrome.</span>
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <span style={{ width: '22px', height: '22px', borderRadius: '50%', backgroundColor: 'var(--bg-accent)', display: 'flex', alignItems: 'center', justifySelf: 'center', justifyContent: 'center', fontWeight: 'bold' }}>3</span>
                <span>Tap **"Install App"** (or **"Add to Home screen"**).</span>
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <span style={{ width: '22px', height: '22px', borderRadius: '50%', backgroundColor: 'var(--bg-accent)', display: 'flex', alignItems: 'center', justifySelf: 'center', justifyContent: 'center', fontWeight: 'bold' }}>4</span>
                <span>Confirm installation. Google Chrome will install it silently in the background.</span>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
