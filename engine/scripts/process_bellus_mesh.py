"""Transforms OpenDroneMap 3D Textured Mesh of Bellus Village into:
1. WebGL Three.js OBJ (Y-Up, courtyard centered at 0, 0, 0, perfectly level takeoff zone)
2. PyBullet Collision Trimesh OBJ (Z-Up, courtyard centered at 0, 0, 0)
"""

from pathlib import Path
import numpy as np
from PIL import Image

def process_bellus():
    base_dir = Path(__file__).resolve().parents[2]
    input_obj = base_dir / "data" / "maps" / "bellus" / "bellus_mesh.obj"
    input_png = base_dir / "data" / "maps" / "bellus" / "bellus_texture.png"
    
    out_web_dir = base_dir / "app" / "public" / "models" / "photogrammetry"
    out_eng_dir = base_dir / "data" / "maps" / "bellus"
    out_web_dir.mkdir(parents=True, exist_ok=True)
    out_eng_dir.mkdir(parents=True, exist_ok=True)

    print(f"Reading OBJ from {input_obj}...")
    
    # 1. Exact courtyard takeoff center in village square
    center_x = -0.20
    center_y = 4.70
    plaza_z = -9.736
    print(f"Courtyard takeoff center: X={center_x:.4f}, Y={center_y:.4f}, Z={plaza_z:.4f}")

    # 2. Export Three.js WebGL OBJ (Y is Up, Z is South)
    web_obj_path = out_web_dir / "bellus_village_3d.obj"
    pyb_obj_path = out_eng_dir / "collision_mesh.obj"
    
    print(f"Writing Three.js OBJ to {web_obj_path}...")
    with open(input_obj, "r", encoding="utf-8") as fin, \
         open(web_obj_path, "w", encoding="utf-8") as fweb, \
         open(pyb_obj_path, "w", encoding="utf-8") as fpyb:
        
        fweb.write("# Bellus European Village 3D Photogrammetry Mesh for WebGL Three.js\n")
        fweb.write("mtllib bellus_village_3d.mtl\n")
        fweb.write("usemtl material0000\n")
        
        fpyb.write("# Bellus European Village Collision Mesh for PyBullet\n")
        
        for line in fin:
            if line.startswith("v "):
                parts = [float(x) for x in line.strip().split()[1:4]]
                # Centered PyBullet coordinates (Z-Up)
                px = parts[0] - center_x
                py = parts[1] - center_y
                pz = parts[2] - plaza_z
                
                # Smooth level takeoff zone in central courtyard (r < 2.0m)
                r_dist = np.hypot(px, py)
                if r_dist < 2.0:
                    blend = min(1.0, (r_dist / 2.0) ** 2)
                    pz = pz * blend
                
                fpyb.write(f"v {px:.4f} {py:.4f} {pz:.4f}\n")
                
                # Three.js coordinates (Y-Up: X_3 = px, Y_3 = pz, Z_3 = -py)
                tx = px
                ty = pz
                tz = -py
                fweb.write(f"v {tx:.4f} {ty:.4f} {tz:.4f}\n")
            elif line.startswith("vt "):
                fweb.write(line)
            elif line.startswith("vn "):
                parts = [float(x) for x in line.strip().split()[1:4]]
                fweb.write(f"vn {parts[0]:.4f} {parts[2]:.4f} {-parts[1]:.4f}\n")
            elif line.startswith("f "):
                fweb.write(line)
                parts = line.strip().split()[1:]
                f_indices = [p.split("/")[0] for p in parts]
                if len(f_indices) >= 3:
                    fpyb.write(f"f {' '.join(f_indices)}\n")

    # 3. Write WebGL MTL file
    web_mtl_path = out_web_dir / "bellus_village_3d.mtl"
    with open(web_mtl_path, "w", encoding="utf-8") as fmtl:
        fmtl.write("newmtl material0000\n")
        fmtl.write("Ka 1.000 1.000 1.000\n")
        fmtl.write("Kd 1.000 1.000 1.000\n")
        fmtl.write("Ks 0.050 0.050 0.050\n")
        fmtl.write("Ns 10.0\n")
        fmtl.write("map_Kd bellus_texture.jpg\n")

    # 4. Texture check
    target_tex = out_web_dir / "bellus_texture.jpg"
    if not target_tex.exists():
        print(f"Optimizing texture from {input_png}...")
        tex = Image.open(input_png).convert("RGB")
        tex.save(target_tex, quality=90, optimize=True)
    
    print("Bellus Village 3D processing complete!")

if __name__ == "__main__":
    process_bellus()
