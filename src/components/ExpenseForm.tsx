import React, { useEffect, useState } from 'react';
import { useAppLayout } from './Layout';
import supabase from '../supabaseClient';
import { 
  X, 
  Utensils, 
  Car, 
  Home, 
  Zap, 
  Film, 
  HelpCircle, 
  AlertCircle
} from 'lucide-react';
import { Group, Profile } from '../types';

interface ExpenseFormProps {
  groupId?: string;
  friendId?: string;
  onClose: () => void;
}

interface SplitItem {
  userId: string;
  userName: string;
  avatarUrl?: string;
  amount: string; // string input to handle editing decimals nicely
  percentage: string;
  checked: boolean;
}

const CATEGORIES = [
  { id: 'Food', label: 'Food', icon: Utensils, emoji: '🍔' },
  { id: 'Travel', label: 'Travel', icon: Car, emoji: '🚗' },
  { id: 'Rent', label: 'Rent', icon: Home, emoji: '🏠' },
  { id: 'Utilities', label: 'Bills', icon: Zap, emoji: '⚡' },
  { id: 'Entertainment', label: 'Movies', icon: Film, emoji: '🎬' },
  { id: 'Others', label: 'Others', icon: HelpCircle, emoji: '📦' }
];

export default function ExpenseForm({ groupId: propGroupId, friendId: propFriendId, onClose }: ExpenseFormProps) {
  const { profile, triggerRefresh } = useAppLayout();
  const myId = profile!.id;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Form values
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [category, setCategory] = useState('Others');
  
  // Destination selection (Group vs Individual)
  const [destType, setDestType] = useState<'group' | 'friend'>(propGroupId ? 'group' : propFriendId ? 'friend' : 'group');
  const [groupId, setGroupId] = useState(propGroupId || '');
  const [friendId, setFriendId] = useState(propFriendId || '');
  
  // Lists for dropdowns
  const [groups, setGroups] = useState<Group[]>([]);
  const [friends, setFriends] = useState<Profile[]>([]);
  
  // Split details
  const [paidBy, setPaidBy] = useState(myId);
  const [splitType, setSplitType] = useState<'equal' | 'exact' | 'percentage'>('equal');
  const [splits, setSplits] = useState<SplitItem[]>([]);

  // Fetch dropdown collections
  useEffect(() => {
    const fetchSelectors = async () => {
      try {
        // Fetch groups
        const { data: memberGroups } = await supabase
          .from('group_members')
          .select('group_id')
          .eq('user_id', myId);
        
        const groupIds = memberGroups?.map((mg: any) => mg.group_id) || [];
        if (groupIds.length > 0) {
          const { data: grps } = await supabase.from('groups').select('*').in('id', groupIds);
          setGroups(grps || []);
        }

        // Fetch friends
        const { data: friendLinks } = await supabase
          .from('friends')
          .select('*')
          .or(`user_id.eq.${myId},friend_id.eq.${myId}`);
        
        const fIds = friendLinks?.map((fl: any) => fl.user_id === myId ? fl.friend_id : fl.user_id) || [];
        if (fIds.length > 0) {
          const { data: frnds } = await supabase.from('profiles').select('*').in('id', fIds);
          setFriends(frnds || []);
        }
      } catch (err) {
        console.error('Error fetching selectors:', err);
      }
    };

    fetchSelectors();
  }, [myId]);

  // Load split members based on destination selection
  useEffect(() => {
    const loadSplitMembers = async () => {
      try {
        let membersList: { id: string; name: string; avatar_url?: string }[] = [];

        if (destType === 'group' && groupId) {
          const { data: gmData } = await supabase
            .from('group_members')
            .select('*, profiles(*)')
            .eq('group_id', groupId);
          
          gmData?.forEach((gm: any) => {
            if (gm.profiles) {
              membersList.push({
                id: gm.profiles.id,
                name: gm.profiles.name,
                avatar_url: gm.profiles.avatar_url
              });
            }
          });
        } else if (destType === 'friend' && friendId) {
          const { data: fProfile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', friendId)
            .single();

          if (fProfile) {
            membersList = [
              { id: myId, name: 'You (Me)', avatar_url: profile?.avatar_url },
              { id: fProfile.id, name: fProfile.name, avatar_url: fProfile.avatar_url }
            ];
          }
        } else {
          // Default: just current user
          membersList = [{ id: myId, name: 'You (Me)', avatar_url: profile?.avatar_url }];
        }

        // Initialize splits
        const initialSplits = membersList.map(m => ({
          userId: m.id,
          userName: m.name,
          avatarUrl: m.avatar_url,
          amount: '',
          percentage: '',
          checked: true
        }));

        setSplits(initialSplits);
        
        // Ensure paidBy matches a member
        if (!membersList.some(m => m.id === paidBy)) {
          setPaidBy(myId);
        }
      } catch (err) {
        console.error('Error loading split members:', err);
      }
    };

    loadSplitMembers();
  }, [destType, groupId, friendId, myId, profile]);

  // Auto-calculate equal splits when checked members, amount or splitType changes
  useEffect(() => {
    if (splitType !== 'equal') return;

    const totalAmt = parseFloat(amount) || 0;
    const checkedSplits = splits.filter(s => s.checked);
    const count = checkedSplits.length;

    if (count === 0 || totalAmt <= 0) {
      setSplits(prev => prev.map(s => ({ ...s, amount: '' })));
      return;
    }

    const share = Math.round((totalAmt / count) * 100) / 100;
    let diff = totalAmt - (share * count); // handle rounding dust

    setSplits(prev => prev.map(s => {
      if (!s.checked) return { ...s, amount: '' };
      
      let myShare = share;
      if (Math.abs(diff) > 0.005) {
        myShare = Math.round((share + diff) * 100) / 100;
        diff = 0; // absorb the difference in one split
      }

      return {
        ...s,
        amount: myShare.toFixed(2)
      };
    }));
  }, [amount, splitType, splits.map(s => s.checked).join(',')]);

  const handleCheckboxChange = (userId: string) => {
    setSplits(prev => prev.map(s => {
      if (s.userId === userId) {
        return { ...s, checked: !s.checked };
      }
      return s;
    }));
  };

  const handleSplitValueChange = (userId: string, val: string, field: 'amount' | 'percentage') => {
    setSplits(prev => prev.map(s => {
      if (s.userId === userId) {
        return {
          ...s,
          [field]: val,
          checked: true // Automatically check if value is modified
        };
      }
      return s;
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const totalAmt = parseFloat(amount);
    if (isNaN(totalAmt) || totalAmt <= 0) {
      setError('Please enter a valid bill amount greater than zero.');
      return;
    }

    if (!description.trim()) {
      setError('Please enter a description.');
      return;
    }

    if (destType === 'group' && !groupId) {
      setError('Please select a group.');
      return;
    }

    if (destType === 'friend' && !friendId) {
      setError('Please select a friend.');
      return;
    }

    const activeSplits = splits.filter(s => s.checked);
    if (activeSplits.length === 0) {
      setError('Please select at least one person to split the bill with.');
      return;
    }

    // Validation for Unequal / Percentage splits
    const splitRecords: { user_id: string; amount: number }[] = [];

    if (splitType === 'equal') {
      activeSplits.forEach(s => {
        splitRecords.push({
          user_id: s.userId,
          amount: parseFloat(s.amount) || 0
        });
      });
    } else if (splitType === 'exact') {
      let sum = 0;
      for (const s of activeSplits) {
        const val = parseFloat(s.amount) || 0;
        if (val < 0) {
          setError('Split amounts cannot be negative.');
          return;
        }
        sum += val;
        splitRecords.push({ user_id: s.userId, amount: val });
      }

      if (Math.abs(sum - totalAmt) > 0.05) {
        setError(`The sum of split amounts (₹${sum.toFixed(2)}) must equal the total bill amount (₹${totalAmt.toFixed(2)}).`);
        return;
      }
    } else if (splitType === 'percentage') {
      let sumPct = 0;
      for (const s of activeSplits) {
        const pct = parseFloat(s.percentage) || 0;
        if (pct < 0) {
          setError('Split percentages cannot be negative.');
          return;
        }
        sumPct += pct;
        
        const calculatedAmt = Math.round((totalAmt * (pct / 100)) * 100) / 100;
        splitRecords.push({ user_id: s.userId, amount: calculatedAmt });
      }

      if (Math.abs(sumPct - 100) > 0.1) {
        setError(`The sum of percentages (${sumPct.toFixed(1)}%) must equal 100%.`);
        return;
      }
    }

    setLoading(true);

    try {
      // Prepend category emoji to description
      const selectedCat = CATEGORIES.find(c => c.id === category);
      const emojiPrefix = selectedCat ? `${selectedCat.emoji} ` : '';
      const fullDescription = `${emojiPrefix}${description.trim()}`;

      // 1. Insert Expense parent
      const { data: newExpense, error: expInsertError } = await supabase
        .from('expenses')
        .insert({
          group_id: destType === 'group' ? groupId : null,
          description: fullDescription,
          amount: totalAmt,
          paid_by: paidBy,
          split_type: splitType,
          date,
          created_by: myId
        })
        .select()
        .single();

      if (expInsertError) throw expInsertError;

      // 2. Batch insert expense splits
      const finalSplits = splitRecords.map(sr => ({
        expense_id: newExpense.id,
        user_id: sr.user_id,
        amount: sr.amount
      }));

      const { error: splitsInsertError } = await supabase
        .from('expense_splits')
        .insert(finalSplits);

      if (splitsInsertError) throw splitsInsertError;

      triggerRefresh();
      onClose();
    } catch (err: any) {
      console.error('Error recording expense:', err);
      setError(err.message || 'Could not record expense. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 style={{ fontSize: '18px', fontFamily: 'var(--font-family-display)' }}>Add Expense</h3>
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
                <label className="form-label">Split Type Category</label>
                <div style={{ display: 'flex', gap: '8px', backgroundColor: 'var(--bg-tertiary)', padding: '4px', borderRadius: '8px' }}>
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
                    Group Expense
                  </button>
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
                    Direct Friend Bill
                  </button>
                </div>
              </div>
            )}

            {/* Group/Friend selector dropdown (only show if not pre-locked) */}
            {!propGroupId && !propFriendId && (
              <div>
                {destType === 'group' ? (
                  <div className="form-group" style={{ marginBottom: '0px' }}>
                    <label className="form-label" htmlFor="groupSelector">Select Group</label>
                    <select
                      id="groupSelector"
                      className="form-input"
                      value={groupId}
                      onChange={(e) => setGroupId(e.target.value)}
                      required
                    >
                      <option value="">-- Choose a Group --</option>
                      {groups.map(g => (
                        <option key={g.id} value={g.id}>{g.name}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="form-group" style={{ marginBottom: '0px' }}>
                    <label className="form-label" htmlFor="friendSelector">Select Friend</label>
                    <select
                      id="friendSelector"
                      className="form-input"
                      value={friendId}
                      onChange={(e) => setFriendId(e.target.value)}
                      required
                    >
                      <option value="">-- Choose a Friend --</option>
                      {friends.map(f => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}

            {/* Category selection grid */}
            <div>
              <label className="form-label">Select Category Tag</label>
              <div className="category-grid">
                {CATEGORIES.map(cat => {
                  const CatIcon = cat.icon;
                  return (
                    <div
                      key={cat.id}
                      className={`category-pill ${category === cat.id ? 'active' : ''}`}
                      onClick={() => setCategory(cat.id)}
                    >
                      <CatIcon />
                      {cat.label}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Description & Amount Inputs */}
            <div style={{ display: 'grid', gridTemplateColumns: '2.5fr 1fr', gap: '10px' }}>
              <div className="form-group" style={{ marginBottom: '0px' }}>
                <label className="form-label" htmlFor="descInput">Description</label>
                <input
                  id="descInput"
                  type="text"
                  className="form-input"
                  placeholder="e.g. Flight tickets, Groceries, Movie"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={50}
                  required
                />
              </div>
              <div className="form-group" style={{ marginBottom: '0px' }}>
                <label className="form-label" htmlFor="amtInput">Amount (₹)</label>
                <input
                  id="amtInput"
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
            </div>

            {/* Paid By & Date Selector */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '10px' }}>
              <div className="form-group" style={{ marginBottom: '0px' }}>
                <label className="form-label" htmlFor="paidBySelector">Paid By</label>
                <select
                  id="paidBySelector"
                  className="form-input"
                  value={paidBy}
                  onChange={(e) => setPaidBy(e.target.value)}
                >
                  {splits.map(s => (
                    <option key={s.userId} value={s.userId}>
                      {s.userId === myId ? 'You (Me)' : s.userName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: '0px' }}>
                <label className="form-label" htmlFor="dateInput">Date</label>
                <input
                  id="dateInput"
                  type="date"
                  className="form-input"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Split Type Selector */}
            <div className="form-group" style={{ marginBottom: '0px' }}>
              <label className="form-label">Split Share Method</label>
              <div style={{ display: 'flex', gap: '8px', backgroundColor: 'var(--bg-tertiary)', padding: '4px', borderRadius: '8px' }}>
                <button
                  type="button"
                  className="btn"
                  style={{ 
                    flex: 1, 
                    padding: '6px 12px',
                    fontSize: '12px',
                    backgroundColor: splitType === 'equal' ? 'var(--bg-accent)' : 'transparent',
                    color: splitType === 'equal' ? 'var(--text-primary)' : 'var(--text-secondary)'
                  }}
                  onClick={() => setSplitType('equal')}
                >
                  Equally
                </button>
                <button
                  type="button"
                  className="btn"
                  style={{ 
                    flex: 1, 
                    padding: '6px 12px',
                    fontSize: '12px',
                    backgroundColor: splitType === 'exact' ? 'var(--bg-accent)' : 'transparent',
                    color: splitType === 'exact' ? 'var(--text-primary)' : 'var(--text-secondary)'
                  }}
                  onClick={() => setSplitType('exact')}
                >
                  Unequally
                </button>
                <button
                  type="button"
                  className="btn"
                  style={{ 
                    flex: 1, 
                    padding: '6px 12px',
                    fontSize: '12px',
                    backgroundColor: splitType === 'percentage' ? 'var(--bg-accent)' : 'transparent',
                    color: splitType === 'percentage' ? 'var(--text-primary)' : 'var(--text-secondary)'
                  }}
                  onClick={() => setSplitType('percentage')}
                >
                  Percentage
                </button>
              </div>
            </div>

            {/* Split Members Checklist / Value input area */}
            <div>
              <label className="form-label">
                {splitType === 'equal' ? 'Who is splitting?' : splitType === 'exact' ? 'Exact share amounts (₹)' : 'Percentage Shares (%)'}
              </label>
              <div className="split-selector-list">
                {splits.map(s => (
                  <div key={s.userId} className="split-selector-item">
                    <label className="split-checkbox-label">
                      <input
                        type="checkbox"
                        checked={s.checked}
                        onChange={() => handleCheckboxChange(s.userId)}
                        style={{ cursor: 'pointer', accentColor: 'var(--primary)' }}
                      />
                      <span style={{ fontWeight: s.checked ? 600 : 'normal' }}>{s.userName}</span>
                    </label>

                    {/* Show value inputs for non-equal splits */}
                    {splitType === 'equal' && s.checked && (
                      <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                        ₹{parseFloat(s.amount) ? parseFloat(s.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '0.00'}
                      </span>
                    )}

                    {splitType === 'exact' && (
                      <input
                        type="number"
                        className="split-input-amount"
                        placeholder="0.00"
                        value={s.amount}
                        onChange={(e) => handleSplitValueChange(s.userId, e.target.value, 'amount')}
                        disabled={!s.checked}
                      />
                    )}

                    {splitType === 'percentage' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <input
                          type="number"
                          className="split-input-amount"
                          placeholder="0"
                          value={s.percentage}
                          onChange={(e) => handleSplitValueChange(s.userId, e.target.value, 'percentage')}
                          disabled={!s.checked}
                        />
                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>%</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Form actions */}
            <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
              <button type="button" onClick={onClose} className="btn btn-secondary btn-full">
                Cancel
              </button>
              <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
                {loading ? 'Saving Bill...' : 'Record Expense'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
