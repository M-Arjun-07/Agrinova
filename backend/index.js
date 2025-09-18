require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

// Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

app.use(cors());
app.use(express.json());

// Test route
app.get('/', (req, res) => {
  res.send('Agrinova Backend: Farming Sim API');
});

// Auth middleware
const authMiddleware = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error) return res.status(401).json({ error: 'Invalid token' });
  req.user = user;
  next();
};

// User profile with saves and leaderboard
app.get('/user', authMiddleware, async (req, res) => {
  const { data: saves, error: savesError } = await supabase
    .from('farms')
    .select('*')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false });

  if (savesError) return res.status(400).json({ error: savesError.message });

  const { data: leaderboard, error: lbError } = await supabase
    .from('leaderboards')
    .select('*')
    .eq('user_id', req.user.id)
    .single();

  res.json({
    user: {
      id: req.user.id,
      email: req.user.email,
    },
    saves: saves || [],
    leaderboard: leaderboard || { score: 0, badges: [] },
  });
});

// List saves - requires auth for user-specific saves
app.get('/saves', async (req, res) => {
  const { data, error } = await supabase
    .from('farms')
    .select('id, save_name, soil_type, created_at, sustainability_score, coins')
    // .eq('user_id', req.user.id)
    .order('created_at', { ascending: false });
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// Create new save - requires auth
app.post('/saves', async (req, res) => {
  const { save_name = 'New Farm', soil_type, crop_type, choices, coins } = req.body;
  if (!soil_type) return res.status(400).json({ error: 'soil_type required' });

  let sustainability_score = 0;
  if (soil_type === 'alluvial' && choices?.fertilizer === 'organic') sustainability_score += 5;
  // Additional scoring logic can be added here

  const { data, error } = await supabase
    .from('farms')
    .insert({
      user_id: null,
      save_name,
      soil_type,
      crop_type,
      choices,
      coins,
      sustainability_score,
      yield: Math.floor(sustainability_score * Math.random() * 10) + 50,
    })
    .select();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data[0]);
});

// Get specific save - requires auth
app.get('/saves/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('farms')
    .select('*')
    .eq('id', req.params.id)
    // .eq('user_id', req.user.id)
    .single();
  if (error) return res.status(400).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Save not found' });
  res.json(data);
});

// Update save - requires auth
app.put('/saves/:id', authMiddleware, async (req, res) => {
  const { crop_type, choices } = req.body;
  let sustainability_score = 0;

  // Fetch current save for soil info
  const { data: current, error: fetchError } = await supabase
    .from('farms')
    .select('soil_type')
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .single();
  if (fetchError || !current) return res.status(400).json({ error: 'Save not found' });

  if (choices.fertilizer === 'organic') sustainability_score += 10;
  if (choices.irrigation === 'drip') sustainability_score += 10;
  if (choices.pest_control === 'natural') sustainability_score += 10;
  if (current.soil_type === 'black') sustainability_score += 5;

  const { data, error } = await supabase
    .from('farms')
    .update({
      crop_type,
      choices,
      sustainability_score,
      yield: Math.floor(sustainability_score * Math.random() * 10) + 50,
    })
    .eq('id', req.params.id)
    .select();
  if (error) return res.status(400).json({ error: error.message });

  // Update leaderboard entry
  await supabase
    .from('leaderboards')
    .upsert({
      user_id: req.user.id,
      score: sustainability_score,
    }, { onConflict: 'user_id' });
  
  res.json(data[0]);
});

// Get player's farms (all fields) - requires auth
app.get('/farms', authMiddleware, async (req, res) => {
  const { data, error } = await supabase
    .from('farms')
    .select('*')
    .eq('user_id', req.user.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// Get leaderboard (top 10)
app.get('/leaderboards', async (req, res) => {
  const { data, error } = await supabase
    .from('leaderboards')
    .select('*')
    .order('score', { ascending: false })
    .limit(10);
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// Update leaderboard - requires auth
app.post('/leaderboards/update', authMiddleware, async (req, res) => {
  const { score_increment, badge } = req.body;
  const { data: current, error: fetchError } = await supabase
    .from('leaderboards')
    .select('score, badges')
    .eq('user_id', req.user.id)
    .single();

  if (fetchError && fetchError.code !== 'PGRST116') return res.status(400).json({ error: fetchError.message });

  const newScore = (current?.score || 0) + score_increment;
  const newBadges = [...(current?.badges || []), badge].filter(Boolean);

  const { data, error } = await supabase
    .from('leaderboards')
    .upsert({
      user_id: req.user.id,
      score: newScore,
      badges: newBadges,
    }, { onConflict: 'user_id' })
    .select();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data[0]);
});

app.listen(port, () => {
  console.log(`Agrinova Backend on http://localhost:${port}`);
});


// do not use these are for testing purposes only.
// to create your own user, use own email id and passwords
// GET: Invoke-WebRequest -Uri "http://localhost:3000/leaderboards" -Method GET
// login user:  Invoke-WebRequest -Uri "http://localhost:3000/login" -Method POST -Body '{"email":"hariram.98706@gmail.com","password":"tunaktunaktun@123"}' -ContentType "application/json"
// POST: Invoke-WebRequest -Uri "http://localhost:3000/farms" -Method POST -Body '{"crop_type":"rice","choices":{"fertilizer":"organic","irrigation":"drip","pest_control":"natural"}}' -ContentType "application/json" -Headers @{Authorization = "Bearer eyJhbGciOiJIUzI1NiIsImtpZCI6IkNUdGM4bzlyaEV1VUpObzkiLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJodHRwczovL3lyc2lhY2xkbmpqa2VmbHdhaWh4LnN1cGFiYXNlLmNvL2F1dGgvdjEiLCJzdWIiOiIzZjdlMzFmYi0zMjdhLTRkM2EtOTgxMi0zMTRlZDY0YzVjODEiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzU3ODc4ODUwLCJpYXQiOjE3NTc4NzUyNTAsImVtYWlsIjoiaGFyaXJhbS45ODcwNkBnbWFpbC5jb20iLCJwaG9uZSI6IiIsImFwcF9tZXRhZGF0YSI6eyJwcm92aWRlciI6ImVtYWlsIiwicHJvdmlkZXJzIjpbImVtYWlsIl19LCJ1c2VyX21ldGFkYXRhIjp7ImVtYWlsX3ZlcmlmaWVkIjp0cnVlfSwicm9sZSI6ImF1dGhlbnRpY2F0ZWQiLCJhYWwiOiJhYWwxIiwiYW1yIjpbeyJtZXRob2QiOiJwYXNzd29yZCIsInRpbWVzdGFtcCI6MTc1Nzg3NTI1MH1dLCJzZXNzaW9uX2lkIjoiY2NkZGU1YjgtMGUwNi00YzZiLWEzZjktZmQ3NmQxYzNiNDZlIiwiaXNfYW5vbnltb3VzIjpmYWxzZX0.FFhLvZMkQBLuxMh7JOIVZLAqkAxRqOVu9bIUzv_7eMA"}