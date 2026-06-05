export interface Profile {
  id: string;
  email: string;
  name: string;
  avatar_url?: string;
  created_at: string;
}

export interface Friend {
  user_id: string;
  friend_id: string;
  status: 'pending' | 'accepted';
  created_at: string;
  friend_profile?: Profile; // Populated via join query
}

export interface Group {
  id: string;
  name: string;
  description?: string;
  created_by: string;
  created_at: string;
  member_count?: number;
}

export interface GroupMember {
  group_id: string;
  user_id: string;
  joined_at: string;
  profile?: Profile;
}

export interface Expense {
  id: string;
  group_id?: string;
  description: string;
  amount: number;
  paid_by: string;
  split_type: 'equal' | 'exact' | 'percentage';
  created_by: string;
  date: string;
  created_at: string;
  profiles?: Profile; // Paid by profile
  group_name?: string;
}

export interface ExpenseSplit {
  expense_id: string;
  user_id: string;
  amount: number;
  profile?: Profile;
}

export interface Settlement {
  id: string;
  group_id?: string;
  payer_id: string;
  payee_id: string;
  amount: number;
  date: string;
  created_at: string;
  payer_profile?: Profile;
  payee_profile?: Profile;
  group_name?: string;
}

// Summary representations
export interface DebtSummary {
  userId: string;
  userName: string;
  userAvatar?: string;
  amount: number; // positive = they owe current user, negative = current user owes them
}

export interface ActivityItem {
  id: string;
  type: 'expense' | 'settlement';
  description: string;
  amount: number;
  date: string;
  paidBy?: string;
  payerName?: string;
  payeeName?: string;
  groupName?: string;
}
