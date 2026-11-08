"use strict";

const canvas = document.querySelector("canvas");
const ctx = canvas.getContext("2d");
const stage = document.querySelector(".stage");
const cameraButton = document.querySelector("#camera");
const fullscreenButton = document.querySelector("#fullscreen");
const respawnNotice = document.querySelector("#respawn-notice");
const world = { x: 9, z: 6.5 };
const plate = { x: 4.7, z: 2.3, radius: 1.08, height: 0.23 };
const spawns = [
  { kind: "cube", x: -3.7, z: -1.1, radius: 0.95, height: 1.35, color: "#51baf5" },
  { kind: "ball", x: 0, z: -2.6, radius: 0.78, height: 1.56, color: "#ff728e" },
  { kind: "pyramid", x: 4, z: -2.4, radius: 1.03, height: 1.55, color: "#ffdf68" },
];
const player = { radius: 0.36 };
const tom = { radius: 0.48, height: 2.2, y: 0 };
const keys = new Set();
const pointers = new Map();
const controls = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowLeft", "ArrowDown", "ArrowRight", "Space"]);
let figures;
let jumpQueued;
let plateFlash;
let respawnTime;
let fallTime;
let firstPerson = false;
let cameraPitch = -0.22;
let lookPointer = null;

async function lockCameraMouse() {
  if (document.pointerLockElement === canvas) return;
  try {
    await canvas.requestPointerLock?.();
  } catch {
    // Mouse movement over the canvas still works if locking is unavailable.
  }
}

canvas.addEventListener("click", event => {
  if (firstPerson && event.pointerType === "mouse") lockCameraMouse();
});

document.addEventListener("pointerlockchange", () => {
  if (!firstPerson && document.pointerLockElement === canvas) document.exitPointerLock();
});

function turnCamera(dx, dy) {
  if (!firstPerson || fallTime > 0) return;
  player.yaw -= dx * 0.003;
  cameraPitch = clamp(cameraPitch - dy * 0.003, -1.4, 1.4);
}

canvas.addEventListener("pointerdown", event => {
  if (!firstPerson || event.pointerType === "mouse" || lookPointer) return;
  canvas.setPointerCapture(event.pointerId);
  lookPointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
});
canvas.addEventListener("pointermove", event => {
  if (event.pointerType === "mouse") {
    turnCamera(event.movementX, event.movementY);
  } else if (lookPointer?.id === event.pointerId) {
    turnCamera(event.clientX - lookPointer.x, event.clientY - lookPointer.y);
    lookPointer.x = event.clientX;
    lookPointer.y = event.clientY;
  }
});
for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
  canvas.addEventListener(type, event => {
    if (lookPointer?.id === event.pointerId) lookPointer = null;
  });
}

function toggleCamera(useMouse) {
  firstPerson = !firstPerson;
  lookPointer = null;
  cameraButton.setAttribute("aria-pressed", firstPerson);
  cameraButton.textContent = firstPerson ? "Вид: от лица" : "Вид: сверху";
  if (firstPerson) {
    cameraPitch = -0.22;
    if (useMouse) lockCameraMouse();
  } else if (document.pointerLockElement === canvas) {
    document.exitPointerLock();
  }
}
cameraButton.addEventListener("click", () => toggleCamera(false));

function syncFullscreen() {
  const expanded = document.fullscreenElement === stage || stage.classList.contains("is-expanded");
  const label = expanded ? "Выйти из полноэкранного режима" : "На весь экран";
  fullscreenButton.setAttribute("aria-pressed", expanded);
  fullscreenButton.setAttribute("aria-label", label);
  fullscreenButton.title = label;
  fullscreenButton.textContent = expanded ? "↙" : "⛶";
  clearControls();
}

function expandInWindow(expanded) {
  stage.classList.toggle("is-expanded", expanded);
  document.body.classList.toggle("game-expanded", expanded);
  syncFullscreen();
}

fullscreenButton.addEventListener("click", async () => {
  if (stage.classList.contains("is-expanded")) {
    expandInWindow(false);
  } else if (document.fullscreenElement === stage) {
    await document.exitFullscreen().catch(() => {});
  } else {
    try {
      if (document.fullscreenEnabled && stage.requestFullscreen) {
        await stage.requestFullscreen();
        return;
      }
    } catch {
      // Use the visible browser viewport when native fullscreen is blocked.
    }
    expandInWindow(true);
  }
});
document.addEventListener("fullscreenchange", syncFullscreen);

function spawnJerry() {
  Object.assign(player, { x: -1.8, z: 3.1, y: 0, vy: 0, yaw: 0.4, stride: 0, walking: false, bouncing: false });
  jumpQueued = false;
  fallTime = 0;
}

function respawnJerry(message) {
  spawnJerry();
  respawnTime = 1.25;
  respawnNotice.textContent = message;
}

function reset() {
  spawnJerry();
  Object.assign(tom, { x: -6.2, z: -3.8, y: 0, vy: 0, yaw: 0.4, stride: 0, walking: false });
  figures = spawns.map(figure => ({ ...figure, y: 0, vx: 0, vy: 0, vz: 0, roll: 0, rollAxis: 0 }));
  respawnTime = 0;
  respawnNotice.textContent = "";
  plateFlash = 0;
}

function pressed(...codes) {
  return codes.some(code => keys.has(code) || [...pointers.values()].includes(code));
}

function clearControls() {
  keys.clear();
  pointers.clear();
  lookPointer = null;
  jumpQueued = false;
}

window.addEventListener("keydown", event => {
  if (event.code === "Escape" && stage.classList.contains("is-expanded")) {
    expandInWindow(false);
    return;
  }
  if (event.code === "KeyC" && !event.altKey && !event.ctrlKey && !event.metaKey) {
    if (event.repeat) return;
    toggleCamera(true);
    return;
  }
  if (!controls.has(event.code) || event.altKey || event.ctrlKey || event.metaKey ||
      (event.code === "Space" && event.target instanceof HTMLButtonElement)) return;
  event.preventDefault();
  if (event.code === "Space" && !event.repeat) jumpQueued = true;
  keys.add(event.code);
});
window.addEventListener("keyup", event => keys.delete(event.code));
window.addEventListener("blur", clearControls);
document.addEventListener("visibilitychange", clearControls);
document.querySelector("#reset").addEventListener("click", event => {
  clearControls();
  reset();
  event.currentTarget.blur();
});
document.querySelectorAll("[data-key]").forEach(button => {
  button.addEventListener("pointerdown", event => {
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, button.dataset.key);
    if (button.dataset.key === "Space") jumpQueued = true;
  });
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
    button.addEventListener(type, event => pointers.delete(event.pointerId));
  }
});

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const overlaps = (x, z, radius, other) => Math.hypot(x - other.x, z - other.z) < radius + other.radius;

function inside(x, z, radius) {
  return Math.abs(x) <= world.x - radius && Math.abs(z) <= world.z - radius;
}

function touchesPlate(figure) {
  const dx = Math.abs(figure.x - plate.x);
  const dz = Math.abs(figure.z - plate.z);
  if (figure.kind === "ball") {
    const height = clamp(figure.y + figure.radius - plate.height, 0, figure.radius);
    const reach = Math.sqrt(figure.radius ** 2 - height ** 2);
    return Math.hypot(dx, dz) < plate.radius + reach;
  }
  if (figure.kind === "cube") {
    const half = figure.height / 2;
    return Math.hypot(Math.max(0, dx - half), Math.max(0, dz - half)) < plate.radius;
  }
  // Closest point on the pyramid's diamond-shaped footprint.
  const edgeX = clamp((figure.radius + dx - dz) / 2, 0, figure.radius);
  return dx + dz <= figure.radius ||
    Math.hypot(dx - edgeX, dz - (figure.radius - edgeX)) < plate.radius;
}

function moveFigure(figure, dx, dz) {
  const x = figure.x + dx;
  const z = figure.z + dz;
  if (!inside(x, z, figure.radius) ||
      figures.some(other => other !== figure && overlaps(x, z, figure.radius, other)) ||
      (player.y < figure.y + figure.height && overlaps(x, z, figure.radius, player))) return false;
  figure.x = x;
  figure.z = z;
  if (figure.kind === "ball" && figure.y === 0) {
    const axis = Math.atan2(dz, dx);
    if (Math.abs(Math.atan2(Math.sin(axis - figure.rollAxis), Math.cos(axis - figure.rollAxis))) > 0.05) {
      figure.rollAxis = axis;
    }
    figure.roll += Math.hypot(dx, dz) / figure.radius;
  }
  return true;
}

function chaseJerry(dt) {
  tom.walking = false;
  const dx = player.x - tom.x;
  const dz = player.z - tom.z;
  const distance = Math.hypot(dx, dz);
  const stride = Math.min(4.2 * dt, distance - tom.radius - player.radius);
  if (player.bouncing || stride <= 0) return;

  const heading = Math.atan2(dx, dz);
  for (const turn of [0, 0.75, -0.75, 1.45, -1.45]) {
    const angle = heading + turn;
    const x = tom.x + Math.sin(angle) * stride;
    const z = tom.z + Math.cos(angle) * stride;
    if (!inside(x, z, tom.radius) || figures.some(figure => figure.y < tom.y + tom.height &&
        figure.y + figure.height > tom.y &&
        overlaps(x, z, tom.radius, figure) &&
        Math.hypot(x - figure.x, z - figure.z) <= Math.hypot(tom.x - figure.x, tom.z - figure.z))) continue;
    Object.assign(tom, { x, z, yaw: angle, walking: true });
    tom.stride += dt * 16;
    break;
  }
}

function bounceCharacter(character, nextY) {
  if (character.vy > 0 || nextY > plate.height ||
      !overlaps(character.x, character.z, character.radius, plate)) return false;
  character.y = plate.height;
  character.vy = 9.3;
  plateFlash = 0.27;
  return true;
}

function updateTom(dt) {
  const nextY = tom.y + tom.vy * dt;
  if (bounceCharacter(tom, nextY)) return;
  tom.y = Math.max(0, nextY);
  tom.vy = nextY <= 0 && tom.vy <= 0 ? 0 : tom.vy - 18 * dt;
}

function update(dt) {
  plateFlash = Math.max(0, plateFlash - dt);
  const turn = Number(pressed("ArrowLeft")) - Number(pressed("ArrowRight"));
  if (firstPerson && fallTime === 0) player.yaw += turn * 2.5 * dt;
  const strafe = Number(pressed("KeyD")) - Number(pressed("KeyA"));
  const horizontal = firstPerson ? strafe :
    Number(pressed("KeyD", "ArrowRight")) - Number(pressed("KeyA", "ArrowLeft"));
  const vertical = Number(pressed("KeyS", "ArrowDown")) - Number(pressed("KeyW", "ArrowUp"));
  const length = Math.hypot(horizontal, vertical);
  player.walking = false;
  if (length && fallTime === 0) {
    const side = firstPerson ? [-Math.cos(player.yaw), 0, Math.sin(player.yaw)] : right;
    const back = firstPerson ? [-Math.sin(player.yaw), 0, -Math.cos(player.yaw)] : view;
    const dx = (horizontal * side[0] + vertical * back[0]) / length * 5.6 * dt;
    const dz = (horizontal * side[2] + vertical * back[2]) / length * 5.6 * dt;
    const x = player.x + dx;
    const z = player.z + dz;
    if (!firstPerson) player.yaw = Math.atan2(dx, dz);
    for (const figure of figures) {
      if (player.y < figure.y + figure.height && overlaps(x, z, player.radius, figure) && moveFigure(figure, dx, dz)) {
        figure.vx = dx / dt * 0.65;
        figure.vz = dz / dt * 0.65;
      }
    }
    if (!figures.some(figure => player.y < figure.y + figure.height && overlaps(x, z, player.radius, figure) &&
        Math.hypot(x - figure.x, z - figure.z) <= Math.hypot(player.x - figure.x, player.z - figure.z))) {
      player.walking = x !== player.x || z !== player.z;
      player.x = x;
      player.z = z;
    }
    if (player.walking) player.stride += dt * 14;
  }

  for (const figure of figures) {
    if (Math.hypot(figure.vx, figure.vz) < 0.02 ||
        !moveFigure(figure, figure.vx * dt, figure.vz * dt)) {
      figure.vx = 0;
      figure.vz = 0;
    }
    const nextY = figure.y + figure.vy * dt;
    if (figure.vy <= 0 && nextY <= plate.height && touchesPlate(figure)) {
      figure.y = plate.height;
      figure.vy = 9.3;
      plateFlash = 0.27;
    } else if (nextY <= 0 && figure.vy <= 0) {
      figure.y = 0;
      figure.vy = 0;
      const friction = Math.exp(-6 * dt);
      figure.vx *= friction;
      figure.vz *= friction;
    } else {
      figure.y = nextY;
      figure.vy -= 18 * dt;
    }
  }

  if (fallTime === 0 && !inside(player.x, player.z, 0)) {
    fallTime = 1;
  }
  if (fallTime > 0) {
    jumpQueued = false;
    tom.walking = false;
    updateTom(dt);
    player.y += player.vy * dt;
    player.vy -= 18 * dt;
    fallTime -= dt;
    if (fallTime <= 1e-9) {
      respawnJerry("Джерри упал и снова на старте.");
    }
    return;
  }

  const floor = figures.reduce((level, figure) => {
    const top = figure.y + figure.height;
    if (player.y < top || !overlaps(player.x, player.z, player.radius, figure)) return level;
    return Math.max(level, top);
  }, 0);
  if (jumpQueued && player.y === floor && player.vy === 0) player.vy = 6.4;
  jumpQueued = false;
  const nextY = player.y + player.vy * dt;
  if (bounceCharacter(player, nextY)) {
    player.bouncing = true;
  } else if (nextY <= floor && player.vy <= 0) {
    player.y = floor;
    player.vy = 0;
    player.bouncing = false;
  } else {
    player.y = nextY;
    player.vy -= 18 * dt;
  }
  chaseJerry(dt);
  updateTom(dt);
  if (respawnTime > 0) {
    respawnTime = Math.max(0, respawnTime - dt);
    if (respawnTime === 0) respawnNotice.textContent = "";
  } else if (player.y < tom.y + tom.height && tom.y < player.y + 1.6 &&
      Math.hypot(player.x - tom.x, player.z - tom.z) <= player.radius + tom.radius + 0.001) {
    respawnJerry("Том поймал Джерри! Джерри снова на старте.");
  }
}

// Camera basis for projecting the 3D scene onto the canvas.
const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
const subtract = (a, b) => a.map((value, i) => value - b[i]);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = vector => {
  const length = Math.hypot(...vector);
  return vector.map(value => value / length);
};
const overviewEye = [6.5, 16, 20];
const overviewForward = unit(subtract([0, 0, 0], overviewEye));
const view = unit([overviewEye[0], 0, overviewEye[2]]);
const right = [view[2], 0, -view[0]];
let eye, forward, cameraRight, up;
const light = unit([-0.5, 1, 0.6]);
const faces = [];
let width;
let height;
let focal;

function projectPolygon(points) {
  const cameraPoints = points.map(point => {
    const relative = subtract(point, eye);
    return [dot(relative, cameraRight), dot(relative, up), dot(relative, forward)];
  });
  const clipped = [];
  const near = 0.08;
  let previous = cameraPoints[cameraPoints.length - 1];
  for (const current of cameraPoints) {
    if ((current[2] >= near) !== (previous[2] >= near)) {
      const t = (near - previous[2]) / (current[2] - previous[2]);
      clipped.push([previous[0] + (current[0] - previous[0]) * t,
        previous[1] + (current[1] - previous[1]) * t, near]);
    }
    if (current[2] >= near) clipped.push(current);
    previous = current;
  }
  return clipped.map(([x, y, depth]) => [
    width / 2 + x * focal / depth, height * 0.48 - y * focal / depth, depth,
  ]);
}

function polygon(points, fill) {
  if (points.length < 3) return;
  ctx.beginPath();
  points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function shaded(color, amount) {
  const rgb = Number.parseInt(color.slice(1), 16);
  return `rgb(${((rgb >> 16) & 255) * amount}, ${((rgb >> 8) & 255) * amount}, ${(rgb & 255) * amount})`;
}

function face(points, center, color) {
  let normal = unit(cross(subtract(points[1], points[0]), subtract(points[2], points[0])));
  if (dot(normal, subtract(points[0], center)) < 0) normal = normal.map(value => -value);
  if (dot(normal, subtract(eye, points[0])) <= 0) return;
  const projected = projectPolygon(points);
  if (projected.length < 3) return;
  faces.push({
    points: projected,
    depth: projected.reduce((sum, point) => sum + point[2], 0) / projected.length,
    color: shaded(color, 0.66 + Math.max(0, dot(normal, light)) * 0.34),
  });
}

const boxSides = [[0, 1, 2, 3], [4, 7, 6, 5], [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0]];

function box(x, y, z, w, h, d, color, transform = point => point) {
  const vertices = [
    [x, y, z], [x + w, y, z], [x + w, y, z + d], [x, y, z + d],
    [x, y + h, z], [x + w, y + h, z], [x + w, y + h, z + d], [x, y + h, z + d],
  ].map(transform);
  const center = transform([x + w / 2, y + h / 2, z + d / 2]);
  for (const side of boxSides) face(side.map(index => vertices[index]), center, color);
}

function ring(x, y, z, radius, count = 32, depth = radius) {
  return Array.from({ length: count }, (_, i) => {
    const angle = i / count * Math.PI * 2;
    return [x + Math.cos(angle) * radius, y, z + Math.sin(angle) * depth];
  });
}

function cylinder(x, y, z, radius, h, topColor, sideColor) {
  const bottom = ring(x, y, z, radius);
  const top = ring(x, y + h, z, radius);
  const center = [x, y + h / 2, z];
  face(top, center, topColor);
  for (let i = 0; i < top.length; i++) {
    const next = (i + 1) % top.length;
    face([bottom[i], bottom[next], top[next], top[i]], center, sideColor);
  }
}

function sphere(figure) {
  const { x, y, z, radius, roll, rollAxis, color } = figure;
  const slices = 16;
  const bands = 10;
  const alongX = Math.cos(rollAxis);
  const alongZ = Math.sin(rollAxis);
  const rings = Array.from({ length: bands + 1 }, (_, row) => {
    const angle = row / bands * Math.PI;
    return ring(0, Math.cos(angle) * radius, 0, Math.sin(angle) * radius, slices).map(([px, py, pz]) => {
      const along = px * alongX + pz * alongZ;
      const shift = along * (Math.cos(roll) - 1) + py * Math.sin(roll);
      return [x + px + alongX * shift, y + radius + py * Math.cos(roll) - along * Math.sin(roll), z + pz + alongZ * shift];
    });
  });
  for (let row = 0; row < bands; row++) {
    for (let i = 0; i < slices; i++) {
      const next = (i + 1) % slices;
      const points = [rings[row][i], rings[row + 1][i], rings[row + 1][next], rings[row][next]];
      if (row === 0) points.pop();
      if (row === bands - 1) points.splice(2, 1);
      face(points, [x, y + radius, z], i % 4 === 0 ? "#ffc4ce" : color);
    }
  }
}

function drawFigure(figure) {
  const { kind, x, y, z, height: h, color } = figure;
  if (kind === "cube") {
    box(x - h / 2, y, z - h / 2, h, h, h, color);
  } else if (kind === "ball") {
    sphere(figure);
  } else {
    const base = ring(x, y, z, figure.radius, 4);
    base.forEach((point, i) => face([point, base[(i + 1) % 4], [x, y + h, z]], [x, y + h / 4, z], color));
  }
}

const animalMesh = [];
const animalSlices = 8;
const animalRings = Array.from({ length: 5 }, (_, row) => {
  const angle = row * Math.PI / 4;
  return ring(0, Math.cos(angle), 0, Math.sin(angle), animalSlices);
});
for (let row = 0; row < 4; row++) {
  for (let i = 0; i < animalSlices; i++) {
    const next = (i + 1) % animalSlices;
    const quad = [animalRings[row][i], animalRings[row + 1][i],
      animalRings[row + 1][next], animalRings[row][next]];
    if (row === 0) quad.pop();
    if (row === 3) quad.splice(2, 1);
    animalMesh.push(quad);
  }
}

function drawAnimal(animal, cat) {
  const { x, y, z, yaw, walking, stride } = animal;
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  const scale = cat ? 1.36 : 1;
  const rotate = ([px, py, pz]) => [
    x + (px * cos + pz * sin) * scale,
    y + py * scale,
    z + (-px * sin + pz * cos) * scale,
  ];
  const oval = (px, py, pz, rx, ry, rz, color) => {
    const center = rotate([px, py, pz]);
    for (const side of animalMesh) {
      const points = side.map(([vx, vy, vz]) => rotate([px + vx * rx, py + vy * ry, pz + vz * rz]));
      face(points, center, color);
    }
  };

  const fur = cat ? "#617f9c" : "#a85a32";
  const belly = cat ? "#f0eee4" : "#f4be7e";
  const tail = cat ? fur : "#c07859";
  const swing = walking && y === 0 ? Math.sin(stride) * 0.17 : 0;
  oval(0, 0.48, 0, 0.27, 0.42, 0.23, fur);
  oval(0, 0.49, 0.15, 0.19, 0.28, 0.12, belly);
  oval(0, 0.26, -0.35, 0.05, 0.05, 0.24, tail);
  oval(0.04, 0.30, -0.57, 0.06, 0.075, 0.13, tail);
  oval(0.08, 0.39, -0.64, 0.05, 0.11, 0.06, tail);
  oval(0, 1.03, 0.035, 0.34, 0.34, 0.28, fur);

  for (const side of [-1, 1]) {
    const step = swing * side;
    oval(side * 0.15, 0.09 + Math.max(0, step), 0.08 + step, 0.12, 0.09, 0.20, cat ? belly : fur);
    oval(side * 0.29, 0.52, -step, 0.10, 0.20, 0.09, fur);
    oval(side * 0.31, 0.36, -step, 0.09, 0.09, 0.09, cat ? belly : fur);
    oval(side * 0.105, 0.95, 0.26, 0.17, 0.125, 0.13, belly);
    oval(side * 0.105, 1.12, 0.275, 0.085, 0.115, 0.065, cat ? "#f5df76" : "#fff6de");
    oval(side * 0.093, 1.12, 0.331, 0.036, 0.067, 0.027, "#26202a");
    if (cat) {
      box(side < 0 ? -0.36 : 0.19, 0.95, 0.32, 0.17, 0.016, 0.018, "#302533", rotate);
      box(side < 0 ? -0.33 : 0.19, 0.90, 0.32, 0.14, 0.016, 0.018, "#302533", rotate);
      const tip = [side * 0.30, 1.70, 0.015];
      const left = [side * 0.08, 1.24, 0.12];
      const right = [side * 0.33, 1.24, 0.12];
      const back = [side * 0.23, 1.24, -0.17];
      const center = rotate([side * 0.23, 1.36, 0]);
      face([left, right, tip].map(rotate), center, "#e69ba7");
      face([left, tip, back].map(rotate), center, fur);
      face([right, back, tip].map(rotate), center, fur);
    } else {
      oval(side * 0.32, 1.30, 0, 0.26, 0.28, 0.095, fur);
      oval(side * 0.34, 1.32, 0.074, 0.19, 0.21, 0.043, "#f3a398");
    }
  }
  oval(0, 1.01, 0.39, 0.085, 0.054, 0.063, "#302533");
}

function ground() {
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, "#9dd9ec");
  sky.addColorStop(1, "#e5f7d0");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  if (!firstPerson && fallTime > 0 && player.y < 0) {
    drawAnimal(player, false);
    paintFaces();
  }
  box(-world.x, -0.62, -world.z, world.x * 2, 0.62, world.z * 2, "#559e46");
  faces.forEach(item => polygon(item.points, item.color));
  faces.length = 0;

  for (let x = -world.x; x < world.x; x += 1.5) {
    for (let z = -world.z; z < world.z; z += 1.3) {
      const nextX = x + 1.5;
      const nextZ = Math.min(world.z, z + 1.3);
      const tile = [[x, 0, z], [nextX, 0, z], [nextX, 0, nextZ], [x, 0, nextZ]];
      const alternate = (Math.round((x + world.x) / 1.5) + Math.round((z + world.z) / 1.3)) % 2;
      polygon(projectPolygon(tile), alternate ? "#80bc53" : "#87c35a");
    }
  }

  const shadowCasters = fallTime > 0 ? [...figures, plate, tom] : [...figures, plate, tom, player];
  for (const object of shadowCasters) {
    const radius = object.radius + 0.12;
    polygon(projectPolygon(ring(object.x + 0.15, 0, object.z - 0.10, radius, 24, radius * 0.75)), "#18352038");
  }
}

function paintFaces() {
  faces.sort((a, b) => b.depth - a.depth);
  faces.forEach(item => polygon(item.points, item.color));
  faces.length = 0;
}

function draw() {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const pixelWidth = Math.round(canvas.clientWidth * ratio);
  const pixelHeight = Math.round(canvas.clientHeight * ratio);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  width = pixelWidth / ratio;
  height = pixelHeight / ratio;
  if (!width || !height) return;
  eye = firstPerson ? [player.x, player.y + 1.15, player.z] : overviewEye;
  forward = firstPerson ? [
    Math.sin(player.yaw) * Math.cos(cameraPitch),
    Math.sin(cameraPitch),
    Math.cos(player.yaw) * Math.cos(cameraPitch),
  ] : overviewForward;
  cameraRight = firstPerson ? [-Math.cos(player.yaw), 0, Math.sin(player.yaw)] : right;
  up = cross(cameraRight, forward);
  focal = firstPerson ? Math.max(width, height) * 0.62 : Math.min(width * 1.13, height * 1.42);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ground();
  cylinder(plate.x, 0, plate.z, plate.radius + 0.12, 0.12, "#504850", "#3c3944");
  cylinder(plate.x, 0.12, plate.z, plate.radius, plate.height - 0.12, plateFlash ? "#fff192" : "#ff9d38", "#e6682f");
  const arrow = [[-0.30, 0.07], [0, -0.31], [0.30, 0.07], [0.16, 0.18], [0, -0.02], [-0.16, 0.18]];
  const marker = arrow.map(([x, z]) => [plate.x + right[0] * x + view[0] * z, plate.height + 0.005, plate.z + right[2] * x + view[2] * z]);
  const projectedMarker = projectPolygon(marker);
  if (projectedMarker.length >= 3) {
    const depth = projectedMarker.reduce((sum, point) => sum + point[2], 0) / projectedMarker.length;
    faces.push({ points: projectedMarker, depth: depth - 0.01, color: "#fff5da" });
  }
  figures.forEach(drawFigure);
  if (!firstPerson && (fallTime === 0 || player.y >= 0)) drawAnimal(player, false);
  drawAnimal(tom, true);
  paintFaces();
}

reset();
const step = 1 / 120;
let lastTime = 0;
let lag = 0;
function frame(time) {
  if (lastTime) lag += Math.min((time - lastTime) / 1000, 0.05);
  lastTime = time;
  while (lag >= step) {
    update(step);
    lag -= step;
  }
  draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
