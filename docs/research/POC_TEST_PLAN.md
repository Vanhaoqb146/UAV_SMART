# Kế hoạch Kiểm thử POC Mô phỏng UAV (POC Test Plan)

Tài liệu này định nghĩa quy trình kiểm thử thực nghiệm giai đoạn POC theo đúng yêu cầu của `Outline.docx` và `Nghiên cứu mã nguồn mở.txt`.

## 1. Các Kịch bản Kiểm thử Bắt buộc

| Mã kịch bản | Nội dung kiểm thử | Đầu vào | Kết quả kỳ vọng |
|---|---|---|---|
| **TC-01** | Khởi tạo vật lý & Cất cánh từ mặt đất | `StickInput(throttle=0.75, arm=True)` ở chế độ `altitude_hold` | UAV cất cánh từ $z = 0.05\text{ m}$ lên $z = 1.5\text{ m}$ ổn định, không lật. |
| **TC-02** | Chế độ Giữ vị trí (`position_hold`) | Bay tới điểm $(1.0, 1.0, 1.5)$ rồi nhả toàn bộ cần về trung tâm trong 10 giây | Độ trôi vị trí $< 0.10\text{ m}$, vận tốc tiệm cận $0\text{ m/s}$. |
| **TC-03** | Chế độ Giữ độ cao (`altitude_hold`) | Đẩy cần Pitch=0.4 trong khi giữ Throttle=0.5 (giữa) | UAV nghiêng về phía trước và tiến tới nhưng vẫn giữ nguyên độ cao $\pm 0.10\text{ m}$. |
| **TC-04** | Chế độ Tự cân bằng (`angle`) | Đặt Roll=0.5, Throttle cân bằng trọng lực | Góc Roll thực tế hội tụ về $0.5 \times \theta_{\max}$ ($15^\circ \pm 3^\circ$). |
| **TC-05** | Mất kết nối Tay cầm USB (Failsafe) | Ngừng gửi gói tin `input` quá $0.5\text{ s}$ khi đang bay | Hệ thống tự động chuyển sang trạng thái `FAILSAFE`, giữ vị trí rồi hạ cánh chậm và ghi sự kiện cảnh báo. |
| **TC-06** | Phát lại Tất định (Deterministic Replay) | Ghi nhận phiên bay 300 bước với hạt giống `seed=42`, sau đó mô phỏng lại từ chuỗi `StickInput` | Sai số tọa độ tối đa giữa 2 lần chạy $< 10^{-6}\text{ m}$. |
| **TC-07** | Hiệu năng Thời gian thực & Độ trễ | Chạy vòng lặp 60Hz liên tục và đo thời gian tính toán mỗi bước | Thời gian tính toán mỗi bước điều khiển $< 2.5\text{ ms}$ (tương đương $>400\text{ Hz}$, đảm bảo chạy 60Hz dư tải trên CPU i7-1360P). |
| **TC-08** | Vận hành Offline | Build ứng dụng web và chạy không cần Internet | Không có bất kỳ request nào gọi ra tên miền ngoài (`unpkg`, `googleapis`, v.v.). |
