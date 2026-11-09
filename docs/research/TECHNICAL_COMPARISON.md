# Bảng So sánh Kỹ thuật Các Giải pháp Mô phỏng (Technical Comparison)

| Tiêu chí đánh giá | `gym-pybullet-drones` (PyBullet) | `RC-Flight-Sim` (Godot + JSBSim) | `Sky-Sim 3.0` (Web Three.js) | `RotorPy` (Python SE3) | ArduPilot SITL / PX4 SIH |
|---|---|---|---|---|---|
| **Loại phương tiện chính** | Quadcopter / Multirotor 6-DOF | Máy bay cánh bằng (Fixed-wing) | Quadcopter trên trình duyệt | Multirotor toán học | Đa dạng (Quad, Plane, VTOL) |
| **Tần số vật lý** | 240 Hz – 500 Hz (C++ Bullet) | 60 Hz – 120 Hz | Phụ thuộc FPS trình duyệt | Tuỳ chỉnh (ODE solver) | 400 Hz |
| **Hiệu năng trên CPU Intel i7-1360P (Iris Xe)** | **Rất cao (>1.200 bước/s, chiếm <10% CPU cho 1 UAV)** | Trung bình (Godot 4 Vulkan nặng trên iGPU) | Khá (WebGL nhẹ) | Cao nhưng không có va chạm lưới 3D | Trung bình, tốn tài nguyên tiến trình |
| **Hỗ trợ va chạm môi trường 3D** | **Có sẵn (`getContactPoints`, raycast, hình trụ/hộp)** | Có trong Godot | Sơ sài | Không có engine va chạm 3D | Phụ thuộc trình mô phỏng ngoài (Gazebo) |
| **Tích hợp Python AI / Chấm điểm Rubric** | **Trực tiếp (Native Python)** | Khó (phải qua socket/GDExtension) | Phải truyền ngược từ trình duyệt về server | Trực tiếp (Native Python) | Qua MAVLink UDP/TCP |
| **Tính tất định khi Phát lại (Replay Determinism)** | **Tuyệt đối (Fixed timestep 240Hz + Seed)** | Khó đảm bảo giữa các máy | Phụ thuộc `requestAnimationFrame` | Cao | Khó đồng bộ lockstep trên Windows |
| **Đóng gói Offline trên Windows** | **Dễ (Wheel dựng sẵn + Web UI nội bộ)** | Dễ xuất `.exe` nhưng khó kèm Python AI | Dễ nhưng vướng bản quyền | Dễ nhưng thiếu 3D | **Rất phức tạp (cần Cygwin/WSL2)** |
| **Giấy phép (License)** | **MIT (An toàn thương mại)** | MIT/GPL | **Phi thương mại (Rủi ro pháp lý)** | MIT | GPLv3 |
| **Kết luận phân loại** | **ADOPT (Chọn làm lõi)** | **REJECT** | **REFERENCE** | **REFERENCE** | **REFERENCE (Hoãn sang bản mở rộng)** |
