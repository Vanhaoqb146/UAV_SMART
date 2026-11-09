# Đề xuất Kiến trúc Chi tiết (Architecture Proposal)

## 1. Nguyên lý Thiết kế
1. **CPU-First, GPU-Ready**:
   - Toàn bộ vật lý 240Hz, kiểm tra điều kiện bài tập, chấm điểm Rubric và chẩn đoán hành vi điều khiển chạy dưới 15% tải CPU trên chip Intel Core i7-1360P.
   - Đồ họa 3D sử dụng các hình học tối ưu (Low-poly `cf2.glb`, Instanced/Cylinder meshes, Shadow disc) để đạt **60 FPS ổn định trên Intel Iris Xe Graphics**.
2. **Offline-First & Self-Contained**:
   - Mọi thư viện giao diện (React, Three.js, Lucide Icons, Tailwind CSS) được đóng gói nội bộ.
   - Dữ liệu phiên bay lưu trực tiếp trên ổ cứng cục bộ (`data/sessions/`) theo định dạng chuẩn hóa `uav-session/1` (JSON + CSV + Parquet).
3. **Chống làm giả & Truy vết tuyệt đối (Auditability)**:
   - Điểm số Rubric không bao giờ được gán cứng mà luôn tính toán từ chuỗi khung hình `frames` thực tế của phiên bay.
   - Mỗi phiên bay lưu kèm chữ ký cấu hình (`seed`, `exercise_version`, `rubric_version`, `gpd_commit`).

## 2. Giao diện Tích hợp Giữa Các Tầng
- **`StickInput`**:
  - `throttle`: `[0.0, 1.0]` (Chuẩn hóa từ trục $[-1, 1]$ của tay cầm USB hoặc phím `W`/`S`).
  - `yaw`: `[-1.0, 1.0]` (Trục xoay mũi: phím `A`/`D` hoặc cần trái ngang Mode 2).
  - `pitch`: `[-1.0, 1.0]` (Trục tiến/lùi: phím `Up`/`Down` hoặc cần phải dọc Mode 2).
  - `roll`: `[-1.0, 1.0]` (Trục nghiêng trái/phải: phím `Left`/`Right` hoặc cần phải ngang Mode 2).
  - `arm`: `bool` (Khóa/Mở khóa động cơ).
  - `mode_switch`: `0` (`position_hold`), `1` (`altitude_hold`), `2` (`angle`).
- **`AssessmentResult` (Rubric 100 điểm)**:
  - **Nhóm Độ chính xác Quỹ đạo & Vị trí (40 điểm)**: Sai số RMSE vị trí/độ cao, tỷ lệ thời gian nằm trong hành lang chuẩn.
  - **Nhóm Hoàn thành Nhiệm vụ & Thời gian (25 điểm)**: Tỷ lệ cổng/mục tiêu đạt được, tốc độ chạm đất khi hạ cánh.
  - **Nhóm Kỹ năng Thao tác Cần điều khiển (20 điểm)**: Độ mượt cần (`stick_jerk`), chỉ số chỉnh quá mức (`overcontrol_index`), tỷ lệ bão hòa cần (`stick_saturation`).
  - **Nhóm An toàn Bay (15 điểm)**: Không va chạm chướng ngại vật, không vượt trần bay/biên sân tập, không chạm đất mạnh.
