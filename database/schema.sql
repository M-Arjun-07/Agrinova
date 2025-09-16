-- Drop and recreate farms for clean update (backup data first if any!)
DROP TABLE IF EXISTS farms CASCADE;

-- Updated farms table (now represents saves)
CREATE TABLE IF NOT EXISTS farms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  save_name TEXT NOT NULL DEFAULT 'New Farm',  -- e.g., 'Summer Rice Farm'
  soil_type TEXT CHECK (soil_type IN ('alluvial', 'black', 'red', 'desert')) NOT NULL,  -- Restrict to your options
  crop_type TEXT,
  sustainability_score INTEGER DEFAULT 0,
  yield INTEGER DEFAULT 0,
  choices JSONB,  -- e.g., {fertilizer: 'organic', ...}
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster queries
CREATE INDEX idx_farms_user_id ON farms(user_id);

-- RLS (updated)
ALTER TABLE farms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "User owns farms" ON farms;
CREATE POLICY "User owns farms" ON farms
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Timestamp trigger (reuse for farms too)
CREATE TRIGGER update_farms_timestamp
BEFORE UPDATE ON farms
FOR EACH ROW EXECUTE PROCEDURE update_updated_at();

-- Leaderboards unchanged, but add foreign key reference if needed
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