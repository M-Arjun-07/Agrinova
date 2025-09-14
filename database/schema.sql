-- Farms table (idempotent)
CREATE TABLE IF NOT EXISTS farms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  crop_type TEXT NOT NULL,
  sustainability_score INTEGER DEFAULT 0,
  yield INTEGER DEFAULT 0,
  choices JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Leaderboards table (idempotent)
CREATE TABLE IF NOT EXISTS leaderboards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  score INTEGER DEFAULT 0,
  badges JSONB DEFAULT '[]'::JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS if not already (this is idempotent in Supabase/Postgres)
ALTER TABLE farms ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboards ENABLE ROW LEVEL SECURITY;

-- Drop and recreate policies to avoid duplicates
DROP POLICY IF EXISTS "User owns farms" ON farms;
CREATE POLICY "User owns farms" ON farms
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Public read leaderboards" ON leaderboards;
CREATE POLICY "Public read leaderboards" ON leaderboards FOR SELECT USING (true);

DROP POLICY IF EXISTS "User owns leaderboard" ON leaderboards;
CREATE POLICY "User owns leaderboard" ON leaderboards
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Function (use OR REPLACE for idempotency)
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop and recreate trigger
DROP TRIGGER IF EXISTS update_leaderboards_timestamp ON leaderboards;
CREATE TRIGGER update_leaderboards_timestamp
BEFORE UPDATE ON leaderboards
FOR EACH ROW EXECUTE PROCEDURE update_updated_at();

ALTER TABLE farms ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE leaderboards ALTER COLUMN id SET DEFAULT gen_random_uuid();