import * as THREE from "three";
import { createHelipadMarkings } from "./fieldObstacleBuilder";

/**
 * Generates a high-resolution 2048x2048 satellite-style urban ground texture
 * representing Vinhomes Central Park, multi-lane asphalt boulevards, stone plazas,
 * and riverside promenade in Ho Chi Minh City.
 */
function createLandmark81SatelliteGroundTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 2048;
  canvas.height = 2048;
  const ctx = canvas.getContext("2d")!;

  // 1. Base tropical urban parkland turf
  const baseGrad = ctx.createRadialGradient(1024, 1024, 80, 1024, 1024, 1200);
  baseGrad.addColorStop(0, "#2d5a36");
  baseGrad.addColorStop(0.55, "#23492b");
  baseGrad.addColorStop(1, "#1b3822");
  ctx.fillStyle = baseGrad;
  ctx.fillRect(0, 0, 2048, 2048);

  // Fine organic grass and foliage texture grain
  for (let i = 0; i < 24000; i++) {
    const x = Math.random() * 2048;
    const y = Math.random() * 2048;
    const g = 55 + Math.floor(Math.random() * 45);
    ctx.fillStyle = `rgba(${Math.floor(g * 0.48)}, ${g}, ${Math.floor(g * 0.52)}, 0.28)`;
    ctx.fillRect(x, y, 2.5, 2.5);
  }

  // 2. Urban blocks & paved architectural podiums (West & North-West sectors)
  ctx.fillStyle = "#334155";
  ctx.fillRect(120, 120, 680, 1800);
  ctx.fillRect(120, 120, 1300, 560);

  // Concrete tile grid on urban podiums
  ctx.strokeStyle = "rgba(148, 163, 184, 0.16)";
  ctx.lineWidth = 1;
  for (let p = 120; p < 1920; p += 24) {
    ctx.beginPath();
    ctx.moveTo(120, p);
    ctx.lineTo(800, p);
    ctx.stroke();
  }

  // 3. Multi-lane Asphalt Boulevards (Nguyen Huu Canh & Central Park Ring Road)
  const drawRoad = (x: number, y: number, w: number, h: number, horizontal: boolean) => {
    ctx.fillStyle = "#1e242d";
    ctx.fillRect(x, y, w, h);

    // Sidewalks
    ctx.strokeStyle = "#64748b";
    ctx.lineWidth = 5;
    ctx.strokeRect(x, y, w, h);

    // Double yellow median line
    ctx.strokeStyle = "#eab308";
    ctx.lineWidth = 2.5;
    ctx.setLineDash([]);
    ctx.beginPath();
    if (horizontal) {
      const cy = y + h * 0.5;
      ctx.moveTo(x, cy - 2);
      ctx.lineTo(x + w, cy - 2);
      ctx.moveTo(x, cy + 2);
      ctx.lineTo(x + w, cy + 2);
    } else {
      const cx = x + w * 0.5;
      ctx.moveTo(cx - 2, y);
      ctx.lineTo(cx - 2, y + h);
      ctx.moveTo(cx + 2, y);
      ctx.lineTo(cx + 2, y + h);
    }
    ctx.stroke();

    // Dashed white lane dividers
    ctx.strokeStyle = "rgba(248, 250, 252, 0.75)";
    ctx.lineWidth = 2;
    ctx.setLineDash([18, 18]);
    ctx.beginPath();
    if (horizontal) {
      ctx.moveTo(x, y + h * 0.25);
      ctx.lineTo(x + w, y + h * 0.25);
      ctx.moveTo(x, y + h * 0.75);
      ctx.lineTo(x + w, y + h * 0.75);
    } else {
      ctx.moveTo(x + w * 0.25, y);
      ctx.lineTo(x + w * 0.25, y + h);
      ctx.moveTo(x + w * 0.75, y);
      ctx.lineTo(x + w * 0.75, y + h);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  };

  // Main North-South Boulevard & East-West Avenue
  drawRoad(740, 0, 96, 2048, false);
  drawRoad(0, 660, 1520, 88, true);
  drawRoad(0, 1320, 1520, 84, true);

  // 4. Central Park Stone Walkways & Takeoff Plaza around Center (1024, 1024)
  ctx.strokeStyle = "#cbd5e1";
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.arc(1024, 1024, 150, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = "#475569";
  ctx.beginPath();
  ctx.arc(1024, 1024, 72, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#38bdf8";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(1024, 1024, 66, 0, Math.PI * 2);
  ctx.stroke();

  // 5. Saigon River Stone Promenade along East bank (x ~ 1480..1545)
  ctx.fillStyle = "#94a3b8";
  ctx.fillRect(1480, 0, 65, 2048);
  ctx.fillStyle = "#64748b";
  ctx.fillRect(1535, 0, 12, 2048);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 8;
  return tex;
}

/**
 * Generates a high-contrast architectural curtain-wall glass facade texture
 * with metallic mullions and illuminated interior office/residential floors.
 */
function createCurtainWallTexture(tintHex: string = "#0ea5e9"): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 1024;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#0b1528";
  ctx.fillRect(0, 0, 512, 1024);

  const cols = 8;
  const rows = 32;
  const cw = 512 / cols;
  const rh = 1024 / rows;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const lit = Math.sin(r * 1.7 + c * 2.3) > 0.15;
      ctx.fillStyle = lit ? tintHex : "#162a45";
      ctx.globalAlpha = lit ? 0.55 : 0.85;
      ctx.fillRect(c * cw + 3, r * rh + 3, cw - 6, rh - 6);
    }
  }
  ctx.globalAlpha = 1.0;

  // Structural aluminum mullions & spandrel beams
  ctx.strokeStyle = "#334155";
  ctx.lineWidth = 3;
  for (let c = 0; c <= cols; c++) {
    ctx.beginPath();
    ctx.moveTo(c * cw, 0);
    ctx.lineTo(c * cw, 1024);
    ctx.stroke();
  }
  for (let r = 0; r <= rows; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * rh);
    ctx.lineTo(512, r * rh);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

/**
 * Builds the iconic Landmark 81 supertall skyscraper using its authentic
 * 5x5 bundled-tube stepped bamboo-cluster architecture, glowing LED setback crowns,
 * and pinnacle spire.
 */
function buildLandmark81Monument(
  glassMat: THREE.Material,
  beaconMeshes: THREE.Mesh[]
): THREE.Group {
  const monument = new THREE.Group();

  // Authentic 5x5 bundled square tube height matrix (in simulation meters, pinnacle ~ 34m)
  const heightGrid: number[][] = [
    [10.5, 13.0, 15.5, 12.5, 9.5],
    [13.5, 18.5, 22.0, 17.5, 13.0],
    [16.0, 23.0, 29.5, 22.5, 15.0],
    [13.0, 18.0, 21.5, 19.0, 12.0],
    [9.0, 12.0, 14.5, 11.5, 8.5],
  ];

  const tubeWidth = 1.15;
  const gap = 0.04;
  const step = tubeWidth + gap;

  const frameMat = new THREE.MeshStandardMaterial({
    color: 0xcbd5e1,
    metalness: 0.85,
    roughness: 0.2,
  });

  const ledStripMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x0ea5e9,
    emissiveIntensity: 0.9,
  });

  // 1. Luxury Retail Podium Base (Vincom Center Landmark 81)
  const podium = new THREE.Mesh(
    new THREE.BoxGeometry(8.6, 2.2, 8.6),
    new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.6,
      roughness: 0.25,
    })
  );
  podium.position.y = 1.1;
  podium.castShadow = true;
  podium.receiveShadow = true;
  monument.add(podium);

  // 2. 25 Bundled Glass Tubes with Illuminated Crown Setbacks
  for (let gx = 0; gx < 5; gx++) {
    for (let gz = 0; gz < 5; gz++) {
      const h = heightGrid[gx][gz];
      const tx = (gx - 2) * step;
      const tz = (gz - 2) * step;

      const tube = new THREE.Mesh(
        new THREE.BoxGeometry(tubeWidth, h, tubeWidth),
        glassMat
      );
      tube.position.set(tx, h * 0.5, tz);
      tube.castShadow = true;
      tube.receiveShadow = true;
      monument.add(tube);

      // Metallic architectural roof cap
      const cap = new THREE.Mesh(
        new THREE.BoxGeometry(tubeWidth + 0.03, 0.12, tubeWidth + 0.03),
        frameMat
      );
      cap.position.set(tx, h + 0.06, tz);
      monument.add(cap);

      // Glowing horizontal LED accent strip near top of each tube
      const led = new THREE.Mesh(
        new THREE.BoxGeometry(tubeWidth + 0.05, 0.07, tubeWidth + 0.05),
        ledStripMat
      );
      led.position.set(tx, h - 0.18, tz);
      monument.add(led);
    }
  }

  // 3. Central Observation Deck & Spire Pinnacle (29.5m -> 35.0m)
  const spireShaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.24, 5.5, 16),
    frameMat
  );
  spireShaft.position.set(0, 29.5 + 2.75, 0);
  monument.add(spireShaft);

  // Aviation strobe beacon at 35.2m peak
  const topBeacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 12, 12),
    new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: 0xef4444,
      emissiveIntensity: 1.2,
    })
  );
  topBeacon.position.set(0, 35.2, 0);
  monument.add(topBeacon);
  beaconMeshes.push(topBeacon);

  return monument;
}

/**
 * Builds the complete Photorealistic 3D Digital Twin of Landmark 81 & Vinhomes Central Park
 * Riverside District (100% Offline, Crisp 90-degree Architecture, Zero Melted Polygons).
 */
export function buildLandmark81DigitalTwin(beaconMeshes: THREE.Mesh[]): THREE.Group {
  const districtGroup = new THREE.Group();

  // 1. High-Res Satellite Ortho Ground Plane (240m x 240m)
  const groundTex = createLandmark81SatelliteGroundTexture();
  const groundMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(240, 240, 1, 1),
    new THREE.MeshStandardMaterial({
      map: groundTex,
      roughness: 0.86,
      metalness: 0.05,
    })
  );
  groundMesh.rotation.x = -Math.PI / 2;
  groundMesh.position.y = -0.01;
  groundMesh.receiveShadow = true;
  districtGroup.add(groundMesh);

  // 2. Saigon River Expanse & Waterfront Seawall (East Sector, X > 28m)
  const riverWater = new THREE.Mesh(
    new THREE.PlaneGeometry(180, 240),
    new THREE.MeshStandardMaterial({
      color: 0x0369a1,
      roughness: 0.14,
      metalness: 0.72,
    })
  );
  riverWater.rotation.x = -Math.PI / 2;
  riverWater.position.set(118, -0.005, 0);
  riverWater.receiveShadow = true;
  districtGroup.add(riverWater);

  // Stone Waterfront Embankment Wall
  const seawall = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 0.55, 240),
    new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.75 })
  );
  seawall.position.set(28.0, 0.25, 0);
  seawall.receiveShadow = true;
  districtGroup.add(seawall);

  // Luxury Marina Pier & Moored Yachts on Saigon River
  const pierMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.65 });
  const mainPier = new THREE.Mesh(new THREE.BoxGeometry(14, 0.25, 2.2), pierMat);
  mainPier.position.set(35, 0.15, 8);
  districtGroup.add(mainPier);

  const yachtHullMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    roughness: 0.2,
    metalness: 0.3,
  });
  const yachtGlassMat = new THREE.MeshStandardMaterial({
    color: 0x0284c7,
    roughness: 0.1,
    metalness: 0.8,
  });
  [-3.2, 3.2].forEach((dz) => {
    const yacht = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.65, 1.35), yachtHullMat);
    hull.position.y = 0.32;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.55, 1.1), yachtGlassMat);
    cabin.position.set(-0.2, 0.85, 0);
    yacht.add(hull, cabin);
    yacht.position.set(37.5, 0.0, 8 + dz);
    districtGroup.add(yacht);
  });

  // 3. Shared Curtain-Wall Glass Materials
  const cyanGlassTex = createCurtainWallTexture("#38bdf8");
  const cyanGlassMat = new THREE.MeshStandardMaterial({
    map: cyanGlassTex,
    color: 0xe0f2fe,
    roughness: 0.1,
    metalness: 0.78,
  });

  const emeraldGlassTex = createCurtainWallTexture("#34d399");
  const emeraldGlassMat = new THREE.MeshStandardMaterial({
    map: emeraldGlassTex,
    color: 0xd1fae5,
    roughness: 0.14,
    metalness: 0.72,
  });

  // 4. Landmark 81 Monumental Skyscraper at (X: 16, Z: -18)
  const landmark81 = buildLandmark81Monument(cyanGlassMat, beaconMeshes);
  landmark81.position.set(16, 0, -18);
  districtGroup.add(landmark81);

  // 5. Surrounding Vinhomes High-Rise Residential & Office Skyline (Outside immediate flight pad)
  const skylineSpecs: [number, number, number, number, number, boolean][] = [
    // [x, z, width, depth, height, hasRooftopHelipad]
    [-19, -18, 5.2, 4.8, 18.5, true],
    [-19, -6, 4.6, 4.6, 15.0, false],
    [-19, 8, 5.0, 4.5, 16.8, false],
    [-19, 20, 5.4, 5.0, 19.2, true],
    [-8, -22, 4.8, 4.4, 14.5, false],
    [4, -22, 5.2, 4.6, 17.0, false],
    [-8, 22, 5.0, 4.8, 15.5, false],
    [6, 22, 4.8, 4.8, 13.8, true],
    [18, 18, 5.5, 5.0, 20.5, false],
  ];

  const parapetMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.5,
    metalness: 0.4,
  });

  skylineSpecs.forEach(([bx, bz, bw, bd, bh, hasHelipad], idx) => {
    const tGroup = new THREE.Group();
    const mat = idx % 2 === 0 ? cyanGlassMat : emeraldGlassMat;
    const body = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), mat);
    body.position.set(bx, bh * 0.5, bz);
    body.castShadow = true;
    body.receiveShadow = true;
    tGroup.add(body);

    const roofRim = new THREE.Mesh(
      new THREE.BoxGeometry(bw + 0.15, 0.22, bd + 0.15),
      parapetMat
    );
    roofRim.position.set(bx, bh + 0.11, bz);
    tGroup.add(roofRim);

    if (hasHelipad) {
      tGroup.add(createHelipadMarkings(new THREE.Vector3(bx, bh + 0.26, bz), 0x38bdf8));
    }

    districtGroup.add(tGroup);
  });

  // 6. Elevated Metro Line 1 Viaduct Bridge along Northern Corridor (Z = -34m)
  const viaductMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.65 });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(140, 0.65, 3.2), viaductMat);
  deck.position.set(-10, 6.2, -34);
  deck.castShadow = true;
  districtGroup.add(deck);

  for (let px = -70; px <= 50; px += 15) {
    const pier = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.55, 6.0, 12),
      viaductMat
    );
    pier.position.set(px, 3.0, -34);
    pier.castShadow = true;
    districtGroup.add(pier);
  }

  // Sleek Metro Train on the Viaduct
  const trainCar = new THREE.Mesh(
    new THREE.BoxGeometry(16, 0.95, 1.35),
    new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.2, metalness: 0.5 })
  );
  trainCar.position.set(-4, 7.0, -34);
  districtGroup.add(trainCar);

  // 7. Landscaped Tropical Park Trees along Riverside Promenade
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x452c1e, roughness: 0.9 });
  const crownMat = new THREE.MeshStandardMaterial({ color: 0x16a34a, roughness: 0.78 });
  const parkTreeCoords: [number, number][] = [
    [22, -10],
    [22, -4],
    [22, 4],
    [22, 10],
    [22, 16],
    [-13, -12],
    [-13, 12],
    [13, 12],
  ];
  parkTreeCoords.forEach(([tx, tz]) => {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 1.6, 8), trunkMat);
    trunk.position.set(tx, 0.8, tz);
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(0.95, 1), crownMat);
    crown.position.set(tx, 2.1, tz);
    crown.castShadow = true;
    districtGroup.add(trunk, crown);
  });

  return districtGroup;
}
