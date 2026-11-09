import * as THREE from "three";

export interface TacticalUavVisuals {
  group: THREE.Group;
  propellers: THREE.Object3D[];
  blurDiscs: THREE.Mesh[];
  strobeLights: THREE.Mesh[];
  bodyMaterial: THREE.MeshStandardMaterial;
}

/**
 * Builds a high-detail Industrial / Tactical Quadcopter (inspired by Matrice RTK / Tactical Recon UAV)
 * Coordinate convention in Three.js:
 *   +X = Forward (Nose)
 *   +Y = Up
 *   +Z = Right Wing (Starboard), -Z = Left Wing (Port)
 */
export function createTacticalUavModel(): TacticalUavVisuals {
  const group = new THREE.Group();
  const propellers: THREE.Object3D[] = [];
  const blurDiscs: THREE.Mesh[] = [];
  const strobeLights: THREE.Mesh[] = [];

  // Shared Aerospace Materials
  const carbonMat = new THREE.MeshStandardMaterial({
    color: 0x1e242b,
    metalness: 0.65,
    roughness: 0.32,
  });

  const darkAlloyMat = new THREE.MeshStandardMaterial({
    color: 0x0f1419,
    metalness: 0.8,
    roughness: 0.25,
  });

  const accentTitaniumMat = new THREE.MeshStandardMaterial({
    color: 0x475569,
    metalness: 0.85,
    roughness: 0.2,
  });

  const copperStatorMat = new THREE.MeshStandardMaterial({
    color: 0xd97706,
    metalness: 0.9,
    roughness: 0.25,
  });

  // 1. Central Monocoque Fuselage (Lower & Upper Hull)
  const coreHull = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 0.052, 0.13),
    carbonMat
  );
  coreHull.castShadow = true;
  coreHull.receiveShadow = true;
  group.add(coreHull);

  // Aerodynamic Chamfered Top Canopy
  const topCanopy = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.095, 0.032, 6),
    darkAlloyMat
  );
  topCanopy.scale.set(1.35, 1, 0.85);
  topCanopy.position.set(0.01, 0.038, 0);
  topCanopy.castShadow = true;
  group.add(topCanopy);

  // High-Gain RTK / GPS Mushroom Antenna on top rear
  const rtkStem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.006, 0.006, 0.035, 8),
    accentTitaniumMat
  );
  rtkStem.position.set(-0.055, 0.062, 0);
  group.add(rtkStem);

  const rtkPuck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.024, 0.022, 0.012, 16),
    new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.3, metalness: 0.2 })
  );
  rtkPuck.position.set(-0.055, 0.082, 0);
  rtkPuck.castShadow = true;
  group.add(rtkPuck);

  // Battery Pack Module at Rear with green power LED bar
  const batteryPack = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.038, 0.095),
    darkAlloyMat
  );
  batteryPack.position.set(-0.085, 0.002, 0);
  group.add(batteryPack);

  const batteryLed = new THREE.Mesh(
    new THREE.BoxGeometry(0.006, 0.012, 0.055),
    new THREE.MeshBasicMaterial({ color: 0x10b981 })
  );
  batteryLed.position.set(-0.126, 0.004, 0);
  group.add(batteryLed);

  // 2. Front 3-Axis Electro-Optical Gimbal Camera Pod (+X Nose)
  const gimbalMount = new THREE.Mesh(
    new THREE.BoxGeometry(0.04, 0.03, 0.05),
    accentTitaniumMat
  );
  gimbalMount.position.set(0.105, -0.022, 0);
  group.add(gimbalMount);

  const cameraBall = new THREE.Mesh(
    new THREE.SphereGeometry(0.026, 16, 16),
    darkAlloyMat
  );
  cameraBall.position.set(0.122, -0.032, 0);
  group.add(cameraBall);

  // Optical Glass Lens facing +X
  const lensMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.015, 0.015, 0.012, 16),
    new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      emissive: 0x0369a1,
      emissiveIntensity: 0.45,
      metalness: 0.95,
      roughness: 0.05,
    })
  );
  lensMesh.rotation.z = Math.PI / 2;
  lensMesh.position.set(0.144, -0.032, 0);
  group.add(lensMesh);

  // Forward Laser Rangefinder / Obstacle Sensor Strip
  const frontVisor = new THREE.Mesh(
    new THREE.BoxGeometry(0.012, 0.016, 0.085),
    new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
  );
  frontVisor.position.set(0.112, 0.012, 0);
  group.add(frontVisor);

  // 3. Carbon-Fiber Landing Gear Skids
  const skidOffsetsZ = [-0.075, 0.075];
  skidOffsetsZ.forEach((zOff) => {
    // Vertical struts
    const frontStrut = new THREE.Mesh(
      new THREE.CylinderGeometry(0.005, 0.005, 0.085, 8),
      carbonMat
    );
    frontStrut.position.set(0.05, -0.055, zOff * 0.85);
    frontStrut.rotation.x = zOff > 0 ? 0.18 : -0.18;
    group.add(frontStrut);

    const rearStrut = new THREE.Mesh(
      new THREE.CylinderGeometry(0.005, 0.005, 0.085, 8),
      carbonMat
    );
    rearStrut.position.set(-0.05, -0.055, zOff * 0.85);
    rearStrut.rotation.x = zOff > 0 ? 0.18 : -0.18;
    group.add(rearStrut);

    // Horizontal ground skid bar
    const skidBar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.006, 0.006, 0.22, 8),
      accentTitaniumMat
    );
    skidBar.rotation.z = Math.PI / 2;
    skidBar.position.set(0, -0.092, zOff);
    skidBar.castShadow = true;
    group.add(skidBar);
  });

  // 4. Four Carbon-Fiber Motor Arms, Brushless Motors, Propellers & Aviation LEDs
  // Positions in Three.js (x = front/back, z = right/left)
  const armSpecs: {
    x: number;
    z: number;
    isFront: boolean;
    isRight: boolean;
    spinDir: number;
  }[] = [
    { x: 0.165, z: -0.165, isFront: true, isRight: false, spinDir: 1 },   // Front-Left (Port)
    { x: 0.165, z: 0.165, isFront: true, isRight: true, spinDir: -1 },    // Front-Right (Starboard)
    { x: -0.165, z: -0.165, isFront: false, isRight: false, spinDir: -1 }, // Rear-Left
    { x: -0.165, z: 0.165, isFront: false, isRight: true, spinDir: 1 },   // Rear-Right
  ];

  const propBladeMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    metalness: 0.5,
    roughness: 0.35,
  });

  const propTipMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b });

  armSpecs.forEach((spec) => {
    // Tubular carbon arm from center (0,0,0) to (spec.x, 0.012, spec.z)
    const armLen = Math.hypot(spec.x, spec.z);
    const armAngleY = Math.atan2(-spec.z, spec.x);

    const armHolder = new THREE.Group();
    armHolder.rotation.y = armAngleY;

    const armTube = new THREE.Mesh(
      new THREE.CylinderGeometry(0.009, 0.012, armLen, 10),
      carbonMat
    );
    armTube.rotation.z = Math.PI / 2;
    armTube.position.set(armLen / 2, 0.008, 0);
    armTube.castShadow = true;
    armHolder.add(armTube);
    group.add(armHolder);

    // Motor Pod Base at (spec.x, 0.015, spec.z)
    const motorMount = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, 0.018, 0.018, 16),
      accentTitaniumMat
    );
    motorMount.position.set(spec.x, 0.016, spec.z);
    motorMount.castShadow = true;
    group.add(motorMount);

    // Copper Stator Core
    const stator = new THREE.Mesh(
      new THREE.CylinderGeometry(0.019, 0.019, 0.012, 16),
      copperStatorMat
    );
    stator.position.set(spec.x, 0.026, spec.z);
    group.add(stator);

    // Rotor Bell & Hub
    const rotorBell = new THREE.Mesh(
      new THREE.CylinderGeometry(0.021, 0.021, 0.01, 16),
      darkAlloyMat
    );
    rotorBell.position.set(spec.x, 0.034, spec.z);
    group.add(rotorBell);

    // Spinning Propeller Blade Group
    const propGroup = new THREE.Group();
    propGroup.position.set(spec.x, 0.041, spec.z);
    propGroup.userData.spinDir = spec.spinDir;

    const blade1 = new THREE.Mesh(
      new THREE.BoxGeometry(0.17, 0.0025, 0.018),
      propBladeMat
    );
    blade1.rotation.x = 0.12 * spec.spinDir;
    propGroup.add(blade1);

    // Yellow safety tips on propeller blades
    const tip1 = new THREE.Mesh(
      new THREE.BoxGeometry(0.022, 0.003, 0.0185),
      propTipMat
    );
    tip1.position.set(0.078, 0, 0);
    propGroup.add(tip1);

    const tip2 = new THREE.Mesh(
      new THREE.BoxGeometry(0.022, 0.003, 0.0185),
      propTipMat
    );
    tip2.position.set(-0.078, 0, 0);
    propGroup.add(tip2);

    const hubCone = new THREE.Mesh(
      new THREE.ConeGeometry(0.008, 0.014, 12),
      accentTitaniumMat
    );
    hubCone.position.set(0, 0.006, 0);
    propGroup.add(hubCone);

    group.add(propGroup);
    propellers.push(propGroup);

    // High-Speed Rotor Blur Disc
    const blurDisc = new THREE.Mesh(
      new THREE.RingGeometry(0.015, 0.088, 28),
      new THREE.MeshBasicMaterial({
        color: spec.isFront ? 0x38bdf8 : 0x94a3b8,
        transparent: true,
        opacity: 0.24,
        side: THREE.DoubleSide,
      })
    );
    blurDisc.rotation.x = -Math.PI / 2;
    blurDisc.position.set(spec.x, 0.042, spec.z);
    group.add(blurDisc);
    blurDiscs.push(blurDisc);

    // Aviation Navigation LED under each motor mount
    // Standard ICAO/FAA: Port (Left, -Z) = RED, Starboard (Right, +Z) = GREEN, Rear = Blinking Strobe
    let ledColor = 0xef4444;
    if (spec.isFront && spec.isRight) ledColor = 0x22c55e; // Front Right = Green
    if (spec.isFront && !spec.isRight) ledColor = 0xef4444; // Front Left = Red
    if (!spec.isFront) ledColor = 0xf59e0b; // Rear = Amber/Red Strobe

    const navLed = new THREE.Mesh(
      new THREE.SphereGeometry(0.009, 10, 10),
      new THREE.MeshBasicMaterial({ color: ledColor })
    );
    navLed.position.set(spec.x, 0.004, spec.z);
    group.add(navLed);

    if (!spec.isFront) {
      strobeLights.push(navLed);
    }
  });

  return {
    group,
    propellers,
    blurDiscs,
    strobeLights,
    bodyMaterial: carbonMat,
  };
}

/**
 * Builds the Holographic Lead UAV (UAV Dẫn đường) ahead of the student along the flight corridor.
 */
export function createLeadUavModel(): THREE.Group {
  const leadGroup = new THREE.Group();

  const holoFillMat = new THREE.MeshBasicMaterial({
    color: 0x06b6d4,
    transparent: true,
    opacity: 0.35,
  });

  const holoWireMat = new THREE.MeshBasicMaterial({
    color: 0x22d3ee,
    wireframe: true,
    transparent: true,
    opacity: 0.85,
  });

  // Sleek delta/quad silhouette
  const hull = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.04, 0.14), holoFillMat);
  leadGroup.add(hull);

  const hullWire = new THREE.Mesh(new THREE.BoxGeometry(0.225, 0.044, 0.145), holoWireMat);
  leadGroup.add(hullWire);

  // Direction Chevron (+X)
  const noseCone = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.16, 4), holoWireMat);
  noseCone.rotation.z = -Math.PI / 2;
  noseCone.position.set(0.18, 0, 0);
  leadGroup.add(noseCone);

  // 4 Holographic Rotor Rings
  const offsets: [number, number][] = [
    [0.15, -0.15],
    [0.15, 0.15],
    [-0.15, -0.15],
    [-0.15, 0.15],
  ];
  offsets.forEach(([x, z]) => {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.06, 0.08, 20),
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.7,
        side: THREE.DoubleSide,
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.02, z);
    leadGroup.add(ring);
  });

  leadGroup.visible = false;
  return leadGroup;
}
