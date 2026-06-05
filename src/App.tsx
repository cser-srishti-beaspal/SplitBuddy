import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import supabase from './supabaseClient.ts';
import Auth from './components/Auth.tsx';
import Layout from './components/Layout.tsx';
import Dashboard from './components/Dashboard.tsx';
import GroupsList from './components/GroupsList.tsx';
import GroupDetail from './components/GroupDetail.tsx';
import FriendsList from './components/FriendsList.tsx';
import FriendDetail from './components/FriendDetail.tsx';
import Profile from './components/Profile.tsx';

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

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
          <img src="/logo.svg" alt="Loading" style={{ width: '64px', height: '64px', animation: 'pulse 1.5s infinite' }} />
          <h3 style={{ marginTop: '12px', fontFamily: 'var(--font-family-display)' }}>Checking Credentials...</h3>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        {session ? (
          // Authenticated Routes (Wrapped in Layout Sidebar/Navbar)
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="groups" element={<GroupsList />} />
            <Route path="groups/:id" element={<GroupDetail />} />
            <Route path="friends" element={<FriendsList />} />
            <Route path="friends/:id" element={<FriendDetail />} />
            <Route path="profile" element={<Profile />} />
            {/* Fallback redirect to dashboard */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        ) : (
          // Unauthenticated Routes
          <Route path="*" element={<Auth />} />
        )}
      </Routes>
    </BrowserRouter>
  );
}
