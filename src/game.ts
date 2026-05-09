import * as THREE from "three";

const canvas = document.getElementById("game") as HTMLCanvasElement;
const minimap = document.getElementById("minimap") as HTMLCanvasElement;
const mapCtx = minimap.getContext("2d");

const healthFill = document.getElementById("healthFill");
const levelCount = document.getElementById("levelCount");
const xpCount = document.getElementById("xpCount");
const nextXpCount = document.getElementById("nextXpCount");
const flockCount = document.getElementById("flockCount");
const gemCount = document.getElementById("gemCount");
const foodCount = document.getElementById("foodCount");
const eatButton = document.getElementById("eatButton") as HTMLButtonElement;
const nestButton = document.getElementById("nestButton") as HTMLButtonElement;
const nestPanel = document.getElementById("nestPanel");
const nestStatus = document.getElementById("nestStatus");
const nestRoster = document.getElementById("nestRoster");
const overlay = document.getElementById("overlay");
const overlayText = document.getElementById("overlayText");
const startButton = document.getElementById("startButton");
const flameButton = document.getElementById("flameButton");
const battlePanel = document.getElementById("battlePanel");
const battleName = document.getElementById("battleName");
const battleHealth = document.getElementById("battleHealth");
const battleEnemyFill = document.getElementById("battleEnemyFill");
const battleLog = document.getElementById("battleLog");

const WORLD = { width: 8400, height: 6400 };
const FLIGHT = { min: 32, max: 430 };
const FOOD_CARRY_MAX = 5;
const lakes = [];
const WATER_CLEARANCE = 90;
const keys = new Set();
const touchDirs = new Set();
let rand = mulberry32(createWorldSeed());
let rosterSignature = "";

let renderer;
let scene;
let camera;
let worldGroup;
let entityGroup;
let particleGroup;

const state = {
  ready: false,
  running: false,
  lastTime: 0,
  gems: 0,
  food: 0,
  storedFood: 0,
  level: 1,
  xp: 0,
  shake: 0,
  message: "Find the scattered dragons.",
  messageTime: 4,
  fireCooldown: 0,
  battle: null,
  nestHealCooldown: 0,
};

const player = {
  x: WORLD.width * 0.5,
  y: WORLD.height * 0.5,
  vx: 0,
  vy: 0,
  vz: 0,
  altitude: FLIGHT.min,
  radius: 32,
  angle: 0,
  health: 100,
  maxHealth: 100,
  invulnerable: 0,
  mesh: null,
  bob: 0,
};

const dragons = [];
const allies = [];
const baseDragons = [];
const enemies = [];
const flames = [];
const particles = [];
const foods = [];
const decorations = [];
const obstacles = [];
let nest = null;

const dragonPalette = [
  ["#42c7a7", "#1f7568", "#d7fff3"],
  ["#e75c72", "#8e2e49", "#ffd2dd"],
  ["#f0b44b", "#996222", "#fff0b8"],
  ["#73a7ff", "#31539a", "#d9e8ff"],
  ["#ba76ee", "#65369d", "#f0dcff"],
];

const enemyKinds = [
  { name: "griffin", color: "#a36a3a", accent: "#e5c17b", radius: 30, speed: 170, health: 10, power: 8 },
  { name: "manticore", color: "#8f3744", accent: "#f09a74", radius: 35, speed: 132, health: 14, power: 11 },
  { name: "wyvern", color: "#496070", accent: "#a7d6d4", radius: 32, speed: 150, health: 12, power: 9 },
  { name: "phoenix", color: "#e24a2c", accent: "#ffd166", radius: 38, speed: 185, health: 22, power: 16, shape: "phoenix" },
];

bootstrap();

function bootstrap() {
  try {
    setupScene();
    initWorld();
    resize();
    render();
    state.ready = true;
  } catch (error) {
    overlayText.textContent = "Dragon World could not start. Check the console and refresh.";
    startButton.textContent = "Retry";
    console.error(error);
  }
}

function setupScene() {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x99c7dc, 1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9ccfe5);
  scene.fog = new THREE.Fog(0x9ccfe5, 1200, 3600);

  camera = new THREE.PerspectiveCamera(54, 16 / 9, 1, 6200);
  worldGroup = new THREE.Group();
  entityGroup = new THREE.Group();
  particleGroup = new THREE.Group();
  scene.add(worldGroup, entityGroup, particleGroup);

  const sun = new THREE.DirectionalLight(0xfff1c2, 2.6);
  sun.position.set(-700, 1100, 420);
  sun.castShadow = true;
  sun.shadow.camera.left = -1200;
  sun.shadow.camera.right = 1200;
  sun.shadow.camera.top = 1200;
  sun.shadow.camera.bottom = -1200;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xccecff, 0x2c4c31, 1.7));
}

function initWorld(progress = null) {
  rand = mulberry32(createWorldSeed());
  clearGroup(worldGroup);
  clearGroup(entityGroup);
  clearGroup(particleGroup);
  dragons.length = 0;
  allies.length = 0;
  baseDragons.length = 0;
  enemies.length = 0;
  flames.length = 0;
  particles.length = 0;
  foods.length = 0;
  decorations.length = 0;
  obstacles.length = 0;
  lakes.length = 0;
  nest = null;
  rosterSignature = "";
  state.food = progress?.food ?? 0;
  state.storedFood = progress?.storedFood ?? 0;
  state.gems = progress?.gems ?? 0;
  state.level = progress?.level ?? 1;
  state.xp = progress?.xp ?? 0;
  state.fireCooldown = 0;
  state.nestHealCooldown = 0;
  state.shake = 0;
  state.battle = null;
  state.message = "Find the scattered dragons.";
  state.messageTime = 4;
  battlePanel.classList.add("hidden");
  nestPanel.classList.add("hidden");

  player.x = WORLD.width * 0.5;
  player.y = WORLD.height * 0.5;
  player.vx = 0;
  player.vy = 0;
  player.vz = 0;
  player.altitude = progress?.altitude ?? FLIGHT.min;
  player.maxHealth = getMaxHealth();
  player.health = progress?.health ?? player.maxHealth;
  player.invulnerable = 1.5;
  player.bob = 0;

  randomizeLakes();
  makeTerrain();
  if (progress?.nest) {
    const nestPosition =
      isWaterArea(progress.nest.x, progress.nest.y, 180) || isObstacleArea(progress.nest.x, progress.nest.y, 180)
        ? findDryPosition(150, 180)
        : progress.nest;
    createNest(nestPosition.x, nestPosition.y, false);
  }
  player.mesh = makeDragonMesh(dragonPalette[0], 1.18);
  entityGroup.add(player.mesh);

  for (let i = 0; i < 760; i += 1) {
    const type = rand() > 0.82 ? "crystal" : rand() > 0.4 ? "tree" : "stone";
    const radius = type === "tree" ? 34 + rand() * 58 : 12 + rand() * 42;
    const position = findDryPosition(radius);
    const item = {
      x: position.x,
      y: position.y,
      r: radius,
      type,
      hue: rand(),
      mesh: null,
    };
    item.mesh = makeDecoration(item);
    decorations.push(item);
    if (item.type !== "crystal") addDecorationObstacle(item);
    worldGroup.add(item.mesh);
  }

  for (let i = 0; i < 20; i += 1) {
    const position = findDryPosition(90, 260);
    const dragon = {
      x: position.x,
      y: position.y,
      radius: 30,
      altitude: FLIGHT.min + 12 + rand() * 38,
      vz: 0,
      angle: rand() * Math.PI * 2,
      colors: dragonPalette[i % dragonPalette.length],
      joined: false,
      bob: rand() * 10,
      mesh: null,
    };
    dragon.mesh = makeDragonMesh(dragon.colors, 0.95);
    dragons.push(dragon);
    entityGroup.add(dragon.mesh);
  }

  for (let i = 0; i < 44; i += 1) {
    const kind = enemyKinds[i % enemyKinds.length];
    const position = findDryPosition(kind.radius * 2.4, 220);
    const level = getRandomEnemyLevel();
    const maxHealth = getEnemyMaxHealth(kind, level);
    const power = getEnemyPower(kind, level);
    const enemy = {
      ...kind,
      x: position.x,
      y: position.y,
      level,
      health: maxHealth,
      power,
      angle: rand() * Math.PI * 2,
      maxHealth,
      xp: getEnemyExperienceForLevel(kind, level),
      hurt: 0,
      battleCooldown: 0,
      wander: rand() * Math.PI * 2,
      wake: 500 + rand() * 330,
      mesh: null,
    };
    enemy.mesh = makeEnemyMesh(enemy);
    enemies.push(enemy);
    entityGroup.add(enemy.mesh);
  }

  updateMeshes(0);
  updateHud();
}

function makeTerrain() {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD.width, WORLD.height, 42, 32),
    new THREE.MeshStandardMaterial({ color: 0x2f7a45, roughness: 0.92 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(WORLD.width / 2, 0, WORLD.height / 2);
  ground.receiveShadow = true;
  worldGroup.add(ground);

  const waterMaterial = new THREE.MeshStandardMaterial({ color: 0x2f8fb2, roughness: 0.5, metalness: 0.08 });
  worldGroup.add(makeLakes(waterMaterial));

  const rimMaterial = new THREE.MeshStandardMaterial({ color: 0x31523a, roughness: 0.9 });
  for (let i = 0; i < 88; i += 1) {
    const radius = 60 + rand() * 110;
    const position = findDryPosition(radius);
    const hill = new THREE.Mesh(new THREE.DodecahedronGeometry(radius, 0), rimMaterial);
    hill.scale.y = 0.35 + rand() * 0.5;
    hill.position.set(position.x, hill.geometry.parameters.radius * hill.scale.y * 0.5, position.y);
    hill.castShadow = true;
    hill.receiveShadow = true;
    addObstacle(hill.position.x, hill.position.z, radius * 0.72, radius * hill.scale.y);
    worldGroup.add(hill);
  }

  for (let i = 0; i < 9; i += 1) {
    const position = findDryPosition(360, 520);
    const rangeX = position.x;
    const rangeZ = position.y;
    const range = makeMountainRange(rangeX, rangeZ, 4 + Math.floor(rand() * 4));
    worldGroup.add(range);
  }
}

function randomizeLakes() {
  const targetCount = 4 + Math.floor(rand() * 3);
  for (let attempt = 0; lakes.length < targetCount && attempt < 90; attempt += 1) {
    const rx = 420 + rand() * 520;
    const rz = 300 + rand() * 360;
    const x = rx + 360 + rand() * (WORLD.width - (rx + 360) * 2);
    const z = rz + 320 + rand() * (WORLD.height - (rz + 320) * 2);
    const overlaps = lakes.some((lake) => {
      const dx = (x - lake.x) / (rx + lake.rx + 360);
      const dz = (z - lake.z) / (rz + lake.rz + 360);
      return dx * dx + dz * dz < 1;
    });
    if (!overlaps) lakes.push({ x, z, rx, rz, rotation: rand() * Math.PI * 2 });
  }
}

function makeLakes(waterMaterial) {
  const group = new THREE.Group();
  const sandMaterial = new THREE.MeshStandardMaterial({ color: 0xd8bf79, roughness: 0.96 });
  const shoreMaterial = new THREE.MeshStandardMaterial({ color: 0x8ca36e, roughness: 0.9 });
  lakes.forEach((lakeData) => {
    const sand = new THREE.Mesh(new THREE.CircleGeometry(1, 72), sandMaterial);
    sand.rotation.x = -Math.PI / 2;
    sand.rotation.z = lakeData.rotation;
    sand.scale.set(lakeData.rx + 72, lakeData.rz + 58, 1);
    sand.position.set(lakeData.x, 0.65, lakeData.z);
    sand.receiveShadow = true;
    group.add(sand);

    const lake = new THREE.Mesh(new THREE.CircleGeometry(1, 72), waterMaterial);
    lake.rotation.x = -Math.PI / 2;
    lake.rotation.z = lakeData.rotation;
    lake.scale.set(lakeData.rx, lakeData.rz, 1);
    lake.position.set(lakeData.x, 1.2, lakeData.z);
    group.add(lake);

    let placedShoreRocks = 0;
    for (let attempt = 0; placedShoreRocks < 12 && attempt < 42; attempt += 1) {
      const angle = (attempt / 12) * Math.PI * 2 + rand() * 0.22;
      const x = lakeData.x + Math.cos(angle) * (lakeData.rx + 80 + rand() * 90);
      const z = lakeData.z + Math.sin(angle) * (lakeData.rz + 70 + rand() * 80);
      if (isWaterArea(x, z, 45)) continue;
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(18 + rand() * 22, 0), shoreMaterial);
      rock.scale.y = 0.26 + rand() * 0.2;
      rock.position.set(x, 5, z);
      rock.rotation.y = rand() * Math.PI * 2;
      rock.castShadow = true;
      rock.receiveShadow = true;
      group.add(rock);
      placedShoreRocks += 1;
    }
  });

  return group;
}

function makeMountainRange(x, z, count) {
  const group = new THREE.Group();
  const rockMaterial = new THREE.MeshStandardMaterial({ color: 0x6f7378, roughness: 0.86 });
  const darkRockMaterial = new THREE.MeshStandardMaterial({ color: 0x4e555c, roughness: 0.92 });
  const snowMaterial = new THREE.MeshStandardMaterial({ color: 0xe8f5f7, roughness: 0.62 });

  for (let i = 0; i < count; i += 1) {
    const angle = rand() * Math.PI * 2;
    const offset = rand() * 260;
    const px = x + Math.cos(angle) * offset;
    const pz = z + Math.sin(angle) * offset;
    const radius = 120 + rand() * 150;
    if (isWaterArea(px, pz, radius + WATER_CLEARANCE)) continue;
    const height = 260 + rand() * 320;
    const peak = new THREE.Mesh(new THREE.ConeGeometry(radius, height, 7), i % 2 === 0 ? rockMaterial : darkRockMaterial);
    peak.position.set(px, height * 0.5, pz);
    peak.rotation.y = rand() * Math.PI * 2;
    peak.castShadow = true;
    peak.receiveShadow = true;
    group.add(peak);

    const snow = new THREE.Mesh(new THREE.ConeGeometry(radius * 0.36, height * 0.24, 7), snowMaterial);
    snow.position.set(px, height * 0.88, pz);
    snow.rotation.y = peak.rotation.y;
    snow.castShadow = true;
    group.add(snow);

    addObstacle(px, pz, radius * 0.72, height);
  }

  return group;
}

function findDryPosition(radius, margin = 0) {
  const min = margin + radius;
  const maxX = WORLD.width - margin - radius;
  const maxY = WORLD.height - margin - radius;
  const padding = radius + WATER_CLEARANCE;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const x = min + rand() * Math.max(1, maxX - min);
    const y = min + rand() * Math.max(1, maxY - min);
    if (!isWaterArea(x, y, padding)) return { x, y };
  }

  const columns = 14;
  const rows = 12;
  const offsetX = rand();
  const offsetY = rand();
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x = min + (((column + offsetX) % columns) / Math.max(1, columns - 1)) * Math.max(1, maxX - min);
      const y = min + (((row + offsetY) % rows) / Math.max(1, rows - 1)) * Math.max(1, maxY - min);
      if (!isWaterArea(x, y, padding)) return { x, y };
    }
  }

  return { x: min, y: min };
}

function createWorldSeed() {
  if (window.crypto?.getRandomValues) {
    const values = new Uint32Array(1);
    window.crypto.getRandomValues(values);
    return values[0];
  }
  return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
}

function isWaterArea(x, y, padding = 0) {
  return lakes.some((lake) => isPointInEllipse(x, y, lake.x, lake.z, lake.rx, lake.rz, padding));
}

function isObstacleArea(x, y, radius) {
  return obstacles.some((obstacle) => {
    const dx = x - obstacle.x;
    const dy = y - obstacle.y;
    const minDistance = radius + obstacle.radius;
    return dx * dx + dy * dy < minDistance * minDistance;
  });
}

function isPointInRotatedRect(x, y, cx, cy, width, height, rotation, padding) {
  const dx = x - cx;
  const dy = y - cy;
  const cos = Math.cos(-rotation);
  const sin = Math.sin(-rotation);
  const localX = dx * cos - dy * sin;
  const localY = dx * sin + dy * cos;
  return Math.abs(localX) <= width * 0.5 + padding && Math.abs(localY) <= height * 0.5 + padding;
}

function isPointInEllipse(x, y, cx, cy, rx, ry, padding) {
  const nx = (x - cx) / (rx + padding);
  const ny = (y - cy) / (ry + padding);
  return nx * nx + ny * ny <= 1;
}

function addDecorationObstacle(item) {
  const radiusByType = {
    tree: item.r * 0.58,
    stone: item.r * 0.46,
    crystal: item.r * 0.34,
  };
  const heightByType = {
    tree: item.r * 3.35,
    stone: item.r * 0.55,
    crystal: item.r,
  };
  addObstacle(item.x, item.y, radiusByType[item.type] || item.r * 0.4, heightByType[item.type] || item.r);
}

function addObstacle(x, y, radius, height) {
  const startBuffer = 210;
  const dx = x - WORLD.width * 0.5;
  const dy = y - WORLD.height * 0.5;
  if (Math.hypot(dx, dy) < startBuffer + radius) return;
  obstacles.push({ x, y, radius, height });
}

function resolveFeatureCollision(entity) {
  let collided = false;
  for (const obstacle of obstacles) {
    if ((entity.altitude || FLIGHT.min) > obstacle.height + entity.radius * 0.7) continue;
    const dx = entity.x - obstacle.x;
    const dy = entity.y - obstacle.y;
    const minDistance = entity.radius + obstacle.radius;
    const distSq = dx * dx + dy * dy;
    if (distSq >= minDistance * minDistance) continue;

    const dist = Math.sqrt(distSq) || 1;
    const push = minDistance - dist;
    entity.x += (dx / dist) * push;
    entity.y += (dy / dist) * push;
    collided = true;
  }
  return collided;
}

function makeDragonMesh(colors, scale) {
  const group = new THREE.Group();
  group.scale.setScalar(scale);

  const bodyColor = new THREE.Color(colors[0]);
  const shadowColor = new THREE.Color(colors[1]).lerp(new THREE.Color(0x050816), 0.36);
  const accentColor = new THREE.Color(colors[2]);
  const membraneColor = bodyColor.clone().lerp(accentColor, 0.48);
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.58, metalness: 0.04 });
  const shadowMaterial = new THREE.MeshStandardMaterial({ color: shadowColor, roughness: 0.66, metalness: 0.03 });
  const bellyMaterial = new THREE.MeshStandardMaterial({
    color: accentColor.clone().lerp(new THREE.Color(0xffffff), 0.45),
    roughness: 0.42,
  });
  const scaleMaterial = new THREE.MeshStandardMaterial({
    color: accentColor,
    emissive: accentColor.clone().lerp(new THREE.Color(0x000000), 0.55),
    emissiveIntensity: 0.8,
    roughness: 0.28,
    metalness: 0.08,
  });
  const brightScaleMaterial = new THREE.MeshStandardMaterial({
    color: accentColor.clone().lerp(new THREE.Color(0xffffff), 0.35),
    emissive: accentColor.clone().lerp(new THREE.Color(0xffffff), 0.15),
    emissiveIntensity: 1.1,
    roughness: 0.22,
  });
  const eyeMaterial = new THREE.MeshStandardMaterial({
    color: 0x030407,
    emissive: 0x000000,
    emissiveIntensity: 0,
    roughness: 0.18,
    metalness: 0.25,
  });
  const hornMaterial = new THREE.MeshStandardMaterial({
    color: accentColor.clone().lerp(new THREE.Color(0xffffff), 0.68),
    roughness: 0.3,
    metalness: 0.08,
  });
  const wingBoneMaterial = new THREE.MeshStandardMaterial({ color: shadowColor, roughness: 0.5, metalness: 0.04 });
  const wingMembraneMaterial = new THREE.MeshStandardMaterial({
    color: membraneColor,
    emissive: accentColor.clone().lerp(new THREE.Color(0x000000), 0.72),
    emissiveIntensity: 0.35,
    transparent: true,
    opacity: 0.8,
    roughness: 0.38,
    side: THREE.DoubleSide,
  });

  const body = new THREE.Mesh(new THREE.SphereGeometry(30, 18, 14), bodyMaterial);
  body.scale.set(1.25, 1.02, 0.9);
  body.position.set(-10, 8, 0);
  group.add(body);

  const chest = new THREE.Mesh(new THREE.SphereGeometry(22, 14, 12), bellyMaterial);
  chest.scale.set(0.55, 1.18, 0.72);
  chest.position.set(15, 4, 0);
  group.add(chest);

  const neck = new THREE.Mesh(new THREE.SphereGeometry(18, 14, 10), bodyMaterial);
  neck.scale.set(0.72, 1.18, 0.74);
  neck.position.set(30, 24, 0);
  neck.rotation.z = -0.25;
  group.add(neck);

  const head = new THREE.Mesh(new THREE.SphereGeometry(24, 18, 12), bodyMaterial);
  head.scale.set(1.2, 0.82, 0.9);
  head.position.set(56, 42, 0);
  group.add(head);

  const snout = new THREE.Mesh(new THREE.ConeGeometry(12, 32, 7), shadowMaterial);
  snout.rotation.z = -Math.PI / 2;
  snout.scale.z = 0.8;
  snout.position.set(82, 36, 0);
  group.add(snout);

  group.add(makeEar(48, 61, 16, 1, bodyMaterial));
  group.add(makeEar(48, 61, -16, -1, bodyMaterial));
  group.add(makeHorn(39, 66, 11, 0.3, hornMaterial));
  group.add(makeHorn(39, 66, -11, -0.3, hornMaterial));

  for (let i = 0; i < 7; i += 1) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(5.5 - i * 0.35, 23 - i, 5), shadowMaterial);
    spike.position.set(43 - i * 10, 60 - i * 6, 0);
    spike.rotation.z = 0.55 + i * 0.03;
    group.add(spike);
  }

  const legPositions = [
    [15, -20, 18, -0.1],
    [15, -20, -18, -0.1],
    [-32, -18, 17, 0.22],
    [-32, -18, -17, 0.22],
  ];
  legPositions.forEach(([x, y, z, bend]) => {
    group.add(makeLeg(x, y, z, bend, bodyMaterial, shadowMaterial));
  });

  group.add(makeDetailedDragonWing(1, wingBoneMaterial, wingMembraneMaterial, scaleMaterial));
  group.add(makeDetailedDragonWing(-1, wingBoneMaterial, wingMembraneMaterial, scaleMaterial));

  const tailCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-37, 5, 0),
    new THREE.Vector3(-76, -10, -8),
    new THREE.Vector3(-116, -32, -6),
    new THREE.Vector3(-155, -18, 0),
    new THREE.Vector3(-174, 18, 5),
  ]);
  const tail = new THREE.Mesh(new THREE.TubeGeometry(tailCurve, 28, 7.5, 8, false), bodyMaterial);
  group.add(tail);
  group.add(makeTailFin(-168, 20, 7, 1, shadowMaterial));
  group.add(makeTailFin(-168, 20, 3, -1, shadowMaterial));

  group.add(makeFurFin([[4, 35, 18], [-8, 24, 46], [-25, 18, 25]], shadowMaterial));
  group.add(makeFurFin([[4, 35, -18], [-8, 24, -46], [-25, 18, -25]], shadowMaterial));
  group.add(makeFurFin([[-10, 24, 21], [-32, 13, 45], [-45, 5, 22]], shadowMaterial));
  group.add(makeFurFin([[-10, 24, -21], [-32, 13, -45], [-45, 5, -22]], shadowMaterial));

  const scaleClusters = [
    [57, 48, 15, 0.75], [51, 52, 17, 0.55], [44, 48, 18, 0.5],
    [5, 21, 20, 0.85], [-4, 18, 22, 0.62], [-16, 15, 23, 0.55],
    [-23, 19, -22, 0.75], [-34, 14, -21, 0.58], [-7, 34, 8, 0.5],
  ];
  scaleClusters.forEach(([x, y, z, s], index) => {
    const scalePatch = new THREE.Mesh(new THREE.OctahedronGeometry(5.8 * s, 0), index % 3 === 0 ? brightScaleMaterial : scaleMaterial);
    scalePatch.scale.set(1, 0.36, 0.72);
    scalePatch.position.set(x, y, z);
    scalePatch.rotation.set(0.2, index * 0.7, 0.6);
    group.add(scalePatch);
  });

  const eyeA = new THREE.Mesh(new THREE.SphereGeometry(4.3, 10, 10), eyeMaterial);
  eyeA.scale.set(1.35, 0.72, 0.5);
  eyeA.position.set(74, 44, 11);
  const eyeB = eyeA.clone();
  eyeB.position.z = -11;
  group.add(eyeA, eyeB);

  group.traverse((child) => {
    if (child.isMesh) child.castShadow = true;
  });

  return group;
}

function makeEar(x, y, z, side, material) {
  const ear = new THREE.Mesh(new THREE.ConeGeometry(9, 34, 4), material);
  ear.position.set(x, y, z);
  ear.rotation.set(side * 0.36, 0.2, -0.3);
  ear.scale.set(0.72, 1.35, 0.55);
  return ear;
}

function makeHorn(x, y, z, sideTilt, material) {
  const horn = new THREE.Mesh(new THREE.ConeGeometry(4.2, 34, 6), material);
  horn.position.set(x, y, z);
  horn.rotation.set(sideTilt, 0.15, -0.58);
  return horn;
}

function makeLeg(x, y, z, bend, material, pawMaterial) {
  const group = new THREE.Group();
  const upper = new THREE.Mesh(new THREE.CylinderGeometry(6.5, 7.8, 28, 8), material);
  upper.position.set(x, y, z);
  upper.rotation.z = bend;
  const paw = new THREE.Mesh(new THREE.SphereGeometry(7.5, 10, 8), pawMaterial);
  paw.scale.set(1.28, 0.55, 0.8);
  paw.position.set(x + 3, y - 17, z);
  group.add(upper, paw);
  return group;
}

function makeTailFin(x, y, z, side, material) {
  return makeFurFin(
    [
      [x, y, z],
      [x - 30, y + 18, z + side * 24],
      [x - 18, y - 8, z + side * 10],
    ],
    material
  );
}

function makeFurFin(points, material) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(points.flat(), 3));
  geometry.computeVertexNormals();
  const fin = new THREE.Mesh(geometry, material);
  fin.castShadow = true;
  return fin;
}

function makeDetailedDragonWing(side, boneMaterial, membraneMaterial, accentMaterial) {
  const group = new THREE.Group();
  const root = new THREE.Vector3(-6, 22, side * 20);
  const elbow = new THREE.Vector3(-38, 62, side * 74);
  const tip = new THREE.Vector3(-118, 48, side * 142);
  const fingers = [
    new THREE.Vector3(-32, 22, side * 66),
    new THREE.Vector3(-58, 12, side * 92),
    new THREE.Vector3(-86, 10, side * 116),
    new THREE.Vector3(-122, 22, side * 132),
  ];

  group.add(makeBone([root, elbow, tip], boneMaterial, 3.2));
  fingers.forEach((finger, index) => {
    const knuckle = new THREE.Vector3(
      root.x - 12 - index * 14,
      root.y + 17 - index * 3,
      root.z + side * (24 + index * 15)
    );
    group.add(makeBone([root, knuckle, finger], boneMaterial, 1.8 - index * 0.12));
  });

  group.add(makeMembrane([root, fingers[0], elbow], membraneMaterial));
  group.add(makeMembrane([elbow, fingers[0], fingers[1]], membraneMaterial));
  group.add(makeMembrane([elbow, fingers[1], fingers[2]], membraneMaterial));
  group.add(makeMembrane([elbow, fingers[2], tip], membraneMaterial));
  group.add(makeMembrane([tip, fingers[2], fingers[3]], membraneMaterial));

  fingers.forEach((finger, index) => {
    const claw = new THREE.Mesh(new THREE.ConeGeometry(3.6, 22 - index * 2, 5), accentMaterial);
    claw.position.copy(finger);
    claw.rotation.z = side > 0 ? 0.82 : -0.82;
    claw.rotation.x = side > 0 ? 0.32 : -0.32;
    group.add(claw);

    const patch = new THREE.Mesh(new THREE.OctahedronGeometry(4.4 - index * 0.35, 0), accentMaterial);
    patch.scale.set(1, 0.28, 0.72);
    patch.position.set(finger.x + 8, finger.y + 2, finger.z - side * 8);
    patch.rotation.set(0.3, index * 0.8, side * 0.45);
    group.add(patch);
  });

  const shoulderPlate = new THREE.Mesh(new THREE.SphereGeometry(9, 10, 8), accentMaterial);
  shoulderPlate.scale.set(1.2, 0.42, 0.78);
  shoulderPlate.position.set(root.x + 4, root.y + 2, root.z);
  group.add(shoulderPlate);

  group.traverse((child) => {
    if (child.isMesh) child.castShadow = true;
  });
  return group;
}

function makeDragonWing(side, sparMaterial, membraneMaterial, tipMaterial) {
  const group = new THREE.Group();
  const root = new THREE.Vector3(2, 12, side * 22);
  const wrist = new THREE.Vector3(-28, 42, side * 82);
  const tip = new THREE.Vector3(-88, 20, side * 130);
  const trailing = [
    new THREE.Vector3(-22, 6, side * 57),
    new THREE.Vector3(-44, -4, side * 78),
    new THREE.Vector3(-68, -7, side * 94),
    new THREE.Vector3(-92, -2, side * 108),
  ];

  group.add(makeBone([root, wrist, tip], sparMaterial, 2.4));
  trailing.forEach((point) => {
    group.add(makeBone([root, point], sparMaterial, 1.5));
  });

  group.add(makeMembrane([root, trailing[0], wrist], membraneMaterial));
  group.add(makeMembrane([wrist, trailing[0], trailing[1]], membraneMaterial));
  group.add(makeMembrane([wrist, trailing[1], trailing[2]], membraneMaterial));
  group.add(makeMembrane([wrist, trailing[2], tip], membraneMaterial));
  group.add(makeMembrane([tip, trailing[2], trailing[3]], membraneMaterial));

  trailing.forEach((point, index) => {
    const feather = new THREE.Mesh(new THREE.ConeGeometry(4.5 - index * 0.35, 28 - index * 2, 5), tipMaterial);
    feather.position.copy(point);
    feather.rotation.z = side > 0 ? 0.78 : -0.78;
    feather.rotation.x = side > 0 ? 0.28 : -0.28;
    feather.castShadow = true;
    group.add(feather);
  });

  const tipFeather = new THREE.Mesh(new THREE.ConeGeometry(5, 36, 5), tipMaterial);
  tipFeather.position.copy(tip);
  tipFeather.rotation.z = side > 0 ? 1.02 : -1.02;
  tipFeather.rotation.x = side > 0 ? 0.34 : -0.34;
  tipFeather.castShadow = true;
  group.add(tipFeather);

  return group;
}

function makeBone(points, material, radius) {
  const curve = new THREE.CatmullRomCurve3(points);
  const bone = new THREE.Mesh(new THREE.TubeGeometry(curve, 8, radius, 6, false), material);
  bone.castShadow = true;
  return bone;
}

function makeMembrane(points, material) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(points.flatMap((point) => [point.x, point.y, point.z]), 3));
  geometry.computeVertexNormals();
  const membrane = new THREE.Mesh(geometry, material);
  membrane.castShadow = true;
  return membrane;
}

function makeRibbonFin(points, material) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(points.flat(), 3));
  geometry.computeVertexNormals();
  const fin = new THREE.Mesh(geometry, material);
  fin.castShadow = true;
  return fin;
}

function makeWhisker(x1, y1, z1, x2, y2, z2, material) {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(x1, y1, z1),
    new THREE.Vector3((x1 + x2) * 0.5, y1 + 8, z1 + (z2 - z1) * 0.7),
    new THREE.Vector3(x2, y2, z2),
  ]);
  const whisker = new THREE.Mesh(new THREE.TubeGeometry(curve, 10, 1.2, 5, false), material);
  whisker.castShadow = true;
  return whisker;
}

function makeWing(ax, az, bx, bz, cx, cz, material) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([ax, 2, az, bx, 3, bz, cx, 0, cz], 3)
  );
  geometry.computeVertexNormals();
  const wing = new THREE.Mesh(geometry, material);
  wing.castShadow = true;
  return wing;
}

function makeEnemyMesh(enemy) {
  if (enemy.shape === "phoenix") return makePhoenixMesh(enemy);

  const group = new THREE.Group();
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: enemy.color, roughness: 0.72 });
  const shellMaterial = new THREE.MeshStandardMaterial({ color: enemy.accent, roughness: 0.58, metalness: 0.08 });
  const legMaterial = new THREE.MeshStandardMaterial({ color: 0x1b130f, roughness: 0.64 });
  const eyeMaterial = new THREE.MeshStandardMaterial({ color: 0xffe27a, emissive: 0xff9c20, emissiveIntensity: 1.1 });

  const segmentCount = 11;
  const spacing = enemy.radius * 0.58;
  for (let i = 0; i < segmentCount; i += 1) {
    const t = i / (segmentCount - 1);
    const x = enemy.radius * 1.6 - i * spacing;
    const z = Math.sin(t * Math.PI * 2) * enemy.radius * 0.08;
    const radius = enemy.radius * (i === 0 ? 0.62 : 0.48 - t * 0.09);
    const segment = new THREE.Mesh(new THREE.SphereGeometry(radius, 14, 10), bodyMaterial);
    segment.scale.set(i === 0 ? 1.15 : 0.98, 0.44, 0.72);
    segment.position.set(x, 20 + Math.sin(t * Math.PI) * 3, z);
    segment.castShadow = true;
    group.add(segment);

    const shell = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.82, 10, 8), shellMaterial);
    shell.scale.set(0.92, 0.18, 0.62);
    shell.position.set(x, 27 + Math.sin(t * Math.PI) * 3, z);
    shell.castShadow = true;
    group.add(shell);

    if (i > 0 && i < segmentCount - 1) {
      group.add(makeCentipedeLeg(x, z, 1, radius, legMaterial));
      group.add(makeCentipedeLeg(x, z, -1, radius, legMaterial));
    }
  }

  const mandibleA = makeBone(
    [new THREE.Vector3(enemy.radius * 2.0, 21, 10), new THREE.Vector3(enemy.radius * 2.35, 16, 22)],
    legMaterial,
    2
  );
  const mandibleB = makeBone(
    [new THREE.Vector3(enemy.radius * 2.0, 21, -10), new THREE.Vector3(enemy.radius * 2.35, 16, -22)],
    legMaterial,
    2
  );
  group.add(mandibleA, mandibleB);

  const antennaA = makeBone(
    [new THREE.Vector3(enemy.radius * 1.9, 31, 9), new THREE.Vector3(enemy.radius * 2.35, 46, 24)],
    shellMaterial,
    1.25
  );
  const antennaB = makeBone(
    [new THREE.Vector3(enemy.radius * 1.9, 31, -9), new THREE.Vector3(enemy.radius * 2.35, 46, -24)],
    shellMaterial,
    1.25
  );
  group.add(antennaA, antennaB);

  const eyeA = new THREE.Mesh(new THREE.SphereGeometry(3.4, 8, 8), eyeMaterial);
  eyeA.position.set(enemy.radius * 2.02, 31, 8);
  const eyeB = eyeA.clone();
  eyeB.position.z = -8;
  group.add(eyeA, eyeB);

  const label = makeEnemyLevelLabel(enemy.level || 1);
  label.position.set(0, 78, 0);
  group.add(label);

  group.traverse((child) => {
    if (child.isMesh) child.castShadow = true;
  });
  return group;
}

function makePhoenixMesh(enemy) {
  const group = new THREE.Group();
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: enemy.color,
    emissive: 0x5c1208,
    emissiveIntensity: 0.45,
    roughness: 0.46,
  });
  const wingMaterial = new THREE.MeshStandardMaterial({
    color: enemy.accent,
    emissive: 0xff6f1f,
    emissiveIntensity: 0.85,
    roughness: 0.34,
    side: THREE.DoubleSide,
  });
  const wingBoneMaterial = new THREE.MeshStandardMaterial({
    color: 0x9f2320,
    emissive: 0x3f0708,
    emissiveIntensity: 0.45,
    roughness: 0.5,
  });
  const wingMembraneMaterial = new THREE.MeshStandardMaterial({
    color: 0xff8f3f,
    emissive: 0xff4c1e,
    emissiveIntensity: 0.72,
    transparent: true,
    opacity: 0.82,
    roughness: 0.36,
    side: THREE.DoubleSide,
  });
  const darkFeatherMaterial = new THREE.MeshStandardMaterial({
    color: 0x8f1f26,
    emissive: 0x3f0708,
    emissiveIntensity: 0.55,
    roughness: 0.5,
  });
  const beakMaterial = new THREE.MeshStandardMaterial({ color: 0xffd782, roughness: 0.4 });
  const eyeMaterial = new THREE.MeshStandardMaterial({ color: 0xfff7b0, emissive: 0xffbc35, emissiveIntensity: 1.4 });

  const body = new THREE.Mesh(new THREE.SphereGeometry(enemy.radius * 0.62, 18, 14), bodyMaterial);
  body.scale.set(1.22, 1.08, 0.58);
  body.position.set(-enemy.radius * 0.22, 30, 0);
  group.add(body);

  const haunch = new THREE.Mesh(new THREE.SphereGeometry(enemy.radius * 0.48, 16, 12), bodyMaterial);
  haunch.scale.set(1.18, 0.9, 0.56);
  haunch.position.set(-enemy.radius * 0.84, 27, 0);
  group.add(haunch);

  const chest = new THREE.Mesh(new THREE.SphereGeometry(enemy.radius * 0.4, 14, 10), wingMaterial);
  chest.scale.set(0.78, 0.8, 0.46);
  chest.position.set(enemy.radius * 0.32, 31, 0);
  group.add(chest);

  const neck = new THREE.Mesh(new THREE.SphereGeometry(enemy.radius * 0.3, 14, 10), bodyMaterial);
  neck.scale.set(1.15, 0.68, 0.58);
  neck.rotation.z = 0.34;
  neck.position.set(enemy.radius * 0.5, 43, 0);
  group.add(neck);

  const head = new THREE.Mesh(new THREE.SphereGeometry(enemy.radius * 0.32, 14, 10), bodyMaterial);
  head.scale.set(0.88, 0.96, 0.78);
  head.position.set(enemy.radius * 0.82, 54, 0);
  group.add(head);

  const beak = new THREE.Mesh(new THREE.ConeGeometry(enemy.radius * 0.12, enemy.radius * 0.42, 8), beakMaterial);
  beak.rotation.z = -Math.PI / 2;
  beak.position.set(enemy.radius * 1.14, 53, 0);
  group.add(beak);

  const eyeA = new THREE.Mesh(new THREE.SphereGeometry(2.8, 8, 8), eyeMaterial);
  eyeA.position.set(enemy.radius * 0.98, 58, enemy.radius * 0.14);
  const eyeB = eyeA.clone();
  eyeB.position.z = -enemy.radius * 0.14;
  group.add(eyeA, eyeB);

  for (let side = -1; side <= 1; side += 2) {
    const wing = makePhoenixWing(side, enemy.radius, wingBoneMaterial, wingMembraneMaterial, wingMaterial);
    group.add(wing);

    for (let i = 0; i < 3; i += 1) {
      const crest = new THREE.Mesh(new THREE.ConeGeometry(3.8 - i * 0.45, 22 - i * 3, 5), wingMaterial);
      crest.position.set(enemy.radius * 0.48 - i * 2, 67 + i * 2, side * (3 + i * 3));
      crest.rotation.z = -0.35 + i * 0.12;
      crest.rotation.x = side * 0.45;
      group.add(crest);
    }
  }

  for (let i = 0; i < 7; i += 1) {
    const t = i / 6;
    const feather = new THREE.Mesh(
      new THREE.ConeGeometry(enemy.radius * (0.12 - t * 0.035), enemy.radius * (1.0 - t * 0.08), 7),
      i % 2 === 0 ? wingMaterial : darkFeatherMaterial
    );
    feather.position.set(-enemy.radius * (0.52 + t * 0.38), 25 - t * 10, (i - 3) * enemy.radius * 0.11);
    feather.rotation.z = Math.PI / 2.5 + t * 0.28;
    feather.rotation.y = (i - 3) * 0.18;
    group.add(feather);
  }

  const label = makeEnemyLevelLabel(enemy.level || 1);
  label.position.set(0, 92, 0);
  group.add(label);

  group.traverse((child) => {
    if (child.isMesh) child.castShadow = true;
  });
  return group;
}

function makePhoenixWing(side, radius, boneMaterial, membraneMaterial, accentMaterial) {
  const group = new THREE.Group();
  const scale = radius / 30;
  const root = new THREE.Vector3(-radius * 0.12, 43, side * radius * 0.48);
  const elbow = new THREE.Vector3(-radius * 0.9, 82, side * radius * 1.45);
  const tip = new THREE.Vector3(-radius * 2.65, 66, side * radius * 2.82);
  const fingers = [
    new THREE.Vector3(-radius * 0.82, 42, side * radius * 1.34),
    new THREE.Vector3(-radius * 1.35, 30, side * radius * 1.9),
    new THREE.Vector3(-radius * 2.02, 30, side * radius * 2.4),
    new THREE.Vector3(-radius * 2.74, 44, side * radius * 2.62),
  ];

  group.add(makeBone([root, elbow, tip], boneMaterial, 2.7 * scale));
  fingers.forEach((finger, index) => {
    const knuckle = new THREE.Vector3(
      root.x - radius * (0.25 + index * 0.28),
      root.y + radius * (0.36 - index * 0.08),
      root.z + side * radius * (0.52 + index * 0.34)
    );
    group.add(makeBone([root, knuckle, finger], boneMaterial, (1.55 - index * 0.12) * scale));
  });

  group.add(makeMembrane([root, fingers[0], elbow], membraneMaterial));
  group.add(makeMembrane([elbow, fingers[0], fingers[1]], membraneMaterial));
  group.add(makeMembrane([elbow, fingers[1], fingers[2]], membraneMaterial));
  group.add(makeMembrane([elbow, fingers[2], tip], membraneMaterial));
  group.add(makeMembrane([tip, fingers[2], fingers[3]], membraneMaterial));

  fingers.forEach((finger, index) => {
    const ember = new THREE.Mesh(new THREE.ConeGeometry((3.4 - index * 0.25) * scale, (20 - index * 1.8) * scale, 5), accentMaterial);
    ember.position.copy(finger);
    ember.rotation.z = side > 0 ? 0.88 : -0.88;
    ember.rotation.x = side > 0 ? 0.32 : -0.32;
    group.add(ember);
  });

  const shoulder = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.18, 10, 8), accentMaterial);
  shoulder.scale.set(1.2, 0.42, 0.78);
  shoulder.position.copy(root);
  group.add(shoulder);

  return group;
}

function makeEnemyLevelLabel(level) {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "rgba(8, 12, 16, 0.78)";
  roundCanvasRect(context, 14, 10, 100, 42, 12);
  context.fill();
  context.strokeStyle = "rgba(255, 255, 255, 0.75)";
  context.lineWidth = 3;
  context.stroke();
  context.fillStyle = "#fff4c2";
  context.font = "900 25px system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(`Lv ${level}`, 64, 32);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(78, 39, 1);
  return sprite;
}

function roundCanvasRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}

function makeCentipedeLeg(x, z, side, radius, material) {
  const hip = new THREE.Vector3(x, 17, z + side * radius * 0.52);
  const knee = new THREE.Vector3(x - radius * 0.18, 10, z + side * radius * 1.05);
  const foot = new THREE.Vector3(x + radius * 0.18, 4, z + side * radius * 1.5);
  return makeBone([hip, knee, foot], material, 1.7);
}

function makeDecoration(item) {
  let mesh;
  if (item.type === "tree") {
    mesh = makeTree(item);
  } else if (item.type === "crystal") {
    mesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(item.r * 0.55, 0),
      new THREE.MeshStandardMaterial({
        color: item.hue > 0.5 ? 0x6be7d8 : 0xc58cff,
        roughness: 0.18,
        metalness: 0.18,
        emissive: item.hue > 0.5 ? 0x17443d : 0x311a4a,
      })
    );
    mesh.position.y = item.r * 0.5;
  } else {
    mesh = new THREE.Mesh(
      new THREE.DodecahedronGeometry(item.r * 0.55, 0),
      new THREE.MeshStandardMaterial({ color: 0x58656b, roughness: 0.86 })
    );
    mesh.scale.y = 0.52;
    mesh.position.y = item.r * 0.18;
  }
  mesh.position.x = item.x;
  mesh.position.z = item.y;
  mesh.rotation.y = item.hue * Math.PI * 2;
  mesh.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  return mesh;
}

function makeTree(item) {
  const group = new THREE.Group();
  const trunkMaterial = new THREE.MeshStandardMaterial({
    color: item.hue > 0.55 ? 0x6b4b2c : 0x553a24,
    roughness: 0.88,
  });
  const barkDarkMaterial = new THREE.MeshStandardMaterial({ color: 0x342315, roughness: 0.92 });
  const leafMaterial = new THREE.MeshStandardMaterial({
    color: item.hue > 0.5 ? 0x2f7b45 : 0x245f3d,
    roughness: 0.78,
  });
  const leafDarkMaterial = new THREE.MeshStandardMaterial({
    color: item.hue > 0.5 ? 0x1f5634 : 0x1b4631,
    roughness: 0.86,
  });

  const trunkHeight = item.r * 1.95;
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(item.r * 0.16, item.r * 0.24, trunkHeight, 8),
    trunkMaterial
  );
  trunk.position.y = trunkHeight * 0.5;
  group.add(trunk);

  for (let i = 0; i < 4; i += 1) {
    const angle = item.hue * Math.PI * 2 + i * Math.PI * 0.5;
    const length = item.r * (0.58 + i * 0.08);
    const branch = new THREE.Mesh(
      new THREE.CylinderGeometry(item.r * 0.055, item.r * 0.09, length, 6),
      trunkMaterial
    );
    branch.position.set(Math.cos(angle) * item.r * 0.22, trunkHeight * (0.52 + i * 0.08), Math.sin(angle) * item.r * 0.22);
    branch.rotation.z = Math.PI / 2.8;
    branch.rotation.y = -angle;
    group.add(branch);
  }

  for (let i = 0; i < 5; i += 1) {
    const t = i / 4;
    const canopy = new THREE.Mesh(
      new THREE.SphereGeometry(item.r * (0.58 - t * 0.06), 10, 8),
      i % 2 === 0 ? leafMaterial : leafDarkMaterial
    );
    canopy.scale.set(1.25 - t * 0.12, 0.78, 1.05);
    canopy.position.set(
      Math.cos(item.hue * 8 + i) * item.r * 0.28,
      trunkHeight * 0.78 + item.r * t * 0.35,
      Math.sin(item.hue * 7 + i) * item.r * 0.28
    );
    group.add(canopy);
  }

  const crown = new THREE.Mesh(
    new THREE.ConeGeometry(item.r * 0.72, item.r * 1.35, 9),
    leafMaterial
  );
  crown.position.y = trunkHeight + item.r * 0.48;
  crown.rotation.y = item.hue * Math.PI * 2;
  group.add(crown);

  for (let i = 0; i < 3; i += 1) {
    const root = new THREE.Mesh(
      new THREE.CylinderGeometry(item.r * 0.04, item.r * 0.08, item.r * 0.72, 5),
      barkDarkMaterial
    );
    root.position.set(Math.cos(i * 2.1) * item.r * 0.24, item.r * 0.08, Math.sin(i * 2.1) * item.r * 0.24);
    root.rotation.z = Math.PI / 2.2;
    root.rotation.y = i * 2.1;
    group.add(root);
  }

  return group;
}

function startGame() {
  if (!state.ready) return;
  initWorld();
  state.running = true;
  state.lastTime = performance.now();
  overlay.classList.add("hidden");
  requestAnimationFrame(loop);
}

function loop(now) {
  if (!state.running) return;
  const dt = Math.min(0.033, (now - state.lastTime) / 1000 || 0);
  state.lastTime = now;
  update(dt);
  render();
  requestAnimationFrame(loop);
}

function update(dt) {
  state.fireCooldown = Math.max(0, state.fireCooldown - dt);
  state.nestHealCooldown = Math.max(0, state.nestHealCooldown - dt);
  state.shake = Math.max(0, state.shake - dt * 18);
  state.messageTime = Math.max(0, state.messageTime - dt);
  player.invulnerable = Math.max(0, player.invulnerable - dt);
  player.bob += dt * 4;

  enemies.forEach((enemy) => {
    enemy.battleCooldown = Math.max(0, (enemy.battleCooldown || 0) - dt);
  });

  if (state.battle) {
    updateBattleCamera(dt);
    updateParticles(dt);
    updateMeshes(dt);
    updateHud();
    return;
  }

  const controls = getMovementControls();
  const speed = controls.throttle > 0 ? 305 : 205;
  const turnSpeed = 2.9;
  const climbSpeed = 185;
  player.angle += controls.turn * turnSpeed * dt;
  player.vx = player.vx * 0.82 + Math.cos(player.angle) * controls.throttle * speed * 0.18;
  player.vy = player.vy * 0.82 + Math.sin(player.angle) * controls.throttle * speed * 0.18;
  player.vz = player.vz * 0.82 + controls.climb * climbSpeed * 0.18;
  const nextX = player.x + player.vx * dt;
  const nextY = player.y + player.vy * dt;
  player.altitude = clamp(player.altitude + player.vz * dt, FLIGHT.min, FLIGHT.max);
  if (player.altitude === FLIGHT.min || player.altitude === FLIGHT.max) player.vz *= 0.3;
  const exitSide = getExitSide(nextX, nextY);
  if (exitSide) {
    transitionToNewWorld(exitSide, nextX, nextY);
    updateHud();
    return;
  }
  player.x = clamp(nextX, 70, WORLD.width - 70);
  player.y = clamp(nextY, 70, WORLD.height - 70);
  if (resolveFeatureCollision(player)) {
    player.vx *= 0.25;
    player.vy *= 0.25;
  }
  player.x = clamp(player.x, 70, WORLD.width - 70);
  player.y = clamp(player.y, 70, WORLD.height - 70);

  updateAllies(dt);
  updateBaseDragons(dt);
  updateDragons(dt);
  updateEnemies(dt);
  updateFlames(dt);
  updateFoods(dt);
  updateGems(dt);
  updateParticles(dt);
  updateMeshes(dt);
  updateHud();
}

function getMovementControls() {
  const left = keys.has("arrowleft") || keys.has("a") || touchDirs.has("left");
  const right = keys.has("arrowright") || keys.has("d") || touchDirs.has("right");
  const up = keys.has("arrowup") || keys.has("w") || touchDirs.has("up");
  const down = keys.has("arrowdown") || keys.has("s") || touchDirs.has("down");
  const climbUp = keys.has("e") || keys.has("pageup");
  const climbDown = keys.has("q") || keys.has("pagedown");
  return {
    throttle: Number(up) - Number(down),
    turn: Number(right) - Number(left),
    climb: Number(climbUp) - Number(climbDown),
  };
}

function getExitSide(x, y) {
  const edge = 70;
  const overflow = [
    { side: "west", amount: edge - x },
    { side: "east", amount: x - (WORLD.width - edge) },
    { side: "north", amount: edge - y },
    { side: "south", amount: y - (WORLD.height - edge) },
  ].filter((entry) => entry.amount > 0);
  if (!overflow.length) return null;
  overflow.sort((a, b) => b.amount - a.amount);
  return overflow[0].side;
}

function transitionToNewWorld(exitSide, rawX, rawY) {
  const carried = {
    health: player.health,
    maxHealth: player.maxHealth,
    altitude: player.altitude,
    food: state.food,
    storedFood: state.storedFood,
    gems: state.gems,
    level: state.level,
    xp: state.xp,
    allies: allies.map((ally) => ally.colors),
    baseDragons: baseDragons.map((dragon) => dragon.colors),
    nest: nest ? { x: nest.x, y: nest.y } : null,
  };
  initWorld(carried);
  const spawn = findEdgeSpawn(exitSide, rawX, rawY);
  player.x = spawn.x;
  player.y = spawn.y;
  player.vx = 0;
  player.vy = 0;
  player.vz = 0;
  player.maxHealth = carried.maxHealth;
  state.message = "A new world square unfolds.";
  state.messageTime = 2.8;
  restoreAllies(carried.allies);
  restoreBaseDragons(carried.baseDragons);
  updateMeshes(0);
}

function findEdgeSpawn(exitSide, rawX, rawY) {
  const inset = 150;
  const base = {
    west: { x: WORLD.width - inset, y: clamp(rawY, inset, WORLD.height - inset), axis: "y" },
    east: { x: inset, y: clamp(rawY, inset, WORLD.height - inset), axis: "y" },
    north: { x: clamp(rawX, inset, WORLD.width - inset), y: WORLD.height - inset, axis: "x" },
    south: { x: clamp(rawX, inset, WORLD.width - inset), y: inset, axis: "x" },
  }[exitSide];
  const offsets = [0, 120, -120, 260, -260, 440, -440, 680, -680, 940, -940];
  for (const offset of offsets) {
    const x = base.axis === "x" ? clamp(base.x + offset, inset, WORLD.width - inset) : base.x;
    const y = base.axis === "y" ? clamp(base.y + offset, inset, WORLD.height - inset) : base.y;
    if (!isWaterArea(x, y, player.radius + WATER_CLEARANCE) && !isObstacleArea(x, y, player.radius + 20)) {
      return { x, y };
    }
  }
  return findDryPosition(player.radius + 40, inset);
}

function restoreAllies(allyColors) {
  allies.length = 0;
  allyColors.forEach((colors, index) => {
    const gap = 86 + index * 12;
    const ally = {
      x: clamp(player.x - Math.cos(player.angle) * gap, 70, WORLD.width - 70),
      y: clamp(player.y - Math.sin(player.angle) * gap, 70, WORLD.height - 70),
      radius: 30,
      altitude: player.altitude,
      vz: 0,
      angle: player.angle,
      colors,
      joined: true,
      bob: rand() * 10,
      mesh: makeDragonMesh(colors, 0.95),
    };
    allies.push(ally);
    entityGroup.add(ally.mesh);
  });
}

function restoreBaseDragons(dragonColors) {
  baseDragons.length = 0;
  dragonColors.forEach((colors, index) => {
    const dragon = makeBaseDragon(colors, index);
    baseDragons.push(dragon);
    entityGroup.add(dragon.mesh);
  });
  arrangeBaseDragons();
}

function makeBaseDragon(colors, index) {
  const position = getNestPerchPosition(index);
  return {
    x: position.x,
    y: position.y,
    radius: 30,
    altitude: FLIGHT.min + 8,
    vz: 0,
    angle: position.angle + Math.PI,
    colors,
    joined: true,
    bob: rand() * 10,
    mesh: makeDragonMesh(colors, 0.86),
  };
}

function updateAllies(dt) {
  allies.forEach((ally, index) => {
    const target = index === 0 ? player : allies[index - 1];
    const gap = 92;
    const dx = target.x - ally.x;
    const dy = target.y - ally.y;
    const dist = Math.hypot(dx, dy) || 1;
    const desired = Math.max(0, dist - gap);
    const speed = 230 + Math.min(index, 5) * 14;
    ally.x += (dx / dist) * Math.min(desired, speed * dt);
    ally.y += (dy / dist) * Math.min(desired, speed * dt);
    ally.altitude += ((target.altitude || FLIGHT.min) - (ally.altitude || FLIGHT.min)) * Math.min(1, dt * 2.8);
    resolveFeatureCollision(ally);
    ally.x = clamp(ally.x, 70, WORLD.width - 70);
    ally.y = clamp(ally.y, 70, WORLD.height - 70);
    ally.altitude = clamp(ally.altitude || FLIGHT.min, FLIGHT.min, FLIGHT.max);
    ally.angle = Math.atan2(dy, dx);
    ally.bob += dt * 4;
  });
}

function updateBaseDragons(dt) {
  if (!nest) return;
  baseDragons.forEach((dragon, index) => {
    const position = getNestPerchPosition(index);
    dragon.x += (position.x - dragon.x) * Math.min(1, dt * 2.5);
    dragon.y += (position.y - dragon.y) * Math.min(1, dt * 2.5);
    dragon.altitude = FLIGHT.min + 8 + Math.sin(dragon.bob) * 3;
    dragon.angle += angleDelta(dragon.angle, position.angle + Math.PI) * Math.min(1, dt * 2.5);
    dragon.bob += dt * 2;
  });
}

function updateDragons(dt) {
  dragons.forEach((dragon) => {
    if (dragon.joined) return;
    dragon.bob += dt * 2.2;
    dragon.angle += Math.sin(dragon.bob) * dt * 0.24;
    if (distance(player, dragon) < player.radius + dragon.radius + 24) {
      dragon.joined = true;
      allies.push(dragon);
      burst(dragon.x, dragon.y, dragon.colors[2], 18);
      state.message = "A dragon joins your flight.";
      state.messageTime = 2.8;
      heal(9);
    }
  });
}

function buildNest() {
  if (!state.running || nest || state.battle) return;
  if (player.altitude > 120) {
    state.message = "Land before building a nest.";
    state.messageTime = 2;
    return;
  }
  createNest(player.x, player.y, true);
}

function createNest(x, y, announce) {
  nest = {
    x: clamp(x, 180, WORLD.width - 180),
    y: clamp(y, 180, WORLD.height - 180),
    radius: 150,
    mesh: makeNestMesh(),
  };
  nest.mesh.position.set(nest.x, 4, nest.y);
  worldGroup.add(nest.mesh);
  nestPanel.classList.remove("hidden");
  if (announce) {
    state.message = "Your home nest is ready.";
    state.messageTime = 2.8;
    burst(nest.x, nest.y, "#f4c66f", 24);
  }
  updateHud();
}

function useNest() {
  if (!state.running || state.battle) return;
  if (!nest) {
    buildNest();
    return;
  }
  if (!isAtNest()) {
    state.message = "Return to your nest to use it.";
    state.messageTime = 2;
    return;
  }
  if (player.health >= player.maxHealth) {
    state.message = "You are already fully healed.";
    state.messageTime = 1.8;
    return;
  }
  if (state.nestHealCooldown > 0) return;
  heal(Math.ceil(player.maxHealth * 0.34));
  state.nestHealCooldown = 1.5;
  state.message = "The nest restores your strength.";
  state.messageTime = 2.4;
  burst(player.x, player.y, "#9fffd0", 18);
  updateHud();
}

function sendAllyHome(index) {
  if (!nest || !isAtNest() || state.battle) return;
  const ally = allies[index];
  if (!ally) return;
  allies.splice(index, 1);
  const position = getNestPerchPosition(baseDragons.length);
  ally.x = position.x;
  ally.y = position.y;
  ally.altitude = FLIGHT.min + 8;
  ally.angle = position.angle + Math.PI;
  baseDragons.push(ally);
  arrangeBaseDragons();
  rosterSignature = "";
  state.message = "A dragon stays at the nest.";
  state.messageTime = 2;
  updateHud();
}

function bringDragonOnAdventure(index) {
  if (!nest || !isAtNest() || state.battle) return;
  const dragon = baseDragons[index];
  if (!dragon) return;
  baseDragons.splice(index, 1);
  const gap = 92 + allies.length * 12;
  dragon.x = clamp(player.x - Math.cos(player.angle) * gap, 70, WORLD.width - 70);
  dragon.y = clamp(player.y - Math.sin(player.angle) * gap, 70, WORLD.height - 70);
  dragon.altitude = player.altitude;
  dragon.angle = player.angle;
  allies.push(dragon);
  arrangeBaseDragons();
  rosterSignature = "";
  state.message = "A dragon joins the adventure.";
  state.messageTime = 2;
  updateHud();
}

function storeFoodAtNest() {
  if (!nest || !isAtNest() || state.battle || state.food <= 0) return;
  state.storedFood += state.food;
  state.food = 0;
  rosterSignature = "";
  state.message = "Food stored at the nest.";
  state.messageTime = 2;
  updateHud();
}

function takeFoodFromNest() {
  if (!nest || !isAtNest() || state.battle || state.storedFood <= 0 || state.food >= FOOD_CARRY_MAX) return;
  const amount = Math.min(FOOD_CARRY_MAX - state.food, state.storedFood);
  state.storedFood -= amount;
  state.food += amount;
  rosterSignature = "";
  state.message = "Food packed for the road.";
  state.messageTime = 2;
  updateHud();
}

function arrangeBaseDragons() {
  if (!nest) return;
  baseDragons.forEach((dragon, index) => {
    const position = getNestPerchPosition(index);
    dragon.x = position.x;
    dragon.y = position.y;
    dragon.angle = position.angle + Math.PI;
  });
}

function getNestPerchPosition(index) {
  if (!nest) return { x: player.x, y: player.y, angle: player.angle };
  const ring = Math.floor(index / 8);
  const slot = index % 8;
  const count = Math.min(8, Math.max(1, baseDragons.length || 1));
  const angle = (slot / count) * Math.PI * 2 + ring * 0.45;
  const radius = nest.radius + 44 + ring * 58;
  return {
    x: clamp(nest.x + Math.cos(angle) * radius, 70, WORLD.width - 70),
    y: clamp(nest.y + Math.sin(angle) * radius, 70, WORLD.height - 70),
    angle,
  };
}

function isAtNest() {
  return Boolean(nest) && player.altitude < 140 && distance(player, nest) < nest.radius + player.radius + 100;
}

function updateEnemies(dt) {
  enemies.forEach((enemy) => {
    enemy.hurt = Math.max(0, enemy.hurt - dt);
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const dist = Math.hypot(dx, dy) || 1;
    enemy.angle += Math.sin(performance.now() * 0.001 + enemy.x) * dt * 0.25;

    if (dist < 150 && player.altitude < 130 && enemy.battleCooldown <= 0) startBattle(enemy);
  });

  for (let i = enemies.length - 1; i >= 0; i -= 1) {
    if (enemies[i].health <= 0) {
      defeatEnemy(enemies[i]);
    }
  }
}

function updateFoods(dt) {
  for (let i = foods.length - 1; i >= 0; i -= 1) {
    const food = foods[i];
    food.bob += dt * 3.4;
    if (food.mesh) {
      food.mesh.position.y = 18 + Math.sin(food.bob) * 4;
      food.mesh.rotation.y += dt * 1.4;
    }
    if (player.altitude < 115 && distance(player, food) < player.radius + food.radius) {
      if (state.food >= FOOD_CARRY_MAX) {
        state.message = nest ? "Food pouch full. Return to the nest to store more." : "Food pouch full.";
        state.messageTime = 1.2;
        continue;
      }
      state.food += 1;
      state.message = "Food collected.";
      state.messageTime = 1.8;
      burst(food.x, food.y, "#ffcf6e", 12);
      entityGroup.remove(food.mesh);
      foods.splice(i, 1);
      updateHud();
    }
  }
}

function updateGems(dt) {
  for (let i = decorations.length - 1; i >= 0; i -= 1) {
    const gem = decorations[i];
    if (gem.type !== "crystal") continue;
    if (gem.mesh) {
      gem.mesh.rotation.y += dt * 1.2;
      gem.mesh.position.y = gem.r * 0.5 + Math.sin(performance.now() * 0.003 + gem.hue * 10) * 3;
    }
    if (player.altitude < 120 && distance(player, gem) < player.radius + gem.r + 18) {
      state.gems += 1;
      state.message = "Gem collected.";
      state.messageTime = 1.8;
      burst(gem.x, gem.y, gem.hue > 0.5 ? "#6be7d8" : "#c58cff", 14);
      worldGroup.remove(gem.mesh);
      decorations.splice(i, 1);
      updateHud();
    }
  }
}

function startBattle(enemy) {
  if (state.battle || !enemies.includes(enemy)) return;
  player.vx = 0;
  player.vy = 0;
  player.vz = 0;
  enemy.battleCooldown = 2;
  state.battle = {
    enemy,
    enemyMaxHealth: enemy.maxHealth || enemy.health,
    defending: false,
  };
  state.message = `${capitalize(enemy.name)} encounter`;
  state.messageTime = 2;
  battlePanel.classList.remove("hidden");
  setBattleLog(`A level ${enemy.level} ${enemy.name} challenges your flight.`);
  updateBattleUi();
}

function performBattleAction(action) {
  if (!state.battle) return;
  const battle = state.battle;
  const enemy = battle.enemy;
  if (!enemies.includes(enemy)) {
    endBattle(false);
    return;
  }

  let playerText = "";
  if (action === "attack") {
    const roll = rollDamage(getAttackDamage("attack"));
    const damage = roll.damage;
    damageEnemyInBattle(enemy, damage);
    playerText = formatPlayerAttackText(`You strike the ${enemy.name}`, roll);
  } else if (action === "fire") {
    const roll = rollDamage(getAttackDamage("fire"));
    const damage = roll.damage;
    damageEnemyInBattle(enemy, damage);
    playerText = formatPlayerAttackText(`Fire washes over the ${enemy.name}`, roll);
  } else if (action === "rally") {
    battle.defending = true;
    heal(8 + allies.length * 2);
    playerText = "Your flight circles close and steadies you.";
    burst(player.x, player.y, dragonPalette[0][2], 12);
  } else if (action === "flee") {
    setBattleLog("You wheel away from the fight.");
    endBattle(true);
    return;
  }

  if (enemy.health <= 0) {
    setBattleLog(`${playerText} The ${enemy.name} falls.`);
    defeatEnemy(enemy);
    endBattle(false);
    return;
  }

  const enemyBaseDamage = Math.max(4, (enemy.power || 8) - Math.floor(allies.length / 2));
  const enemyRoll = rollDamage(enemyBaseDamage);
  const finalDamage = battle.defending ? Math.ceil(enemyRoll.damage * 0.45) : enemyRoll.damage;
  battle.defending = false;
  player.health = Math.max(0, player.health - finalDamage);
  player.invulnerable = 0.6;
  if (finalDamage > 0) {
    state.shake = enemyRoll.kind === "critical" ? 1.2 : 0.8;
    burst(player.x, player.y, "#ff746d", 10 + Math.min(14, finalDamage));
  }
  setBattleLog(`${playerText} ${formatEnemyAttackText(enemy.name, enemyRoll, finalDamage)}`);
  updateBattleUi();
  updateHud();
  if (player.health <= 0) endGame(false);
}

function damageEnemyInBattle(enemy, damage) {
  if (damage <= 0) return;
  enemy.health -= damage;
  enemy.hurt = 0.45;
  burst(enemy.x, enemy.y, enemy.accent, 12 + damage * 2);
}

function rollDamage(baseDamage) {
  const roll = rand();
  let multiplier = 1;
  let kind = "normal";
  if (roll < 0.08) {
    multiplier = 0;
    kind = "miss";
  } else if (roll < 0.18) {
    multiplier = 0.5;
    kind = "glancing";
  } else if (roll > 0.96) {
    multiplier = 2.35;
    kind = "critical";
  } else if (roll > 0.86) {
    multiplier = 1.55;
    kind = "heavy";
  }
  return {
    damage: Math.max(0, Math.round(baseDamage * multiplier)),
    kind,
  };
}

function formatPlayerAttackText(prefix, roll) {
  if (roll.kind === "miss") return `${prefix}, but misses.`;
  if (roll.kind === "critical") return `${prefix} for ${roll.damage}. Critical hit!`;
  if (roll.kind === "heavy") return `${prefix} for ${roll.damage}. Heavy hit!`;
  if (roll.kind === "glancing") return `${prefix} for ${roll.damage}. Glancing blow.`;
  return `${prefix} for ${roll.damage}.`;
}

function formatEnemyAttackText(name, roll, finalDamage) {
  if (roll.kind === "miss") return `The ${name} counters, but misses.`;
  if (roll.kind === "critical") return `The ${name} lands a critical counter for ${finalDamage}.`;
  if (roll.kind === "heavy") return `The ${name} hits hard for ${finalDamage}.`;
  if (roll.kind === "glancing") return `The ${name} grazes you for ${finalDamage}.`;
  return `The ${name} counters for ${finalDamage}.`;
}

function getAttackDamage(kind) {
  const levelBonus = Math.floor((state.level - 1) * 1.6);
  if (kind === "fire") return 5 + levelBonus + Math.floor(allies.length / 2);
  return 3 + levelBonus + Math.floor(allies.length / 3);
}

function getRandomEnemyLevel() {
  const roll = rand();
  const spread = roll < 0.58 ? 0 : roll < 0.82 ? 1 : roll < 0.94 ? 2 : 3;
  return Math.max(state.level, state.level + spread);
}

function getEnemyMaxHealth(kind, level) {
  return kind.health + (level - 1) * 7 + Math.floor(rand() * (level + 3));
}

function getEnemyPower(kind, level) {
  return kind.power + Math.floor((level - 1) * 2.2);
}

function getEnemyExperienceForLevel(kind, level) {
  return Math.max(6, Math.round(kind.health * 0.7 + kind.power + level * 5));
}

function defeatEnemy(enemy) {
  grantExperience(enemy.xp || getEnemyExperienceForLevel(enemy, enemy.level || 1));
  burst(enemy.x, enemy.y, "#ffd166", 24);
  dropFood(enemy.x, enemy.y);
  entityGroup.remove(enemy.mesh);
  const index = enemies.indexOf(enemy);
  if (index !== -1) enemies.splice(index, 1);
  if (enemies.length === 0) endGame(true);
}

function dropFood(x, y) {
  const food = {
    x: clamp(x + (rand() - 0.5) * 70, 60, WORLD.width - 60),
    y: clamp(y + (rand() - 0.5) * 70, 60, WORLD.height - 60),
    radius: 34,
    bob: rand() * Math.PI * 2,
    mesh: makeFoodMesh(),
  };
  food.mesh.position.set(food.x, 18, food.y);
  foods.push(food);
  entityGroup.add(food.mesh);
}

function makeFoodMesh() {
  const group = new THREE.Group();
  const meatMaterial = new THREE.MeshStandardMaterial({ color: 0xd05a3a, roughness: 0.58 });
  const boneMaterial = new THREE.MeshStandardMaterial({ color: 0xf7ead0, roughness: 0.38 });
  const meat = new THREE.Mesh(new THREE.SphereGeometry(15, 14, 10), meatMaterial);
  meat.scale.set(1.25, 0.82, 0.9);
  const bone = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.6, 34, 8), boneMaterial);
  bone.rotation.z = Math.PI / 2;
  const capA = new THREE.Mesh(new THREE.SphereGeometry(5, 8, 8), boneMaterial);
  capA.position.x = -20;
  const capB = capA.clone();
  capB.position.x = 20;
  group.add(bone, capA, capB, meat);
  group.traverse((child) => {
    if (child.isMesh) child.castShadow = true;
  });
  return group;
}

function makeNestMesh() {
  const group = new THREE.Group();
  const strawMaterial = new THREE.MeshStandardMaterial({ color: 0xb88445, roughness: 0.9 });
  const darkStrawMaterial = new THREE.MeshStandardMaterial({ color: 0x6f4a2b, roughness: 0.95 });
  const warmEarthMaterial = new THREE.MeshStandardMaterial({ color: 0x8f6b3a, roughness: 0.92 });
  const eggMaterial = new THREE.MeshStandardMaterial({ color: 0xe8f2da, roughness: 0.48 });

  const floor = new THREE.Mesh(new THREE.CylinderGeometry(112, 128, 10, 28), warmEarthMaterial);
  floor.position.y = 2;
  floor.receiveShadow = true;
  group.add(floor);

  for (let i = 0; i < 18; i += 1) {
    const angle = (i / 18) * Math.PI * 2;
    const length = 98 + rand() * 54;
    const twig = new THREE.Mesh(
      new THREE.CylinderGeometry(5 + rand() * 3, 7 + rand() * 4, length, 7),
      i % 2 === 0 ? strawMaterial : darkStrawMaterial
    );
    twig.position.set(Math.cos(angle) * 78, 13 + rand() * 7, Math.sin(angle) * 78);
    twig.rotation.z = Math.PI / 2 + (rand() - 0.5) * 0.35;
    twig.rotation.y = -angle + (rand() - 0.5) * 0.45;
    twig.castShadow = true;
    twig.receiveShadow = true;
    group.add(twig);
  }

  for (let i = 0; i < 3; i += 1) {
    const egg = new THREE.Mesh(new THREE.SphereGeometry(15, 14, 12), eggMaterial);
    egg.scale.set(0.82, 1.22, 0.82);
    egg.position.set(Math.cos(i * 2.1) * 24, 25, Math.sin(i * 2.1) * 18);
    egg.castShadow = true;
    group.add(egg);
  }

  return group;
}

function eatFood() {
  if (!state.running || state.food <= 0 || player.health >= player.maxHealth) return;
  state.food -= 1;
  heal(28);
  state.message = "You eat food and recover health.";
  state.messageTime = 2;
  burst(player.x, player.y, "#8ee68e", 14);
  updateHud();
}

function grantExperience(amount) {
  state.xp += amount;
  let leveled = false;
  while (state.xp >= getNextLevelXp()) {
    state.xp -= getNextLevelXp();
    state.level += 1;
    leveled = true;
  }
  if (leveled) {
    player.maxHealth = getMaxHealth();
    heal(Math.ceil(player.maxHealth * 0.45));
    state.message = `Level ${state.level}!`;
    state.messageTime = 3;
    burst(player.x, player.y, "#9fffd0", 24);
  } else {
    state.message = `Gained ${amount} XP.`;
    state.messageTime = 2;
  }
  updateHud();
}

function getEnemyExperience(enemy) {
  return Math.max(6, Math.round((enemy.maxHealth || enemy.health || 10) * 0.8 + (enemy.power || 8)));
}

function getNextLevelXp() {
  return 10 + (state.level - 1) * 8;
}

function getMaxHealth() {
  return 100 + (state.level - 1) * 15;
}

function endBattle(pushAway) {
  const enemy = state.battle?.enemy;
  if (pushAway && enemy) {
    const angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
    player.x = clamp(enemy.x + Math.cos(angle) * 260, 70, WORLD.width - 70);
    player.y = clamp(enemy.y + Math.sin(angle) * 260, 70, WORLD.height - 70);
    enemy.battleCooldown = 5;
  }
  state.battle = null;
  battlePanel.classList.add("hidden");
  updateHud();
}

function updateBattleUi() {
  if (!state.battle) return;
  const enemy = state.battle.enemy;
  const max = state.battle.enemyMaxHealth;
  battleName.textContent = `Lv ${enemy.level} ${capitalize(enemy.name)}`;
  battleHealth.textContent = `${Math.max(0, enemy.health)} / ${max}`;
  battleEnemyFill.style.width = `${clamp(enemy.health / max, 0, 1) * 100}%`;
}

function setBattleLog(text) {
  battleLog.textContent = text;
  updateBattleUi();
}

function updateBattleCamera(dt) {
  const enemy = state.battle?.enemy;
  if (!enemy) return;
  const midX = (player.x + enemy.x) * 0.5;
  const midZ = (player.y + enemy.y) * 0.5;
  const angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
  const camDistance = 470;
  camera.position.lerp(
    new THREE.Vector3(midX + Math.cos(angle + Math.PI / 2) * camDistance, 300, midZ + Math.sin(angle + Math.PI / 2) * camDistance),
    dt ? 0.1 : 1
  );
  camera.lookAt(midX, 55, midZ);
}

function updateFlames(dt) {
  for (let i = flames.length - 1; i >= 0; i -= 1) {
    const flame = flames[i];
    flame.life -= dt;
    flame.x += Math.cos(flame.angle) * flame.speed * dt;
    flame.y += Math.sin(flame.angle) * flame.speed * dt;
    flame.radius += dt * 42;
    enemies.forEach((enemy) => {
      if (distance(flame, enemy) < flame.radius + enemy.radius && enemy.hurt <= 0) {
        enemy.health -= 1;
        enemy.hurt = 0.35;
        knockEnemy(enemy, flame.angle, 86);
        flame.life = Math.min(flame.life, 0.08);
        burst(enemy.x, enemy.y, "#ffad42", 12);
      }
    });
    if (flame.life <= 0) {
      entityGroup.remove(flame.mesh);
      flames.splice(i, 1);
    }
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const p = particles[i];
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;
    p.vx *= 0.96;
    p.vy *= 0.96;
    p.vz -= 110 * dt;
    if (p.mesh) {
      p.mesh.position.set(p.x, Math.max(6, p.z), p.y);
      p.mesh.material.opacity = clamp(p.life / p.maxLife, 0, 1);
    }
    if (p.life <= 0) {
      particleGroup.remove(p.mesh);
      particles.splice(i, 1);
    }
  }
}

function updateMeshes(dt) {
  positionDragon(player, player.mesh, player.altitude + Math.sin(player.bob) * 5);
  dragons.forEach((dragon) => {
    if (!dragon.joined) positionDragon(dragon, dragon.mesh, (dragon.altitude || FLIGHT.min) + Math.sin(dragon.bob) * 6);
  });
  allies.forEach((ally, index) => positionDragon(ally, ally.mesh, (ally.altitude || FLIGHT.min) + Math.sin(ally.bob + index) * 5));
  baseDragons.forEach((dragon, index) => positionDragon(dragon, dragon.mesh, (dragon.altitude || FLIGHT.min) + Math.sin(dragon.bob + index) * 4));

  enemies.forEach((enemy) => {
    enemy.mesh.position.set(enemy.x, 27 + Math.sin(performance.now() * 0.004 + enemy.x) * 3, enemy.y);
    enemy.mesh.rotation.y = -enemy.angle;
    enemy.mesh.rotation.z = enemy.hurt > 0 ? Math.sin(performance.now() * 0.06) * 0.25 : 0;
    enemy.mesh.scale.setScalar(enemy.hurt > 0 ? 1.16 : 1);
  });

  flames.forEach((flame) => {
    flame.mesh.position.set(flame.x, flame.altitude, flame.y);
    flame.mesh.rotation.y = -flame.angle;
    flame.mesh.scale.set(flame.radius / 18, flame.radius / 18, flame.radius / 18);
    flame.mesh.material.opacity = clamp(flame.life / 0.38, 0, 1);
  });

  const wobble = state.shake * 16;
  const camBack = 560;
  const camHeight = 440 + player.altitude * 0.6;
  const lookAhead = 220;
  const targetX = player.x - Math.cos(player.angle) * camBack + (rand() - 0.5) * wobble;
  const targetZ = player.y - Math.sin(player.angle) * camBack + (rand() - 0.5) * wobble;
  camera.position.lerp(new THREE.Vector3(targetX, camHeight, targetZ), dt ? 0.08 : 1);
  camera.lookAt(player.x + Math.cos(player.angle) * lookAhead, player.altitude, player.y + Math.sin(player.angle) * lookAhead);
}

function positionDragon(entity, mesh, height) {
  mesh.position.set(entity.x, height, entity.y);
  mesh.rotation.y = -entity.angle;
  mesh.rotation.z = -clamp((entity.vy || 0) / 600, -0.32, 0.32);
  mesh.rotation.x = clamp((entity.vz || 0) / 380, -0.28, 0.28);
}

function breatheFire() {
  if (state.battle) {
    performBattleAction("fire");
    return;
  }
  if (!state.running || state.fireCooldown > 0) return;
  state.fireCooldown = 0.38;
  const count = 1 + Math.min(3, Math.floor(allies.length / 3));
  for (let i = 0; i < count; i += 1) {
    const spread = (i - (count - 1) / 2) * 0.15;
    const flame = {
      x: player.x + Math.cos(player.angle) * 54,
      y: player.y + Math.sin(player.angle) * 54,
      altitude: player.altitude + 2,
      angle: player.angle + spread,
      speed: 570,
      radius: 18,
      life: 0.38,
      mesh: null,
    };
    flame.mesh = makeFlameMesh();
    flames.push(flame);
    entityGroup.add(flame.mesh);
  }
}

function makeFlameMesh() {
  const material = new THREE.MeshStandardMaterial({
    color: 0xff8e35,
    emissive: 0xff5a1f,
    emissiveIntensity: 1.8,
    transparent: true,
    opacity: 1,
    roughness: 0.36,
  });
  const flame = new THREE.Mesh(new THREE.ConeGeometry(16, 60, 10), material);
  flame.rotation.z = -Math.PI / 2;
  return flame;
}

function heal(amount) {
  player.health = Math.min(player.maxHealth, player.health + amount);
}

function endGame(won) {
  state.running = false;
  state.battle = null;
  battlePanel.classList.add("hidden");
  overlayText.textContent = won
    ? "Your flight has cleared the wilds and the sky is yours."
    : "The world fades, but dragons are stubborn things.";
  startButton.textContent = won ? "Fly Again" : "Rise Again";
  overlay.classList.remove("hidden");
}

function updateHud() {
  healthFill.style.width = `${clamp(player.health / player.maxHealth, 0, 1) * 100}%`;
  levelCount.textContent = String(state.level);
  xpCount.textContent = String(state.xp);
  nextXpCount.textContent = String(getNextLevelXp());
  flockCount.textContent = String(allies.length);
  gemCount.textContent = String(state.gems);
  foodCount.textContent = `${state.food}/${FOOD_CARRY_MAX}`;
  eatButton.disabled = state.food <= 0 || player.health >= player.maxHealth;
  nestButton.textContent = nest ? "Heal Nest" : "Build Nest";
  nestButton.disabled = state.battle || (nest ? !isAtNest() || player.health >= player.maxHealth : player.altitude > 120);
  updateNestPanel();
}

function updateNestPanel() {
  if (!nest) {
    nestPanel.classList.add("hidden");
    rosterSignature = "";
    return;
  }

  const atNest = isAtNest();
  nestPanel.classList.remove("hidden");
  nestStatus.textContent = atNest ? "At base" : "Away";
  const signature = [
    atNest ? "near" : "far",
    state.battle ? "battle" : "free",
    `${state.food}:${state.storedFood}`,
    allies.map((ally) => ally.colors.join(":")).join("|"),
    baseDragons.map((dragon) => dragon.colors.join(":")).join("|"),
  ].join("/");
  if (signature === rosterSignature) return;
  rosterSignature = signature;
  nestRoster.replaceChildren();
  nestRoster.appendChild(makeNestFoodRow(atNest));

  allies.forEach((ally, index) => {
    nestRoster.appendChild(makeNestRosterRow(ally, `Ally ${index + 1}`, "Send Home", !atNest || state.battle, () => sendAllyHome(index)));
  });
  baseDragons.forEach((dragon, index) => {
    nestRoster.appendChild(makeNestRosterRow(dragon, `Resting ${index + 1}`, "Adventure", !atNest || state.battle, () => bringDragonOnAdventure(index)));
  });
  if (!allies.length && !baseDragons.length) {
    const empty = document.createElement("div");
    empty.className = "nest-name";
    empty.textContent = "No dragons have joined yet.";
    nestRoster.appendChild(empty);
  }
}

function makeNestFoodRow(atNest) {
  const row = document.createElement("div");
  row.className = "nest-row nest-food-row";

  const name = document.createElement("span");
  name.className = "nest-name";
  name.textContent = `Stored food: ${state.storedFood}`;

  const storeButton = document.createElement("button");
  storeButton.className = "nest-action";
  storeButton.type = "button";
  storeButton.textContent = "Store";
  storeButton.disabled = !atNest || state.battle || state.food <= 0;
  storeButton.addEventListener("click", storeFoodAtNest);

  const takeButton = document.createElement("button");
  takeButton.className = "nest-action";
  takeButton.type = "button";
  takeButton.textContent = "Take";
  takeButton.disabled = !atNest || state.battle || state.storedFood <= 0 || state.food >= FOOD_CARRY_MAX;
  takeButton.addEventListener("click", takeFoodFromNest);

  row.append(name, storeButton, takeButton);
  return row;
}

function makeNestRosterRow(dragon, label, actionLabel, disabled, action) {
  const row = document.createElement("div");
  row.className = "nest-row";

  const swatch = document.createElement("span");
  swatch.className = "nest-swatch";
  swatch.style.background = `linear-gradient(135deg, ${dragon.colors[0]}, ${dragon.colors[2]})`;

  const name = document.createElement("span");
  name.className = "nest-name";
  name.textContent = label;

  const button = document.createElement("button");
  button.className = "nest-action";
  button.type = "button";
  button.textContent = actionLabel;
  button.disabled = disabled;
  button.addEventListener("click", action);

  row.append(swatch, name, button);
  return row;
}

function render() {
  if (!renderer || !scene || !camera) return;
  renderer.render(scene, camera);
  drawMinimap();
}

function drawMinimap() {
  const w = minimap.width;
  const h = minimap.height;
  mapCtx.clearRect(0, 0, w, h);
  mapCtx.fillStyle = "#153724";
  mapCtx.fillRect(0, 0, w, h);
  mapCtx.fillStyle = "#5fd3a9";
  dot(mapCtx, (player.x / WORLD.width) * w, (player.y / WORLD.height) * h, 4);
  mapCtx.fillStyle = "#92d7ff";
  allies.forEach((a) => dot(mapCtx, (a.x / WORLD.width) * w, (a.y / WORLD.height) * h, 2.5));
  if (nest) {
    mapCtx.fillStyle = "#f4c66f";
    dot(mapCtx, (nest.x / WORLD.width) * w, (nest.y / WORLD.height) * h, 4);
  }
  mapCtx.fillStyle = "#caa0ff";
  baseDragons.forEach((d) => dot(mapCtx, (d.x / WORLD.width) * w, (d.y / WORLD.height) * h, 2.3));
  mapCtx.fillStyle = "#f3cf68";
  dragons.forEach((d) => {
    if (!d.joined) dot(mapCtx, (d.x / WORLD.width) * w, (d.y / WORLD.height) * h, 2.5);
  });
  mapCtx.fillStyle = "#ff6a6f";
  enemies.forEach((e) => dot(mapCtx, (e.x / WORLD.width) * w, (e.y / WORLD.height) * h, 2.5));
  mapCtx.fillStyle = "#ffcf6e";
  foods.forEach((f) => dot(mapCtx, (f.x / WORLD.width) * w, (f.y / WORLD.height) * h, 2.2));
}

function burst(x, y, color, count) {
  const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 });
  for (let i = 0; i < count; i += 1) {
    const angle = rand() * Math.PI * 2;
    const speed = 70 + rand() * 180;
    const life = 0.35 + rand() * 0.45;
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(4 + rand() * 3, 6, 6), material.clone());
    particleGroup.add(mesh);
    particles.push({
      x,
      y,
      z: 28 + rand() * 26,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      vz: 70 + rand() * 170,
      life,
      maxLife: life,
      mesh,
    });
  }
}

function knockEnemy(enemy, angle, amount) {
  enemy.x = clamp(enemy.x + Math.cos(angle) * amount, 46, WORLD.width - 46);
  enemy.y = clamp(enemy.y + Math.sin(angle) * amount, 46, WORLD.height - 46);
}

function resize() {
  if (!renderer || !camera) return;
  const rect = canvas.getBoundingClientRect();
  renderer.setSize(rect.width, rect.height, false);
  camera.aspect = rect.width / Math.max(1, rect.height);
  camera.updateProjectionMatrix();
  render();
}

function clearGroup(group) {
  while (group.children.length) {
    const child = group.children.pop();
    child.traverse((node) => {
      if (node.geometry) node.geometry.dispose();
      if (node.material) {
        if (Array.isArray(node.material)) node.material.forEach((material) => material.dispose());
        else node.material.dispose();
      }
    });
  }
}

function dot(context, x, y, r) {
  context.beginPath();
  context.arc(x, y, r, 0, Math.PI * 2);
  context.fill();
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function angleDelta(from, to) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function mulberry32(seed) {
  return function next() {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

window.addEventListener("resize", resize);
window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  keys.add(key);
  if (key === " " || key === "enter") {
    event.preventDefault();
    if (state.battle) performBattleAction("attack");
    else if (state.running) breatheFire();
    else startGame();
  }
  if (key === "h") eatFood();
  if (key === "n") useNest();
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.key.toLowerCase());
});

startButton.addEventListener("click", startGame);
flameButton.addEventListener("pointerdown", breatheFire);
eatButton.addEventListener("click", eatFood);
nestButton.addEventListener("click", useNest);
document.querySelectorAll<HTMLButtonElement>("[data-battle-action]").forEach((button) => {
  button.addEventListener("click", () => performBattleAction(button.dataset.battleAction));
});

document.querySelectorAll<HTMLButtonElement>("[data-dir]").forEach((button) => {
  const dir = button.dataset.dir;
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    touchDirs.add(dir);
  });
  button.addEventListener("pointerup", () => touchDirs.delete(dir));
  button.addEventListener("pointercancel", () => touchDirs.delete(dir));
  button.addEventListener("pointerleave", () => touchDirs.delete(dir));
});
