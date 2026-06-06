import React, { useEffect, useState } from 'react';
import { useAppLayout } from './Layout';
import supabase from '../supabaseClient';
import { 
  ArrowUpRight, 
  ArrowDownLeft, 
  CheckCircle,
  PlusCircle,
  TrendingUp,
  Activity
} from 'lucide-react';
import { Profile, DebtSummary, ActivityItem } from '../types';
import SettleForm from './SettleForm';
import ExpenseForm from './ExpenseForm';

export default function Dashboard() {
  const { profile, refreshKey, triggerRefresh } = useAppLayout();
  const [loading, setLoading] = useState(true);
  const [youOwe, setYouOwe] = useState(0);
  const [youAreOwed, setYouAreOwed] = useState(0);
  const [debts, setDebts] = useState<DebtSummary[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [showSettle, setShowSettle] = useState(false);
  const [showAddExpense, setShowAddExpense] = useState(false);

  useEffect(() => {
    if (!profile) return;

    const loadDashboardData = async () => {
      setLoading(true);
      try {
        const myId = profile.id;

        // 1. Fetch all profiles to map names
        const { data: allProfiles } = await supabase.from('profiles').select('*');
        const profileMap = new Map<string, Profile>();
        allProfiles?.forEach(p => profileMap.set(p.id, p));

        // 2. Fetch all expenses involving the user (either paid by user, or in splits)
        // First get expense IDs where user is in splits
        const { data: mySplits } = await supabase
          .from('expense_splits')
          .select('expense_id')
          .eq('user_id', myId);
        
        const mySplitIds = mySplits?.map(s => s.expense_id) || [];
        
        // Fetch expenses
        let expensesQuery = supabase
          .from('expenses')
          .select('*, expense_splits(*), groups(name)');
        
        if (mySplitIds.length > 0) {
          expensesQuery = expensesQuery.or(`paid_by.eq.${myId},id.in.(${mySplitIds.join(',')})`);
        } else {
          expensesQuery = expensesQuery.eq('paid_by', myId);
        }

        const { data: expenses, error: expError } = await expensesQuery;
        if (expError) throw expError;

        // 3. Fetch all settlements involving the user
        const { data: settlements, error: setError } = await supabase
          .from('settlements')
          .select('*, groups(name)')
          .or(`payer_id.eq.${myId},payee_id.eq.${myId}`);
        if (setError) throw setError;

        // 4. Calculate Net Balances per user
        // balanceMap keys: user_id, value: net balance (positive = they owe me, negative = I owe them)
        const balanceMap = new Map<string, number>();

        expenses?.forEach(exp => {
          const payerId = exp.paid_by;
          const splits = exp.expense_splits || [];
          
          if (payerId === myId) {
            // I paid: others owe me their split amounts
            splits.forEach(split => {
              if (split.user_id !== myId) {
                const currentBal = balanceMap.get(split.user_id) || 0;
                balanceMap.set(split.user_id, currentBal + Number(split.amount));
              }
            });
          } else {
            // Someone else paid: I owe them my split amount
            const mySplit = splits.find(s => s.user_id === myId);
            if (mySplit) {
              const currentBal = balanceMap.get(payerId) || 0;
              balanceMap.set(payerId, currentBal - Number(mySplit.amount));
            }
          }
        });

        settlements?.forEach(settle => {
          const payerId = settle.payer_id;
          const payeeId = settle.payee_id;
          const amt = Number(settle.amount);

          if (payerId === myId) {
            // I paid them: reduces my debt to them (increases balance)
            const currentBal = balanceMap.get(payeeId) || 0;
            balanceMap.set(payeeId, currentBal + amt);
          } else if (payeeId === myId) {
            // They paid me: reduces what they owe me (decreases balance)
            const currentBal = balanceMap.get(payerId) || 0;
            balanceMap.set(payerId, currentBal - amt);
          }
        });

        // Convert balance map to list of DebtSummary
        let totalOwe = 0;
        let totalOwed = 0;
        const tempDebts: DebtSummary[] = [];

        balanceMap.forEach((bal, userId) => {
          // Round to 2 decimal places to avoid floating point errors
          const roundedBal = Math.round(bal * 100) / 100;
          if (Math.abs(roundedBal) < 0.01) return; // Skip zero balance

          if (roundedBal > 0) {
            totalOwed += roundedBal;
          } else {
            totalOwe += Math.abs(roundedBal);
          }

          const userProf = profileMap.get(userId);
          tempDebts.push({
            userId,
            userName: userProf?.name || 'Unknown User',
            userAvatar: userProf?.avatar_url,
            amount: roundedBal
          });
        });

        setYouOwe(totalOwe);
        setYouAreOwed(totalOwed);
        setDebts(tempDebts);

        // 5. Compile Recent Activities list (sort merged expenses & settlements by date/created_at)
        const tempActivities: ActivityItem[] = [];

        expenses?.forEach(exp => {
          const payerName = profileMap.get(exp.paid_by)?.name || 'Someone';
          tempActivities.push({
            id: exp.id,
            type: 'expense',
            description: exp.description,
            amount: Number(exp.amount),
            date: exp.date || exp.created_at,
            paidBy: exp.paid_by,
            payerName,
            groupName: exp.groups?.name
          });
        });

        settlements?.forEach(settle => {
          const payerName = profileMap.get(settle.payer_id)?.name || 'Someone';
          const payeeName = profileMap.get(settle.payee_id)?.name || 'Someone';
          tempActivities.push({
            id: settle.id,
            type: 'settlement',
            description: 'Settle Up Payment',
            amount: Number(settle.amount),
            date: settle.date || settle.created_at,
            payerName,
            payeeName,
            groupName: settle.groups?.name
          });
        });

        // Sort by date descending
        tempActivities.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setActivities(tempActivities.slice(0, 10)); // Top 10 activities

      } catch (err) {
        console.error('Error compiling dashboard:', err);
      } finally {
        setLoading(false);
      }
    };

    loadDashboardData();
  }, [profile, refreshKey]);

  if (loading) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
        <p>Calculating balances and loading feed...</p>
      </div>
    );
  }

  const netBalance = youAreOwed - youOwe;

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header">
        <div>
          <h2 className="page-title">Hey, {profile?.name}!</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '2px' }}>
            Here is your spending overview
          </p>
        </div>
        
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setShowSettle(true)} className="btn btn-secondary">
            <CheckCircle size={16} />
            Settle Up
          </button>
          <button onClick={() => setShowAddExpense(true)} className="btn btn-primary">
            <PlusCircle size={16} />
            Add Bill
          </button>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="balance-card-grid">
        <div className={`balance-item ${netBalance > 0 ? 'owed' : netBalance < 0 ? 'owe' : 'neutral'}`}>
          <div className="label">Net Balance</div>
          <div className="value">
            {netBalance >= 0 ? '+' : '-'}₹{Math.abs(netBalance).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
        <div className="balance-item owe">
          <div className="label">You Owe</div>
          <div className="value">
            ₹{youOwe.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
        <div className="balance-item owed">
          <div className="label">You Are Owed</div>
          <div className="value">
            ₹{youAreOwed.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '20px', marginTop: '12px' }} className="dashboard-grid">
        {/* Debts Breakdown */}
        <section className="glass-card" style={{ display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <TrendingUp size={20} color="var(--primary)" />
            Balances Summary
          </h3>

          {debts.length === 0 ? (
            <div className="empty-state" style={{ flex: 1, padding: '20px' }}>
              <CheckCircle size={36} color="var(--color-owed)" />
              <h3 style={{ fontSize: '16px', marginTop: '10px' }}>You are all settled up!</h3>
              <p style={{ fontSize: '12px' }}>No active debts or balances. Awesome job managing your paisa!</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', overflowY: 'auto', maxHeight: '320px' }}>
              {debts.map((debt) => (
                <div 
                  key={debt.userId} 
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    backgroundColor: 'var(--bg-tertiary)',
                    borderLeft: `4px solid ${debt.amount > 0 ? 'var(--color-owed)' : 'var(--color-owe)'}`
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <img 
                      src={debt.userAvatar || `https://api.dicebear.com/7.x/adventurer/svg?seed=${debt.userId}`} 
                      alt={debt.userName}
                      style={{ width: '30px', height: '30px', borderRadius: '50%', backgroundColor: 'var(--bg-accent)' }}
                    />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '14px' }}>{debt.userName}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                        {debt.amount > 0 ? 'owes you' : 'you owe'}
                      </div>
                    </div>
                  </div>
                  <div style={{ 
                    fontWeight: 700, 
                    color: debt.amount > 0 ? 'var(--color-owed)' : 'var(--color-owe)',
                    fontSize: '14px' 
                  }}>
                    ₹{Math.abs(debt.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Recent Activity Log */}
        <section className="glass-card" style={{ display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <Activity size={20} color="var(--secondary)" />
            Recent Activity
          </h3>

          {activities.length === 0 ? (
            <div className="empty-state" style={{ flex: 1, padding: '20px' }}>
              <p style={{ fontSize: '12px' }}>No expenses recorded yet. Create a group or add an expense to get started!</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto', maxHeight: '320px' }}>
              {activities.map((act) => (
                <div key={act.id} style={{ display: 'flex', gap: '10px', fontSize: '13px', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
                  <div style={{ 
                    width: '32px', 
                    height: '32px', 
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: act.type === 'expense' ? 'var(--primary-glow)' : 'var(--color-owed-bg)',
                    color: act.type === 'expense' ? 'var(--primary)' : 'var(--color-owed)'
                  }}>
                    {act.type === 'expense' ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
                  </div>
                  
                  <div style={{ flex: 1 }}>
                    <div style={{ color: 'var(--text-primary)', fontWeight: 550 }}>
                      {act.type === 'expense' ? (
                        <span>
                          {act.paidBy === profile.id ? 'You' : act.payerName} added "<strong>{act.description}</strong>"
                          {act.groupName && <span style={{ color: 'var(--text-muted)' }}> in {act.groupName}</span>}
                        </span>
                      ) : (
                        <span>
                          {act.payerName} settled with {act.payeeName}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      {new Date(act.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </div>
                  </div>

                  <div style={{ textAlign: 'right', fontWeight: 600 }}>
                    ₹{act.amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Modals */}
      {showSettle && (
        <SettleForm 
          onClose={() => {
            setShowSettle(false);
            triggerRefresh();
          }} 
        />
      )}

      {showAddExpense && (
        <ExpenseForm 
          onClose={() => {
            setShowAddExpense(false);
            triggerRefresh();
          }} 
        />
      )}
      
      {/* Mobile Grid Layout Fix (Responsive) */}
      <style>{`
        @media (max-width: 768px) {
          .dashboard-grid {
            grid-template-columns: 1fr !important;
            gap: 16px !important;
          }
        }
      `}</style>
    </div>
  );
}
