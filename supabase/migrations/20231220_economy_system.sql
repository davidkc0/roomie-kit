-- supabase/migrations/20231220_economy_system.sql

-- User coins (purchased currency)
create table if not exists user_coins (
  user_id uuid references auth.users primary key,
  balance int default 0 check (balance >= 0),
  lifetime_purchased int default 0,  -- Track total $ spent
  last_daily_claim timestamp,
  streak_days int default 0 check (streak_days >= 0),
  created_at timestamp default now(),
  updated_at timestamp default now()
);

-- User gems (earned currency, convertible to cash)
create table if not exists user_gems (
  user_id uuid references auth.users primary key,
  balance int default 0 check (balance >= 0),
  lifetime_earned int default 0,  -- Track total gems earned
  lifetime_withdrawn int default 0,  -- Track total gems converted to cash
  created_at timestamp default now(),
  updated_at timestamp default now()
);

-- Transaction log (covers both coins and gems)
create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  currency_type text not null check (currency_type in ('coins', 'gems')),
  amount int not null,  -- Positive = earn, negative = spend
  balance_after int not null,
  transaction_type text not null,
  -- Types: 'purchase', 'daily_login', 'gift_sent', 'gift_received', 'gem_withdrawal', 'task_complete'
  metadata jsonb default '{}'::jsonb,
  created_at timestamp default now()
);

-- Indexes
create index if not exists idx_transactions_user_currency on transactions(user_id, currency_type, created_at desc);
create index if not exists idx_transactions_type on transactions(transaction_type);

-- RPC: Add/subtract coins
create or replace function modify_coins(
  p_user_id uuid,
  p_amount int,
  p_type text,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_new_balance int;
  v_lifetime_purchased int;
begin
  -- Update or insert user_coins
  insert into user_coins (user_id, balance, lifetime_purchased)
  values (
    p_user_id, 
    p_amount, 
    case when p_amount > 0 and p_type = 'purchase' then p_amount else 0 end
  )
  on conflict (user_id) do update
  set 
    balance = user_coins.balance + p_amount,
    lifetime_purchased = user_coins.lifetime_purchased + 
      case when p_amount > 0 and p_type = 'purchase' then p_amount else 0 end,
    updated_at = now()
  returning balance, lifetime_purchased into v_new_balance, v_lifetime_purchased;
  
  -- Prevent negative balance
  if v_new_balance < 0 then
    raise exception 'Insufficient coins';
  end if;
  
  -- Log transaction
  insert into transactions (user_id, currency_type, amount, balance_after, transaction_type, metadata)
  values (p_user_id, 'coins', p_amount, v_new_balance, p_type, p_metadata);
  
  return jsonb_build_object(
    'balance', v_new_balance,
    'lifetime_purchased', v_lifetime_purchased
  );
end;
$$;

-- RPC: Add/subtract gems
create or replace function modify_gems(
  p_user_id uuid,
  p_amount int,
  p_type text,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_new_balance int;
  v_lifetime_earned int;
  v_lifetime_withdrawn int;
begin
  -- Update or insert user_gems
  insert into user_gems (user_id, balance, lifetime_earned, lifetime_withdrawn)
  values (
    p_user_id, 
    p_amount,
    case when p_amount > 0 then p_amount else 0 end,
    case when p_amount < 0 and p_type = 'gem_withdrawal' then abs(p_amount) else 0 end
  )
  on conflict (user_id) do update
  set 
    balance = user_gems.balance + p_amount,
    lifetime_earned = user_gems.lifetime_earned + case when p_amount > 0 then p_amount else 0 end,
    lifetime_withdrawn = user_gems.lifetime_withdrawn + 
      case when p_amount < 0 and p_type = 'gem_withdrawal' then abs(p_amount) else 0 end,
    updated_at = now()
  returning balance, lifetime_earned, lifetime_withdrawn 
  into v_new_balance, v_lifetime_earned, v_lifetime_withdrawn;
  
  -- Prevent negative balance
  if v_new_balance < 0 then
    raise exception 'Insufficient gems';
  end if;
  
  -- Log transaction
  insert into transactions (user_id, currency_type, amount, balance_after, transaction_type, metadata)
  values (p_user_id, 'gems', p_amount, v_new_balance, p_type, p_metadata);
  
  return jsonb_build_object(
    'balance', v_new_balance,
    'lifetime_earned', v_lifetime_earned,
    'lifetime_withdrawn', v_lifetime_withdrawn
  );
end;
$$;

-- RPC: Daily login claim (coins)
create or replace function claim_daily_coins(p_user_id uuid)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_last_claim timestamp;
  v_streak int;
  v_reward int;
  v_now timestamp := now();
begin
  -- Get current streak info
  select last_daily_claim, streak_days
  into v_last_claim, v_streak
  from user_coins
  where user_id = p_user_id;
  
  -- Check if already claimed today
  if v_last_claim is not null and v_last_claim::date = v_now::date then
    raise exception 'Already claimed today';
  end if;
  
  -- Calculate new streak
  if v_last_claim is null or v_last_claim::date < (v_now - interval '1 day')::date then
    v_streak := 1;  -- Reset if missed a day
  elsif v_last_claim::date = (v_now - interval '1 day')::date then
    v_streak := v_streak + 1;  -- Continue streak
  end if;
  
  -- Calculate reward (base 50 + 10 per streak day, max 200)
  v_reward := least(50 + (v_streak * 10), 200);
  
  -- Update streak info
  update user_coins
  set 
    last_daily_claim = v_now,
    streak_days = v_streak,
    updated_at = v_now
  where user_id = p_user_id;
  
  -- Add coins
  perform modify_coins(
    p_user_id,
    v_reward,
    'daily_login',
    jsonb_build_object('streak', v_streak)
  );
  
  return jsonb_build_object(
    'reward', v_reward,
    'streak', v_streak,
    'next_reward', least(50 + ((v_streak + 1) * 10), 200)
  );
end;
$$;

-- Enable RLS
alter table user_coins enable row level security;
alter table user_gems enable row level security;
alter table transactions enable row level security;

-- RLS Policies
create policy "Users can view own coins"
  on user_coins for select
  using (auth.uid() = user_id);

create policy "Users can view own gems"
  on user_gems for select
  using (auth.uid() = user_id);

create policy "Users can view own transactions"
  on transactions for select
  using (auth.uid() = user_id);
