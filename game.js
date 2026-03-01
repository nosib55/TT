/* ============================================================
   SPACE SHOOTER — game.js  (Infinite Edition)
   ------------------------------------------------------------
   New in this version:
   - Enemies continuously drop 💣 bombs downward
   - Bomb hits player → GAME OVER
   - All enemies killed → they respawn after a short pause (INFINITE)
   - Player AUTO-FIRES continuously (no button needed to keep shooting)
   - Score climbs forever — high score challenge!
============================================================ */


/* ============================================================
   1. CONFIGURATION
============================================================ */

// --- Player ---
const PLAYER_SPEED_PCT = 1.0;   // % of container width per frame
const PLAYER_SIZE_PCT = 12;    // % — must match CSS width

// --- Player bullets ---
const BULLET_SPEED_PCT = 1.6;   // % upward per frame
const BULLET_SIZE_PCT = 5;     // approx bullet hitbox %
const BULLET_EMOJI = "💩";
const AUTO_FIRE_INTERVAL = 320;   // ms between auto-shots (lower = faster)

// --- Enemies ---
const ENEMY_COUNT = 3;
const ENEMY_SIZE_PCT = 11;    // % — must match CSS width
const ENEMY_IMAGES = ["enemy1.png", "enemy2.png", "enemy3.png"];
const ENEMY_RESPAWN_DELAY = 1200;  // ms to wait before new wave spawns
const ENEMY_PATROL_SPEED = 0.35;  // % of container width per frame (left/right patrol)

// --- Enemy bombs ---
const BOMB_SPEED_PCT = 0.30;  // % downward per frame (lower = slower bombs)
const BOMB_SIZE_PCT = 4.5;   // approx bomb hitbox %
const BOMB_EMOJI = "💣";
const BOMB_INTERVAL_MIN = 900;   // ms min gap between each enemy's drops
const BOMB_INTERVAL_MAX = 2400;  // ms max gap

// --- Power-up (🥿) ---
const POWERUP_EMOJI = "🥿";   // the item that falls
const POWERUP_BULLET_EMOJI = "🥿";   // bullet shape while powered up
const POWERUP_SPEED_PCT = 0.30;   // fall speed (% height per frame)
const POWERUP_SIZE_PCT = 6;      // hitbox size %
const POWERUP_DURATION = 8000;   // ms the power-up lasts after pickup
const POWERUP_SPAWN_INTERVAL_MIN = 8000;  // ms between spawns (min)
const POWERUP_SPAWN_INTERVAL_MAX = 16000; // ms between spawns (max)

// --- Stars ---
const STAR_COUNT = 80;


/* ============================================================
   2. STATE VARIABLES
============================================================ */

let gameContainer;
let playerEl;
let scoreEl;
let messageEl;
let messageTextEl;

let containerW;           // live px width  of game container
let containerH;           // live px height of game container

let playerLeftPct;        // player x position as % of container width

var keys = {};            // shared with HTML touch buttons (var = global)

let bullets = [];    // { el, leftPct, topPct }
let enemies = [];    // { el, leftPct, topPct, alive, nextDropTime, dir }
let bombs = [];    // { el, leftPct, topPct }
let powerups = [];    // { el, leftPct, topPct }  — falling 🥿 items

let score = 0;
let wave = 1;
let gameRunning = false;
let respawning = false;

// Power-up state
let powerupActive = false;  // true while 🥿 bullet mode is on
let powerupEndTime = 0;      // timestamp when power-up expires
let nextPowerupSpawn = 0;      // timestamp when next 🥿 falls
let powerupBarEl = null;   // the HUD timer bar element

let lastAutoFireTime = 0;
let animFrameId;


/* ============================================================
   3. SETUP HELPERS
============================================================ */

function updateContainerSize() {
  const rect = gameContainer.getBoundingClientRect();
  containerW = rect.width;
  containerH = rect.height;
}

function createStars() {
  const starsEl = document.getElementById("stars");
  starsEl.innerHTML = "";
  for (let i = 0; i < STAR_COUNT; i++) {
    const s = document.createElement("span");
    s.classList.add("star");
    s.style.left = Math.random() * 100 + "%";
    s.style.top = Math.random() * 100 + "%";
    const size = Math.random() * 2 + 1;
    s.style.width = size + "px";
    s.style.height = size + "px";
    s.style.animationDelay = Math.random() * 2 + "s";
    s.style.animationDuration = (1.5 + Math.random() * 2) + "s";
    starsEl.appendChild(s);
  }
}

function setupPlayer() {
  playerLeftPct = 50 - PLAYER_SIZE_PCT / 2;
  playerEl.style.left = playerLeftPct + "%";
}

/**
 * setupEnemies()
 * Creates 3 enemy imgs near the top with a random initial bomb-drop timer.
 * Also increases bomb speed slightly with each new wave to add difficulty.
 */
function setupEnemies() {
  document.querySelectorAll(".enemy").forEach(el => el.remove());
  enemies = [];

  const slotPct = 100 / ENEMY_COUNT;
  const now = performance.now();

  for (let i = 0; i < ENEMY_COUNT; i++) {
    const el = document.createElement("img");
    el.src = ENEMY_IMAGES[i];
    el.alt = "Enemy " + (i + 1);
    el.classList.add("enemy");

    const leftPct = slotPct * i + (slotPct - ENEMY_SIZE_PCT) / 2;
    const topPct = 5 + Math.random() * 10;   // 5–15% from top

    el.style.left = leftPct + "%";
    el.style.top = topPct + "%";

    gameContainer.appendChild(el);

    // Spread out first drops so all three don't bomb simultaneously
    const firstDrop = now + 800 + i * 400 + Math.random() * 600;

    // dir: 1 = moving right, -1 = moving left (alternated so they don't all go the same way)
    const dir = i % 2 === 0 ? 1 : -1;

    enemies.push({
      el,
      leftPct,
      topPct,
      alive: true,
      nextDropTime: firstDrop,
      dir
    });
  }
}


/* ============================================================
   4. INPUT HANDLING (keyboard)
   Touch is handled by inline handlers in index.html
============================================================ */

document.addEventListener("keydown", function (e) {
  keys[e.code] = true;
  if (["Space", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]
    .includes(e.code)) {
    e.preventDefault();
  }
});

document.addEventListener("keyup", function (e) {
  keys[e.code] = false;
});


/* ============================================================
   5. GAME LOOP
============================================================ */

function gameLoop(timestamp) {
  if (!gameRunning) return;

  updateContainerSize();

  movePlayer();
  moveEnemies();
  autoFire(timestamp);
  moveBullets();
  dropBombs(timestamp);
  moveBombs();
  spawnPowerup(timestamp);   // maybe drop a 🥿
  movePowerups();
  updatePowerupTimer(timestamp); // tick down the HUD bar
  checkCollisions();
  checkWaveComplete();

  animFrameId = requestAnimationFrame(gameLoop);
}

/* ---- 5a. Move enemies (patrol left & right) ---- */

/**
 * moveEnemies()
 * Each enemy slides left or right each frame and flips direction
 * when it reaches the edge of the game area.
 */
function moveEnemies() {
  for (const enemy of enemies) {
    if (!enemy.alive) continue;

    enemy.leftPct += ENEMY_PATROL_SPEED * enemy.dir;

    // Bounce off left wall
    if (enemy.leftPct <= 0) {
      enemy.leftPct = 0;
      enemy.dir = 1;   // flip to right
    }
    // Bounce off right wall  (enemy takes up ENEMY_SIZE_PCT width)
    if (enemy.leftPct >= 100 - ENEMY_SIZE_PCT) {
      enemy.leftPct = 100 - ENEMY_SIZE_PCT;
      enemy.dir = -1;  // flip to left
    }

    enemy.el.style.left = enemy.leftPct + "%";
  }
}

/* ---- 5b. Move player ---- */

function movePlayer() {
  const maxLeftPct = 100 - PLAYER_SIZE_PCT;
  if (keys["ArrowLeft"]) playerLeftPct -= PLAYER_SPEED_PCT;
  if (keys["ArrowRight"]) playerLeftPct += PLAYER_SPEED_PCT;
  playerLeftPct = Math.max(0, Math.min(maxLeftPct, playerLeftPct));
  playerEl.style.left = playerLeftPct + "%";
}

/* ---- 5b. Auto-fire player bullets ---- */

/**
 * autoFire(timestamp)
 * Player automatically fires every AUTO_FIRE_INTERVAL ms.
 * Holding the fire button / Space also fires (handled same way).
 * Result: continuous rapid fire by default, no button needed.
 */
function autoFire(timestamp) {
  if (timestamp - lastAutoFireTime >= AUTO_FIRE_INTERVAL) {
    fireBullet();
    lastAutoFireTime = timestamp;
  }
}

function fireBullet() {
  const bulletLeftPct = playerLeftPct + PLAYER_SIZE_PCT / 2 - BULLET_SIZE_PCT / 2;
  const bulletTopPct = 100 - 2.5 - PLAYER_SIZE_PCT - BULLET_SIZE_PCT - 1;

  const el = document.createElement("span");
  el.classList.add("bullet");
  // 🥿 power-up active → use special emoji, otherwise use normal bullet
  el.textContent = powerupActive ? POWERUP_BULLET_EMOJI : BULLET_EMOJI;
  if (powerupActive) el.classList.add("bullet-powered");
  el.style.left = bulletLeftPct + "%";
  el.style.top = bulletTopPct + "%";
  gameContainer.appendChild(el);

  bullets.push({ el, leftPct: bulletLeftPct, topPct: bulletTopPct });
}

/* ---- 5c. Move bullets upward ---- */

function moveBullets() {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.topPct -= BULLET_SPEED_PCT;
    b.el.style.top = b.topPct + "%";
    if (b.topPct < -10) {
      b.el.remove();
      bullets.splice(i, 1);
    }
  }
}

/* ---- 5d. Enemy bomb dropping ---- */

/**
 * dropBombs(timestamp)
 * Each alive enemy checks its own timer and drops a bomb when due.
 * After dropping, a new random timer is set for that enemy.
 */
function dropBombs(timestamp) {
  for (const enemy of enemies) {
    if (!enemy.alive) continue;
    if (timestamp >= enemy.nextDropTime) {
      createBomb(enemy);
      // Randomise next drop (gets slightly faster each wave)
      const speedFactor = Math.max(0.5, 1 - (wave - 1) * 0.06);
      const gap = (BOMB_INTERVAL_MIN + Math.random() *
        (BOMB_INTERVAL_MAX - BOMB_INTERVAL_MIN)) * speedFactor;
      enemy.nextDropTime = timestamp + gap;
    }
  }
}

function createBomb(enemy) {
  // Drop from centre-bottom of the enemy image
  const bombLeftPct = enemy.leftPct + ENEMY_SIZE_PCT / 2 - BOMB_SIZE_PCT / 2;
  const bombTopPct = enemy.topPct + ENEMY_SIZE_PCT + 0.5;

  const el = document.createElement("span");
  el.classList.add("bomb");
  el.textContent = BOMB_EMOJI;
  el.style.left = bombLeftPct + "%";
  el.style.top = bombTopPct + "%";
  gameContainer.appendChild(el);

  bombs.push({ el, leftPct: bombLeftPct, topPct: bombTopPct });
}

/* ---- 5e. Move bombs downward ---- */

function moveBombs() {
  // Wave bonus: later waves drop bombs a bit faster
  const speedBonus = 1 + (wave - 1) * 0.07;

  for (let i = bombs.length - 1; i >= 0; i--) {
    const b = bombs[i];
    b.topPct += BOMB_SPEED_PCT * speedBonus;
    b.el.style.top = b.topPct + "%";

    // Remove bombs that exit the bottom of the screen
    if (b.topPct > 106) {
      b.el.remove();
      bombs.splice(i, 1);
    }
  }
}

/* ---- 5f. Collision detection ---- */

function checkCollisions() {
  // === Bullet vs Enemy ===
  for (let ei = enemies.length - 1; ei >= 0; ei--) {
    const enemy = enemies[ei];
    if (!enemy.alive) continue;

    const ex1 = enemy.leftPct / 100 * containerW;
    const ey1 = enemy.topPct / 100 * containerH;
    const ex2 = ex1 + ENEMY_SIZE_PCT / 100 * containerW;
    const ey2 = ey1 + ENEMY_SIZE_PCT / 100 * containerH;

    for (let bi = bullets.length - 1; bi >= 0; bi--) {
      const b = bullets[bi];
      const bx1 = b.leftPct / 100 * containerW;
      const by1 = b.topPct / 100 * containerH;
      const bx2 = bx1 + BULLET_SIZE_PCT / 100 * containerW;
      const by2 = by1 + BULLET_SIZE_PCT / 100 * containerH;

      if (bx1 < ex2 && bx2 > ex1 && by1 < ey2 && by2 > ey1) {
        // Bullet hits enemy
        b.el.remove();
        bullets.splice(bi, 1);

        showExplosion(
          ex1 + (ex2 - ex1) / 2,
          ey1 + (ey2 - ey1) / 2
        );

        enemy.alive = false;
        enemy.el.remove();
        enemies.splice(ei, 1);

        score += 100;
        scoreEl.textContent = score;
        break;
      }
    }
  }

  // === Bomb vs Player ===
  // Player bounding box (player sits at bottom: 2.5% from bottom)
  const py1 = (100 - 2.5 - PLAYER_SIZE_PCT) / 100 * containerH;
  const px1 = playerLeftPct / 100 * containerW;
  const px2 = px1 + PLAYER_SIZE_PCT / 100 * containerW;
  const py2 = py1 + PLAYER_SIZE_PCT / 100 * containerH;

  for (let i = bombs.length - 1; i >= 0; i--) {
    const bomb = bombs[i];
    const bx1 = bomb.leftPct / 100 * containerW;
    const by1 = bomb.topPct / 100 * containerH;
    const bx2 = bx1 + BOMB_SIZE_PCT / 100 * containerW;
    const by2 = by1 + BOMB_SIZE_PCT / 100 * containerH;

    if (bx1 < px2 && bx2 > px1 && by1 < py2 && by2 > py1) {
      // Bomb hits player!
      bomb.el.remove();
      bombs.splice(i, 1);

      // Big explosion on the player
      showExplosion(
        px1 + (px2 - px1) / 2,
        py1 + (py2 - py1) / 2,
        true  // big = true
      );

      endGame(false); // Player loses
      return;
    }
  }

  // === Power-up vs Player ===
  const pu_px1 = playerLeftPct / 100 * containerW;
  const pu_py1 = (100 - 2.5 - PLAYER_SIZE_PCT) / 100 * containerH;
  const pu_px2 = pu_px1 + PLAYER_SIZE_PCT / 100 * containerW;
  const pu_py2 = pu_py1 + PLAYER_SIZE_PCT / 100 * containerH;

  for (let i = powerups.length - 1; i >= 0; i--) {
    const pu = powerups[i];
    const pux1 = pu.leftPct / 100 * containerW;
    const puy1 = pu.topPct / 100 * containerH;
    const pux2 = pux1 + POWERUP_SIZE_PCT / 100 * containerW;
    const puy2 = puy1 + POWERUP_SIZE_PCT / 100 * containerH;

    if (pux1 < pu_px2 && pux2 > pu_px1 && puy1 < pu_py2 && puy2 > pu_py1) {
      // Player collected the power-up!
      pu.el.remove();
      powerups.splice(i, 1);
      activatePowerup(performance.now());
    }
  }
}

/* ---- 5g. Wave complete check ---- */

/**
 * checkWaveComplete()
 * If all enemies are gone and we're not already respawning,
 * award a wave bonus and schedule new enemies (INFINITE gameplay).
 */
function checkWaveComplete() {
  if (enemies.length === 0 && !respawning) {
    respawning = true;

    // Wave clear bonus
    const bonus = wave * 200;
    score += bonus;
    scoreEl.textContent = score;

    // Show a brief "WAVE CLEAR!" flash
    showWaveBanner(wave, bonus);

    wave++;

    // Spawn next wave after a short delay
    setTimeout(() => {
      if (gameRunning) {
        setupEnemies();
        respawning = false;
      }
    }, ENEMY_RESPAWN_DELAY);
  }
}


/* ============================================================
   6. POWER-UP HELPERS
============================================================ */

/**
 * spawnPowerup(timestamp)
 * Drops a 🥿 at a random X position at the top on a timed interval.
 */
function spawnPowerup(timestamp) {
  if (nextPowerupSpawn === 0) {
    // Set first spawn time once the game has been running a few seconds
    nextPowerupSpawn = timestamp + POWERUP_SPAWN_INTERVAL_MIN;
    return;
  }
  if (timestamp < nextPowerupSpawn) return;

  // Pick a random X so the shoe isn't always in the corner
  const leftPct = 5 + Math.random() * (100 - POWERUP_SIZE_PCT - 10);

  const el = document.createElement("span");
  el.classList.add("powerup-item");
  el.textContent = POWERUP_EMOJI;
  el.style.left = leftPct + "%";
  el.style.top = "-8%";
  gameContainer.appendChild(el);

  powerups.push({ el, leftPct, topPct: -8 });

  // Schedule next spawn
  nextPowerupSpawn = timestamp + POWERUP_SPAWN_INTERVAL_MIN
    + Math.random() * (POWERUP_SPAWN_INTERVAL_MAX - POWERUP_SPAWN_INTERVAL_MIN);
}

/** Move all falling power-ups downward, remove if off screen. */
function movePowerups() {
  for (let i = powerups.length - 1; i >= 0; i--) {
    const pu = powerups[i];
    pu.topPct += POWERUP_SPEED_PCT;
    pu.el.style.top = pu.topPct + "%";
    if (pu.topPct > 108) {
      pu.el.remove();
      powerups.splice(i, 1);
    }
  }
}

/**
 * activatePowerup(now)
 * Starts the 🥿 bullet mode and shows the HUD countdown bar.
 */
function activatePowerup(now) {
  powerupActive = true;
  powerupEndTime = now + POWERUP_DURATION;

  // Show / reset the HUD bar
  if (!powerupBarEl) {
    powerupBarEl = document.createElement("div");
    powerupBarEl.id = "powerup-bar-wrap";
    powerupBarEl.innerHTML =
      `<div id="powerup-label">🥿 Power-Up!</div>
       <div id="powerup-bar-bg"><div id="powerup-bar-fill"></div></div>`;
    gameContainer.appendChild(powerupBarEl);
  }
  powerupBarEl.classList.remove("hidden");
  document.getElementById("powerup-bar-fill").style.width = "100%";
}

/**
 * updatePowerupTimer(timestamp)
 * Shrinks the HUD bar and deactivates when time is up.
 */
function updatePowerupTimer(timestamp) {
  if (!powerupActive) return;

  const remaining = powerupEndTime - timestamp;
  if (remaining <= 0) {
    // Power-up expired
    powerupActive = false;
    if (powerupBarEl) {
      powerupBarEl.classList.add("hidden");
    }
    return;
  }

  // Update the progress bar width (100% → 0%)
  const pct = (remaining / POWERUP_DURATION) * 100;
  const fill = document.getElementById("powerup-bar-fill");
  if (fill) fill.style.width = pct + "%";
}


/* ============================================================
   7. UTILITY FUNCTIONS
============================================================ */

/**
 * showExplosion(cx, cy, big)
 * Displays a 💥 at pixel position (cx,cy).
 * big=true makes it larger (used for player death).
 */
function showExplosion(cx, cy, big = false) {
  const el = document.createElement("span");
  el.classList.add("explosion");
  if (big) el.classList.add("explosion-big");
  el.textContent = "💥";
  el.style.left = (cx / containerW * 100 - 4) + "%";
  el.style.top = (cy / containerH * 100 - 4) + "%";
  gameContainer.appendChild(el);
  setTimeout(() => el.remove(), big ? 800 : 500);
}

/**
 * showWaveBanner(waveNum, bonus)
 * Shows a brief floating text label when a wave is cleared.
 */
function showWaveBanner(waveNum, bonus) {
  const el = document.createElement("div");
  el.classList.add("wave-banner");
  el.textContent = `Wave ${waveNum} Clear! +${bonus}pts`;
  gameContainer.appendChild(el);
  setTimeout(() => el.remove(), 1100);
}

/**
 * endGame(won)
 * Stops the loop and shows the result overlay.
 */
function endGame(won) {
  gameRunning = false;
  cancelAnimationFrame(animFrameId);

  // Clear all remaining bombs/bullets from screen
  document.querySelectorAll(".bomb").forEach(el => el.remove());
  document.querySelectorAll(".bullet").forEach(el => el.remove());

  messageTextEl.textContent = won
    ? "🎉 You Win!\nScore: " + score
    : "💀 Game Over!\nScore: " + score + "\nWave " + wave;

  messageEl.classList.remove("hidden");
}


/* ============================================================
   7. START / RESTART
============================================================ */

function initGame() {
  gameContainer = document.getElementById("game-container");
  playerEl = document.getElementById("player");
  scoreEl = document.getElementById("score");
  messageEl = document.getElementById("message");
  messageTextEl = document.getElementById("message-text");

  window.addEventListener("resize", updateContainerSize);
  startGame();
}

function startGame() {
  score = 0;
  wave = 1;
  respawning = false;
  powerupActive = false;
  powerupEndTime = 0;
  nextPowerupSpawn = 0;

  scoreEl.textContent = score;
  keys = {};
  bullets = [];
  enemies = [];
  bombs = [];
  powerups = [];

  document.querySelectorAll(".bullet, .bomb, .wave-banner, .powerup-item").forEach(el => el.remove());

  // Hide power-up bar if it exists
  if (powerupBarEl) powerupBarEl.classList.add("hidden");

  messageEl.classList.add("hidden");

  updateContainerSize();
  createStars();
  setupPlayer();
  setupEnemies();

  gameRunning = true;
  lastAutoFireTime = 0;
  animFrameId = requestAnimationFrame(gameLoop);
}

function restartGame() {
  gameRunning = false;
  cancelAnimationFrame(animFrameId);
  startGame();
}

document.addEventListener("DOMContentLoaded", initGame);
