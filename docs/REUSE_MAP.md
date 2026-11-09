# Bản đồ Kế thừa Có Kiểm soát từ `drone-rl-lab` (Reuse Map)

Tài liệu này ghi rõ các thành phần kỹ thuật được chép và điều chỉnh từ [`drone-rl-lab`](../../drone-rl-lab) sang `uav-smart-training`. Hai thư mục hoàn toàn độc lập, không import chéo.

| Thành phần tại `drone-rl-lab` | Phân loại | Vị trí mới tại `uav-smart-training` | Nội dung kế thừa & Điều chỉnh |
|---|---|---|---|
| `third_party/gym-pybullet-drones` (commit `348b5c18`) | **ADOPT** | `engine/third_party/gym-pybullet-drones` | Giữ nguyên thư viện vật lý lõi (`BaseAviary`, `DSLPIDControl`, `cf2x.urdf`, `racer.urdf`). |
| `envs/base_task.py` (gió OU, va chạm, thông số CF2X) | **ADAPT** | `engine/uavsim/environment/wind.py`<br/>`engine/uavsim/vehicle/pybullet_vehicle.py` | Tách mô hình gió nền + gió giật Ornstein-Uhlenbeck (`wind_cd = 0.02`, `tau = 2.0s`) và kiểm tra va chạm `getContactPoints` khỏi `gym.Env` của RL để phục vụ vòng lặp thời gian thực 60Hz. |
| `envs/obstacle.py` (cột chướng ngại vật hình trụ) | **ADAPT** | `engine/uavsim/environment/obstacles.py` | Dựng các cột trụ vật lý trong PyBullet và tính khoảng cách tịnh tiến ngắn nhất tới bề mặt cột cho bài tập BT07 & BT08. |
| `agents/controllers.py` (`PIDBaseline`, `APFBaseline`) | **ADAPT** | `engine/uavsim/reference/instructor_pilot.py` | Chuyển đổi bộ điều khiển PID/APF thành **Phi công mẫu (Instructor Demo Pilot)** tạo tín hiệu điều khiển mẫu `StickInput` cho từng bài tập BT01–BT08 để học viên xem minh họa và so sánh quỹ đạo. |
| `evaluation/trajectory.py` (`drone-traj/1`) | **ADAPT** | `engine/uavsim/flight_data/schema.py`<br/>`engine/uavsim/flight_data/exporter.py` | Nâng cấp lên schema `uav-session/1` bổ sung 4 kênh cần điều khiển (`throttle, yaw, pitch, roll`), chế độ bay, tiến độ bài tập và điểm số Rubric; kèm hàm `to_legacy_drone_traj()` để tương thích ngược. |
| `viewer/index.html` & `viewer/models/cf2.glb` | **ADAPT / ADOPT** | `app/src/scene/FlightScene3D.tsx`<br/>`app/public/models/cf2.glb` | Kế thừa công thức chuyển đổi hệ trục PyBullet Z-up sang Three.js Y-up `(x, z, -y)`, quaternion `rpyToThree`, bóng đổ hình đĩa, mũi tên gió, cột chướng ngại vật và model `cf2.glb`; đóng gói Three.js cục bộ không dùng CDN. |
| `perception/` (YOLO) & `envs/target.py` (G4) | **REJECT** | *(Không sử dụng)* | Loại bỏ theo mục 1.4 của `Outline.docx` (không mô phỏng chỉ thị/bám mục tiêu tác chiến). |
| `train.py` (PPO RL Training) | **REJECT** | *(Giữ nguyên tại `drone-rl-lab`)* | `uav-smart-training` tập trung vào huấn luyện học viên con người lái trực tiếp. |
