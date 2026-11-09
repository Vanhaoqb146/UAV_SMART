import * as THREE from "three";
import { ObstacleSpec } from "../types/domain";

/**
 * Builds an ICAO-standard Helipad "H" ring with high-contrast non-slip tarmac base
 * and perimeter night landing beacons (supports both ground pads and elevated rooftop helipads).
 */
export function createHelipadMarkings(
  posThree: THREE.Vector3,
  ringColorHex: number = 0x10b981
): THREE.Group {
  const padGroup = new THREE.Group();
  padGroup.position.set(posThree.x, Math.max(0.004, posThree.y - 0.035), posThree.z);

  // 1. Non-slip asphalt helipad circular foundation
  const padBase = new THREE.Mesh(
    new THREE.CircleGeometry(0.58, 48),
    new THREE.MeshStandardMaterial({
      color: 0x09111e,
      roughness: 0.85,
      metalness: 0.15,
      side: THREE.DoubleSide,
    })
  );
  padBase.rotation.x = -Math.PI / 2;
  padGroup.add(padBase);

  // 2. High-visibility perimeter safety border ring
  const padOuter = new THREE.Mesh(
    new THREE.RingGeometry(0.51, 0.58, 48),
    new THREE.MeshStandardMaterial({
      color: ringColorHex,
      roughness: 0.3,
      metalness: 0.2,
      side: THREE.DoubleSide,
    })
  );
  padOuter.rotation.x = -Math.PI / 2;
  padOuter.position.y = 0.002;
  padGroup.add(padOuter);

  // 3. Thick white reflective Helipad "H" marking
  const hMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    roughness: 0.25,
    metalness: 0.1,
    side: THREE.DoubleSide,
  });
  const hLeft = new THREE.Mesh(new THREE.PlaneGeometry(0.075, 0.44), hMat);
  hLeft.rotation.x = -Math.PI / 2;
  hLeft.position.set(-0.15, 0.005, 0);
  padGroup.add(hLeft);

  const hRight = new THREE.Mesh(new THREE.PlaneGeometry(0.075, 0.44), hMat);
  hRight.rotation.x = -Math.PI / 2;
  hRight.position.set(0.15, 0.005, 0);
  padGroup.add(hRight);

  const hCross = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.075), hMat);
  hCross.rotation.x = -Math.PI / 2;
  hCross.position.set(0, 0.005, 0);
  padGroup.add(hCross);

  // 4. Perimeter night landing indicator LEDs
  const ledGeo = new THREE.SphereGeometry(0.022, 8, 8);
  const ledMat = new THREE.MeshStandardMaterial({
    color: ringColorHex,
    emissive: ringColorHex,
    emissiveIntensity: 0.95,
  });
  const numLeds = 8;
  for (let i = 0; i < numLeds; i++) {
    const angle = (i / numLeds) * Math.PI * 2;
    const led = new THREE.Mesh(ledGeo, ledMat);
    led.position.set(Math.cos(angle) * 0.54, 0.02, Math.sin(angle) * 0.54);
    padGroup.add(led);
  }

  return padGroup;
}

/**
 * Builds a physical 3D obstacle mesh group (Organic 3D Forest Tree, Modern 3D High-Rise Building, or Hazard Pillar)
 * matching the exact PyBullet collision geometry.
 */
export function buildObstacleMeshGroup(
  ob: ObstacleSpec,
  hazardMat: THREE.Material,
  buildingMat: THREE.Material
): THREE.Group {
  const group = new THREE.Group();
  const threeX = ob.x;
  const threeZ = -ob.y;

  if (ob.kind === "tree") {
    const trunkH = ob.h * 0.65;
    const crownR = ob.crown_r || ob.r * 3.0;
    const crownY = ob.h * 0.72;

    // 1. Organic Tapered Wood Bark Trunk with Root Flare
    const trunkMat = new THREE.MeshStandardMaterial({
      color: 0x3d2817,
      roughness: 0.95,
      metalness: 0.02,
    });
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(ob.r * 0.68, ob.r * 1.25, trunkH, 12),
      trunkMat
    );
    trunk.position.set(threeX, trunkH * 0.5, threeZ);
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    group.add(trunk);

    // Root flare base
    const rootBase = new THREE.Mesh(
      new THREE.CylinderGeometry(ob.r * 1.15, ob.r * 1.6, 0.15, 10),
      trunkMat
    );
    rootBase.position.set(threeX, 0.075, threeZ);
    rootBase.receiveShadow = true;
    group.add(rootBase);

    // 2. Clustered Organic Foliage Canopy (matches PyBullet collision sphere at crownY)
    const seed = Math.abs(Math.sin(ob.x * 4.3 + ob.y * 2.7));
    const sunnyLeafColor = seed > 0.6 ? 0x22c55e : seed > 0.3 ? 0x16a34a : 0x15803d;
    const shadeLeafColor = seed > 0.5 ? 0x14532d : 0x0f391f;

    const sunlitFoliageMat = new THREE.MeshStandardMaterial({
      color: sunnyLeafColor,
      roughness: 0.82,
      metalness: 0.03,
      shadowSide: THREE.DoubleSide,
    });

    const shadedFoliageMat = new THREE.MeshStandardMaterial({
      color: shadeLeafColor,
      roughness: 0.9,
      metalness: 0.02,
      shadowSide: THREE.DoubleSide,
    });

    // 2A. Main Crown Volume (Center cluster)
    const mainCrown = new THREE.Mesh(
      new THREE.IcosahedronGeometry(crownR * 0.88, 2),
      sunlitFoliageMat
    );
    mainCrown.position.set(threeX, crownY, threeZ);
    mainCrown.castShadow = true;
    mainCrown.receiveShadow = true;
    group.add(mainCrown);

    // 2B. Organic Sub-Clusters forming a natural tiered pine/oak canopy
    const clusterOffsets: [number, number, number, number, boolean][] = [
      [crownR * 0.32, crownR * 0.18, crownR * 0.28, crownR * 0.55, true],
      [-crownR * 0.34, crownR * 0.14, crownR * 0.22, crownR * 0.52, true],
      [crownR * 0.12, -crownR * 0.25, -crownR * 0.38, crownR * 0.62, false],
      [-crownR * 0.28, -crownR * 0.22, -crownR * 0.25, crownR * 0.58, false],
      [0.0, crownR * 0.45, 0.0, crownR * 0.5, true], // Top crown spire
      [crownR * 0.35, -crownR * 0.15, -crownR * 0.18, crownR * 0.54, false],
    ];

    clusterOffsets.forEach(([dx, dy, dz, cr, isTop]) => {
      const clump = new THREE.Mesh(
        new THREE.IcosahedronGeometry(cr, 1),
        isTop ? sunlitFoliageMat : shadedFoliageMat
      );
      clump.position.set(threeX + dx, crownY + dy, threeZ + dz);
      clump.scale.set(1.05, 0.85, 1.05); // slight flattening gives natural leaf mass
      clump.castShadow = true;
      clump.receiveShadow = true;
      group.add(clump);
    });

    return group;
  }

  if (ob.kind === "building") {
    const sx = ob.sx && ob.sx > 0 ? ob.sx : ob.r * 2.0;
    const sy = ob.sy && ob.sy > 0 ? ob.sy : ob.r * 2.0;

    // 1. Main High-Rise Tower (Photorealistic Glass Facade)
    const tower = new THREE.Mesh(
      new THREE.BoxGeometry(sx, ob.h, sy),
      buildingMat
    );
    tower.position.set(threeX, ob.h * 0.5, threeZ);
    tower.castShadow = true;
    tower.receiveShadow = true;
    group.add(tower);

    // 2. Concrete Structural Corner Mullions
    const mullionMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.65,
      roughness: 0.35,
    });
    const colSize = 0.08;
    const colOffsets: [number, number][] = [
      [-sx * 0.5, -sy * 0.5],
      [sx * 0.5, -sy * 0.5],
      [-sx * 0.5, sy * 0.5],
      [sx * 0.5, sy * 0.5],
    ];
    colOffsets.forEach(([cx, cz]) => {
      const col = new THREE.Mesh(
        new THREE.BoxGeometry(colSize, ob.h, colSize),
        mullionMat
      );
      col.position.set(threeX + cx, ob.h * 0.5, threeZ + cz);
      group.add(col);
    });

    // 3. Concrete Rooftop Parapet Rim
    const roofParapet = new THREE.Mesh(
      new THREE.BoxGeometry(sx + 0.08, 0.12, sy + 0.08),
      new THREE.MeshStandardMaterial({
        color: 0x334155,
        roughness: 0.65,
        metalness: 0.3,
      })
    );
    roofParapet.position.set(threeX, ob.h - 0.02, threeZ);
    roofParapet.receiveShadow = true;
    group.add(roofParapet);

    // 4. Rooftop Mechanical Elevator Penthouse / Utility Housing
    const penthouse = new THREE.Mesh(
      new THREE.BoxGeometry(sx * 0.28, 0.38, sy * 0.28),
      new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        metalness: 0.8,
        roughness: 0.3,
      })
    );
    penthouse.position.set(threeX - sx * 0.3, ob.h + 0.19, threeZ - sy * 0.3);
    penthouse.castShadow = true;
    penthouse.receiveShadow = true;
    group.add(penthouse);

    // 5. Corner Aviation Warning Beacons (Strobe Red)
    const beaconMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: 0xef4444,
      emissiveIntensity: 0.9,
    });
    const beaconOffsets: [number, number][] = [
      [sx * 0.44, sy * 0.44],
      [-sx * 0.44, sy * 0.44],
      [sx * 0.44, -sy * 0.44],
      [-sx * 0.44, -sy * 0.44],
    ];
    beaconOffsets.forEach(([dx, dz]) => {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 8), beaconMat);
      b.position.set(threeX + dx, ob.h + 0.08, threeZ + dz);
      group.add(b);
    });

    return group;
  }

  // Default: Industrial Hazard Pillar with metallic caps
  const cyl = new THREE.Mesh(
    new THREE.CylinderGeometry(ob.r, ob.r, ob.h, 24),
    hazardMat
  );
  cyl.position.set(threeX, ob.h * 0.5, threeZ);
  cyl.castShadow = true;
  cyl.receiveShadow = true;
  group.add(cyl);

  const capMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    metalness: 0.8,
    roughness: 0.2,
  });
  const topCap = new THREE.Mesh(new THREE.CylinderGeometry(ob.r * 1.08, ob.r * 1.08, 0.06, 24), capMat);
  topCap.position.set(threeX, ob.h, threeZ);
  group.add(topCap);

  const topBeacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.085, 12, 12),
    new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: 0xef4444,
      emissiveIntensity: 0.85,
    })
  );
  topBeacon.position.set(threeX, ob.h + 0.1, threeZ);
  group.add(topBeacon);

  return group;
}
