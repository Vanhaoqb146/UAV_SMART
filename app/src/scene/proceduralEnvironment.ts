import * as THREE from "three";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { ObstacleSpec } from "../types/domain";
import { buildObstacleMeshGroup } from "./fieldObstacleBuilder";
import {
  PHOTOGRAMMETRY_GRID_SIZE,
  PHOTOGRAMMETRY_HEIGHTS,
  PHOTOGRAMMETRY_LENGTH_M,
  PHOTOGRAMMETRY_WIDTH_M,
  PHOTOGRAMMETRY_PARK_OFFSET_X,
  PHOTOGRAMMETRY_PARK_OFFSET_Z,
} from "./photogrammetryData";
import { buildLandmark81DigitalTwin } from "./urbanDigitalTwinBuilder";

export type MapPreset =
  | "landmark81"
  | "google3d"
  | "airbase"
  | "urban"
  | "forest"
  | "tactical"
  | "photogrammetry"
  | "bellus";

export interface EnvironmentBuildResult {
  envGroup: THREE.Group;
  radarDish: THREE.Object3D | null;
  windsockPivot: THREE.Group;
  windsockCone: THREE.Mesh;
  beaconMeshes: THREE.Mesh[];
}

/**
 * Generates a photorealistic asphalt tarmac & runway texture set with aggregate grain,
 * bitumen expansion joints, painted ICAO markings, and rubber tire skid marks.
 */
export function createTarmacTexture(isTactical: boolean): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext("2d")!;

  // 1. Base aged asphalt bitumen
  ctx.fillStyle = isTactical ? "#0c1524" : "#242a35";
  ctx.fillRect(0, 0, 1024, 1024);

  // 2. Multi-octave mineral aggregate grain (sand, limestone chips, basalt gravel)
  for (let i = 0; i < 18000; i++) {
    const x = Math.random() * 1024;
    const y = Math.random() * 1024;
    const size = Math.random() < 0.85 ? 1.5 : 2.5;
    const v = isTactical
      ? 18 + Math.floor(Math.random() * 26)
      : 42 + Math.floor(Math.random() * 40);
    ctx.fillStyle = `rgb(${v}, ${v + 2}, ${v + 6})`;
    ctx.fillRect(x, y, size, size);
  }

  // 3. Bitumen expansion joint seams (concrete slab grid)
  ctx.strokeStyle = isTactical ? "rgba(30, 58, 95, 0.45)" : "rgba(15, 23, 42, 0.55)";
  ctx.lineWidth = 3;
  const step = 128;
  for (let p = 0; p <= 1024; p += step) {
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, 1024);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(1024, p);
    ctx.stroke();
  }

  // 4. Aircraft touchdown tire skid marks (rubbed rubber burns)
  ctx.fillStyle = isTactical ? "rgba(2, 6, 23, 0.35)" : "rgba(10, 15, 25, 0.38)";
  for (let s = 0; s < 12; s++) {
    const sy = 400 + Math.random() * 224;
    const sx = 180 + Math.random() * 200;
    const sw = 160 + Math.random() * 320;
    ctx.fillRect(sx, sy, sw, 8 + Math.random() * 14);
  }

  // 5. ICAO Runway border lines (Taxiway yellow safety sidelines)
  ctx.strokeStyle = isTactical ? "#06b6d4" : "#eab308";
  ctx.lineWidth = 9;
  ctx.strokeRect(44, 44, 936, 936);

  // 6. White dashed runway centerlines along X and Z
  ctx.strokeStyle = isTactical ? "rgba(56, 189, 248, 0.85)" : "rgba(248, 250, 252, 0.92)";
  ctx.lineWidth = 7;
  ctx.setLineDash([48, 32]);
  ctx.beginPath();
  ctx.moveTo(70, 512);
  ctx.lineTo(954, 512);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(512, 70);
  ctx.lineTo(512, 954);
  ctx.stroke();
  ctx.setLineDash([]);

  // 7. Outer helipad safety circle
  ctx.strokeStyle = isTactical ? "#10b981" : "#f59e0b";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(512, 512, 175, 0, Math.PI * 2);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 8;
  return tex;
}

/**
 * Generates an organic PBR terrain ground texture with natural color gradients,
 * soil patches, and surface micro-variations.
 */
export function createTerrainTexture(preset: MapPreset): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext("2d")!;

  // 1. Organic base wash
  if (preset === "tactical") {
    ctx.fillStyle = "#070d18";
  } else if (preset === "urban") {
    ctx.fillStyle = "#1e293b";
  } else if (preset === "forest") {
    ctx.fillStyle = "#183321"; // Deep damp woodland floor
  } else {
    ctx.fillStyle = "#254734"; // Airfield turf grass
  }
  ctx.fillRect(0, 0, 1024, 1024);

  // 2. Large organic soil and moisture patches
  for (let p = 0; p < 24; p++) {
    const rx = Math.random() * 1024;
    const ry = Math.random() * 1024;
    const rad = 60 + Math.random() * 140;
    const grad = ctx.createRadialGradient(rx, ry, rad * 0.1, rx, ry, rad);
    if (preset === "forest") {
      grad.addColorStop(0, "rgba(43, 29, 14, 0.45)"); // Peat moss / earth
      grad.addColorStop(1, "rgba(24, 51, 33, 0)");
    } else if (preset === "airbase") {
      grad.addColorStop(0, "rgba(54, 83, 44, 0.4)"); // Meadow patch
      grad.addColorStop(1, "rgba(37, 71, 52, 0)");
    } else if (preset === "urban") {
      grad.addColorStop(0, "rgba(15, 23, 42, 0.5)");
      grad.addColorStop(1, "rgba(30, 41, 59, 0)");
    } else {
      grad.addColorStop(0, "rgba(14, 165, 233, 0.08)");
      grad.addColorStop(1, "transparent");
    }
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(rx, ry, rad, 0, Math.PI * 2);
    ctx.fill();
  }

  // 3. Dense blade/pebble texture micro-noise
  for (let i = 0; i < 28000; i++) {
    const x = Math.random() * 1024;
    const y = Math.random() * 1024;
    if (preset === "forest") {
      const g = 38 + Math.floor(Math.random() * 45);
      const r = 24 + Math.floor(Math.random() * 28);
      ctx.fillStyle = `rgb(${r}, ${g}, 22)`;
    } else if (preset === "airbase") {
      const g = 62 + Math.floor(Math.random() * 48);
      const r = 32 + Math.floor(Math.random() * 26);
      ctx.fillStyle = `rgb(${r}, ${g}, 35)`;
    } else if (preset === "urban") {
      const v = 28 + Math.floor(Math.random() * 25);
      ctx.fillStyle = `rgb(${v}, ${v + 4}, ${v + 10})`;
    } else {
      ctx.fillStyle = "rgba(14, 165, 233, 0.12)";
    }
    ctx.fillRect(x, y, 2.5, 2.5);
  }

  // 4. Subtle military geodesic survey coordinates
  if (preset === "tactical") {
    ctx.strokeStyle = "rgba(14, 165, 233, 0.22)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(0, 0, 1024, 1024);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(16, 16);
  tex.anisotropy = 4;
  return tex;
}

/**
 * Generates an architectural curtain-wall glass facade texture for modern high-rises.
 * Features tinted double-glazing panes, metallic floor spandrels, and warm interior lighting.
 */
export function createBuildingFacadeTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 1024;
  const ctx = canvas.getContext("2d")!;

  // Dark structural concrete core
  ctx.fillStyle = "#0f172a";
  ctx.fillRect(0, 0, 512, 1024);

  const cols = 8;
  const rows = 20;
  const padX = 6;
  const padY = 8;
  const w = (512 - padX * (cols + 1)) / cols;
  const h = (1024 - padY * (rows + 1)) / rows;

  for (let r = 0; r < rows; r++) {
    // Horizontal floor spandrel band (structural concrete / composite aluminum panel)
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(0, r * (h + padY), 512, padY);

    for (let c = 0; c < cols; c++) {
      const px = padX + c * (w + padX);
      const py = padY + r * (h + padY);

      // Tinted architectural glass pane
      const isLit = (r * 11 + c * 7 + (r % 3)) % 6 === 0;
      const isLateNight = (r * 5 + c * 3) % 9 === 0;

      if (isLit) {
        // Warm interior office lights
        ctx.fillStyle = "#fef08a";
      } else if (isLateNight) {
        // Cool blue server/security room glow
        ctx.fillStyle = "#38bdf8";
      } else {
        // Dark reflective exterior glass pane (catches sky reflection in Three.js)
        ctx.fillStyle = "#091322";
      }
      ctx.fillRect(px, py, w, h);

      // Aluminum window frame bevel
      ctx.strokeStyle = "#334155";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(px, py, w, h);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

/**
 * Generates a diagonal Yellow/Black industrial hazard texture for obstacle pillars.
 */
export function createHazardPillarTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#eab308";
  ctx.fillRect(0, 0, 256, 256);

  ctx.fillStyle = "#111827";
  for (let i = -256; i < 512; i += 64) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 32, 0);
    ctx.lineTo(i + 32 + 256, 256);
    ctx.lineTo(i + 256, 256);
    ctx.closePath();
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 3);
  return tex;
}

/**
 * Builds surrounding realistic 3D mountain ridgelines, terrain grounds,
 * and preset-specific infrastructure (Hangars, Radar, Sky Towers, Forest Streams).
 */
export function buildWorldEnvironment(preset: MapPreset): EnvironmentBuildResult {
  const envGroup = new THREE.Group();
  const beaconMeshes: THREE.Mesh[] = [];
  let radarDish: THREE.Object3D | null = null;

  // 1. Outer Terrain Ground (160m x 160m) - for non-photogrammetry presets
  if (
    preset !== "photogrammetry" &&
    preset !== "bellus" &&
    preset !== "landmark81" &&
    preset !== "google3d"
  ) {
    const outerGeo = new THREE.PlaneGeometry(160, 160, 32, 32);
    const outerMat = new THREE.MeshStandardMaterial({
      map: createTerrainTexture(preset),
      roughness: 0.88,
      metalness: 0.04,
    });
    const outerGround = new THREE.Mesh(outerGeo, outerMat);
    outerGround.rotation.x = -Math.PI / 2;
    outerGround.position.y = -0.015;
    outerGround.receiveShadow = true;
    envGroup.add(outerGround);
  }

  // 2. Central Flight Surface: Digital Twin, Google 3D, Photogrammetry, Forest Trail, or Airport Apron
  if (preset === "landmark81") {
    envGroup.add(buildLandmark81DigitalTwin(beaconMeshes));
  } else if (preset === "google3d") {
    // Google Photorealistic 3D Tiles & Real Satellite Ortho are mounted via google3DTilesLoader in FlightScene3D
  } else if (preset === "photogrammetry") {
    // 2A. Real-World Drone Photogrammetry 3D Terrain Surface (OpenDroneMap DSM + Orthophoto)
    const pGrid = PHOTOGRAMMETRY_GRID_SIZE;
    const pGeo = new THREE.PlaneGeometry(
      PHOTOGRAMMETRY_WIDTH_M,
      PHOTOGRAMMETRY_LENGTH_M,
      pGrid - 1,
      pGrid - 1
    );
    pGeo.rotateX(-Math.PI / 2);

    const posArr = pGeo.attributes.position.array as Float32Array;
    for (let r = 0; r < pGrid; r++) {
      for (let c = 0; c < pGrid; c++) {
        const idx = (r * pGrid + c) * 3;
        const h = PHOTOGRAMMETRY_HEIGHTS[r * pGrid + c];
        posArr[idx + 1] = h;
      }
    }
    pGeo.computeVertexNormals();

    const texLoader = new THREE.TextureLoader();
    const orthoTex = texLoader.load("/models/photogrammetry/brighton_beach.jpg");
    orthoTex.colorSpace = THREE.SRGBColorSpace; // Critical: preserve rich true drone color dynamics
    orthoTex.anisotropy = 8;
    const photoMat = new THREE.MeshStandardMaterial({
      map: orthoTex,
      roughness: 0.88,
      metalness: 0.04,
    });
    const photoMesh = new THREE.Mesh(pGeo, photoMat);
    photoMesh.receiveShadow = true;
    photoMesh.castShadow = true;
    // Align origin (0, 0, 0) with flat park lawn
    photoMesh.position.set(
      -PHOTOGRAMMETRY_PARK_OFFSET_X,
      0.002,
      -PHOTOGRAMMETRY_PARK_OFFSET_Z
    );
    envGroup.add(photoMesh);

    // Expansive Coastal Ocean Water: Sand beach slopes naturally down into azure water
    const oceanGeo = new THREE.PlaneGeometry(460, 460, 32, 32);
    const oceanMat = new THREE.MeshPhysicalMaterial({
      color: 0x0284c7, // Vibrant Mediterranean coastal blue
      roughness: 0.12,
      metalness: 0.16,
      transmission: 0.62,
      ior: 1.333,
      transparent: true,
      opacity: 0.85,
    });
    const oceanMesh = new THREE.Mesh(oceanGeo, oceanMat);
    oceanMesh.rotation.x = -Math.PI / 2;
    oceanMesh.position.set(55.0, -3.82, 0.0);
    oceanMesh.receiveShadow = true;
    envGroup.add(oceanMesh);
  } else if (preset === "bellus") {
    // 2B. Real-World European Historic Village 3D Photogrammetry (Bellus, OpenDroneMap)
    // Ambient Mediterranean Countryside Ground Plane
    const villageGroundGeo = new THREE.PlaneGeometry(360, 360, 24, 24);
    const villageGroundMat = new THREE.MeshStandardMaterial({
      color: 0x3d4d2d, // Mediterranean olive grove earth
      roughness: 0.94,
      metalness: 0.03,
    });
    const villageGround = new THREE.Mesh(villageGroundGeo, villageGroundMat);
    villageGround.rotation.x = -Math.PI / 2;
    villageGround.position.y = -0.012;
    villageGround.receiveShadow = true;
    envGroup.add(villageGround);

    // Village Central Plaza Takeoff Ring (Transparent overlay allowing real stone pavers to show through)
    const ringGeo = new THREE.RingGeometry(1.6, 1.75, 48);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(0, 0.015, 0);
    envGroup.add(ring);

    const innerDot = new THREE.Mesh(
      new THREE.RingGeometry(0.18, 0.28, 24),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide })
    );
    innerDot.rotation.x = -Math.PI / 2;
    innerDot.position.set(0, 0.015, 0);
    envGroup.add(innerDot);

    // Load True 3D Photogrammetric Village Mesh (OpenDroneMap)
    const villageGroup = new THREE.Group();
    envGroup.add(villageGroup);

    const texLoader = new THREE.TextureLoader();
    const villageTex = texLoader.load("/models/photogrammetry/bellus_texture.jpg");
    villageTex.colorSpace = THREE.SRGBColorSpace;
    villageTex.anisotropy = 8;

    const villageMat = new THREE.MeshStandardMaterial({
      map: villageTex,
      roughness: 0.76,
      metalness: 0.06,
    });

    const objLoader = new OBJLoader();
    objLoader.load(
      "/models/photogrammetry/bellus_village_3d.obj",
      (obj) => {
        obj.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const m = child as THREE.Mesh;
            m.material = villageMat;
            m.castShadow = true;
            m.receiveShadow = true;
          }
        });
        villageGroup.add(obj);
      },
      undefined,
      (err) => {
        console.warn("Failed to load bellus_village_3d.obj:", err);
      }
    );

    // Surrounding Mediterranean Cypress Trees framing the village hills
    const cypressTrunkGeo = new THREE.CylinderGeometry(0.09, 0.14, 1.4, 8);
    const cypressCrownGeo = new THREE.ConeGeometry(0.55, 6.2, 8);
    const cypressTrunkMat = new THREE.MeshStandardMaterial({ color: 0x422f22, roughness: 0.9 });
    const cypressCrownMat = new THREE.MeshStandardMaterial({
      color: 0x1b3524,
      roughness: 0.78,
      metalness: 0.04,
    });

    const cypressPositions: [number, number][] = [
      [-24, -18], [-26, -12], [-25, -5], [-27, 4], [-24, 14], [-26, 22],
      [26, -16], [28, -8], [27, 2], [29, 12], [26, 20],
      [-14, 25], [-4, 27], [6, 26], [16, 25],
      [-16, -20], [-6, -22], [5, -21], [15, -19],
    ];

    cypressPositions.forEach(([cx, cz]) => {
      const cGroup = new THREE.Group();
      cGroup.position.set(cx, 0, cz);

      const trunk = new THREE.Mesh(cypressTrunkGeo, cypressTrunkMat);
      trunk.position.y = 0.7;
      trunk.castShadow = true;
      cGroup.add(trunk);

      const crown = new THREE.Mesh(cypressCrownGeo, cypressCrownMat);
      crown.position.y = 4.2;
      crown.castShadow = true;
      cGroup.add(crown);

      envGroup.add(cGroup);
    });

    // Historic Plaza Lantern Posts in courtyard corners
    const lanternMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.35,
      metalness: 0.8,
    });
    const lanternGlowMat = new THREE.MeshStandardMaterial({
      color: 0xfef08a,
      emissive: 0xfde047,
      emissiveIntensity: 0.9,
    });
    const lanternCoords: [number, number][] = [
      [-3.2, -3.2], [3.2, -3.2], [-3.2, 3.2], [3.2, 3.2],
    ];
    lanternCoords.forEach(([lx, lz]) => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 2.4, 8), lanternMat);
      post.position.set(lx, 1.2, lz);
      post.castShadow = true;
      envGroup.add(post);

      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.32, 0.24), lanternGlowMat);
      lamp.position.set(lx, 2.45, lz);
      envGroup.add(lamp);
    });
  } else if (preset !== "forest") {
    const apronGeo = new THREE.PlaneGeometry(12.5, 12.5);
    const apronMat = new THREE.MeshStandardMaterial({
      map: createTarmacTexture(preset === "tactical"),
      roughness: 0.65,
      metalness: 0.18,
    });
    const apronMesh = new THREE.Mesh(apronGeo, apronMat);
    apronMesh.rotation.x = -Math.PI / 2;
    apronMesh.position.y = -0.003;
    apronMesh.receiveShadow = true;
    envGroup.add(apronMesh);

    // Long Runway Strip
    const stripGeo = new THREE.PlaneGeometry(52, 4.2);
    const stripMat = new THREE.MeshStandardMaterial({
      color: preset === "tactical" ? 0x0c1524 : 0x222834,
      roughness: 0.75,
      metalness: 0.12,
    });
    const stripMesh = new THREE.Mesh(stripGeo, stripMat);
    stripMesh.rotation.x = -Math.PI / 2;
    stripMesh.position.y = -0.008;
    stripMesh.receiveShadow = true;
    envGroup.add(stripMesh);

    // Taxiway edge lights
    const edgeLightGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.08, 8);
    const edgeLightMat = new THREE.MeshStandardMaterial({
      color: preset === "tactical" ? 0x06b6d4 : 0x38bdf8,
      emissive: preset === "tactical" ? 0x0891b2 : 0x0284c7,
      emissiveIntensity: 0.85,
      roughness: 0.2,
    });
    for (let x = -21; x <= 21; x += 3.5) {
      if (Math.abs(x) < 5.8) continue;
      [-2.15, 2.15].forEach((z) => {
        const l = new THREE.Mesh(edgeLightGeo, edgeLightMat);
        l.position.set(x, 0.04, z);
        envGroup.add(l);
      });
    }
  } else {
    // Forest preset: Woodland dirt/moss trail strip + Meandering Clear Stream
    const trailStrip = new THREE.Mesh(
      new THREE.PlaneGeometry(28, 3.4),
      new THREE.MeshStandardMaterial({
        color: 0x24331e,
        roughness: 0.95,
        metalness: 0.02,
      })
    );
    trailStrip.rotation.x = -Math.PI / 2;
    trailStrip.position.y = -0.006;
    trailStrip.receiveShadow = true;
    envGroup.add(trailStrip);

    // Natural Forest Stream with transparent water and riverbed stones
    const streamGeo = new THREE.PlaneGeometry(36, 2.8);
    const streamMat = new THREE.MeshPhysicalMaterial({
      color: 0x0284c7,
      roughness: 0.08,
      metalness: 0.1,
      transmission: 0.72,
      ior: 1.333,
      transparent: true,
      opacity: 0.88,
    });
    const streamMesh = new THREE.Mesh(streamGeo, streamMat);
    streamMesh.rotation.x = -Math.PI / 2;
    streamMesh.rotation.z = 0.18; // organic diagonal bend
    streamMesh.position.set(1.5, -0.009, 8.5);
    streamMesh.receiveShadow = true;
    envGroup.add(streamMesh);

    // Riverbed pebbles along stream banks
    const pebbleMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      roughness: 0.8,
      metalness: 0.1,
    });
    for (let i = 0; i < 30; i++) {
      const px = -14 + i * 0.95;
      const pz = 8.5 + px * 0.18 + (Math.sin(i * 1.5) > 0 ? 1.4 : -1.4);
      const pebble = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.12 + Math.random() * 0.18, 0),
        pebbleMat
      );
      pebble.position.set(px, 0.06, pz);
      pebble.rotation.set(Math.random(), Math.random(), Math.random());
      pebble.castShadow = true;
      envGroup.add(pebble);
    }
  }

  // 3. Surrounding 3D Mountain Ridgelines (for procedural presets)
  if (
    preset !== "photogrammetry" &&
    preset !== "bellus" &&
    preset !== "landmark81" &&
    preset !== "google3d"
  ) {
    const mountainRockMat = new THREE.MeshStandardMaterial({
      color:
        preset === "tactical"
          ? 0x0a1424
          : preset === "urban"
          ? 0x334155
          : preset === "forest"
          ? 0x1c3326
          : 0x2b4234,
      roughness: 0.94,
      metalness: 0.05,
      flatShading: true,
    });

    const numPeaks = 32;
    for (let i = 0; i < numPeaks; i++) {
      const angle = (i / numPeaks) * Math.PI * 2;
      const dist = 48 + (i % 4) * 8;
      const height = 5.5 + ((i * 11) % 13) * 1.6;
      const radius = 8.0 + (i % 3) * 3.5;

      const peak = new THREE.Mesh(
        new THREE.ConeGeometry(radius, height, 7),
        mountainRockMat
      );
      peak.position.set(
        Math.cos(angle) * dist,
        height / 2 - 0.25,
        Math.sin(angle) * dist
      );
      peak.rotation.y = i * 0.8;
      envGroup.add(peak);
    }
  } else if (preset === "photogrammetry") {
    // Photogrammetry: Coastal Promenade Architecture (Railing, Pathway Bollards, Benches)
    // 1. Maritime White Timber Safety Railing along the park-beach crest
    const railMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.45,
      metalness: 0.1,
    });
    const postGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.95, 8);
    const beamGeo = new THREE.CylinderGeometry(0.026, 0.026, 2.5, 8);

    for (let z = -22; z <= 22; z += 2.5) {
      const post = new THREE.Mesh(postGeo, railMat);
      post.position.set(6.8, 0.475, z);
      post.castShadow = true;
      envGroup.add(post);

      if (z < 22) {
        const topRail = new THREE.Mesh(beamGeo, railMat);
        topRail.rotation.x = Math.PI / 2;
        topRail.position.set(6.8, 0.88, z + 1.25);
        topRail.castShadow = true;
        envGroup.add(topRail);

        const botRail = new THREE.Mesh(beamGeo, railMat);
        botRail.rotation.x = Math.PI / 2;
        botRail.position.set(6.8, 0.48, z + 1.25);
        botRail.castShadow = true;
        envGroup.add(botRail);
      }
    }

    // 2. Solar Pathway Bollard Lamps along the park promenade
    const bollardGeo = new THREE.CylinderGeometry(0.055, 0.065, 0.72, 8);
    const bollardMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      metalness: 0.75,
      roughness: 0.3,
    });
    const bollardGlowMat = new THREE.MeshStandardMaterial({
      color: 0xfef08a,
      emissive: 0xfef08a,
      emissiveIntensity: 0.85,
    });
    const bollardCoords: [number, number][] = [
      [3.8, -12],
      [3.8, -4],
      [3.8, 4],
      [3.8, 12],
      [-5.5, -8],
      [-5.5, 8],
    ];
    bollardCoords.forEach(([bx, bz]) => {
      const bMesh = new THREE.Mesh(bollardGeo, bollardMat);
      bMesh.position.set(bx, 0.36, bz);
      bMesh.castShadow = true;
      envGroup.add(bMesh);

      const lampCap = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.05, 0.12, 8),
        bollardGlowMat
      );
      lampCap.position.set(bx, 0.62, bz);
      envGroup.add(lampCap);
    });

    // 3. Coastal Promenade Park Benches overlooking the beach
    const benchWoodMat = new THREE.MeshStandardMaterial({
      color: 0x5c3a21,
      roughness: 0.82,
      metalness: 0.05,
    });
    const benchIronMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.4,
      metalness: 0.8,
    });
    const benches: [number, number, number][] = [
      [3.0, 0.0, -7.0],
      [3.5, 0.0, 7.0],
      [-2.5, 0.0, -15.0],
    ];
    benches.forEach(([bx, by, bz]) => {
      const bGroup = new THREE.Group();
      bGroup.position.set(bx, by, bz);
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 1.4), benchWoodMat);
      seat.position.set(0, 0.28, 0);
      seat.castShadow = true;
      bGroup.add(seat);
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.35, 1.4), benchWoodMat);
      back.position.set(-0.22, 0.48, 0);
      back.castShadow = true;
      bGroup.add(back);
      const leg1 = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.28, 0.06), benchIronMat);
      leg1.position.set(0, 0.14, 0.55);
      leg1.castShadow = true;
      bGroup.add(leg1);
      const leg2 = leg1.clone();
      leg2.position.z = -0.55;
      bGroup.add(leg2);
      envGroup.add(bGroup);
    });
  } else if (preset === "bellus") {
    // Distant soft rolling Mediterranean hills framing the village horizon
    const hillMat = new THREE.MeshStandardMaterial({
      color: 0x344622,
      roughness: 0.95,
      metalness: 0.02,
      flatShading: true,
    });
    for (let i = 0; i < 20; i++) {
      const angle = (i / 20) * Math.PI * 2;
      const dist = 75 + (i % 3) * 18;
      const height = 12.0 + ((i * 7) % 9) * 2.5;
      const radius = 24.0 + (i % 4) * 8;
      const hill = new THREE.Mesh(new THREE.ConeGeometry(radius, height, 10), hillMat);
      hill.position.set(Math.cos(angle) * dist, height / 2 - 1.5, Math.sin(angle) * dist);
      envGroup.add(hill);
    }
  }

  // 4. Preset-Specific High-Detail 3D Architecture
  const buildingFacadeTex = createBuildingFacadeTexture();
  const concreteMat = new THREE.MeshStandardMaterial({
    color: 0x475569,
    roughness: 0.75,
    metalness: 0.15,
  });
  const darkSteelMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.35,
    metalness: 0.85,
  });
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });

  if (preset === "airbase" || preset === "tactical") {
    // 4A. 3D Aircraft Hangar at (-16.0, 0, -14.0)
    const hangarGroup = new THREE.Group();
    hangarGroup.position.set(-16.0, 0, -14.0);

    const hangarWalls = new THREE.Mesh(
      new THREE.BoxGeometry(7.5, 3.2, 5.8),
      concreteMat
    );
    hangarWalls.position.y = 1.6;
    hangarWalls.castShadow = true;
    hangarWalls.receiveShadow = true;
    hangarGroup.add(hangarWalls);

    // Curved arched corrugated hangar roof
    const archRoof = new THREE.Mesh(
      new THREE.CylinderGeometry(3.0, 3.0, 7.6, 20, 1, false, 0, Math.PI),
      darkSteelMat
    );
    archRoof.rotation.z = Math.PI / 2;
    archRoof.position.y = 3.2;
    archRoof.castShadow = true;
    hangarGroup.add(archRoof);

    // Open Hangar Door Dark Interior
    const doorOpening = new THREE.Mesh(
      new THREE.PlaneGeometry(5.0, 2.6),
      new THREE.MeshBasicMaterial({ color: 0x060911 })
    );
    doorOpening.position.set(0, 1.3, 2.91);
    hangarGroup.add(doorOpening);

    envGroup.add(hangarGroup);

    // 4B. 3D Air Traffic Control Tower at (-16.5, 0, 13.5)
    const towerGroup = new THREE.Group();
    towerGroup.position.set(-16.5, 0, 13.5);

    const towerShaft = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 7.0, 2.4),
      concreteMat
    );
    towerShaft.position.y = 3.5;
    towerShaft.castShadow = true;
    towerGroup.add(towerShaft);

    // Octagonal Observation Glass Cab
    const glassCab = new THREE.Mesh(
      new THREE.CylinderGeometry(2.0, 1.6, 1.8, 8),
      new THREE.MeshStandardMaterial({
        color: 0x0284c7,
        metalness: 0.9,
        roughness: 0.08,
        transparent: true,
        opacity: 0.88,
      })
    );
    glassCab.position.y = 7.9;
    towerGroup.add(glassCab);

    const towerRoof = new THREE.Mesh(
      new THREE.CylinderGeometry(2.1, 2.1, 0.3, 8),
      darkSteelMat
    );
    towerRoof.position.y = 8.85;
    towerGroup.add(towerRoof);

    // Rotating Tactical Radar Assembly on Tower Roof
    const radarMount = new THREE.Group();
    radarMount.position.set(0, 9.3, 0);

    const dishBar = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.28, 0.2),
      new THREE.MeshStandardMaterial({ color: 0xf8fafc, metalness: 0.5, roughness: 0.2 })
    );
    radarMount.add(dishBar);

    const redBeacon = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 12, 12),
      beaconMat
    );
    redBeacon.position.set(0, 0.42, 0);
    radarMount.add(redBeacon);
    beaconMeshes.push(redBeacon);

    towerGroup.add(radarMount);
    radarDish = radarMount;
    envGroup.add(towerGroup);

    // 4C. Geodesic Radar Dome Station at (16.0, 0, -13.5)
    const radomeGroup = new THREE.Group();
    radomeGroup.position.set(16.0, 0, -13.5);

    const pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(1.8, 2.0, 2.0, 14),
      concreteMat
    );
    pedestal.position.y = 1.0;
    radomeGroup.add(pedestal);

    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(2.4, 20, 16),
      new THREE.MeshStandardMaterial({
        color: 0xf1f5f9,
        roughness: 0.3,
        metalness: 0.1,
      })
    );
    dome.position.y = 3.1;
    dome.castShadow = true;
    radomeGroup.add(dome);
    envGroup.add(radomeGroup);
  }

  if (preset === "urban") {
    // 4D. 3D Modern Skyline Blocks framing the city horizon
    const buildingCoords: [number, number, number, number, number][] = [
      [-17, -15, 4.2, 10.5, 4.2],
      [-7.5, -16, 4.6, 8.2, 4.0],
      [3.5, -16.5, 5.0, 11.8, 4.2],
      [15, -15, 4.5, 9.2, 4.5],
      [17.5, -4.5, 4.2, 7.5, 4.5],
      [17.5, 6.5, 4.6, 12.8, 4.2],
      [14.5, 15.5, 4.2, 8.8, 4.2],
      [3.0, 16, 5.4, 10.2, 4.2],
      [-8.0, 15.5, 4.2, 10.5, 4.2],
      [-17.5, 5.5, 4.5, 8.5, 4.5],
    ];

    const bldgMat = new THREE.MeshStandardMaterial({
      map: buildingFacadeTex,
      roughness: 0.18,
      metalness: 0.45,
    });

    buildingCoords.forEach(([bx, bz, bw, bh, bd]) => {
      const bGroup = new THREE.Group();
      bGroup.position.set(bx, 0, bz);

      const bMesh = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), bldgMat);
      bMesh.position.y = bh / 2;
      bMesh.castShadow = true;
      bMesh.receiveShadow = true;
      bGroup.add(bMesh);

      // Rooftop HVAC Chiller Box
      const hvac = new THREE.Mesh(
        new THREE.BoxGeometry(bw * 0.4, 0.45, bd * 0.4),
        darkSteelMat
      );
      hvac.position.set(0, bh + 0.22, 0);
      bGroup.add(hvac);

      // Red aviation warning light on top of skyscrapers
      const roofBeacon = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 10, 10),
        beaconMat
      );
      roofBeacon.position.set(0, bh + 0.55, 0);
      bGroup.add(roofBeacon);
      beaconMeshes.push(roofBeacon);

      envGroup.add(bGroup);
    });
  }

  // 5. Physical 3D Windsock at (-5.2, 0, -5.2)
  const windsockBase = new THREE.Group();
  windsockBase.position.set(-5.2, 0, -5.2);

  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.055, 2.5, 12),
    new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.7, roughness: 0.25 })
  );
  pole.position.y = 1.25;
  pole.castShadow = true;
  windsockBase.add(pole);

  const windsockPivot = new THREE.Group();
  windsockPivot.position.set(0, 2.45, 0);

  // Striped red/white windsock cone
  const sockCanvas = document.createElement("canvas");
  sockCanvas.width = 256;
  sockCanvas.height = 64;
  const sCtx = sockCanvas.getContext("2d")!;
  for (let i = 0; i < 5; i++) {
    sCtx.fillStyle = i % 2 === 0 ? "#ef4444" : "#f8fafc";
    sCtx.fillRect(0, (i * 64) / 5, 256, 64 / 5);
  }
  const sockTex = new THREE.CanvasTexture(sockCanvas);

  const windsockCone = new THREE.Mesh(
    new THREE.CylinderGeometry(0.065, 0.17, 0.82, 16, 1, true),
    new THREE.MeshStandardMaterial({
      map: sockTex,
      side: THREE.DoubleSide,
      roughness: 0.55,
    })
  );
  windsockCone.rotation.z = Math.PI / 2;
  windsockCone.position.set(0.41, -0.05, 0);
  windsockPivot.add(windsockCone);

  windsockBase.add(windsockPivot);
  envGroup.add(windsockBase);

  return {
    envGroup,
    radarDish,
    windsockPivot,
    windsockCone,
    beaconMeshes,
  };
}
