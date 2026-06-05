import React, { useEffect, useState } from 'react';
import { useAppLayout } from './Layout.tsx';
import supabase from '../supabaseClient.ts';
import { X, CheckCircle, ArrowRight, Calendar, AlertCircle } from 'lucide-react';
import { Group, Profile } from '../types.ts';

interface SettleFormProps {
  groupId?: string;
  friendId?: string;
  onClose: () => void;
}

export default function SettleForm({ groupId: propGroupId, friendId: propFriendId, onClose }: SettleFormProps) {
  const { profile, triggerRefresh } = useAppLayout();
  const myId = profile!.id;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Form states
  const [destType, setDestType] = useState<'group' | 'friend'>(propGroupId ? 'group' : propFriendId ? 'friend' : 'friend');
  const [groupId, setGroupId] = useState(propGroupId || '');
  const [friendId, setFriendId] = useState(propFriendId || '');
  
  const [payerId, setPayerId] = useState(myId);
  const [payeeId, setPayeeId] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  // Dropdowns lists
  const [groups, setGroups] = useState<Group[]>([]);
  const [friends, setFriends] = useState<Profile[]>([]);
  const [eligibleUsers, setEligibleUsers] = useState<Profile[]>([]);

  // Fetch groups and friends lists
  useEffect(() => {
    const fetchSelectors = async () => {
      try {
        // Fetch groups
        const { data: memberGroups } = await supabase
          .from('group_members')
          .select('group_id')
          .eq('user_id', myId);
        
        const groupIds = memberGroups?.map(mg => mg.group_id) || [];
        if (groupIds.length > 0) {
          const { data: grps } = await supabase.from('groups').select('*').in('id', groupIds);
          setGroups(grps || []);
        }

        // Fetch friends
        const { data: friendLinks } = await supabase
          .from('friends')
          .select('*')
          .or(`user_id.eq.${myId},friend_id.eq.${myId}`);
        
        const fIds = friendLinks?.map(fl => fl.user_id === myId ? fl.friend_id : fl.user_id) || [];
        if (fIds.length > 0) {
          const { data: frnds } = await supabase.from('profiles').select('*').in('id', fIds);
          setFriends(frnds || []);
        }
      } catch (err) {
        console.error('Error fetching selector options in settle form:', err);
      }
    };

    fetchSelectors();
  }, [myId]);

  // Load eligible members for transactions
  useEffect(() => {
    const loadEligibleMembers = async () => {
      try {
        if (destType === 'group' && groupId) {
          // Fetch all profiles in the group
          const { data: gmData } = await supabase
            .from('group_members')
            .select('*, profiles(*)')
            .eq('group_id', groupId);
          
          const list: Profile[] = [];
          gmData?.forEach(gm => {
            if (gm.profiles) list.push(gm.profiles as Profile);
          });
          setEligibleUsers(list);

          // Auto-setup defaults
          setPayerId(myId);
          const firstNonMe = list.find(u => u.id !== myId);
          if (firstNonMe) setPayeeId(firstNonMe.id);
        } else if (destType === 'friend' && friendId) {
          // Only friend and me
          const { data: fProfile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', friendId)
            .single();

          if (fProfile) {
            const list = [profile!, fProfile];
            setEligibleUsers(list);

            // Default: I am paying the friend
            setPayerId(myId);
            setPayeeId(fProfile.id);
          }
        } else {
          // Global friend settlement fallback (no specific friend selected yet)
          setEligibleUsers([profile!]);
          setPayerId(myId);
          setPayeeId('');
        }
      } catch (err) {
        console.error('Error loading eligible users for settlement:', err);
      }
    };

    loadEligibleMembers();
  }, [destType, groupId, friendId, myId, profile]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const settleAmount = parseFloat(amount);
    if (isNaN(settleAmount) || settleAmount <= 0) {
      setError('Please enter a valid amount to settle.');
      return;
    }

    if (!payerId || !payeeId) {
      setError('Please specify both the payer and payee.');
      return;
    }

    if (payerId === payeeId) {
      setError('Payer and Payee cannot be the same person.');
      return;
    }

    if (destType === 'group' && !groupId) {
      setError('Please select a group.');
      return;
    }

    if (destType === 'friend' && !friendId && !propFriendId) {
      setError('Please select a friend.');
      return;
    }

    setLoading(true);

    try {
      // Record settlement payment
      const { error: insertError } = await supabase
        .from('settlements')
        .insert({
          group_id: destType === 'group' ? groupId : null,
          payer_id: payerId,
          payee_id: payeeId,
          amount: settleAmount,
          date
        });

      if (insertError) throw insertError;

      triggerRefresh();
      onClose();
    } catch (err: any) {
      console.error('Error recording settlement:', err);
      setError(err.message || 'Could not record settlement. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const payerName = eligibleUsers.find(u => u.id === payerId)?.name || 'Someone';
  const payeeName = eligibleUsers.find(u => u.id === payeeId)?.name || 'Someone';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 style={{ fontSize: '18px', fontFamily: 'var(--font-family-display)' }}>Record Settle Payment</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {error && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px', backgroundColor: 'var(--color-owe-bg)', color: 'var(--color-owe)', borderRadius: '8px', fontSize: '13px' }}>
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            {/* Destination Mode Selector (only show if not pre-locked) */}
            {!propGroupId && !propFriendId && (
              <div className="form-group" style={{ marginBottom: '0px' }}>
                <label className="form-label">Settlement Mode</label>
                <div style={{ display: 'flex', gap: '8px', backgroundColor: 'var(--bg-tertiary)', padding: '4px', borderRadius: '8px' }}>
                  <button
                    type="button"
                    className="btn"
                    style={{ 
                      flex: 1, 
                      padding: '6px 12px',
                      fontSize: '13px',
                      backgroundColor: destType === 'friend' ? 'var(--bg-accent)' : 'transparent',
                      color: destType === 'friend' ? 'var(--text-primary)' : 'var(--text-secondary)'
                    }}
                    onClick={() => setDestType('friend')}
                  >
                    Direct Friend Settlement
                  </button>
                  <button
                    type="button"
                    className="btn"
                    style={{ 
                      flex: 1, 
                      padding: '6px 12px',
                      fontSize: '13px',
                      backgroundColor: destType === 'group' ? 'var(--bg-accent)' : 'transparent',
                      color: destType === 'group' ? 'var(--text-primary)' : 'var(--text-secondary)'
                    }}
                    onClick={() => setDestType('group')}
                  >
                    Group Settlement
                  </button>
                </div>
              </div>
            )}

            {/* Dropdown selectors (only show if not pre-locked) */}
            {!propGroupId && !propFriendId && (
              <div>
                {destType === 'group' ? (
                  <div className="form-group" style={{ marginBottom: '0px' }}>
                    <label className="form-label" htmlFor="settleGroupSelect">Group</label>
                    <select
                      id="settleGroupSelect"
                      className="form-input"
                      value={groupId}
                      onChange={(e) => setGroupId(e.target.value)}
                      required
                    >
                      <option value="">-- Select Group --</option>
                      {groups.map(g => (
                        <option key={g.id} value={g.id}>{g.name}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="form-group" style={{ marginBottom: '0px' }}>
                    <label className="form-label" htmlFor="settleFriendSelect">Friend</label>
                    <select
                      id="settleFriendSelect"
                      className="form-input"
                      value={friendId}
                      onChange={(e) => setFriendId(e.target.value)}
                      required
                    >
                      <option value="">-- Select Friend --</option>
                      {friends.map(f => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}

            {/* Visual Direction Representation */}
            <div 
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                gap: '16px',
                padding: '16px',
                backgroundColor: 'var(--bg-tertiary)',
                borderRadius: '12px',
                border: '1px solid var(--border-color)',
                marginTop: '6px'
              }}
            >
              <div style={{ textAlign: 'center', flex: 1 }}>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Payer</div>
                <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--primary)' }}>{payerName}</div>
              </div>
              <div style={{ color: 'var(--text-muted)' }}>
                <ArrowRight size={24} />
              </div>
              <div style={{ textAlign: 'center', flex: 1 }}>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Recipient</div>
                <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--color-owed)' }}>{payeeName}</div>
              </div>
            </div>

            {/* Payer and Payee dropdown overrides */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div className="form-group" style={{ marginBottom: '0px' }}>
                <label className="form-label" htmlFor="payerSelect">Who Paid?</label>
                <select
                  id="payerSelect"
                  className="form-input"
                  value={payerId}
                  onChange={(e) => setPayerId(e.target.value)}
                >
                  {eligibleUsers.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.id === myId ? 'You (Me)' : u.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: '0px' }}>
                <label className="form-label" htmlFor="payeeSelect">Who Received?</label>
                <select
                  id="payeeSelect"
                  className="form-input"
                  value={payeeId}
                  onChange={(e) => setPayeeId(e.target.value)}
                  required
                >
                  <option value="">-- Choose --</option>
                  {eligibleUsers
                    .filter(u => u.id !== payerId)
                    .map(u => (
                      <option key={u.id} value={u.id}>
                        {u.id === myId ? 'You (Me)' : u.name}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            {/* Amount and Date Inputs */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '10px' }}>
              <div className="form-group" style={{ marginBottom: '0px' }}>
                <label className="form-label" htmlFor="settleAmt">Settlement Amount (₹)</label>
                <input
                  id="settleAmt"
                  type="number"
                  step="0.01"
                  min="0.01"
                  className="form-input"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
              </div>

              <div className="form-group" style={{ marginBottom: '0px' }}>
                <label className="form-label" htmlFor="settleDate">Date</label>
                <input
                  id="settleDate"
                  type="date"
                  className="form-input"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
              <button type="button" onClick={onClose} className="btn btn-secondary btn-full">
                Cancel
              </button>
              <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
                {loading ? 'Recording...' : 'Settle Debt'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
