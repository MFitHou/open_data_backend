# Open Data Backend

Ứng dụng backend được xây dựng bằng NestJS framework, hỗ trợ xử lý dữ liệu mở và tích hợp với Apache Jena Fuseki.

## Mô tả dự án

Đây là một API backend được phát triển bằng [NestJS](https://nestjs.com/) - framework Node.js cho việc xây dựng các ứng dụng server-side hiệu quả và có khả năng mở rộng.

## Yêu cầu hệ thống

- **Node.js**: phiên bản 18.x trở lên
- **npm**: phiên bản 9.x trở lên
- **Git**: để clone repository

## Hướng dẫn cài đặt và chạy

### Bước 1: Clone repository

```bash
git clone https://github.com/MFitHou/open_data_backend.git
cd open_data_backend
```

### Bước 2: Cài đặt môi trường Node.js

#### Trên Windows:
1. Tải và cài đặt Node.js từ [nodejs.org](https://nodejs.org/)
2. Kiểm tra cài đặt:
```powershell
node --version
npm --version
```

#### Trên macOS:
```bash
# Sử dụng Homebrew
brew install node

# Hoặc tải từ nodejs.org
```

#### Trên Linux (Ubuntu/Debian):
```bash
# Sử dụng NodeSource repository
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Kiểm tra cài đặt
node --version
npm --version
```

### Bước 3: Cài đặt dependencies

```bash
npm install
```

### Bước 4: Cấu hình môi trường (nếu cần)

Tạo file `.env` trong thư mục gốc và cấu hình các biến môi trường:

```env
# Ví dụ cấu hình
PORT=3000
NODE_ENV=development
# Thêm các cấu hình khác nếu cần
```

### Bước 5: Chạy ứng dụng

#### Development mode (khuyến nghị cho phát triển):
```bash
npm run start:dev
```

#### Production mode:
```bash
npm run build
npm run start:prod
```

#### Standard mode:
```bash
npm run start
```

Ứng dụng sẽ chạy tại `http://localhost:3000`

## Cài đặt tự động

Để thuận tiện, chúng tôi cung cấp các script tự động hóa quá trình cài đặt:

### Trên Windows:
Chạy file `setup.bat`:
```powershell
.\setup.bat
```

### Trên Linux/macOS:
Chạy file `setup.sh`:
```bash
chmod +x setup.sh
./setup.sh
```

## Chạy ứng dụng nhanh

Sau khi cài đặt, bạn có thể sử dụng script chạy nhanh:

### Trên Windows:
```powershell
.\run.bat
```

### Trên Linux/macOS:
```bash
chmod +x run.sh
./run.sh
```

Script sẽ hiển thị menu để bạn chọn chế độ chạy phù hợp.

## Các lệnh hữu ích

### Development
```bash
# Chạy với watch mode (tự động restart khi có thay đổi)
npm run start:dev

# Chạy với debug mode
npm run start:debug

# Format code
npm run format

# Lint code
npm run lint
```

### Testing
```bash
# Chạy unit tests
npm run test

# Chạy tests với watch mode
npm run test:watch

# Chạy e2e tests
npm run test:e2e

# Tạo coverage report
npm run test:cov
```

### Build
```bash
# Build ứng dụng cho production
npm run build
```

## Cấu trúc dự án

```
src/
├── app.controller.ts      # Controller chính
├── app.module.ts          # Module chính
├── app.service.ts         # Service chính
├── main.ts               # Entry point
└── fuseki/               # Module xử lý Fuseki
    ├── fuseki.controller.ts
    ├── fuseki.service.ts
    ├── fuseki.module.ts
    └── dto/
        └── SparqlQueryDto.ts
```

## API Endpoints

Sau khi chạy ứng dụng, bạn có thể truy cập:

- `GET /` - Endpoint chính
- `POST /fuseki/query` - Thực hiện SPARQL query (nếu có)

## Troubleshooting

### Lỗi thường gặp:

1. **Port đã được sử dụng**: Thay đổi port trong file `.env` hoặc dừng tiến trình đang sử dụng port 3000
2. **Node modules lỗi**: Xóa thư mục `node_modules` và chạy lại `npm install`
3. **Permission denied (Linux/macOS)**: Sử dụng `sudo` hoặc cài đặt nvm để quản lý Node.js

### Debug mode:
```bash
npm run start:debug
```

## Đóng góp

1. Fork repository
2. Tạo feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Tạo Pull Request

## Liên hệ

- Repository: [https://github.com/MFitHou/open_data_backend](https://github.com/MFitHou/open_data_backend)
- Issues: [https://github.com/MFitHou/open_data_backend/issues](https://github.com/MFitHou/open_data_backend/issues)

