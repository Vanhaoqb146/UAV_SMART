# Kế hoạch Đo kiểm POC (POC Test Plan & Acceptance Criteria)

## 1. Cấu hình Máy Mục tiêu
- **CPU**: 13th Gen Intel(R) Core(TM) i7-1360P (12 nhân / 16 luồng)
- **GPU**: Intel(R) Iris(R) Xe Graphics (GPU tích hợp)
- **RAM**: 16 GB
- **Hệ điều hành**: Windows 11 64-bit

## 2. Danh mục Tiêu chí Nghiệm thu POC & V1.0 Core

| Mã | Hạng mục kiểm tra | Ngưỡng nghiệm thu | Phương pháp kiểm chứng |
|---|---|---|---|
| **POC-01** | Ba chế độ bay (`position_hold`, `altitude_hold`, `angle`) | Cất cánh, giữ vị trí/độ cao sai số < 0.15m, đáp ứng góc nghiêng đúng chiều | `pytest tests/test_flight_modes.py` |
| **POC-02** | Xung nhịp mô phỏng thời gian thực | Vật lý 240Hz / Điều khiển 60Hz; tốc độ tối đa CPU > 500 bước/giây (dư > 8x so với 60Hz) | `pytest tests/test_realtime_loop.py` & `scripts/bench_realtime.py` |
| **POC-03** | An toàn mất kết nối tay cầm (Failsafe) | Ngừng gửi input > 0.5s tự động kích hoạt `FAILSAFE`, chuyển sang giữ vị trí/hạ cánh và ghi sự kiện | `pytest tests/test_failsafe.py` |
| **POC-04** | Phát lại tất định (Deterministic Replay) | Chạy lại cùng `seed` + chuỗi `StickInput` cho ra quỹ đạo trùng khớp tuyệt đối (`max_pos_diff < 1e-6 m`) | `pytest tests/test_replay_determinism.py` |
| **POC-05** | Giáo trình bài tập BT01–BT08 & Phi công mẫu | Cả 8 bài tập nạp hợp lệ từ YAML; Phi công mẫu hoàn thành đạt điểm chuẩn >= 80/100 | `pytest tests/test_exercises.py` |
| **POC-06** | Chấm điểm Rubric & Phân tích lỗi thao tác | Phân biệt rõ phiên bay mượt (điểm cao) và phiên bay giật cần / chỉnh quá mức (`overcontrol_index` cao, trừ điểm thao tác) | `pytest tests/test_assessment.py` |
| **POC-07** | Giao thức WebSocket 60Hz & REST API | Kết nối `/ws/session`, gửi `StickInput`, nhận `state` + `events`, lưu và xuất CSV/Parquet/JSON | `pytest tests/test_ws_protocol.py` |
| **POC-08** | Vận hành Offline 100% | Toàn bộ bundle JS/CSS/Three.js/3D Model nạp nội bộ không gọi CDN ngoài | `npm.cmd run build` & kiểm tra mã nguồn |
