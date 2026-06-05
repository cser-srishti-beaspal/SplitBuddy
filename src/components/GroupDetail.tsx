import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAppLayout } from './Layout.tsx';
import supabase from '../supabaseClient.ts';
import { 
  Users, 
  Plus, 
  ArrowLeft, 
  X, 
  UserPlus, 
  FileText, 
  DollarSign,
  Info,
  Calendar,
  AlertCircle,
  TrendingDown,
  TrendingUp,
  UserCheck
} from 'lucide-react';
import { Group, Profile, Expense, Settlement, GroupMember } from '../types.ts';
import ExpenseForm from './ExpenseForm.tsx';
import SettleForm from './SettleForm.tsx';

interface simplifiedDebt {
  from: string;
  fromName: string;
  to: string;
  toName: string;
  amount: number;
}

export default function GroupDetail() {
  const { id: groupId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile, refreshKey, triggerRefresh } = useAppLayout();

  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);
  
  // UI Tabs: 'expenses' | 'balances' | 'members'
  const [activeTab, setActiveTab] = useState<'expenses' | 'balances' | 'members'>('expenses');
  
  // Modals
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [showSettle, setShowSettle] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  
  // Add Member form state
  const [memberEmail, setMemberEmail] = useState('');
  const [memberError, setMemberError] = useState('');
  const [memberSuccess, setMemberSuccess] = useState('');
  const [memberSaving, setMemberSaving] = useState(false);

  // Group Balances and simplified debts
  const [memberBalances, setMemberBalances] = useState<{ [userId: string]: number }>({});
  const [simplifiedDebts, setSimplifiedDebts] = useState<simplifiedDebt[]>([]);

  useEffect(() => {
    if (!profile || !groupId) return;

    const loadGroupDetails = async () => {
      setLoading(true);
      try {
        // 1. Fetch Group Info
        const { data: groupData, error: groupError } = await supabase
          .from('groups')
          .select('*')
          .eq('id', groupId)
          .single();

        if (groupError) {
          // If group not found or access denied, redirect to groups
          navigate('/groups');
          return;
        }
        setGroup(groupData);

        // 2. Fetch Group Members (joined with profiles)
        const { data: membersData, error: membersError } = await supabase
          .from('group_members')
          .select('*, profiles(*)')
          .eq('group_id', groupId);

        if (membersError) throw membersError;
        
        const formattedMembers = membersData?.map(m => ({
          group_id: m.group_id,
          user_id: m.user_id,
          joined_at: m.joined_at,
          profile: m.profiles as Profile
        })) || [];
        setMembers(formattedMembers);

        const memberMap = new Map<string, Profile>();
        formattedMembers.forEach(m => {
          if (m.profile) memberMap.set(m.user_id, m.profile);
        });

        // 3. Fetch Group Expenses
        const { data: expensesData, error: expensesError } = await supabase
          .from('expenses')
          .select('*, expense_splits(*)')
          .eq('group_id', groupId)
          .order('date', { ascending: false });

        if (expensesError) throw expensesError;
        
        const formattedExpenses = expensesData?.map(exp => ({
          ...exp,
          amount: Number(exp.amount),
          expense_splits: exp.expense_splits?.map((es: any) => ({
            ...es,
            amount: Number(es.amount)
          }))
        })) || [];
        setExpenses(formattedExpenses);

        // 4. Fetch Group Settlements
        const { data: settlementsData, error: settlementsError } = await supabase
          .from('settlements')
          .select('*')
          .eq('group_id', groupId)
          .order('date', { ascending: false });

        if (settlementsError) throw settlementsError;
        
        const formattedSettlements = settlementsData?.map(settle => ({
          ...settle,
          amount: Number(settle.amount)
        })) || [];
        setSettlements(formattedSettlements);

        // 5. Compute Group Member Balances
        // Initialise balances to 0 for all members
        const balances: { [userId: string]: number } = {};
        formattedMembers.forEach(m => {
          balances[m.user_id] = 0;
        });

        // Add expense splits
        formattedExpenses.forEach(exp => {
          const payerId = exp.paid_by;
          const splits = exp.expense_splits || [];
          
          // Payer is credited the full amount
          if (balances[payerId] !== undefined) {
            balances[payerId] += exp.amount;
          }

          // Each split owes a portion
          splits.forEach(split => {
            if (balances[split.user_id] !== undefined) {
              balances[split.user_id] -= split.amount;
            }
          });
        });

        // Adjust for settlements
        formattedSettlements.forEach(settle => {
          const payerId = settle.payer_id; // who paid
          const payeeId = settle.payee_id; // who received
          
          if (balances[payerId] !== undefined) {
            balances[payerId] += settle.amount; // reduced debt / paid up
          }
          if (balances[payeeId] !== undefined) {
            balances[payeeId] -= settle.amount; // received payment
          }
        });

        // Round all balances to 2 decimals
        Object.keys(balances).forEach(uid => {
          balances[uid] = Math.round(balances[uid] * 100) / 100;
        });

        setMemberBalances(balances);

        // 6. Simplify Debts Algorithm
        // Create arrays of debtors (balance < 0) and creditors (balance > 0)
        const debtors: { id: string; name: string; bal: number }[] = [];
        const creditors: { id: string; name: string; bal: number }[] = [];

        Object.entries(balances).forEach(([userId, bal]) => {
          const prof = memberMap.get(userId);
          const name = prof?.name || 'Unknown User';
          
          if (bal < -0.01) {
            debtors.push({ id: userId, name, bal: Math.abs(bal) });
          } else if (bal > 0.01) {
            creditors.push({ id: userId, name, bal });
          }
        });

        // Debt Simplification matching debtors to creditors
        const debtsList: simplifiedDebt[] = [];
        let dIdx = 0;
        let cIdx = 0;

        while (dIdx < debtors.length && cIdx < creditors.length) {
          const debtor = debtors[dIdx];
          const creditor = creditors[cIdx];
          
          const amountToSettle = Math.min(debtor.bal, creditor.bal);
          if (amountToSettle > 0.01) {
            debtsList.push({
              from: debtor.id,
              fromName: debtor.name,
              to: creditor.id,
              toName: creditor.name,
              amount: Math.round(amountToSettle * 100) / 100
            });
          }

          debtor.bal -= amountToSettle;
          creditor.bal -= amountToSettle;

          if (debtor.bal < 0.01) dIdx++;
          if (creditor.bal < 0.01) cIdx++;
        }

        setSimplifiedDebts(debtsList);

      } catch (err) {
        console.error('Error loading group details:', err);
      } finally {
        setLoading(false);
      }
    };

    loadGroupDetails();
  }, [groupId, profile, refreshKey, navigate]);

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!memberEmail.trim() || !groupId) return;

    setMemberSaving(true);
    setMemberError('');
    setMemberSuccess('');

    try {
      const email = memberEmail.trim().toLowerCase();

      // 1. Check if user exists in Profiles
      const { data: targetProfile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('email', email)
        .maybeSingle();

      if (profileError) throw profileError;

      if (!targetProfile) {
        throw new Error('This user is not registered yet on SplitBuddy. Ask them to sign up first so you can invite them!');
      }

      // 2. Check if already a member of the group
      const alreadyMember = members.some(m => m.user_id === targetProfile.id);
      if (alreadyMember) {
        throw new Error(`${targetProfile.name} is already a member of this group.`);
      }

      // 3. Insert into group_members
      const { error: insertError } = await supabase
        .from('group_members')
        .insert({
          group_id: groupId,
          user_id: targetProfile.id
        });

      if (insertError) throw insertError;

      setMemberSuccess(`${targetProfile.name} added to the group!`);
      setMemberEmail('');
      triggerRefresh();

      setTimeout(() => {
        setShowAddMember(false);
        setMemberSuccess('');
      }, 1500);

    } catch (err: any) {
      console.error('Error adding group member:', err);
      setMemberError(err.message || 'Could not add member.');
    } finally {
      setMemberSaving(false);
    }
  };

  const handleLeaveGroup = async () => {
    if (!window.confirm('Are you sure you want to leave this group? You can only leave if your net balance is ₹0.')) {
      return;
    }

    const myBalance = memberBalances[profile!.id] || 0;
    if (Math.abs(myBalance) > 0.05) {
      alert(`You cannot leave the group because you have an active balance of ₹${myBalance.toFixed(2)}. Please settle all debts before leaving.`);
      return;
    }

    try {
      const { error } = await supabase
        .from('group_members')
        .delete()
        .eq('group_id', groupId)
        .eq('user_id', profile!.id);

      if (error) throw error;
      
      triggerRefresh();
      navigate('/groups');
    } catch (err: any) {
      alert(err.message || 'Failed to leave the group.');
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
        <p>Loading group information...</p>
      </div>
    );
  }

  if (!group) {
    return (
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <h3>Group not found</h3>
        <Link to="/groups" className="btn btn-secondary" style={{ marginTop: '12px' }}>
          Back to Groups
        </Link>
      </div>
    );
  }

  const myGroupBalance = memberBalances[profile!.id] || 0;

  return (
    <div className="page-container">
      {/* Back button & Action buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
        <Link to="/groups" style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center' }}>
          <ArrowLeft size={20} />
        </Link>
        <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Groups / Detail</span>
      </div>

      {/* Group Info Header */}
      <div className="glass-card" style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 style={{ fontSize: '24px', fontFamily: 'var(--font-family-display)' }}>{group.name}</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '4px' }}>
              {group.description || 'No description provided.'}
            </p>
          </div>
          
          <button 
            onClick={handleLeaveGroup} 
            className="btn btn-danger" 
            style={{ padding: '6px 12px', fontSize: '12px' }}
          >
            Leave Group
          </button>
        </div>

        {/* User's balance within group banner */}
        <div 
          style={{ 
            marginTop: '20px', 
            padding: '12px 16px', 
            borderRadius: '10px',
            backgroundColor: myGroupBalance > 0 ? 'var(--color-owed-bg)' : myGroupBalance < 0 ? 'var(--color-owe-bg)' : 'var(--color-neutral-bg)',
            color: myGroupBalance > 0 ? 'var(--color-owed)' : myGroupBalance < 0 ? 'var(--color-owe)' : 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '14px',
            fontWeight: 600
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Info size={16} />
            {myGroupBalance > 0 
              ? 'Overall in this group, you are owed' 
              : myGroupBalance < 0 
                ? 'Overall in this group, you owe' 
                : 'You are all settled up in this group'}
          </span>
          <span style={{ fontSize: '16px', fontWeight: 800 }}>
            ₹{Math.abs(myGroupBalance).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>

        <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
          <button onClick={() => setShowAddExpense(true)} className="btn btn-primary btn-full">
            <Plus size={16} />
            Add Expense
          </button>
          <button onClick={() => setShowSettle(true)} className="btn btn-secondary btn-full">
            <DollarSign size={16} />
            Settle Up
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="detail-tab-container">
        <div 
          className={`detail-tab ${activeTab === 'expenses' ? 'active' : ''}`}
          onClick={() => setActiveTab('expenses')}
        >
          Expenses
        </div>
        <div 
          className={`detail-tab ${activeTab === 'balances' ? 'active' : ''}`}
          onClick={() => setActiveTab('balances')}
        >
          Balances & Settle Plans
        </div>
        <div 
          className={`detail-tab ${activeTab === 'members' ? 'active' : ''}`}
          onClick={() => setActiveTab('members')}
        >
          Members ({members.length})
        </div>
      </div>

      {/* TAB CONTENT: EXPENSES */}
      {activeTab === 'expenses' && (
        <div>
          {expenses.length === 0 && settlements.length === 0 ? (
            <div className="glass-card" style={{ textAlign: 'center', padding: '40px 20px' }}>
              <FileText size={40} style={{ color: 'var(--text-muted)', opacity: 0.6, marginBottom: '12px' }} />
              <h4 style={{ color: 'var(--text-primary)' }}>No expenses yet</h4>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Tap the "Add Expense" button to log your first shared expense.
              </p>
            </div>
          ) : (
            <div className="list-container">
              {/* Combine expenses and settlements chronologically */}
              {[
                ...expenses.map(e => ({ ...e, recordType: 'expense' as const })),
                ...settlements.map(s => ({ ...s, recordType: 'settlement' as const }))
              ]
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                .map((item) => {
                  if (item.recordType === 'expense') {
                    const exp = item as Expense;
                    const paidByMe = exp.paid_by === profile!.id;
                    const payerName = members.find(m => m.user_id === exp.paid_by)?.profile?.name || 'Someone';
                    const mySplit = exp.expense_splits?.find(s => s.user_id === profile!.id);
                    
                    let splitInfo = '';
                    let splitColor = 'var(--text-muted)';
                    let splitAmt = 0;

                    if (paidByMe) {
                      const totalOwedToMe = exp.expense_splits
                        ?.filter(s => s.user_id !== profile!.id)
                        .reduce((sum, s) => sum + s.amount, 0) || 0;
                      
                      splitInfo = 'you lent';
                      splitColor = 'var(--color-owed)';
                      splitAmt = totalOwedToMe;
                    } else if (mySplit) {
                      splitInfo = 'you borrowed';
                      splitColor = 'var(--color-owe)';
                      splitAmt = mySplit.amount;
                    } else {
                      splitInfo = 'not involved';
                      splitAmt = 0;
                    }

                    return (
                      <div key={exp.id} className="list-item" style={{ cursor: 'default' }}>
                        <div className="list-item-left">
                          <div style={{ padding: '8px', borderRadius: '8px', backgroundColor: 'var(--bg-tertiary)', color: 'var(--primary)' }}>
                            <FileText size={18} />
                          </div>
                          <div>
                            <div className="expense-item-desc">{exp.description}</div>
                            <div className="expense-item-meta">
                              Paid by <strong>{paidByMe ? 'You' : payerName}</strong> on {new Date(exp.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                            </div>
                          </div>
                        </div>
                        <div className="list-item-right" style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                          <div>
                            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                              ₹{exp.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </div>
                            <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>total bill</div>
                          </div>
                          {splitAmt > 0 && (
                            <div style={{ minWidth: '80px' }}>
                              <div style={{ fontSize: '14px', fontWeight: 700, color: splitColor }}>
                                ₹{splitAmt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </div>
                              <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>{splitInfo}</div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  } else {
                    const settle = item as Settlement;
                    const payer = members.find(m => m.user_id === settle.payer_id)?.profile;
                    const payee = members.find(m => m.user_id === settle.payee_id)?.profile;
                    
                    return (
                      <div 
                        key={settle.id} 
                        className="list-item" 
                        style={{ 
                          cursor: 'default', 
                          border: '1px dashed var(--border-color)', 
                          backgroundColor: 'rgba(16, 185, 129, 0.02)' 
                        }}
                      >
                        <div className="list-item-left">
                          <div style={{ padding: '8px', borderRadius: '50%', backgroundColor: 'var(--color-owed-bg)', color: 'var(--color-owed)' }}>
                            <UserCheck size={16} />
                          </div>
                          <div>
                            <div style={{ fontSize: '13px', fontWeight: 600 }}>
                              <strong>{settle.payer_id === profile!.id ? 'You' : payer?.name}</strong> settled with <strong>{settle.payee_id === profile!.id ? 'You' : payee?.name}</strong>
                            </div>
                            <div className="expense-item-meta">
                              Recorded on {new Date(settle.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                            </div>
                          </div>
                        </div>
                        <div className="list-item-right">
                          <div style={{ fontSize: '13px', fontWeight: 750, color: 'var(--color-owed)' }}>
                            ₹{settle.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </div>
                          <div style={{ fontSize: '9px', color: 'var(--text-secondary)' }}>settlement</div>
                        </div>
                      </div>
                    );
                  }
                })}
            </div>
          )}
        </div>
      )}

      {/* TAB CONTENT: BALANCES & SIMPLIFICATION */}
      {activeTab === 'balances' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* List of members with positive/negative net balances */}
          <div className="glass-card">
            <h3 style={{ fontSize: '16px', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <TrendingUp size={18} color="var(--primary)" />
              Net Member Status
            </h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {members.map(m => {
                const bal = memberBalances[m.user_id] || 0;
                return (
                  <div 
                    key={m.user_id} 
                    style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      backgroundColor: 'var(--bg-tertiary)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <img 
                        src={m.profile?.avatar_url || `https://api.dicebear.com/7.x/adventurer/svg?seed=${m.user_id}`} 
                        alt={m.profile?.name} 
                        style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: 'var(--bg-accent)' }}
                      />
                      <span style={{ fontSize: '14px', fontWeight: 550 }}>
                        {m.user_id === profile!.id ? 'You' : m.profile?.name}
                      </span>
                    </div>

                    <div style={{ 
                      fontSize: '14px', 
                      fontWeight: 700,
                      color: bal > 0 ? 'var(--color-owed)' : bal < 0 ? 'var(--color-owe)' : 'var(--text-secondary)'
                    }}>
                      {bal > 0 ? '+' : bal < 0 ? '-' : ''}₹{Math.abs(bal).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Simplified Settle Plans */}
          <div className="glass-card">
            <h3 style={{ fontSize: '16px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertCircle size={18} color="var(--secondary)" />
              Simplified Settlement Path
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '12px', marginBottom: '16px' }}>
              These transfers resolve everyone's debts inside the group using the minimum number of transactions.
            </p>

            {simplifiedDebts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                Everyone in this group is fully settled!
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {simplifiedDebts.map((debt, index) => (
                  <div 
                    key={index} 
                    style={{ 
                      padding: '12px 14px', 
                      borderRadius: '8px', 
                      backgroundColor: 'var(--bg-tertiary)',
                      borderLeft: '4px solid var(--primary)',
                      fontSize: '13px'
                    }}
                  >
                    <strong>{debt.from === profile!.id ? 'You' : debt.fromName}</strong> owes{' '}
                    <strong>{debt.to === profile!.id ? 'You' : debt.toName}</strong>{' '}
                    <span style={{ color: 'var(--color-owe)', fontWeight: 700 }}>
                      ₹{debt.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB CONTENT: MEMBERS */}
      {activeTab === 'members' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Invite Member Section */}
          <div className="glass-card">
            <h3 style={{ fontSize: '16px', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <UserPlus size={18} color="var(--primary)" />
              Add Group Member
            </h3>
            
            <form onSubmit={handleAddMember} style={{ display: 'flex', gap: '8px' }}>
              <div style={{ flex: 1 }}>
                <input
                  type="email"
                  className="form-input"
                  placeholder="Enter member email..."
                  value={memberEmail}
                  onChange={(e) => setMemberEmail(e.target.value)}
                  required
                />
              </div>
              <button type="submit" className="btn btn-primary" disabled={memberSaving}>
                {memberSaving ? 'Adding...' : 'Add'}
              </button>
            </form>
            
            {memberError && (
              <div style={{ color: 'var(--color-owe)', fontSize: '12px', marginTop: '8px' }}>
                {memberError}
              </div>
            )}
            {memberSuccess && (
              <div style={{ color: 'var(--color-owed)', fontSize: '12px', marginTop: '8px' }}>
                {memberSuccess}
              </div>
            )}
          </div>

          {/* Members List */}
          <div className="list-container">
            {members.map((m) => (
              <div key={m.user_id} className="list-item" style={{ cursor: 'default' }}>
                <div className="list-item-left">
                  <div className="list-item-avatar">
                    <img 
                      src={m.profile?.avatar_url || `https://api.dicebear.com/7.x/adventurer/svg?seed=${m.user_id}`} 
                      alt={m.profile?.name} 
                    />
                  </div>
                  <div>
                    <div className="list-item-title">
                      {m.profile?.name} {m.user_id === profile!.id && <span style={{ color: 'var(--text-muted)', fontSize: '12px', fontWeight: 'normal' }}>(You)</span>}
                    </div>
                    <div className="list-item-subtitle">{m.profile?.email}</div>
                  </div>
                </div>
                <div className="list-item-right">
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    Joined {new Date(m.joined_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modals */}
      {showAddExpense && (
        <ExpenseForm 
          groupId={groupId}
          onClose={() => {
            setShowAddExpense(false);
            triggerRefresh();
          }} 
        />
      )}

      {showSettle && (
        <SettleForm 
          groupId={groupId}
          onClose={() => {
            setShowSettle(false);
            triggerRefresh();
          }} 
        />
      )}
    </div>
  );
}
