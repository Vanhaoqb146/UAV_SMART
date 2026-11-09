# UAV Smart Training — Hệ thống Mô phỏng Huấn luyện Lái UAV & Chấm điểm Tự động

Phần mềm huấn luyện học viên điều khiển UAV/Drone 3D thời gian thực bằng **Tay điều khiển USB (Gamepad / RC Controller HID) hoặc Bàn phím**, kèm giáo trình chuẩn hóa **BT01–BT08**, chấm điểm định lượng theo **Rubric**, phân tích lỗi thao tác cần điều khiển và phát lại (Replay) phiên bay 3D hoàn toàn **Offline**.

---

## 1. Kiến trúc tổng thể

Dự án được tổ chức độc lập với [`drone-rl-lab`](../drone-rl-lab) theo kiến trúc tách lớp rõ ràng:

- **`engine/` (Python 3.12 + PyBullet 240Hz + FastAPI WebSocket 60Hz)**:
  - `uavsim/domain/`: Hợp đồng dữ liệu thuần (`StickInput`, `VehicleState`, `FlightEvent`, `SessionConfig`).
  - `uavsim/vehicle/`: Adapter vật lý `PyBulletVehicle` đóng gói `gym-pybullet-drones` (`CF2X` mặc định + hỗ trợ mở rộng hồ sơ UAV).
  - `uavsim/flight_modes/`: 3 chế độ bay huấn luyện (`position_hold` Giữ vị trí, `altitude_hold` Giữ độ cao, `angle` Tự cân bằng ga trực tiếp).
  - `uavsim/environment/`: Mô hình gió nền + gió giật Ornstein-Uhlenbeck (`wind_cd = 0.02`), chướng ngại vật hình trụ.
  - `uavsim/exercises/`: Giáo trình bài tập chuẩn hóa **BT01 → BT08** định nghĩa bằng YAML kèm bộ kiểm tra tiến độ thời gian thực.
  - `uavsim/session/`: Vòng lặp thời gian thực `SessionLoop` (vật lý 240Hz / điều khiển 60Hz), cơ chế **Failsafe** tự giữ vị trí & hạ cánh khi mất tín hiệu tay cầm > 0.5s, và **Phi công mẫu (AI/PID Instructor Demo)**.
  - `uavsim/flight_data/`: Ghi nhận telemetry chuẩn `uav-session/1`, xuất CSV / Parquet / `drone-traj/1`, và kiểm chứng phát lại tất định (Deterministic Replay).
  - `uavsim/assessment/`: Chấm điểm định lượng theo **Rubric 100 điểm** có phiên bản và chẩn đoán hành vi thao tác cần (độ giật cần, chỉnh quá mức over-control, độ trễ phản ứng).
- **`app/` (React + TypeScript + Vite + Tailwind + Three.js Offline)**:
  - **Thư viện Bài tập (BT01–BT08)**: Chọn bài tập, chế độ bay, mức gió hoặc xem Phi công mẫu bay minh họa.
  - **Phòng bay 3D & HUD Buồng lái**: Hiển thị 3D Three.js mượt trên GPU tích hợp (Iris Xe), góc nhìn Bám theo (Chase) / Người lái (FPV) / Tự do (Orbit), HUD độ cao - tốc độ - la bàn - chân trời nhân tạo, hành lang bay & cổng waypoint.
  - **Cấu hình & Hiệu chuẩn Tay cầm USB**: Tự nhận diện tay cầm USB (Gamepad API Mode 2 / Mode 1), hiệu chuẩn min/center/max, deadzone, expo, đảo trục, kèm điều khiển bàn phím dự phòng trực quan.
  - **Chấm điểm Rubric & Phát lại 3D**: Bảng điểm chi tiết 100 điểm, nhận xét lỗi thao tác giải thích được, thanh trượt phát lại 3D và nút xuất CSV/Parquet.

---

## 2. Cài đặt & Khởi chạy nhanh (Windows)

### Bước 1: Thiết lập môi trường (chỉ chạy 1 lần)
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup_env.ps1
```

### Bước 2: Khởi chạy phần mềm (Backend + Giao diện 3D)
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run_dev.ps1
```
Hoặc nhấp đúp vào `scripts\run_app.bat`, sau đó mở trình duyệt tại **`http://localhost:5173`**.

---

## 3. Kiểm thử tự động

```powershell
# Kiểm thử Python Simulation & Assessment Engine
cd engine
.\.venv\python.exe -m pytest -v

# Kiểm thử & Build Frontend Offline
cd ..\app
npm.cmd run test
npm.cmd run build
```

---

## 4. Tài liệu kỹ thuật (`docs/`)
- [`docs/PROJECT_CONTEXT.md`](docs/PROJECT_CONTEXT.md): Bối cảnh, mục tiêu, người dùng và phạm vi dự án.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): Kiến trúc 7 lớp, hướng phụ thuộc và giao thức thời gian thực.
- [`docs/DECISIONS.md`](docs/DECISIONS.md): Hồ sơ quyết định kiến trúc (ADR).
- [`docs/REUSE_MAP.md`](docs/REUSE_MAP.md): Bản đồ kế thừa có kiểm soát từ `drone-rl-lab`.
- [`docs/POC_TEST_PLAN.md`](docs/POC_TEST_PLAN.md): Kế hoạch và kết quả đo kiểm POC trên máy mục tiêu (Intel Core i7-1360P / Iris Xe).
- [`docs/UBUNTU_GPU_INTEGRATION_PLAN.md`](docs/UBUNTU_GPU_INTEGRATION_PLAN.md): Nhật ký các mốc tiến độ và kế hoạch kết nối trạm máy chủ Ubuntu GPU (RTX 5060 - 192.168.0.54) cho Huấn luyện AI & ArduPilot SITL.
- [`docs/research/`](docs/research/): Bộ 6 tài liệu nghiên cứu mã nguồn mở (`gym-pybullet-drones`, `RC-Flight-Sim`, `Sky-Sim 3.0`, `RotorPy`).
