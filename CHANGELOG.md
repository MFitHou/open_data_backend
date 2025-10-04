# Nhật ký thay đổi (Changelog)

Tất cả các thay đổi đáng chú ý của dự án sẽ được ghi lại trong file này.

Định dạng dựa trên [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
và dự án này tuân theo [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] - 2025 - 10 -04

### Đã sửa
- Sửa lỗi gửi request tới Fuseki server
- Cải thiện xử lý lỗi trong Fuseki service

### Đã thay đổi
- Cập nhật .env.example với cấu hình Fuseki đầy đủ hơn
- Cải thiện API query bằng SPARQL từ client

## [0.1.0] - 2025-10-03

### Đã thêm
- Thiết lập dự án NestJS ban đầu
- Cấu trúc ứng dụng cơ bản với các module chính
- Module tích hợp Fuseki cho SPARQL queries
- Hỗ trợ cấu hình môi trường với file .env mẫu
- Chức năng endpoint ATM
- Giấy phép MIT
- Cấu hình dự án cơ bản (TypeScript, ESLint, Jest)
- Package.json với tất cả dependencies cần thiết

### Hạ tầng
- Khung dự án với NestJS CLI
- Thiết lập testing với Jest
- Cấu hình môi trường phát triển
- Script build và deployment

### Tài liệu
- Tài liệu dự án ban đầu
- Cấu trúc README cơ bản

---

## Ghi chú phiên bản

### Cập nhật gần đây (2025-10-04)
- **Sửa lỗi kết nối Fuseki**: Cải thiện xử lý request tới Fuseki server
- **API SPARQL nâng cao**: Tối ưu hóa query từ phía client
- **Cấu hình môi trường**: Bổ sung thêm biến môi trường trong .env.example
- **Xử lý lỗi**: Cải thiện error handling trong Fuseki service

### Phiên bản 0.1.0 (Phát hành đầu tiên - 2025-10-03)
- **Phiên bản ổn định đầu tiên** của Open Data Backend
- Cung cấp **API cơ bản** cho xử lý dữ liệu mở
- Tích hợp **Apache Jena Fuseki** để xử lý SPARQL queries
- **Endpoint ATM** để lấy thông tin các điểm ATM
- Hỗ trợ **cấu hình môi trường** linh hoạt
- **Kiểm thử tự động** với Jest framework

### Thiết lập phát triển
- Hỗ trợ **Node.js** 18+
- Cấu hình **TypeScript**
- **ESLint** và **Prettier** để đảm bảo chất lượng code
- **Hot reload** trong chế độ phát triển
- Tối ưu hóa **Production build**


---
## Lộ trình phát triển

### Đã hoàn thành gần đây
- [x] Cải thiện API SPARQL queries
- [x] Sửa lỗi kết nối Fuseki server
- [x] Tối ưu hóa error handling
- [x] Cập nhật cấu hình môi trường

### Tính năng dự kiến
- [ ] Tích hợp cơ sở dữ liệu
- [ ] Hệ thống xác thực
- [ ] Tài liệu API với Swagger
- [ ] Container hóa Docker  
- [ ] Thiết lập CI/CD pipeline
- [ ] Giám sát hiệu suất
- [ ] Triển khai caching
- [ ] Giới hạn tốc độ truy cập

### Phiên bản 0.1.1 (Sắp tới)
- Unit tests toàn diện cho Fuseki module
- Validation cho SPARQL queries
- Logging system
- API documentation cơ bản

### Phiên bản 0.2.0 (Tương lai)
- Tài liệu API đầy đủ với Swagger
- Performance monitoring
- Caching layer


---
