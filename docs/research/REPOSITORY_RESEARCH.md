# Báo cáo Nghiên cứu Các Repository Mã nguồn Mở (Repository Research)

Tài liệu này tổng hợp kết quả khảo sát kỹ thuật chuyên sâu đối với các repository mô phỏng UAV mã nguồn mở phục vụ dự án **UAV Smart Training** (Phần mềm mô phỏng huấn luyện điều khiển UAV 3D, tay cầm USB, chấm điểm Rubric và phân tích hành vi điều khiển trên Windows CPU-first / GPU-ready).

---

## 1. `utiasDSL/gym-pybullet-drones` (Đã kiểm chứng thực thi trên máy mục tiêu)
- **URL**: `https://github.com/utiasDSL/gym-pybullet-drones` (commit cố định `348b5c18a4bb770a48928b9d044decf77ca33302`)
- **Mức độ kiểm chứng**: **Đã đọc mã nguồn + Đã cài đặt và chạy thực tế trên máy Intel Core i7-1360P / Iris Xe**.
- **Ngôn ngữ & Công nghệ**: Python 3.10–3.12, PyBullet (C++ Bullet Physics backend), NumPy, SciPy, Gymnasium.
- **Giấy phép (License)**: **MIT License** (cho phép sử dụng, sửa đổi, đóng gói thương mại và nội bộ).
- **Kiến trúc kỹ thuật**:
  - `BaseAviary.py`: Quản lý thế giới vật lý PyBullet 240Hz, nạp mô hình URDF (`cf2x.urdf` 27g, `racer.urdf` 830g), tính lực đẩy 4 cánh quạt $F_i = k_f \cdot \omega_i^2$, mô-men xoắn phản kháng $M_i = k_m \cdot \omega_i^2$, hiệu ứng mặt đất (Ground Effect), lực cản không khí (Drag) và hiệu ứng Downwash.
  - `DSLPIDControl.py`: Bộ điều khiển PID phân tầng (Cascaded Position PID → Attitude Quaternion/Euler PID → Motor Mixing PWM/RPM).
- **Ưu điểm**:
  - Tốc độ thực thi cực nhanh trên CPU: đạt **> 1.200 bước điều khiển/giây** ở chế độ headless (`p.DIRECT`), dư gấp 20 lần yêu cầu thời gian thực 60Hz.
  - Viết hoàn toàn bằng Python nên kết nối trực tiếp với tầng chấm điểm Rubric, xuất dữ liệu Parquet/CSV và mô hình AI (ONNX/PyTorch) không cần cầu nối phức tạp.
- **Nhược điểm & Cách khắc phục**:
  - Đồ họa mặc định của cửa sổ PyBullet OpenGL cũ và sơ sài → **Khắc phục**: Chạy PyBullet ở chế độ `p.DIRECT` (ẩn) và hiển thị đồ họa 3D hiện đại qua **Three.js + WebGL** trên giao diện.
  - `DSLPIDControl` mặc định chỉ viết cho vị trí/vận tốc của CF2X → **Khắc phục**: Tách vòng điều khiển góc nghiêng (`_dslPIDAttitudeControl`) để xây dựng 3 chế độ bay tay cầm (`position_hold`, `altitude_hold`, `angle`).

---

## 2. `DaScient/RC-Flight-Sim`
- **URL**: `https://github.com/DaScient/RC-Flight-Sim`
- **Mức độ kiểm chứng**: Đã khảo sát kiến trúc mã nguồn và tài liệu kỹ thuật.
- **Ngôn ngữ & Công nghệ**: Godot Engine 4.x (GDScript / C#), JSBSim Flight Dynamics Model.
- **Giấy phép**: MIT / GPL thành phần phụ thuộc.
- **Đánh giá kỹ thuật**:
  - Dựa trên động lực học khí động cánh bằng (Fixed-Wing aerodynamics: Lift, Drag, Aileron, Elevator, Rudder).
  - Hỗ trợ quadcopter/multirotor rất hạn chế, không có sẵn bộ điều khiển phân tầng chuẩn cho 3 chế độ bay huấn luyện drone (Position Hold / Altitude Hold / Angle).
  - Việc kết nối luồng telemetry 60Hz sang hệ sinh thái Python (Polars, Scikit-learn, PyTorch, ONNX) đòi hỏi IPC phức tạp.
- **Quyết định**: **REJECT (Loại bỏ)**.

---

## 3. `vishwagw/Sky-Sim-drone-simulator-3.0`
- **URL**: `https://github.com/vishwagw/Sky-Sim-drone-simulator-3.0`
- **Mức độ kiểm chứng**: Đã khảo sát kiến trúc mã nguồn.
- **Ngôn ngữ & Công nghệ**: TypeScript / JavaScript, Three.js / WebGL, WebAssembly physics.
- **Giấy phép**: Giấy phép hạn chế thương mại (Source-available / Non-commercial).
- **Đánh giá kỹ thuật**:
  - Có giao diện HUD buồng lái trực quan trên trình duyệt, mô hình hóa pin sụt áp và nhiễu gió.
  - Tuy nhiên, toàn bộ vật lý chạy trên luồng trình duyệt (khó đảm bảo tính tất định tuyệt đối khi phát lại trên Python backend) và **giấy phép không cho phép thương mại hóa**.
- **Quyết định**: **REFERENCE (Chỉ tham khảo ý tưởng thiết kế HUD và mô hình nhiễu gió/pin; không sao chép mã nguồn)**.

---

## 4. `spencerfolk/rotorpy`
- **URL**: `https://github.com/spencerfolk/rotorpy`
- **Mức độ kiểm chứng**: Đã khảo sát mã nguồn công thức động lực học.
- **Ngôn ngữ & Công nghệ**: Python thuần (NumPy, SciPy, Matplotlib), điều khiển hình học SE(3).
- **Giấy phép**: MIT License.
- **Đánh giá kỹ thuật**:
  - Mô hình toán học khí động học cánh quạt và trường gió (Dryden / Ornstein-Uhlenbeck wind field) rất chuẩn xác.
  - Không có engine va chạm 3D thời gian thực như Bullet Physics và chỉ vẽ đồ thị tĩnh bằng Matplotlib.
- **Quyết định**: **REFERENCE (Tham khảo công thức trường gió Ornstein-Uhlenbeck để tích hợp vào PyBullet)**.
