# Hồ sơ Quyết định Kiến trúc (Architecture Decision Records - ADR)

## ADR-001: Chọn `gym-pybullet-drones` (PyBullet) làm Engine Vật lý Chính
- **Trạng thái**: Đã phê duyệt (ADOPT)
- **Bối cảnh**: Dự án yêu cầu chạy mượt trên máy tính Windows CPU phổ thông (Intel Core i7-1360P, GPU tích hợp Iris Xe, không có MSVC C++ compiler), hỗ trợ 240Hz, có va chạm và mô hình gió, dễ kết nối với module chấm điểm/AI bằng Python.
- **Quyết định**: Sử dụng `utiasDSL/gym-pybullet-drones` (commit `348b5c18a4bb770a48928b9d044decf77ca33302`) kết hợp bản dựng sẵn `pybullet 3.25` từ `conda-forge`.
- **Lý do**:
  - Tốc độ thực tế đạt >1.200 bước điều khiển/giây trên CPU (nhanh gấp 20 lần yêu cầu thời gian thực 60Hz).
  - Giấy phép MIT, hoàn toàn mã nguồn mở và thương mại hóa hợp pháp.
  - Không yêu cầu biên dịch firmware phức tạp như ArduPilot SITL / PX4 SIH.
- **Phương án thay thế**:
  - `RC-Flight-Sim` (Godot 4 + JSBSim): **REJECT** vì JSBSim thiết kế cho máy bay cánh bằng, thiếu mô hình quadcopter 4 motor độc lập và khó tích hợp trực tiếp với Python.
  - `Sky-Sim 3.0`: **REFERENCE** cho công thức gió và pin, không dùng mã nguồn vì giấy phép hạn chế thương mại.
  - `RotorPy`: **REFERENCE** cho công thức khí động học nâng cao.

## ADR-002: Kiến trúc 3 Chế độ Bay Huấn luyện trên Bộ điều khiển Phân tầng (Cascade PID)
- **Trạng thái**: Đã phê duyệt (ADOPT)
- **Bối cảnh**: `DSLPIDControl` nguyên bản nhận đầu vào là vị trí hoặc vận tốc đích (`ActionType.PID` / `ActionType.VEL`), trong khi học viên cầm tay điều khiển cần luyện cả 3 chế độ thực tế: Giữ vị trí (`position_hold`), Giữ độ cao (`altitude_hold`), và Tự cân bằng ga trực tiếp (`angle`).
- **Quyết định**: Tách và tái sử dụng hai vòng điều khiển bên trong `DSLPIDControl` (`_dslPIDPositionControl` và `_dslPIDAttitudeControl`) để hiện thực hóa 3 bộ điều khiển chế độ bay độc lập trong `uavsim/flight_modes/`:
  1. `PositionHoldMode`: Cần điều khiển ánh xạ thành vận tốc đích `(vx, vy, vz)` + tốc độ quay `yaw_rate`; khi nhả cần (`|stick| == 0`), neo cứng tọa độ điểm dừng để giữ vị trí chống trôi do gió.
  2. `AltitudeHoldMode`: Cần Roll/Pitch ánh xạ trực tiếp thành góc nghiêng đích (`±25°`), cần Ga điều khiển tốc độ leo/hạ `vz` với bộ PID giữ độ cao tự động, cần Yaw điều khiển `yaw_rate`.
  3. `AngleMode`: Cần Ga điều khiển trực tiếp tổng lực đẩy (`thrust -> PWM`), cần Roll/Pitch điều khiển góc nghiêng đích (`±30°`), cần Yaw điều khiển `yaw_rate`.

## ADR-003: Giao diện React + Vite + Three.js Đóng gói Cục bộ 100% Offline
- **Trạng thái**: Đã phê duyệt (ADOPT)
- **Bối cảnh**: `viewer/index.html` ở repo cũ tải `three@0.170.0` từ `unpkg.com` và font từ `fonts.googleapis.com`, khiến ứng dụng không hoạt động khi ngắt mạng Internet (vi phạm yêu cầu Offline của `Outline.docx`).
- **Quyết định**: Xây dựng ứng dụng Frontend bằng **Vite + React + TypeScript + Tailwind CSS + Three.js** cài đặt cục bộ trong `package.json`, lưu trữ model 3D `cf2.glb` tại `app/public/models/cf2.glb`.

## ADR-004: Định dạng Phiên bay `uav-session/1` & Điểm số Truy vết từ Dữ liệu Thật
- **Trạng thái**: Đã phê duyệt (ADOPT)
- **Quyết định**:
  - Mỗi phiên bay lưu file JSON theo schema `uav-session/1` (gồm metadata thiết bị, bài tập, hạt giống ngẫu nhiên `seed`, toàn bộ khung hình `frames` với `sticks` + `pos` + `vel` + `rpy`, danh sách sự kiện `events`, và kết quả `AssessmentResult`).
  - Hỗ trợ xuất trực tiếp ra CSV, Parquet và định dạng tương thích ngược `drone-traj/1`.
  - Mọi điểm số trên giao diện đều được tính toán trực tiếp từ chuỗi khung hình thật, kèm kiểm chứng phát lại tất định (Deterministic Replay).
