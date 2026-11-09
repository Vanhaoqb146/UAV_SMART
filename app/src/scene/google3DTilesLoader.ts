import * as THREE from "three";
import { TilesRenderer } from "3d-tiles-renderer";
import {
  GLTFExtensionsPlugin,
  GoogleCloudAuthPlugin,
  ReorientationPlugin,
} from "3d-tiles-renderer/plugins";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { createHelipadMarkings } from "./fieldObstacleBuilder";

export interface Google3DLocationConfig {
  id: string;
  name: string;
  subtitle: string;
  lat: number;
  lon: number;
  alt: number;
  apiKey?: string;
}

export const GOOGLE_3D_PRESETS: Google3DLocationConfig[] = [
  {
    id: "landmark81_hcm",
    name: "Landmark 81 & Vinhomes Central Park",
    subtitle: "TP. Hồ Chí Minh, Việt Nam (10.7951°N, 106.7219°E)",
    lat: 10.7951,
    lon: 106.7219,
    alt: 8,
  },
  {
    id: "dragon_bridge_dn",
    name: "Cầu Rồng & Bờ Sông Hàn",
    subtitle: "Đà Nẵng, Việt Nam (16.0611°N, 108.2272°E)",
    lat: 16.0611,
    lon: 108.2272,
    alt: 7,
  },
  {
    id: "hoan_kiem_hn",
    name: "Hồ Gươm & Tháp Rùa Phố Cổ",
    subtitle: "Hà Nội, Việt Nam (21.0285°N, 105.8542°E)",
    lat: 21.0285,
    lon: 105.8542,
    alt: 10,
  },
  {
    id: "manhattan_ny",
    name: "Lower Manhattan & Financial District",
    subtitle: "New York, Hoa Kỳ (40.7061°N, 74.0088°W)",
    lat: 40.7061,
    lon: -74.0088,
    alt: 12,
  },
  {
    id: "eiffel_paris",
    name: "Tháp Eiffel & Quảng Trường Champ-de-Mars",
    subtitle: "Paris, Pháp (48.8584°N, 2.2945°E)",
    lat: 48.8584,
    lon: 2.2945,
    alt: 30,
  },
  {
    id: "shibuya_tokyo",
    name: "Shibuya Sky & Trung Tâm Tokyo",
    subtitle: "Tokyo, Nhật Bản (35.6595°N, 139.7005°E)",
    lat: 35.6595,
    lon: 139.7005,
    alt: 22,
  },
];

const STORAGE_KEY_API = "uav_google_3d_api_key";
const STORAGE_KEY_LOC = "uav_google_3d_location";

export function loadSavedGoogle3DConfig(): Google3DLocationConfig {
  const apiKey = localStorage.getItem(STORAGE_KEY_API) || "";
  try {
    const raw = localStorage.getItem(STORAGE_KEY_LOC);
    if (raw) {
      const parsed = JSON.parse(raw) as Google3DLocationConfig;
      if (typeof parsed.lat === "number" && typeof parsed.lon === "number") {
        return { ...parsed, apiKey };
      }
    }
  } catch {
    // Fallback to default preset
  }
  return { ...GOOGLE_3D_PRESETS[0], apiKey };
}

export function saveGoogle3DConfig(config: Google3DLocationConfig): void {
  if (config.apiKey !== undefined) {
    localStorage.setItem(STORAGE_KEY_API, config.apiKey.trim());
  }
  localStorage.setItem(
    STORAGE_KEY_LOC,
    JSON.stringify({
      id: config.id,
      name: config.name,
      subtitle: config.subtitle,
      lat: config.lat,
      lon: config.lon,
      alt: config.alt,
    })
  );
}

/**
 * Parses a pasted Google Maps URL (e.g. https://www.google.com/maps/@10.7951,106.7219,17z)
 * or raw "lat, lon" coordinate string into validated WGS84 coordinates.
 */
export function parseGoogleMapsCoordinates(
  input: string
): { lat: number; lon: number } | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Match @lat,lon in Google Maps URLs
  const atMatch = trimmed.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (atMatch) {
    const lat = parseFloat(atMatch[1]);
    const lon = parseFloat(atMatch[2]);
    if (lat >= -85 && lat <= 85 && lon >= -180 && lon <= 180) {
      return { lat, lon };
    }
  }

  // Match !3dLAT!4dLON in Google Maps place URLs
  const placeMatch = trimmed.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (placeMatch) {
    const lat = parseFloat(placeMatch[1]);
    const lon = parseFloat(placeMatch[2]);
    if (lat >= -85 && lat <= 85 && lon >= -180 && lon <= 180) {
      return { lat, lon };
    }
  }

  // Match plain "lat, lon" or "lat lon"
  const pairMatch = trimmed.match(/(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)/);
  if (pairMatch) {
    const lat = parseFloat(pairMatch[1]);
    const lon = parseFloat(pairMatch[2]);
    if (lat >= -85 && lat <= 85 && lon >= -180 && lon <= 180) {
      return { lat, lon };
    }
  }

  return null;
}

/**
 * Converts WGS84 (lat, lon) to Web Mercator Slippy Map tile coordinates (x, y) at a given zoom level.
 */
export function latLonToSlippyTile(
  lat: number,
  lon: number,
  zoom: number
): { x: number; y: number } {
  const n = Math.pow(2, zoom);
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
  );
  return { x, y };
}

export interface Google3DSceneController {
  rootGroup: THREE.Group;
  update: (camera: THREE.PerspectiveCamera, renderer: THREE.WebGLRenderer) => void;
  dispose: () => void;
}

/**
 * Builds a hybrid Real-World 3D Map for any GPS coordinate:
 * - Always renders real high-res satellite imagery (Esri World Imagery 3x3 tile grid) + 3D extruded landmarks.
 * - When a Google Cloud API Key is configured, streams live Google Photorealistic 3D Tiles via `3d-tiles-renderer`.
 */
export function createGoogle3DTilesScene(
  config: Google3DLocationConfig,
  beaconMeshes: THREE.Mesh[]
): Google3DSceneController {
  const rootGroup = new THREE.Group();
  let tilesRenderer: TilesRenderer | null = null;
  let dracoLoader: DRACOLoader | null = null;

  // 1. Real Satellite Imagery 3x3 Tile Matrix (Zoom 17, ~90m per tile -> 270m x 270m real satellite ortho)
  const zoom = 17;
  const centerTile = latLonToSlippyTile(config.lat, config.lon, zoom);
  const tileSizeM = 90;
  const texLoader = new THREE.TextureLoader();
  texLoader.setCrossOrigin("anonymous");

  const satelliteGroup = new THREE.Group();
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const tx = centerTile.x + dx;
      const ty = centerTile.y + dy;
      const tileUrl = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${ty}/${tx}`;

      const tileMat = new THREE.MeshStandardMaterial({
        color: 0x334155,
        roughness: 0.88,
        metalness: 0.04,
      });

      texLoader.load(
        tileUrl,
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.anisotropy = 8;
          tileMat.map = tex;
          tileMat.color.setHex(0xffffff);
          tileMat.needsUpdate = true;
        },
        undefined,
        () => {
          // Graceful offline fallback color
        }
      );

      const tilePlane = new THREE.Mesh(
        new THREE.PlaneGeometry(tileSizeM, tileSizeM),
        tileMat
      );
      tilePlane.rotation.x = -Math.PI / 2;
      tilePlane.position.set(dx * tileSizeM, -0.015, dy * tileSizeM);
      tilePlane.receiveShadow = true;
      satelliteGroup.add(tilePlane);
    }
  }
  rootGroup.add(satelliteGroup);

  // 2. Build 3D Extruded Landmarks & Urban Blocks around the GPS Takeoff Zone
  const landmarkGroup = buildGpsExtruded3DBuildings(config, beaconMeshes);
  rootGroup.add(landmarkGroup);

  // 3. If Google Maps API Key is provided, stream live Google Photorealistic 3D Tiles
  const apiKey = (config.apiKey || "").trim();
  if (apiKey.length > 10) {
    try {
      tilesRenderer = new TilesRenderer();
      dracoLoader = new DRACOLoader();
      dracoLoader.setDecoderPath(
        "https://www.gstatic.com/draco/versioned/decoders/1.5.6/"
      );

      tilesRenderer.registerPlugin(
        new GoogleCloudAuthPlugin({
          apiToken: apiKey,
          autoRefreshToken: true,
          useRecommendedSettings: true,
        })
      );
      tilesRenderer.registerPlugin(
        new GLTFExtensionsPlugin({
          dracoLoader,
          rtc: true,
        })
      );
      tilesRenderer.registerPlugin(
        new ReorientationPlugin({
          lat: THREE.MathUtils.degToRad(config.lat),
          lon: THREE.MathUtils.degToRad(config.lon),
          height: config.alt,
          recenter: true,
        })
      );

      rootGroup.add(tilesRenderer.group);
    } catch (err) {
      console.warn("Google 3D Tiles initialization warning:", err);
    }
  }

  return {
    rootGroup,
    update: (camera: THREE.PerspectiveCamera, renderer: THREE.WebGLRenderer) => {
      if (tilesRenderer) {
        tilesRenderer.setCamera(camera);
        tilesRenderer.setResolutionFromRenderer(camera, renderer);
        camera.updateMatrixWorld();
        tilesRenderer.update();
      }
    },
    dispose: () => {
      if (tilesRenderer) {
        tilesRenderer.dispose();
        tilesRenderer = null;
      }
      if (dracoLoader) {
        dracoLoader.dispose();
        dracoLoader = null;
      }
    },
  };
}

/**
 * Generates deterministic 3D architectural buildings & iconic bridges/towers
 * keyed to the GPS coordinate so the flight zone always has crisp 3D depth.
 */
function buildGpsExtruded3DBuildings(
  config: Google3DLocationConfig,
  beaconMeshes: THREE.Mesh[]
): THREE.Group {
  const group = new THREE.Group();

  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    roughness: 0.14,
    metalness: 0.76,
  });
  const concreteMat = new THREE.MeshStandardMaterial({
    color: 0xcbd5e1,
    roughness: 0.65,
    metalness: 0.2,
  });
  const goldMat = new THREE.MeshStandardMaterial({
    color: 0xfacc15,
    roughness: 0.25,
    metalness: 0.65,
    emissive: 0xca8a04,
    emissiveIntensity: 0.25,
  });

  // Special Landmark for Da Nang Dragon Bridge (Cầu Rồng)
  if (config.id === "dragon_bridge_dn") {
    const bridgeDeck = new THREE.Mesh(
      new THREE.BoxGeometry(120, 0.7, 5.5),
      concreteMat
    );
    bridgeDeck.position.set(0, 4.2, -16);
    bridgeDeck.castShadow = true;
    group.add(bridgeDeck);

    // Iconic Golden Dragon Sinusoidal Arch Spans
    for (let i = -40; i <= 40; i += 2) {
      const waveY = 4.5 + Math.max(0, Math.sin((i / 18) * Math.PI) * 5.2);
      const archSeg = new THREE.Mesh(new THREE.SphereGeometry(0.65, 10, 10), goldMat);
      archSeg.position.set(i, waveY, -16);
      group.add(archSeg);
    }
  }

  // Deterministic OSM-style 3D extruded building footprints seeded by (lat, lon)
  const seedBase = Math.abs(Math.sin(config.lat * 12.9898 + config.lon * 78.233));
  const ringPositions: [number, number][] = [
    [-16, -15],
    [-16, -4],
    [-16, 8],
    [-16, 18],
    [16, -15],
    [16, -3],
    [16, 9],
    [16, 19],
    [-6, -19],
    [6, -19],
    [-6, 19],
    [6, 19],
  ];

  ringPositions.forEach(([bx, bz], i) => {
    const h = 8.0 + ((seedBase * (i + 3) * 17.3) % 16.0);
    const w = 3.8 + ((i * 1.3) % 2.2);
    const d = 3.8 + ((i * 1.7) % 2.2);

    const bMesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      i % 2 === 0 ? glassMat : concreteMat
    );
    bMesh.position.set(bx, h * 0.5, bz);
    bMesh.castShadow = true;
    bMesh.receiveShadow = true;
    group.add(bMesh);

    if (i % 4 === 0) {
      group.add(createHelipadMarkings(new THREE.Vector3(bx, h + 0.05, bz), 0x38bdf8));
      const beacon = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 8, 8),
        new THREE.MeshStandardMaterial({
          color: 0xef4444,
          emissive: 0xef4444,
          emissiveIntensity: 1.0,
        })
      );
      beacon.position.set(bx + w * 0.4, h + 0.15, bz + d * 0.4);
      group.add(beacon);
      beaconMeshes.push(beacon);
    }
  });

  return group;
}
