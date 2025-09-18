-- Drop and recreate farms for clean update (backup data first if any!)
DROP TABLE IF EXISTS farms CASCADE;

-- Updated farms table (now represents saves)


-- Index for faster queries
CREATE INDEX idx_farms_user_id ON farms(user_id);

-- Timestamp trigger (reuse for farms too)
CREATE TRIGGER update_farms_timestamp
BEFORE UPDATE ON farms
FOR EACH ROW EXECUTE PROCEDURE update_updated_at();


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


-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.farms (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  save_name text NOT NULL DEFAULT 'New Farm'::text,
  soil_type text NOT NULL CHECK (soil_type = ANY (ARRAY['alluvial'::text, 'black'::text, 'red'::text, 'desert'::text])),
  crop_type text,
  sustainability_score integer DEFAULT 0,
  yield integer DEFAULT 0,
  choices jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  coins integer DEFAULT 0,
  CONSTRAINT farms_pkey PRIMARY KEY (id),
  CONSTRAINT farms_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.leaderboards (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE,
  score integer DEFAULT 0,
  badges jsonb DEFAULT '[]'::jsonb,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT leaderboards_pkey PRIMARY KEY (id),
  CONSTRAINT leaderboards_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);