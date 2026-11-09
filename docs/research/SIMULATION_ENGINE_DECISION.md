# Quyết định Lựa chọn Engine Mô phỏng (Simulation Engine Decision)

## 1. Quyết định Chính thức
Chọn **`gym-pybullet-drones` (PyBullet 240Hz) kết hợp tầng hiển thị Three.js 60FPS qua WebSocket cục bộ** làm kiến trúc mô phỏng chính cho **UAV Smart Training**.

## 2. Cơ sở Kỹ thuật & Thực nghiệm
1. **Đã kiểm chứng thực tế trên phần cứng mục tiêu**:
   - Máy mục tiêu sử dụng CPU `Intel Core i7-1360P` và GPU tích hợp `Intel Iris Xe Graphics` (không có GPU rời NVIDIA, không cài Visual Studio C++ Build Tools).
   - Công thức cài đặt `pybullet 3.25` dựng sẵn từ `conda-forge` kết hợp `gym-pybullet-drones` đã chạy thành công 100%, đạt tốc độ **>1.200 bước điều khiển/giây** (gấp 20 lần tốc độ thời gian thực 60Hz).
2. **Tách bạch Vật lý (Physics) và Hiển thị (Rendering)**:
   - PyBullet chạy ở chế độ `p.DIRECT` (không mở cửa sổ OpenGL cũ kỹ của Bullet), đảm nhận tính toán động lực học 6-DOF ở tần số **240Hz**, gió giật Ornstein-Uhlenbeck và phát hiện va chạm chính xác.
   - Tầng hiển thị 3D sử dụng **Three.js** trên trình duyệt / WebView2 với mô hình `cf2.glb`, nội suy mượt ở **60 FPS**, hỗ trợ 3 góc nhìn (Chase, FPV, Orbit) và HUD buồng lái tiếng Việt.
3. **Sẵn sàng cho Chấm điểm Rubric & AI**:
   - Toàn bộ dữ liệu trạng thái `(pos, vel, rpy, ang_vel)` và tín hiệu tay cầm `(throttle, yaw, pitch, roll)` nằm ngay trong bộ nhớ Python, cho phép tính toán tức thời các chỉ số định lượng (RMSE vị trí/độ cao, lệch hành lang, tốc độ chạm đất, độ giật cần `stick_jerk`, chỉ số chỉnh quá mức `overcontrol_index`) và xuất file chuẩn `uav-session/1`.
4. **Khả năng mở rộng (Extensibility)**:
   - Tầng `PyBulletVehicle` đóng vai trò `SimulationAdapter`. Trong tương lai (V3.0), nếu cần kết nối phần cứng Flight Controller thật hoặc ArduPilot SITL qua MAVLink, chỉ cần bổ sung `MAVLinkVehicle` có cùng giao diện `step(stick_input) -> VehicleState` mà không phải sửa đổi UI, bài tập hay bộ chấm điểm.
