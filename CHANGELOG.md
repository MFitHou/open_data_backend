# Nhật ký thay đổi (Changelog)

Tất cả các thay đổi đáng chú ý của dự án sẽ được ghi lại trong file này.

Định dạng dựa trên [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
và dự án này tuân theo [Semantic Versioning](https://semver.org/spec/v2.0.0.html).


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

### Phiên bản 0.1.0 (Phát hành đầu tiên)
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

### Tính năng dự kiến
- [ ] Tích hợp cơ sở dữ liệu
- [ ] Hệ thống xác thực
- [ ] Tài liệu API với Swagger
- [ ] Container hóa Docker
- [ ] Thiết lập CI/CD pipeline
- [ ] Giám sát hiệu suất
- [ ] Triển khai caching
- [ ] Giới hạn tốc độ truy cập

### Phiên bản 0.1.2 (Sắp tới)
- Nâng cao khả năng SPARQL query
- Cải thiện RESTful API
- Xử lý lỗi tốt hơn
- Tài liệu API toàn diện


---
