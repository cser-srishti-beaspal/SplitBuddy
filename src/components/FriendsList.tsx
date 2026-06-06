import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppLayout } from './Layout';
import supabase from '../supabaseClient';
import { User, Plus, X, UserPlus, Search, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { Profile } from '../types';

interface FriendListItem {
  friendProfile: Profile;
  balance: number; // positive = they owe me, negative = I owe them
}

export default function FriendsList() {
  const { profile, refreshKey, triggerRefresh } = useAppLayout();
  const [friends, setFriends] = useState<FriendListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [friendEmail, setFriendEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (!profile) return;

    const fetchFriendsAndBalances = async () => {
      setLoading(true);
      try {
        const myId = profile.id;

        // 1. Fetch friend links
        const { data: friendLinks, error: linksError } = await supabase
          .from('friends')
          .select('*')
          .or(`user_id.eq.${myId},friend_id.eq.${myId}`);

        if (linksError) throw linksError;

        if (!friendLinks || friendLinks.length === 0) {
          setFriends([]);
          return;
        }

        // Get friend IDs
        const friendIds = friendLinks.map(link => 
          link.user_id === myId ? link.friend_id : link.user_id
        );

        // Fetch friend profiles
        const { data: profilesData, error: profsError } = await supabase
          .from('profiles')
          .select('*')
          .in('id', friendIds);

        if (profsError) throw profsError;

        const profileMap = new Map<string, Profile>();
        profilesData?.forEach(p => profileMap.set(p.id, p));

        // 2. Fetch all individual/shared expenses to compute balances with each friend
        // Get splits where current user is involved
        const { data: mySplits } = await supabase
          .from('expense_splits')
          .select('expense_id')
          .eq('user_id', myId);
        
        const splitIds = mySplits?.map(s => s.expense_id) || [];

        let expensesQuery = supabase
          .from('expenses')
          .select('*, expense_splits(*)');

        if (splitIds.length > 0) {
          expensesQuery = expensesQuery.or(`paid_by.eq.${myId},id.in.(${splitIds.join(',')})`);
        } else {
          expensesQuery = expensesQuery.eq('paid_by', myId);
        }

        const { data: expenses } = await expensesQuery;

        // Fetch settlements
        const { data: settlements } = await supabase
          .from('settlements')
          .select('*')
          .or(`payer_id.eq.${myId},payee_id.eq.${myId}`);

        // Calculate balance for each friend
        const tempFriends: FriendListItem[] = friendIds.map(fid => {
          const friendProfile = profileMap.get(fid);
          if (!friendProfile) return null;

          let balance = 0;

          // Process expenses
          expenses?.forEach(exp => {
            const payerId = exp.paid_by;
            const splits = exp.expense_splits || [];

            if (payerId === myId) {
              // I paid: did this friend owe anything?
              const friendSplit = splits.find(s => s.user_id === fid);
              if (friendSplit) {
                balance += Number(friendSplit.amount);
              }
            } else if (payerId === fid) {
              // Friend paid: did I owe anything?
              const mySplit = splits.find(s => s.user_id === myId);
              if (mySplit) {
                balance -= Number(mySplit.amount);
              }
            }
          });

          // Process settlements
          settlements?.forEach(settle => {
            const payerId = settle.payer_id;
            const payeeId = settle.payee_id;
            const amt = Number(settle.amount);

            if (payerId === myId && payeeId === fid) {
              // I paid friend (settled my debt to them)
              balance += amt;
            } else if (payerId === fid && payeeId === myId) {
              // Friend paid me (settled their debt to me)
              balance -= amt;
            }
          });

          return {
            friendProfile,
            balance: Math.round(balance * 100) / 100
          };
        }).filter(Boolean) as FriendListItem[];

        setFriends(tempFriends);
      } catch (err) {
        console.error('Error fetching friends and balances:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchFriendsAndBalances();
  }, [profile, refreshKey]);

  const handleAddFriend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!friendEmail.trim()) return;

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const myId = profile!.id;
      const targetEmail = friendEmail.trim().toLowerCase();

      if (targetEmail === profile!.email.toLowerCase()) {
        throw new Error('You cannot add yourself as a friend.');
      }

      // 1. Find the profile of the friend in profiles
      const { data: targetProfile, error: profileSearchError } = await supabase
        .from('profiles')
        .select('*')
        .eq('email', targetEmail)
        .maybeSingle();

      if (profileSearchError) throw profileSearchError;

      if (!targetProfile) {
        throw new Error('No user is registered with this email. Please check the spelling or ask them to sign up first.');
      }

      // 2. Check if already friends
      const { data: existingFriend, error: checkError } = await supabase
        .from('friends')
        .select('*')
        .or(`and(user_id.eq.${myId},friend_id.eq.${targetProfile.id}),and(user_id.eq.${targetProfile.id},friend_id.eq.${myId})`)
        .maybeSingle();

      if (checkError) throw checkError;

      if (existingFriend) {
        throw new Error(`You are already friends with ${targetProfile.name}.`);
      }

      // 3. Add friend link (A added B)
      const { error: insertError } = await supabase
        .from('friends')
        .insert({
          user_id: myId,
          friend_id: targetProfile.id,
          status: 'accepted' // Autoconfirmed for simplified UI experience
        });

      if (insertError) throw insertError;

      setSuccess(`Successfully added ${targetProfile.name} to your friends!`);
      setFriendEmail('');
      triggerRefresh();
      
      // Auto close modal after a short delay
      setTimeout(() => {
        setShowAddModal(false);
        setSuccess('');
      }, 1500);

    } catch (err: any) {
      console.error('Error adding friend:', err);
      setError(err.message || 'Failed to add friend.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header">
        <div>
          <h2 className="page-title">Friends</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '2px' }}>
            Track individual expenses and balances outside groups
          </p>
        </div>
        <button onClick={() => setShowAddModal(true)} className="btn btn-primary">
          <Plus size={16} />
          Add Friend
        </button>
      </div>

      {/* Main List */}
      {loading ? (
        <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-secondary)' }}>
          Loading friends...
        </div>
      ) : friends.length === 0 ? (
        <div className="glass-card" style={{ padding: '60px 20px' }}>
          <div className="empty-state">
            <User size={48} />
            <h3>No friends added yet</h3>
            <p>Add friends by email to split dinner bills, shared cabs, or individual gifts.</p>
            <button onClick={() => setShowAddModal(true)} className="btn btn-primary">
              <UserPlus size={16} />
              Add Your First Friend
            </button>
          </div>
        </div>
      ) : (
        <div className="list-container">
          {friends.map(({ friendProfile, balance }) => (
            <Link key={friendProfile.id} to={`/friends/${friendProfile.id}`} className="list-item">
              <div className="list-item-left">
                <div className="list-item-avatar">
                  <img 
                    src={friendProfile.avatar_url || `https://api.dicebear.com/7.x/adventurer/svg?seed=${friendProfile.id}`} 
                    alt={friendProfile.name} 
                  />
                </div>
                <div>
                  <div className="list-item-title">{friendProfile.name}</div>
                  <div className="list-item-subtitle">{friendProfile.email}</div>
                </div>
              </div>
              <div className="list-item-right">
                {balance === 0 ? (
                  <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Settled up</span>
                ) : balance > 0 ? (
                  <div>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-owed)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '2px' }}>
                      <ArrowUpRight size={14} />
                      ₹{balance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>owes you</span>
                  </div>
                ) : (
                  <div>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-owe)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '2px' }}>
                      <ArrowDownLeft size={14} />
                      ₹{Math.abs(balance).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>you owe</span>
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Add Friend Modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontSize: '18px' }}>Add Friend</h3>
              <button onClick={() => setShowAddModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleAddFriend}>
              <div className="modal-body">
                {error && (
                  <div style={{ padding: '10px', backgroundColor: 'var(--color-owe-bg)', color: 'var(--color-owe)', borderRadius: '8px', marginBottom: '14px', fontSize: '13px' }}>
                    {error}
                  </div>
                )}
                {success && (
                  <div style={{ padding: '10px', backgroundColor: 'var(--color-owed-bg)', color: 'var(--color-owed)', borderRadius: '8px', marginBottom: '14px', fontSize: '13px' }}>
                    {success}
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label" htmlFor="friendEmail">Friend's Email Address</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      id="friendEmail"
                      type="email"
                      className="form-input"
                      placeholder="e.g. friend@example.com"
                      value={friendEmail}
                      onChange={(e) => setFriendEmail(e.target.value)}
                      required
                      style={{ paddingLeft: '38px' }}
                    />
                    <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                  <button type="button" onClick={() => setShowAddModal(false)} className="btn btn-secondary btn-full">
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary btn-full" disabled={saving}>
                    {saving ? 'Adding...' : 'Add Friend'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
