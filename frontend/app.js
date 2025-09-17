// Game Data from JSON specifications
const gameData = {
  gameConfig: {
    fieldWidth: 800,
    fieldHeight: 600,
    dayLengthSeconds: 300,
    startingMoney: 200
  },
  soilTypes: {
    alluvial: {name:"Alluvial Soil",color:"#8B7355",emoji:"🏞️",nutrients:{N:40,P:35,K:45}},
    black: {name:"Black Soil",color:"#2F2F2F",emoji:"🌿",nutrients:{N:55,P:45,K:50}},
    red: {name:"Red Soil",color:"#A0522D",emoji:"⛰️",nutrients:{N:25,P:30,K:35}},
    desert: {name:"Desert Soil",color:"#F4E4BC",emoji:"🌵",nutrients:{N:10,P:12,K:15}}
  },

  
  crops: {
  rice:   {name:"Rice",emoji:"🌾",seedCost:8,growthTime:20000,stages:4, fertilizerNeed: 80},
  wheat:  {name:"Wheat",emoji:"🌾",seedCost:10,growthTime:15000,stages:4, fertilizerNeed: 60},
  cotton: {name:"Cotton",emoji:"🤍",seedCost:15,growthTime:30000,stages:4, fertilizerNeed: 100},
  groundnut: {name:"Groundnut",emoji:"🥜",seedCost:6,growthTime:12000,stages:4, fertilizerNeed: 40}
  }
};

// Game State
let gameState = {

  fertilizerMeter: 0,   // current field fertilizer level
  maxFertilizer: 100,   // cap for fertilizer
  currentScreen: 'splash',
  selectedSoil: null,
  selectedTool: 'plough',
  selectedCrop: 'rice',
  money: gameData.gameConfig.startingMoney,
  
  // Organic field system - NO GRID
  ploughedPaths: [], // Array of path objects with points
  crops: [], // Array of crop objects at specific coordinates
  
  // Stats
  stats: {
    planted: 0,
    growing: 0,
    harvested: 0,
    totalEarnings: 0
  },
  
  // Canvas and interaction state
  canvas: null,
  ctx: null,
  isMouseDown: false,
  currentPath: [],
  lastMousePos: {x: 0, y: 0},
  gameLoopRunning: false
};

// Utility Functions
function generateID() {
  return Date.now() + Math.random().toString(36).substr(2, 9);
}

function adjustBrightness(hex, percent) {
  const num = parseInt(hex.replace("#", ""), 16);
  const amt = Math.round(2.55 * percent);
  const R = (num >> 16) + amt;
  const G = (num >> 8 & 0x00FF) + amt;
  const B = (num & 0x0000FF) + amt;
  return "#" + (0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 +
    (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 +
    (B < 255 ? B < 1 ? 0 : B : 255)).toString(16).slice(1);
}

function distance(x1, y1, x2, y2) {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

function isOnPloughedSoil(x, y) {
  for (let path of gameState.ploughedPaths) {
    for (let point of path.points) {
      if (distance(x, y, point.x, point.y) <= 25) {
        return true;
      }
    }
  }
  return false;
}

async function getSaves() {
  try {
    const res = await fetch('http://localhost:3000/saves'); // Change to production backend if needed
    if (!res.ok) throw new Error('Failed to fetch saves');
    return await res.json();
  } catch (err) {
    console.error('Error fetching saves:', err);
    return [];
  }
}

// Creates a new save in the backend
async function createSave(saveObj) {
  try {
    const res = await fetch('http://localhost:3000/saves', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(saveObj),
    });
    if (!res.ok) throw new Error('Failed to create save');
    return await res.json();
  } catch (err) {
    console.error('Error creating save:', err);
    return null;
  }
}

// --------- NEW: UI to show saves ---------

// Renders the saves panel
function renderSavesPanel(saves) {
  const panel = document.getElementById('saves-panel');
  if (!panel) return;
  if (saves.length === 0) {
    panel.innerHTML = '<div class="saves-empty">No saves yet</div>';
    return;
  }
  panel.innerHTML = saves.map(save => `
    <div class="save-entry">
      <div class="save-title">${save.savename || 'Unnamed Farm'}</div>
      <div class="save-meta">
        <span>${save.soiltype || 'Unknown Soil'}</span>
        <span>Score: ${save.sustainabilityscore || 0}</span>
        <span>${new Date(save.createdat).toLocaleString()}</span>
      </div>
    </div>
  `).join('');
}

// Fetch and show saves in UI
async function loadSaves() {
  const saves = await getSaves();
  renderSavesPanel(saves);
}

// Handler to save current farm
async function saveCurrentFarm() {
  const saveObj = {
    save_name: 'My Organic Farm ' + (new Date()).toLocaleTimeString(),
    soil_type: gameState.selectedSoil,
    crop_type: gameState.selectedCrop,
    choices: {
      fertilizer: 'organic', // or from player choices
      irrigation: 'drip',
      pestcontrol: 'natural',
    },
    stats: {...gameState.stats}
  };
  const result = await createSave(saveObj);
  if (result && !result.error) {
    showMessage('Farm saved successfully!');
    loadSaves();
  } else {
    showMessage('Failed to save farm.');
  }
}

// Screen Management
function showScreen(screenId) {
  console.log(`Attempting to show screen: ${screenId}`);
  
  // Hide all screens first
  const screens = document.querySelectorAll('.screen');
  screens.forEach(screen => {
    screen.classList.remove('active');
    console.log(`Hiding screen: ${screen.id}`);
  });
  
  // Show target screen
  const targetScreen = document.getElementById(screenId);
  if (targetScreen) {
    targetScreen.classList.add('active');
    gameState.currentScreen = screenId;
    console.log(`Successfully showing screen: ${screenId}`);
    
    // Initialize game when entering game screen
    if (screenId === 'game-screen') {
      setTimeout(() => {
        initializeGame();
      }, 200);
    }
    return true;
  } else {
    console.error(`Screen not found: ${screenId}`);
    return false;
  }
}

// Game Initialization
function initializeGame() {
  console.log('Initializing organic farming game...');
  
  // Stop any existing game loop
  gameState.gameLoopRunning = false;
  
  gameState.canvas = document.getElementById('field-canvas');
  if (!gameState.canvas) {
    console.error('Canvas element not found!');
    return;
  }
  
  gameState.ctx = gameState.canvas.getContext('2d');
  if (!gameState.ctx) {
    console.error('Canvas context not found!');
    return;
  }
  
  console.log('Canvas initialized successfully');
  
  // Setup canvas event listeners
  setupCanvasEvents();
  
  // Initial render
  renderField();
  updateUI();
  updateCurrentTool();
  
  // Start game loop
  startGameLoop();
  
  // Hide instructions after 3 seconds
  setTimeout(() => {
    const instructions = document.getElementById('field-instructions');
    if (instructions) {
      instructions.style.transition = 'opacity 0.5s ease-out';
      instructions.style.opacity = '0';
      setTimeout(() => {
        instructions.style.display = 'none';
      }, 500);
    }
  }, 3000);
  
  console.log('Game initialized successfully!');
}

function setupCanvasEvents() {
  const canvas = gameState.canvas;
  if (!canvas) return;
  
  console.log('Setting up canvas events...');
  
  // Remove existing event listeners first
  canvas.onmousedown = null;
  canvas.onmousemove = null;
  canvas.onmouseup = null;
  canvas.onmouseleave = null;
  canvas.ontouchstart = null;
  canvas.ontouchmove = null;
  canvas.ontouchend = null;
  
  // Mouse events
  canvas.addEventListener('mousedown', handleMouseDown, { passive: false });
  canvas.addEventListener('mousemove', handleMouseMove, { passive: false });
  canvas.addEventListener('mouseup', handleMouseUp, { passive: false });
  canvas.addEventListener('mouseleave', handleMouseUp, { passive: false });
  
  // Touch events for mobile
  canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
  canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
  canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
  
  console.log('Canvas events set up successfully');
}

function getCanvasCoordinates(event) {
  const rect = gameState.canvas.getBoundingClientRect();
  const scaleX = gameState.canvas.width / rect.width;
  const scaleY = gameState.canvas.height / rect.height;
  
  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY
  };
}

// Mouse Event Handlers
function handleMouseDown(event) {
  event.preventDefault();
  const coords = getCanvasCoordinates(event);
  gameState.isMouseDown = true;
  gameState.lastMousePos = coords;
  
  console.log(`Mouse down at: ${coords.x}, ${coords.y}, tool: ${gameState.selectedTool}`);
  
  if (gameState.selectedTool === 'plough') {
    gameState.currentPath = [{
      x: coords.x,
      y: coords.y,
      timestamp: Date.now()
    }];
    drawPloughedStripe(coords.x, coords.y, 25);
  } else {
    handleToolAction(coords.x, coords.y);
  }
}

function handleMouseMove(event) {
  event.preventDefault();
  const coords = getCanvasCoordinates(event);
  
  if (gameState.isMouseDown && gameState.selectedTool === 'plough') {
    // Add point to current ploughing path if moved enough
    const lastPoint = gameState.currentPath[gameState.currentPath.length - 1];
    if (distance(coords.x, coords.y, lastPoint.x, lastPoint.y) > 8) {
      gameState.currentPath.push({
        x: coords.x,
        y: coords.y,
        timestamp: Date.now()
      });
      
      // Draw ploughed stripe immediately
      drawPloughedStripe(coords.x, coords.y, 25);
    }
  }
  
  gameState.lastMousePos = coords;
}

function handleMouseUp(event) {
  if (gameState.isMouseDown && gameState.selectedTool === 'plough' && gameState.currentPath.length > 1) {
    // Save completed path
    gameState.ploughedPaths.push({
      id: generateID(),
      points: [...gameState.currentPath],
      createdAt: Date.now()
    });
    
    console.log(`Ploughed path completed with ${gameState.currentPath.length} points`);
  }
  
  gameState.isMouseDown = false;
  gameState.currentPath = [];
}

// Touch Event Handlers
function handleTouchStart(event) {
  event.preventDefault();
  const touch = event.touches[0];
  handleMouseDown(touch);
}

function handleTouchMove(event) {
  event.preventDefault();
  const touch = event.touches[0];
  handleMouseMove(touch);
}

function handleTouchEnd(event) {
  event.preventDefault();
  handleMouseUp(event);
}

// Tool Actions
function handleToolAction(x, y) {
  console.log(`Handling tool action: ${gameState.selectedTool} at ${x}, ${y}`);
  
  switch (gameState.selectedTool) {
    case 'plant':
      plantSeed(x, y);
      break;
    case 'water':
      waterArea(x, y);
      break;
    case 'fertilizer':
      applyFertilizerToField();
      break;

    case 'harvest':
      harvestCrop(x, y);
      break;
  }
}

function plantSeed(x, y) {
  if (!isOnPloughedSoil(x, y)) {
    showMessage("You need to plough the soil first!");
    return;
  }

  const minDistance = 30;
  for (let crop of gameState.crops) {
    if (distance(x, y, crop.x, crop.y) < minDistance) {
      showMessage("Give crops more space to grow!");
      return;
    }
  }

  const cropData = gameData.crops[gameState.selectedCrop];

  if (gameState.money < cropData.seedCost) {
    showMessage(`Need more coins! ${cropData.name} seeds cost 💰${cropData.seedCost}`);
    return;
  }

  gameState.money -= cropData.seedCost;

  const newCrop = {
  id: generateID(),
  type: gameState.selectedCrop,
  x: x,
  y: y,
  stage: 0,              // start as seed
  plantedTime: Date.now(),
  size: 2,
  rotation: Math.random() * 360,
  health: 100,
  watered: false,
  fertilized: false,
  growthProgress: 0,
  fertilizedTime: null,
  fertilizerDuration: 0
};


  gameState.crops.push(newCrop);
  gameState.stats.planted++;

  console.log(`Planted ${cropData.name} at ${x}, ${y}`);
  updateUI();
  showMessage(`${cropData.name} planted!`);
}


function waterArea(x, y) {
  createWaterEffect(x, y);
  let wateredCount = 0;

  gameState.crops.forEach(crop => {
    if (distance(x, y, crop.x, crop.y) <= 40) {
      crop.watered = true;
      crop.growthPoints += 5;  // 💧 Water adds growth
      wateredCount++;
      checkGrowth(crop);
    }
  });

  if (wateredCount > 0) {
    showMessage(`💧 Watered ${wateredCount} crops!`);
  } else {
    showMessage("💧 Area watered!");
  }
}


function applyFertilizerToField() {
  if (gameState.money < 15) {
    showMessage("Need more coins for fertilizer!");
    return;
  }

  gameState.money -= 15;

  // Visual effect at center of canvas
  createFertilizerEffect(gameState.canvas.width / 2, gameState.canvas.height / 2);

  let fertilizedCount = 0;

  gameState.crops.forEach(crop => {
    // Only fertilize crops that already exist
    if (!crop.fertilized) {
      crop.fertilized = true;
      crop.fertilizedTime = Date.now();
      crop.fertilizerDuration = 10000; // lasts 10s
      crop.health = Math.min(100, crop.health + 20);
      fertilizedCount++;
    }
  });

  updateUI();

  if (fertilizedCount > 0) {
    showMessage(`✨ Fertilized ${fertilizedCount} crops!`);
  } else {
    showMessage("✨ No crops to fertilize right now!");
  }
}





function harvestCrop(x, y) {
  for (let i = 0; i < gameState.crops.length; i++) {
    const crop = gameState.crops[i];
    if (distance(x, y, crop.x, crop.y) <= 20 && crop.stage >= 3) {
      const cropData = gameData.crops[crop.type];
      const reward = Math.floor(cropData.seedCost * 2.5);
      
      gameState.money += reward;
      gameState.stats.harvested++;
      gameState.stats.totalEarnings += reward;
      
      // Remove crop
      gameState.crops.splice(i, 1);
      
      updateUI();
      showMessage(`🎉 Harvested ${cropData.name}! Earned 💰${reward}!`);
      
      // Harvest effect
      createHarvestEffect(x, y);
      return;
    }
  }
  
  showMessage("No mature crops here to harvest!");
}
function checkGrowth(crop) {
  if (crop.growthPoints >= crop.thresholds.sprout && crop.stage === 0) {
    crop.stage = 1; // seed → sprout
    showMessage(`${gameData.crops[crop.type].name} has sprouted! 🌱`);
  }
  if (crop.growthPoints >= crop.thresholds.mature && crop.stage === 1) {
    crop.stage = 2; // sprout → mature
    showMessage(`${gameData.crops[crop.type].name} is growing strong! 🌾`);
  }
  if (crop.growthPoints >= crop.thresholds.harvest && crop.stage === 2) {
    crop.stage = 3; // mature → ready to harvest
    showMessage(`${gameData.crops[crop.type].name} is ready to harvest! 🎉`);
  }
}

// Visual Effects
function createWaterEffect(x, y) {
  // Create water droplets with canvas coordinates converted to screen coordinates
  const rect = gameState.canvas.getBoundingClientRect();
  const screenX = rect.left + (x * rect.width / gameState.canvas.width);
  const screenY = rect.top + (y * rect.height / gameState.canvas.height);
  
  for (let i = 0; i < 8; i++) {
    setTimeout(() => {
      const droplet = document.createElement('div');
      droplet.innerHTML = '💧';
      droplet.style.cssText = `
        position: fixed;
        left: ${screenX + (Math.random() - 0.5) * 40}px;
        top: ${screenY + (Math.random() - 0.5) * 20}px;
        font-size: ${16 + Math.random() * 8}px;
        pointer-events: none;
        z-index: 9999;
        transition: all 1.2s ease-in;
      `;
      
      document.body.appendChild(droplet);
      
      requestAnimationFrame(() => {
        droplet.style.transform = `translateY(${40 + Math.random() * 30}px) rotate(${Math.random() * 360}deg)`;
        droplet.style.opacity = '0';
      });
      
      setTimeout(() => droplet.remove(), 1200);
    }, i * 100);
  }
  
  // Draw ripple effect on canvas
  drawWaterRipple(x, y);
}

function drawWaterRipple(x, y) {
  let radius = 0;
  const maxRadius = 30;
  
  const animate = () => {
    if (!gameState.ctx) return;
    
    gameState.ctx.save();
    gameState.ctx.globalAlpha = 1 - (radius / maxRadius);
    gameState.ctx.strokeStyle = '#42A5F5';
    gameState.ctx.lineWidth = 2;
    gameState.ctx.beginPath();
    gameState.ctx.arc(x, y, radius, 0, 2 * Math.PI);
    gameState.ctx.stroke();
    gameState.ctx.restore();
    
    radius += 2;
    if (radius < maxRadius) {
      requestAnimationFrame(animate);
    }
  };
  
  animate();
}

function createFertilizerEffect(x, y) {
  // Create sparkle burst with proper coordinate conversion
  const rect = gameState.canvas.getBoundingClientRect();
  const screenX = rect.left + (x * rect.width / gameState.canvas.width);
  const screenY = rect.top + (y * rect.height / gameState.canvas.height);
  
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2;
    const distance = 30 + Math.random() * 40;
    const sparkleX = screenX + Math.cos(angle) * distance;
    const sparkleY = screenY + Math.sin(angle) * distance;
    
    setTimeout(() => {
      const sparkle = document.createElement('div');
      sparkle.innerHTML = ['✨', '⭐', '💫', '🌟'][Math.floor(Math.random() * 4)];
      sparkle.style.cssText = `
        position: fixed;
        left: ${screenX}px;
        top: ${screenY}px;
        font-size: ${12 + Math.random() * 8}px;
        pointer-events: none;
        z-index: 9999;
        transition: all 1.5s ease-out;
      `;
      
      document.body.appendChild(sparkle);
      
      requestAnimationFrame(() => {
        sparkle.style.transform = `translate(${sparkleX - screenX}px, ${sparkleY - screenY}px) scale(0) rotate(720deg)`;
        sparkle.style.opacity = '0';
      });
      
      setTimeout(() => sparkle.remove(), 1500);
    }, i * 50);
  }
}

function createHarvestEffect(x, y) {
  const rect = gameState.canvas.getBoundingClientRect();
  const screenX = rect.left + (x * rect.width / gameState.canvas.width);
  const screenY = rect.top + (y * rect.height / gameState.canvas.height);
  
  for (let i = 0; i < 6; i++) {
    setTimeout(() => {
      const coin = document.createElement('div');
      coin.innerHTML = '💰';
      coin.style.cssText = `
        position: fixed;
        left: ${screenX + (Math.random() - 0.5) * 30}px;
        top: ${screenY + (Math.random() - 0.5) * 30}px;
        font-size: ${18 + Math.random() * 10}px;
        pointer-events: none;
        z-index: 9999;
        transition: all 2s ease-out;
      `;
      
      document.body.appendChild(coin);
      
      requestAnimationFrame(() => {
        coin.style.transform = `translateY(-60px) rotate(${Math.random() * 720}deg) scale(1.5)`;
        coin.style.opacity = '0';
      });
      
      setTimeout(() => coin.remove(), 2000);
    }, i * 100);
  }
}

// Rendering Functions
function renderField() {
  if (!gameState.ctx || !gameState.canvas) return;
  
  const ctx = gameState.ctx;
  const canvas = gameState.canvas;
  
  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // Draw soil background
  drawSoilBackground();
  
  // Draw ploughed paths
  drawPloughedPaths();
  
  // Draw crops
  drawCrops();
}

function drawSoilBackground() {
  const ctx = gameState.ctx;
  const canvas = gameState.canvas;
  const soil = gameData.soilTypes[gameState.selectedSoil] || gameData.soilTypes.alluvial;
  
  // Create soil gradient
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, soil.color);
  gradient.addColorStop(1, adjustBrightness(soil.color, -20));
  
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Add natural soil texture
  ctx.fillStyle = 'rgba(0,0,0,0.1)';
  for (let i = 0; i < 300; i++) {
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height;
    const size = Math.random() * 3;
    ctx.fillRect(x, y, size, size);
  }
  
  // Add organic soil patterns
  ctx.strokeStyle = 'rgba(0,0,0,0.05)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 50; i++) {
    ctx.beginPath();
    ctx.moveTo(Math.random() * canvas.width, Math.random() * canvas.height);
    ctx.quadraticCurveTo(
      Math.random() * canvas.width, 
      Math.random() * canvas.height,
      Math.random() * canvas.width, 
      Math.random() * canvas.height
    );
    ctx.stroke();
  }
}

function drawPloughedPaths() {
  for (let path of gameState.ploughedPaths) {
    for (let point of path.points) {
      drawPloughedStripe(point.x, point.y, 25);
    }
  }
  
  // Draw current path being dragged
  for (let point of gameState.currentPath) {
    drawPloughedStripe(point.x, point.y, 25);
  }
}

function drawPloughedStripe(x, y, radius) {
  const ctx = gameState.ctx;
  if (!ctx) return;
  
  const soil = gameData.soilTypes[gameState.selectedSoil] || gameData.soilTypes.alluvial;
  
  ctx.fillStyle = adjustBrightness(soil.color, -30);
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, 2 * Math.PI);
  ctx.fill();
  
  // Add texture lines for realistic ploughed look
  for (let i = -radius; i <= radius; i += 4) {
    ctx.strokeStyle = adjustBrightness(soil.color, -40);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - radius, y + i);
    ctx.lineTo(x + radius, y + i);
    ctx.stroke();
  }
}

function drawCrops() {
  const ctx = gameState.ctx;
  if (!ctx) return;
  
  gameState.crops.forEach(crop => {
    const cropData = gameData.crops[crop.type];
    
    ctx.save();
    ctx.translate(crop.x + (crop.sway || 0), crop.y);
    ctx.rotate((crop.rotation * Math.PI) / 180);
    
    // Draw crop based on growth stage
    if (crop.stage === 0) {
    ctx.fillStyle = '#4CAF50';
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, 2 * Math.PI); // very small dot
    ctx.fill();


    } else if (crop.stage === 1) {
      // Young plant - small stem
      ctx.strokeStyle = '#4CAF50';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, 5);
      ctx.lineTo(0, -crop.size);
      ctx.stroke();
    } else if (crop.stage === 2) {
      // Growing - stem with leaves
      ctx.strokeStyle = '#2E7D32';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(0, 5);
      ctx.lineTo(0, -crop.size);
      ctx.stroke();
      
      // Add leaves
      ctx.fillStyle = '#4CAF50';
      ctx.beginPath();
      ctx.ellipse(-5, -crop.size/2, 8, 4, 0, 0, 2 * Math.PI);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(5, -crop.size/2 + 3, 8, 4, 0, 0, 2 * Math.PI);
      ctx.fill();
    } else {
      // Mature - full crop with emoji
      ctx.font = `${crop.size}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      if (crop.stage >= 3) {
        // Add golden glow for harvestable crops
        ctx.shadowColor = '#FFD700';
        ctx.shadowBlur = 10;
      }
      
      ctx.fillText(cropData.emoji, 0, 0);
      ctx.shadowBlur = 0;
    }
    
    ctx.restore();
  });
}

// Game Loop
function startGameLoop() {
  if (gameState.gameLoopRunning) return;
  
  gameState.gameLoopRunning = true;
  console.log('Starting game loop...');
  
  function gameLoop() {
    if (!gameState.gameLoopRunning) return;
    
    updateCropGrowth();
    renderField();
    updateGrowingCropsPanel();
    
    setTimeout(gameLoop, 1000);
  }
  
  gameLoop();
}

function updateCropGrowth() {
  gameState.crops.forEach(crop => {
    const cropData = gameData.crops[crop.type];

    // Skip growth if no external help
    if (!crop.watered && !crop.fertilized) {
      return; // stays in current stage until acted on
    }

    // Calculate growth rate
    let growthRate = 0; // default no growth
    if (crop.watered) growthRate += 0.5;        // watered gives growth
    if (crop.fertilized) growthRate += 1.0;     // fertilizer gives stronger boost

    // Increase growth progress proportional to rate
    crop.growthProgress = Math.min(1, crop.growthProgress + (growthRate / cropData.growthTime) * 1000);

    // Update size visually
    crop.size = 2 + (crop.growthProgress * 18);

    // Stage calculation
    if (crop.growthProgress < 0.2) {
      crop.stage = 0; // seed
    } else if (crop.growthProgress < 0.5) {
      crop.stage = 1; // sprout
    } else if (crop.growthProgress < 0.8) {
      crop.stage = 2; // young plant
    } else {
      crop.stage = 3; // mature
    }

    // Add natural sway effect
    crop.sway = Math.sin(Date.now() * 0.001 + parseInt(crop.id.substr(-3))) * 2;

    // Reset watered over time
    if (crop.watered && Math.random() < 0.05) {
      crop.watered = false;
    }

    // Reset fertilizer when duration ends
    if (crop.fertilized && crop.fertilizedTime && Date.now() - crop.fertilizedTime > crop.fertilizerDuration) {
      crop.fertilized = false;
    }
  });

  // Update stats
  gameState.stats.growing = gameState.crops.filter(c => c.stage < 3).length;
}





// UI Functions
function updateUI() {
  const coinCountElement = document.querySelector('.coin-count');
  if (coinCountElement) {
    coinCountElement.textContent = gameState.money;
  }
  
  const elements = {
    'planted-count': gameState.stats.planted,
    'growing-count': gameState.stats.growing,
    'harvested-count': gameState.stats.harvested,
    'total-earnings': `💰${gameState.stats.totalEarnings}`
  };
  
  for (const [id, value] of Object.entries(elements)) {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = value;
    }
  }
}

function updateGrowingCropsPanel() {
  const panel = document.getElementById('growing-crops');
  if (!panel) return;
  
  const growingCrops = gameState.crops.filter(c => c.stage < 3);
  
  if (growingCrops.length === 0) {
    panel.innerHTML = '<div class="no-crops">No crops growing yet</div>';
    return;
  }
  
  panel.innerHTML = growingCrops.map(crop => {
    const cropData = gameData.crops[crop.type];
    const progress = Math.floor(crop.growthProgress * 100);
    
    return `
      <div class="crop-entry">
        <div class="crop-entry-icon">${cropData.emoji}</div>
        <div class="crop-entry-info">
          <div class="crop-entry-name">${cropData.name}</div>
          <div class="crop-entry-progress">${progress}% grown</div>
          <div class="crop-progress-bar">
            <div class="crop-progress-fill" style="width: ${progress}%"></div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function updateCurrentTool() {
  const toolData = {
    plough: { icon: '🚜', name: 'Plough', desc: 'Click and drag to create organic furrows' },
    plant: { icon: '🌱', name: 'Plant', desc: 'Click anywhere on ploughed soil to plant seeds' },
    water: { icon: '💧', name: 'Water', desc: 'Click to water crops and boost growth' },
    fertilizer: { icon: '✨', name: 'Fertilizer', desc: 'Click to apply nutrients (💰15)' },
    harvest: { icon: '🌾', name: 'Harvest', desc: 'Click mature crops to harvest them' }
  };
  
  const tool = toolData[gameState.selectedTool];
  const iconElement = document.querySelector('.tool-icon');
  const nameElement = document.querySelector('.tool-name');
  const descElement = document.querySelector('.tool-desc');
  
  if (iconElement) iconElement.textContent = tool.icon;
  if (nameElement) nameElement.textContent = tool.name;
  if (descElement) descElement.textContent = tool.desc;
}

// Message System
function showMessage(message) {
  const popup = document.getElementById('message-popup');
  const text = document.getElementById('message-text');
  
  if (popup && text) {
    text.textContent = message;
    popup.classList.remove('hidden');
  }
}

function hideMessage() {
  const popup = document.getElementById('message-popup');
  if (popup) {
    popup.classList.add('hidden');
  }
}

// Initialize application
function initApp() {
  console.log('Initializing AgriNova application...');
  
  // Splash screen
  const startBtn = document.getElementById('start-btn');
  if (startBtn) {
    startBtn.addEventListener('click', (e) => {
      e.preventDefault();
      console.log('Start button clicked');
      showScreen('soil-screen');
    });
  }
  const gameScreen = document.getElementById('game-screen');
  if (gameScreen) {
    gameScreen.addEventListener('show', loadSaves); // Custom event or call from showScreen
  }
  // Load saves after DOM ready (for demo)
  loadSaves();

  // Save button handler
  const saveBtn = document.getElementById('save-btn');
  if (saveBtn) {
    saveBtn.addEventListener('click', saveCurrentFarm);
  }

  // Soil selection
  document.querySelectorAll('.soil-card').forEach(card => {
    card.addEventListener('click', (e) => {
      e.preventDefault();
      const soilType = card.dataset.soil;
      console.log(`Selected soil: ${soilType}`);
      gameState.selectedSoil = soilType;
      showScreen('game-screen');
    });
  });
  
  const soilBackBtn = document.getElementById('soil-back-btn');
  if (soilBackBtn) {
    soilBackBtn.addEventListener('click', (e) => {
      e.preventDefault();
      showScreen('splash');
    });
  }
  
  // Tools
  document.querySelectorAll('.tool').forEach(tool => {
    tool.addEventListener('click', (e) => {
      e.preventDefault();
      document.querySelectorAll('.tool').forEach(t => t.classList.remove('selected'));
      tool.classList.add('selected');
      gameState.selectedTool = tool.dataset.tool;
      updateCurrentTool();
      console.log(`Selected tool: ${gameState.selectedTool}`);
    });
  });
  
  // Crop selection
  const cropSelect = document.getElementById('crop-select');
  if (cropSelect) {
    cropSelect.addEventListener('change', (e) => {
      gameState.selectedCrop = e.target.value;
      console.log(`Selected crop: ${gameState.selectedCrop}`);
    });
  }
  
  // Message popup
  const messageBtn = document.getElementById('message-btn');
  if (messageBtn) {
    messageBtn.addEventListener('click', hideMessage);
  }
  
  console.log('Application initialized successfully!');
}

// Start application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  initApp();
  // Attach Save button handler again in case panel is rendered after
  const saveBtn = document.getElementById('save-btn');
  if (saveBtn) {
    saveBtn.addEventListener('click', saveCurrentFarm);
  }
});