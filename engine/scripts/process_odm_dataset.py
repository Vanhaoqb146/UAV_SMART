"""Processes OpenDroneMap photogrammetry dataset (DSM GeoTIFF + Orthophoto)
into 3D WebGL terrain assets and PyBullet physics collision meshes.

Features:
- Gaussian bilateral smoothing to eliminate spiky elevation artifacts.
- Perimeter skirts to seamlessly blend terrain boundaries into sea level.
- 1:1 true scale (140m x 134m) matching real aerial survey bounds.
- Level helipad landing zone on lush park lawn at origin (0, 0, 0).
"""

from __future__ import annotations

import json
from pathlib import Path
import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter


def process_odm_dataset(
    dsm_path: Path,
    ortho_path: Path,
    output_dir_frontend: Path,
    output_dir_engine: Path,
    grid_size: int = 128,
    area_width_m: float = 140.0,
    area_length_m: float = 134.0,
) -> None:
    output_dir_frontend.mkdir(parents=True, exist_ok=True)
    output_dir_engine.mkdir(parents=True, exist_ok=True)

    print(f"Loading DSM from {dsm_path}...")
    dsm_raw = np.array(Image.open(dsm_path), dtype=np.float32)

    # 1. Co-registered crop of DSM to valid model bounds
    # Valid model bounds: y=[321, 1678], x=[208, 1783]
    dsm_cropped = dsm_raw[321:1678, 208:1783]

    # Fill nodata (< -100) with sea level (~155.7m)
    valid_mask = dsm_cropped > -100.0
    sea_level = float(dsm_cropped[valid_mask].min()) if np.any(valid_mask) else 155.7
    dsm_cropped[~valid_mask] = sea_level

    # 2. Resize DSM to uniform 128x128 grid
    pil_dsm = Image.fromarray(dsm_cropped)
    scaled_dsm = pil_dsm.resize((grid_size, grid_size), Image.Resampling.BILINEAR)
    grid = np.array(scaled_dsm, dtype=np.float32)

    # 3. Apply Gaussian filter to eliminate high-frequency spikes and jagged noise
    # sigma=2.2 provides smooth natural park rolling slopes without noisy bumps
    smoothed = gaussian_filter(grid, sigma=2.2)

    # 4. Align Takeoff Helipad (0, 0) with the lush flat park lawn (col ~ 35%, row ~ 50%)
    park_r = int(grid_size * 0.50)
    park_c = int(grid_size * 0.35)
    park_elev = float(smoothed[park_r, park_c])

    # Convert to relative heights where park lawn center is 0.0m
    # Height scaling 0.38 provides realistic, gentle coastal dunes and lawns
    heights_rel = (smoothed - park_elev) * 0.38

    # Smooth level ground pad area at center helipad (radius 7 cells ~ 7.7m)
    for r in range(grid_size):
        for c in range(grid_size):
            d = np.hypot(r - park_r, c - park_c)
            if d < 7.0:
                blend = min(1.0, d / 7.0)
                heights_rel[r, c] *= blend

    # 5. Perimeter Horizon Skirts: Gently slope outer edges down into ocean sea level (-3.8m)
    # Eliminates any sharp boundary cutoff or floating cliffs
    target_sea_level = -3.8
    skirt_width = 7
    for r in range(grid_size):
        for c in range(grid_size):
            edge_dist = min(r, grid_size - 1 - r, c, grid_size - 1 - c)
            if edge_dist < skirt_width:
                factor = edge_dist / float(skirt_width)
                smooth_factor = 0.5 * (1.0 - np.cos(factor * np.pi))
                heights_rel[r, c] = heights_rel[r, c] * smooth_factor + target_sea_level * (1.0 - smooth_factor)

    # 6. Export WebGL JSON metadata
    meta = {
        "name": "Brighton Beach Real-World Drone Photogrammetry",
        "grid_size": grid_size,
        "width_m": area_width_m,
        "length_m": area_length_m,
        "min_height": float(heights_rel.min()),
        "max_height": float(heights_rel.max()),
        "texture_url": "/models/photogrammetry/brighton_beach.jpg",
        "heights": heights_rel.tolist(),
        "park_center_offset": [
            float((park_c / (grid_size - 1) - 0.5) * area_width_m),
            float((park_r / (grid_size - 1) - 0.5) * area_length_m),
        ],
    }
    json_path = output_dir_frontend / "terrain_elevation.json"
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(meta, f)
    print(f"Saved WebGL terrain metadata to {json_path}")

    # 7. Crop Orthophoto to eliminate pure white padding borders
    # Content bounds: y=[36, 1048], x=[352, 1504]
    ortho_img = Image.open(ortho_path).convert("RGB")
    ortho_cropped = ortho_img.crop((352, 36, 1504, 1048))
    # Resize to power-of-two 1024x1024 for optimal GPU mipmapping
    ortho_optimized = ortho_cropped.resize((1024, 1024), Image.Resampling.LANCZOS)
    target_tex_path = output_dir_frontend / "brighton_beach.jpg"
    ortho_optimized.save(target_tex_path, quality=92)
    print(f"Saved optimized Orthophoto texture to {target_tex_path}")

    # 8. Export Wavefront OBJ for PyBullet trimesh collision
    obj_path = output_dir_engine / "collision_mesh.obj"
    with open(obj_path, "w", encoding="utf-8") as f:
        f.write("# OpenDroneMap Photogrammetry Collision Mesh for PyBullet\n")
        dx = area_width_m / (grid_size - 1)
        dy = area_length_m / (grid_size - 1)
        x0 = -area_width_m * 0.5
        y0 = -area_length_m * 0.5

        # Vertices (PyBullet X, Y, Z where Z is Up)
        for r in range(grid_size):
            py = y0 + r * dy
            for c in range(grid_size):
                px = x0 + c * dx
                pz = float(heights_rel[r, c])
                f.write(f"v {px:.4f} {py:.4f} {pz:.4f}\n")

        # Faces (1-based indices)
        for r in range(grid_size - 1):
            for c in range(grid_size - 1):
                v1 = r * grid_size + c + 1
                v2 = r * grid_size + (c + 1) + 1
                v3 = (r + 1) * grid_size + (c + 1) + 1
                v4 = (r + 1) * grid_size + c + 1
                f.write(f"f {v1} {v2} {v3}\n")
                f.write(f"f {v1} {v3} {v4}\n")
    print(f"Saved PyBullet collision mesh to {obj_path}")

    # 9. Update TypeScript data for instant zero-latency frontend loading
    ts_path = output_dir_frontend.parents[2] / "src" / "scene" / "photogrammetryData.ts"
    flat_heights = [round(float(h), 3) for row in heights_rel.tolist() for h in row]
    ts_content = f"""// Generated by engine/scripts/process_odm_dataset.py
// Pre-baked real-world OpenDroneMap DSM elevation grid for instant zero-latency loading

export const PHOTOGRAMMETRY_GRID_SIZE = {grid_size};
export const PHOTOGRAMMETRY_WIDTH_M = {area_width_m:.1f};
export const PHOTOGRAMMETRY_LENGTH_M = {area_length_m:.1f};
export const PHOTOGRAMMETRY_PARK_OFFSET_X = {float((park_c / (grid_size - 1) - 0.5) * area_width_m):.2f};
export const PHOTOGRAMMETRY_PARK_OFFSET_Z = {float((park_r / (grid_size - 1) - 0.5) * area_length_m):.2f};

export const PHOTOGRAMMETRY_HEIGHTS = new Float32Array({flat_heights});
"""
    with open(ts_path, "w", encoding="utf-8") as f:
        f.write(ts_content)
    print(f"Saved TypeScript elevation module to {ts_path}")


if __name__ == "__main__":
    base = Path(__file__).resolve().parents[2]
    dsm = base / "data" / "maps" / "brighton_beach" / "dsm.tif"
    ortho = base / "data" / "maps" / "brighton_beach" / "brighton_beach.jpg"
    front = base / "app" / "public" / "models" / "photogrammetry"
    eng = base / "data" / "maps" / "brighton_beach"

    if dsm.exists() and ortho.exists():
        process_odm_dataset(dsm, ortho, front, eng)
    else:
        print(f"Error: Missing {dsm} or {ortho}")
