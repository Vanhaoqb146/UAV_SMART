# Bối cảnh Dự án (Project Context) — UAV Smart Training

## 1. Mục tiêu cốt lõi
Xây dựng hệ thống phần mềm **Mô phỏng Huấn luyện Điều khiển UAV và Đánh giá Kỹ năng Tự động** chạy độc lập (Offline) trên máy tính Windows phổ thông (**CPU-first, GPU-ready**). Phần mềm phục vụ trực tiếp cho **học viên con người** luyện tập kỹ năng lái UAV qua tay điều khiển USB (hoặc bàn phím dự phòng) theo giáo trình chuẩn hóa và được chấm điểm khách quan.

## 2. Đối tượng sử dụng
1. **Học viên (Student)**:
   - Cầm tay điều khiển USB (Mode 2 mặc định hoặc Mode 1) thực hành các bài tập từ cơ bản đến nâng cao (**BT01 → BT08**).
   - Quan sát HUD buồng lái, nhận gợi ý trực tiếp trong lúc bay, xem Phi công mẫu (Instructor Demo) thực hiện bài bay chuẩn, tự xem lại phiên bay 3D và điểm số Rubric sau mỗi lượt.
2. **Giảng viên / Huấn luyện viên (Instructor)**:
   - Theo dõi tiến độ, xem lại quỹ đạo bay và biểu đồ thao tác cần của học viên.
   - Dựa trên bảng chấm điểm định lượng (Rubric 100 điểm) và chẩn đoán lỗi thao tác (chỉnh quá mức, giật cần, lệch hành lang, chạm đất mạnh) để nhận xét và duyệt kết quả.
3. **Quản trị viên (Admin / Kỹ thuật)**:
   - Cấu hình thiết bị tay cầm, hiệu chuẩn trục điều khiển, quản lý dữ liệu phiên bay cục bộ và xuất báo cáo CSV/Parquet.

## 3. Phạm vi triển khai (In-Scope)
- Mô phỏng vật lý Quadcopter 6-DOF tốc độ 240Hz bằng PyBullet (`gym-pybullet-drones`), vòng điều khiển & truyền trạng thái 60Hz qua WebSocket cục bộ.
- 3 chế độ bay huấn luyện thực tế:
  - **Giữ vị trí (`position_hold`)**: Dành cho người mới bắt đầu; nhả cần tự động đứng yên giữ vị trí 3D.
  - **Giữ độ cao (`altitude_hold`)**: Dành cho bài tập quỹ đạo; cần phải điều khiển góc nghiêng Roll/Pitch, cần ga điều khiển tốc độ leo/hạ và tự giữ độ cao khi để giữa.
  - **Tự cân bằng ga trực tiếp (`angle`)**: Dành cho huấn luyện nâng cao; người lái tự kiểm soát lực đẩy (Throttle) và góc nghiêng.
- Cơ chế an toàn **Failsafe**: Tự động chuyển sang Giữ vị trí và hạ cánh an toàn khi mất kết nối tay cầm quá 0.5 giây.
- Giáo trình 8 bài tập chuẩn hóa (**BT01–BT08**): Làm quen 4 trục, Cất cánh & giữ độ cao, Hover chính xác, Bay hình vuông, Bay hình số 8, Hạ cánh chính xác, Xử trí gió giật & chướng ngại vật, Kiểm tra tổng hợp.
- Ghi nhận đầy đủ Telemetry (`uav-session/1`), phát lại 3D tất định, xuất CSV/Parquet và chấm điểm Rubric + phân tích hành vi điều khiển.

## 4. Ngoài phạm vi (Out-of-Scope)
- Không bao gồm các tính năng tác chiến, vũ khí, hoặc nhận diện/bám mục tiêu con người bằng camera YOLO (phần G4 của `drone-rl-lab` được loại bỏ theo đúng mục 1.4 của `Outline.docx`).
- Không phụ thuộc dịch vụ đám mây hay CDN bên ngoài khi vận hành.
