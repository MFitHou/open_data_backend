# Crowdsource Module - Hướng dẫn sử dụng

## 📖 Tổng quan

Module Crowdsource cho phép người dùng đề xuất cập nhật thông tin POI (Point of Interest) với cơ chế đồng thuận (Consensus Mechanism). Thay vì ghi đè dữ liệu ngay lập tức, các đề xuất sẽ được lưu trữ ở trạng thái "Pending" và chỉ được merge vào dữ liệu chính khi đạt ngưỡng vote (mặc định: 5 votes).

## 🏗️ Kiến trúc

### Database Layers

1. **MySQL** (TypeORM):
   - `user_contributions`: Lưu metadata của các đề xuất
   - `contribution_votes`: Lưu votes của users
   - Tracking: Status, upvotes, downvotes, auto-merge

2. **Apache Jena Fuseki** (RDF/SPARQL):
   - **Pending Graph**: `http://opendatafithou.org/graph/school-pending`
   - **Main Graph**: `http://opendatafithou.org/graph/school`
   - Khi đạt threshold → AUTO-MERGE từ Pending → Main

### Workflow Logic

```
User Submit Update
    ↓
Generate MD5 Hash (poiId + data)
    ↓
Check Duplicate in MySQL
    ├─ YES (Proposal exists)
    │   ↓
    │   Create Vote (up/down)
    │   ↓
    │   Increment upvotes
    │   ↓
    │   Check Threshold (≥5?)
    │       ├─ YES → Auto-merge to Main Graph
    │       └─ NO → Wait for more votes
    │
    └─ NO (New proposal)
        ↓
        Insert into MySQL + Fuseki Pending Graph
        ↓
        Create initial vote
        ↓
        Return "New proposal created"
```

## 🚀 Cài đặt

### 1. Database Migration

Chạy migration SQL:

```bash
# Trong thư mục open_data_backend
mysql -u root -p opendatafithou < database/migrations/002_create_crowdsource_tables.sql
```

### 2. Cài đặt dependencies

Backend đã có sẵn dependencies cần thiết:
- `typeorm`
- `uuid`
- `crypto` (Node.js built-in)

### 3. Environment Variables

Đảm bảo file `.env` có cấu hình MySQL:

```env
DB_HOST=localhost
DB_PORT=3306
DB_USERNAME=root
DB_PASSWORD=your_password
DB_DATABASE=opendatafithou
```

## 📡 API Endpoints

### 1. Submit Update (POST `/crowdsource/submit`)

Gửi đề xuất cập nhật POI.

**Headers:**
```json
{
  "Content-Type": "application/json",
  "x-user-id": "user123"
}
```

**Request Body:**
```json
{
  "poiId": "school_001",
  "data": {
    "telephone": "024 1234 5678",
    "email": "contact@school.edu",
    "website": "https://school.edu",
    "openingHours": "07:00 - 17:00",
    "hasWifi": true,
    "wheelchairAccessible": true,
    "parking": true,
    "airConditioning": true,
    "petsAllowed": false,
    "reservationRequired": false,
    "priceLevel": "free",
    "paymentMethods": "cash, card",
    "description": "Trường tiểu học công lập",
    "notes": "Có sân chơi rộng"
  }
}
```

**Response (New Proposal):**
```json
{
  "success": true,
  "message": "Đề xuất mới đã được tạo thành công",
  "contributionId": "uuid-contribution",
  "status": "new",
  "currentVotes": 1,
  "requiredVotes": 5
}
```

**Response (Voted):**
```json
{
  "success": true,
  "message": "Vote của bạn đã được ghi nhận",
  "contributionId": "uuid-contribution",
  "status": "voted",
  "currentVotes": 3,
  "requiredVotes": 5
}
```

**Response (Auto-Merged):**
```json
{
  "success": true,
  "message": "Đề xuất đã được chấp nhận và cập nhật tự động!",
  "contributionId": "uuid-contribution",
  "status": "auto-merged",
  "currentVotes": 5
}
```

### 2. Vote Contribution (POST `/crowdsource/vote`)

Vote cho một contribution có sẵn.

**Headers:**
```json
{
  "Content-Type": "application/json",
  "x-user-id": "user456"
}
```

**Request Body:**
```json
{
  "contributionId": "uuid-contribution",
  "voteType": "up",
  "comment": "Thông tin chính xác!"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Vote của bạn đã được ghi nhận",
  "contributionId": "uuid-contribution",
  "status": "voted",
  "currentVotes": 4,
  "requiredVotes": 5
}
```

### 3. Get Pending Contributions (GET `/crowdsource/pending`)

Lấy danh sách contributions đang pending.

**Query Parameters:**
- `poiId` (optional): Filter theo POI ID
- `status` (optional): `pending`, `approved`, `rejected`
- `page` (optional): Số trang (default: 1)
- `limit` (optional): Số items per page (default: 20)

**Example:**
```
GET /crowdsource/pending?poiId=school_001&status=pending&page=1&limit=10
```

**Response:**
```json
{
  "success": true,
  "count": 15,
  "data": [
    {
      "id": "uuid-1",
      "targetPoiId": "school_001",
      "reportUri": "report_abc123",
      "proposalHash": "md5hash",
      "proposedData": { ... },
      "status": "pending",
      "upvotes": 3,
      "downvotes": 0,
      "autoMerged": false,
      "trustThreshold": 5,
      "createdAt": "2025-12-10T10:00:00Z",
      "votes": [ ... ]
    }
  ]
}
```

### 4. Get Contribution Detail (GET `/crowdsource/contribution/:id`)

Lấy chi tiết một contribution.

**Example:**
```
GET /crowdsource/contribution/uuid-contribution
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid-1",
    "targetPoiId": "school_001",
    "proposedData": { ... },
    "status": "pending",
    "upvotes": 3,
    "downvotes": 0,
    "votes": [
      {
        "id": "vote-1",
        "userId": "user123",
        "voteType": "up",
        "comment": "Correct info",
        "createdAt": "2025-12-10T10:05:00Z"
      }
    ]
  }
}
```

### 5. Get POI Contributions (GET `/crowdsource/poi/:poiId/contributions`)

Lấy tất cả contributions cho một POI cụ thể.

**Example:**
```
GET /crowdsource/poi/school_001/contributions?status=pending
```

## 🎨 Frontend Integration

### Sử dụng UpdateForm Component

```tsx
import { UpdateForm } from './components/map/UpdateForm';

// Trong component của bạn
const [showUpdateForm, setShowUpdateForm] = useState(false);

// Mở form
<button onClick={() => setShowUpdateForm(true)}>
  Cập nhật thông tin
</button>

// Render form
{showUpdateForm && (
  <UpdateForm
    placeData={{
      name: "Trường Tiểu học Thanh Am",
      lat: 21.069121,
      lon: 105.897454,
      type: "School",
      poiId: "school_001"
    }}
    onClose={() => setShowUpdateForm(false)}
  />
)}
```

## 🔐 Security & Anti-Spam

### Implemented Measures:

1. **Duplicate Detection**: MD5 hash prevents duplicate submissions
2. **One Vote Per User**: Unique constraint `(contribution_id, user_id)`
3. **IP Tracking**: Store user IP to detect spam patterns
4. **Transaction Safety**: Use database transactions for consistency

### TODO (Future Enhancements):

- [ ] Rate limiting per IP/user
- [ ] CAPTCHA verification
- [ ] User reputation system
- [ ] Admin moderation interface
- [ ] Automated spam detection

## 📊 Data Model

### RDF Structure (Fuseki Pending Graph)

```sparql
PREFIX ext: <http://opendatafithou.org/ext/>
PREFIX ex: <http://opendatafithou.org/poi/>
PREFIX schema: <http://schema.org/>

ext:report_uuid123 a ext:UpdateReport ;
  ext:refTarget ex:school_001 ;
  ext:reportedByUserID "user123" ;
  ext:reportedAt "2025-12-10T10:00:00Z"^^xsd:dateTime ;
  ext:status "pending" ;
  schema:telephone "024 1234 5678" ;
  schema:email "contact@school.edu" ;
  ext:hasWifi "true"^^xsd:boolean .
```

## 🧪 Testing

### Manual Testing

1. **Submit first proposal**:
```bash
curl -X POST http://localhost:3000/crowdsource/submit \
  -H "Content-Type: application/json" \
  -H "x-user-id: user1" \
  -d '{
    "poiId": "school_001",
    "data": {
      "telephone": "024 1234 5678",
      "hasWifi": true
    }
  }'
```

2. **Vote from different users**:
```bash
# User 2
curl -X POST http://localhost:3000/crowdsource/submit \
  -H "x-user-id: user2" \
  -d '{ "poiId": "school_001", "data": { "telephone": "024 1234 5678", "hasWifi": true } }'

# User 3, 4, 5... (Repeat until threshold reached)
```

3. **Check auto-merge**:
```bash
curl http://localhost:3000/crowdsource/pending?poiId=school_001
```

## 🐛 Troubleshooting

### Issue: "Contribution không tồn tại"
- **Nguyên nhân**: Invalid contribution ID
- **Giải pháp**: Verify contribution ID từ response khi submit

### Issue: "Bạn đã vote cho đề xuất này rồi"
- **Nguyên nhân**: User đã vote rồi
- **Giải pháp**: Chỉ cho phép vote 1 lần per user

### Issue: SPARQL queries không execute
- **Nguyên nhân**: Chưa có SparqlService implementation
- **Giải pháp**: Uncomment dòng `await this.sparqlService.update(query)` trong code

## 📈 Performance Considerations

- **Index Optimization**: Đã có compound index `(target_poi_id, proposal_hash, status)`
- **Pagination**: Default limit 20 items per page
- **Transaction Isolation**: Use QueryRunner for ACID compliance
- **Hash Collision**: MD5 đủ cho use case này (32 chars, low collision rate)

## 🔮 Future Improvements

1. **Machine Learning**: Auto-detect spam/malicious edits
2. **Gamification**: User reputation points, badges
3. **Real-time Updates**: WebSocket notifications khi proposal được approve
4. **Conflict Resolution**: AI-assisted merging khi có conflicts
5. **History Tracking**: Version control cho POI data
6. **Admin Dashboard**: UI để moderate contributions
7. **Analytics**: Dashboard thống kê contributions, user activity

## 📞 Support

Nếu gặp vấn đề, tạo issue tại: [GitHub Issues](https://github.com/MFitHou/open_data_backend/issues)

---

**Last Updated**: December 10, 2025  
**Version**: 1.0.0  
**License**: GNU GPL v3.0
