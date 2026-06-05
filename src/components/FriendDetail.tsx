import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAppLayout } from './Layout.tsx';
import supabase from '../supabaseClient.ts';
import { 
  ArrowLeft, 
  Plus, 
  DollarSign, 
  FileText, 
  ArrowUpRight, 
  ArrowDownLeft, 
  CheckCircle,
  UserCheck
} from 'lucide-react';
import { Profile, Expense, Settlement } from '../types.ts';
import ExpenseForm from './ExpenseForm.tsx';
import SettleForm from './SettleForm.tsx';

export default function FriendDetail() {
  const { id: friendId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile, refreshKey, triggerRefresh } = useAppLayout();

  const [friend, setFriend] = useState<Profile | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState(0);

  // Modals
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [showSettle, setShowSettle] = useState(false);

  useEffect(() => {
    if (!profile || !friendId) return;

    const loadFriendDetails = async () => {
      setLoading(true);
      try {
        const myId = profile.id;

        // 1. Fetch friend profile
        const { data: friendProfile, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', friendId)
          .single();

        if (profileError) {
          navigate('/friends');
          return;
        }
        setFriend(friendProfile);

        // 2. Fetch mutual non-group expenses (where group_id IS NULL)
        // Either I paid and friend is in splits, OR friend paid and I am in splits
        const { data: expensesData, error: expensesError } = await supabase
          .from('expenses')
          .select('*, expense_splits(*)')
          .is('group_id', null)
          .or(`paid_by.eq.${myId},paid_by.eq.${friendId}`)
          .order('date', { ascending: false });

        if (expensesError) throw expensesError;

        // Filter in JS to ensure mutual engagement
        const mutualExpenses = expensesData?.filter(exp => {
          const payerId = exp.paid_by;
          const splits = exp.expense_splits || [];
          
          if (payerId === myId) {
            // I paid, is friend in splits?
            return splits.some((s: any) => s.user_id === friendId);
          } else if (payerId === friendId) {
            // Friend paid, am I in splits?
            return splits.some((s: any) => s.user_id === myId);
          }
          return false;
        }).map(exp => ({
          ...exp,
          amount: Number(exp.amount),
          expense_splits: exp.expense_splits?.map((es: any) => ({
            ...es,
            amount: Number(es.amount)
          }))
        })) || [];

        setExpenses(mutualExpenses);

        // 3. Fetch mutual non-group settlements
        const { data: settlementsData, error: settlementsError } = await supabase
          .from('settlements')
          .select('*')
          .is('group_id', null)
          .or(`and(payer_id.eq.${myId},payee_id.eq.${friendId}),and(payer_id.eq.${friendId},payee_id.eq.${myId})`)
          .order('date', { ascending: false });

        if (settlementsError) throw settlementsError;

        const formattedSettlements = settlementsData?.map(s => ({
          ...s,
          amount: Number(s.amount)
        })) || [];
        setSettlements(formattedSettlements);

        // 4. Calculate Net balance with this friend
        let tempBal = 0;

        // Process expenses
        mutualExpenses.forEach(exp => {
          const payerId = exp.paid_by;
          const splits = exp.expense_splits || [];
          
          if (payerId === myId) {
            // I paid, friend owes me their split amount
            const friendSplit = splits.find(s => s.user_id === friendId);
            if (friendSplit) {
              tempBal += friendSplit.amount;
            }
          } else {
            // Friend paid, I owe them my split amount
            const mySplit = splits.find(s => s.user_id === myId);
            if (mySplit) {
              tempBal -= mySplit.amount;
            }
          }
        });

        // Process settlements
        formattedSettlements.forEach(settle => {
          const payerId = settle.payer_id;
          const amt = settle.amount;

          if (payerId === myId) {
            // I paid friend: reduces my debt to them (adds to balance)
            tempBal += amt;
          } else {
            // Friend paid me: reduces their debt to me (subtracts from balance)
            tempBal -= amt;
          }
        });

        setBalance(Math.round(tempBal * 100) / 100);

      } catch (err) {
        console.error('Error fetching friend details:', err);
      } finally {
        setLoading(false);
      }
    };

    loadFriendDetails();
  }, [friendId, profile, refreshKey, navigate]);

  if (loading) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
        <p>Loading friend activity...</p>
      </div>
    );
  }

  if (!friend) {
    return (
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <h3>Friend not found</h3>
        <Link to="/friends" className="btn btn-secondary" style={{ marginTop: '12px' }}>
          Back to Friends
        </Link>
      </div>
    );
  }

  return (
    <div className="page-container">
      {/* Back link */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
        <Link to="/friends" style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center' }}>
          <ArrowLeft size={20} />
        </Link>
        <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Friends / Detail</span>
      </div>

      {/* Friend Detail Card */}
      <div className="glass-card" style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <img 
            src={friend.avatar_url || `https://api.dicebear.com/7.x/adventurer/svg?seed=${friend.id}`} 
            alt={friend.name}
            style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: 'var(--bg-accent)' }}
          />
          <div>
            <h2 style={{ fontSize: '24px', fontFamily: 'var(--font-family-display)' }}>{friend.name}</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>{friend.email}</p>
          </div>
        </div>

        {/* Balance Status Banner */}
        <div 
          style={{ 
            marginTop: '20px', 
            padding: '12px 16px', 
            borderRadius: '10px',
            backgroundColor: balance > 0 ? 'var(--color-owed-bg)' : balance < 0 ? 'var(--color-owe-bg)' : 'var(--color-neutral-bg)',
            color: balance > 0 ? 'var(--color-owed)' : balance < 0 ? 'var(--color-owe)' : 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '14px',
            fontWeight: 600
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {balance > 0 ? <ArrowUpRight size={18} /> : balance < 0 ? <ArrowDownLeft size={18} /> : <CheckCircle size={18} />}
            {balance > 0 
              ? `${friend.name} owes you` 
              : balance < 0 
                ? `You owe ${friend.name}` 
                : `You are all settled up with ${friend.name}`}
          </span>
          <span style={{ fontSize: '18px', fontWeight: 800 }}>
            ₹{Math.abs(balance).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>

        <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
          <button onClick={() => setShowAddExpense(true)} className="btn btn-primary btn-full">
            <Plus size={16} />
            Add Bill
          </button>
          <button onClick={() => setShowSettle(true)} className="btn btn-secondary btn-full">
            <DollarSign size={16} />
            Settle Up
          </button>
        </div>
      </div>

      {/* History Log */}
      <h3 style={{ fontSize: '18px', marginBottom: '16px' }}>Mutual History</h3>

      {expenses.length === 0 && settlements.length === 0 ? (
        <div className="glass-card" style={{ textAlign: 'center', padding: '40px 20px' }}>
          <FileText size={40} style={{ color: 'var(--text-muted)', opacity: 0.6, marginBottom: '12px' }} />
          <h4>No history yet</h4>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Log individual bills or record settling payments with {friend.name}.
          </p>
        </div>
      ) : (
        <div className="list-container">
          {/* Chronological list of mutual expenses & settlements */}
          {[
            ...expenses.map(e => ({ ...e, recordType: 'expense' as const })),
            ...settlements.map(s => ({ ...s, recordType: 'settlement' as const }))
          ]
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .map((item) => {
              if (item.recordType === 'expense') {
                const exp = item as Expense;
                const paidByMe = exp.paid_by === profile!.id;
                const mySplit = exp.expense_splits?.find(s => s.user_id === profile!.id);
                const friendSplit = exp.expense_splits?.find(s => s.user_id === friendId);
                
                let shareText = '';
                let shareColor = 'var(--text-muted)';
                let shareAmount = 0;

                if (paidByMe) {
                  shareText = 'you lent';
                  shareColor = 'var(--color-owed)';
                  shareAmount = friendSplit ? friendSplit.amount : 0;
                } else {
                  shareText = 'you borrowed';
                  shareColor = 'var(--color-owe)';
                  shareAmount = mySplit ? mySplit.amount : 0;
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
                          Paid by <strong>{paidByMe ? 'You' : friend.name}</strong> on {new Date(exp.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                        </div>
                      </div>
                    </div>
                    
                    <div className="list-item-right" style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                          ₹{exp.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </div>
                        <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>bill total</div>
                      </div>
                      {shareAmount > 0 && (
                        <div style={{ minWidth: '80px' }}>
                          <div style={{ fontSize: '14px', fontWeight: 700, color: shareColor }}>
                            ₹{shareAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </div>
                          <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>{shareText}</div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              } else {
                const settle = item as Settlement;
                const isPayerMe = settle.payer_id === profile!.id;
                
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
                          <strong>{isPayerMe ? 'You' : friend.name}</strong> settled and paid{' '}
                          <strong>{isPayerMe ? friend.name : 'You'}</strong>
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
                      <div style={{ fontSize: '9px', color: 'var(--text-secondary)' }}>settled up</div>
                    </div>
                  </div>
                );
              }
            })}
        </div>
      )}

      {/* Modals */}
      {showAddExpense && (
        <ExpenseForm 
          friendId={friendId}
          onClose={() => {
            setShowAddExpense(false);
            triggerRefresh();
          }} 
        />
      )}

      {showSettle && (
        <SettleForm 
          friendId={friendId}
          onClose={() => {
            setShowSettle(false);
            triggerRefresh();
          }} 
        />
      )}
    </div>
  );
}
