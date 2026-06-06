-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create friends table
CREATE TABLE public.friends (
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  friend_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'accepted' NOT NULL CHECK (status IN ('pending', 'accepted')),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  PRIMARY KEY (user_id, friend_id)
);

-- Enable RLS on friends
ALTER TABLE public.friends ENABLE ROW LEVEL SECURITY;

-- Create groups table
CREATE TABLE public.groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Enable RLS on groups
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

-- Create group members table
CREATE TABLE public.group_members (
  group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  PRIMARY KEY (group_id, user_id)
);

-- Enable RLS on group_members
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;

-- Create expenses table
CREATE TABLE public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE, -- Nullable for individual friend expenses
  description TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  paid_by UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  split_type TEXT NOT NULL DEFAULT 'equal' CHECK (split_type IN ('equal', 'exact', 'percentage')),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  date DATE DEFAULT CURRENT_DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Enable RLS on expenses
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

-- Create expense splits table
CREATE TABLE public.expense_splits (
  expense_id UUID REFERENCES public.expenses(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  PRIMARY KEY (expense_id, user_id)
);

-- Enable RLS on expense_splits
ALTER TABLE public.expense_splits ENABLE ROW LEVEL SECURITY;

-- Create settlements table
CREATE TABLE public.settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE, -- Nullable for individual friend settlements
  payer_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  payee_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  date DATE DEFAULT CURRENT_DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CHECK (payer_id <> payee_id)
);

-- Enable RLS on settlements
ALTER TABLE public.settlements ENABLE ROW LEVEL SECURITY;

---------------------------------------------------------
-- SECURITY DEFINER HELPER FUNCTIONS
---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_group_member(group_uuid UUID, user_uuid UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = group_uuid AND user_id = user_uuid
  );
$$;

---------------------------------------------------------
-- ROW LEVEL SECURITY (RLS) POLICIES
---------------------------------------------------------

-- Profiles Policies
CREATE POLICY "Public profiles are viewable by authenticated users"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

-- Friends Policies
CREATE POLICY "Users can view their own friend list"
  ON public.friends FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR auth.uid() = friend_id);

CREATE POLICY "Users can add friends"
  ON public.friends FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update or remove friends"
  ON public.friends FOR ALL
  TO authenticated
  USING (auth.uid() = user_id OR auth.uid() = friend_id);

-- Groups Policies
CREATE POLICY "Users can view groups they are member of or created"
  ON public.groups FOR SELECT
  TO authenticated
  USING (
    created_by = auth.uid() OR
    public.is_group_member(id, auth.uid())
  );

CREATE POLICY "Users can create groups"
  ON public.groups FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update groups they are member of"
  ON public.groups FOR UPDATE
  TO authenticated
  USING (
    public.is_group_member(id, auth.uid())
  );

-- Group Members Policies
CREATE POLICY "group_members_select_policy"
  ON public.group_members FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid() OR
    public.is_group_member(group_id, auth.uid())
  );

CREATE POLICY "Group members can add other members"
  ON public.group_members FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Allow initial creator to add members, or existing members to add others
    EXISTS (
      SELECT 1 FROM public.groups g
      WHERE g.id = group_members.group_id AND g.created_by = auth.uid()
    ) OR
    public.is_group_member(group_id, auth.uid())
  );

CREATE POLICY "Group members can leave or remove members"
  ON public.group_members FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.groups g
      WHERE g.id = group_members.group_id AND g.created_by = auth.uid()
    )
  );

-- Expenses Policies
CREATE POLICY "expenses_select_policy"
  ON public.expenses FOR SELECT
  TO authenticated
  USING (
    created_by = auth.uid() OR
    (group_id IS NOT NULL AND public.is_group_member(group_id, auth.uid())) OR
    (group_id IS NULL AND (
      paid_by = auth.uid() OR
      EXISTS (
        SELECT 1 FROM public.friends f
        WHERE (f.user_id = auth.uid() AND f.friend_id = expenses.paid_by)
           OR (f.friend_id = auth.uid() AND f.user_id = expenses.paid_by)
      )
    ))
  );

CREATE POLICY "expenses_insert_policy"
  ON public.expenses FOR INSERT
  TO authenticated
  WITH CHECK (
    (auth.uid() = paid_by OR auth.uid() = created_by) AND
    (group_id IS NULL OR public.is_group_member(group_id, auth.uid()))
  );

CREATE POLICY "expenses_delete_policy"
  ON public.expenses FOR DELETE
  TO authenticated
  USING (
    paid_by = auth.uid() OR created_by = auth.uid()
  );

-- Expense Splits Policies
CREATE POLICY "splits_select_policy"
  ON public.expense_splits FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.expenses e
      WHERE e.id = expense_splits.expense_id
    )
  );

CREATE POLICY "splits_insert_policy"
  ON public.expense_splits FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.expenses e
      WHERE e.id = expense_splits.expense_id AND (
        e.paid_by = auth.uid() OR e.created_by = auth.uid()
      )
    )
  );

CREATE POLICY "splits_delete_policy"
  ON public.expense_splits FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.expenses e
      WHERE e.id = expense_splits.expense_id AND (e.paid_by = auth.uid() OR e.created_by = auth.uid())
    )
  );

-- Settlements Policies
CREATE POLICY "Users can view settlements they are involved in or in their groups"
  ON public.settlements FOR SELECT
  TO authenticated
  USING (
    payer_id = auth.uid() OR
    payee_id = auth.uid() OR
    (group_id IS NOT NULL AND public.is_group_member(group_id, auth.uid()))
  );

CREATE POLICY "Users can record settlements"
  ON public.settlements FOR INSERT
  TO authenticated
  WITH CHECK (
    (payer_id = auth.uid() OR payee_id = auth.uid()) AND
    (group_id IS NULL OR public.is_group_member(group_id, auth.uid()))
  );

CREATE POLICY "Users can delete settlements they recorded"
  ON public.settlements FOR DELETE
  TO authenticated
  USING (
    payer_id = auth.uid() OR payee_id = auth.uid()
  );

---------------------------------------------------------
-- INDEXES FOR PERFORMANCE
---------------------------------------------------------
CREATE INDEX idx_friends_friend_id ON public.friends(friend_id);
CREATE INDEX idx_group_members_user_id ON public.group_members(user_id);
CREATE INDEX idx_expenses_group_id ON public.expenses(group_id);
CREATE INDEX idx_expenses_paid_by ON public.expenses(paid_by);
CREATE INDEX idx_expense_splits_user_id ON public.expense_splits(user_id);
CREATE INDEX idx_settlements_payer_id ON public.settlements(payer_id);
CREATE INDEX idx_settlements_payee_id ON public.settlements(payee_id);
CREATE INDEX idx_settlements_group_id ON public.settlements(group_id);

---------------------------------------------------------
-- AUTH TRIGGERS TO PROFILE SYNC
---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    email,
    name,
    avatar_url
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NEW.raw_user_meta_data->>'name',
      split_part(NEW.email, '@', 1)
    ),
    COALESCE(
      NEW.raw_user_meta_data->>'avatar_url',
      'https://api.dicebear.com/7.x/adventurer/svg?seed=' || NEW.id::text
    )
  );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
