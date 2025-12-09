---
title: GitHub Copilot Custom Instructions
description: Hướng dẫn tùy chỉnh để GitHub Copilot sinh code phù hợp với kiến trúc và quy ước của OpenDataFitHou
version: 1.2.0
last_updated: 2025-11-28
---

# GitHub Copilot Custom Instructions - OpenDataFitHou

> **Mục đích:** Đảm bảo GitHub Copilot sinh code nhất quán với kiến trúc, conventions và best practices của dự án OpenDataFitHou.

---

## Tổng quan dự án

### Tech Stack
- **Frontend:** React 19.1.1 + TypeScript 5.8.3 + Vite 7.1.7
- **Backend:** NestJS 11.0.1 + TypeScript 5.7.3
- **Mapping:** Leaflet 1.9.4 + React-Leaflet 5.0.0
- **Routing:** React Router DOM 7.9.3
- **Build Tool:** Vite 7 (Frontend), NestJS CLI (Backend)
- **Linting:** ESLint 9.x + Prettier 3.x
- **Testing:** Jest 30.x (Backend)
- **License:** GNU GPL v3.0

### Kiến trúc
- **Monorepo:** 
- **Communication:** REST API (Backend port 3000)
- **Data Sources:** Wikidata SPARQL, OpenStreetMap Overpass API, Apache Jena Fuseki
- **Focus:** Linked Open Data (RDF/SPARQL)

---

## Quy tắc chung khi sinh code

### 1. TypeScript
**LUÔN:**
- Sử dụng TypeScript strict mode
- Định nghĩa explicit interfaces/types cho props, params, responses
- Dùng `interface` cho object shapes, `type` cho unions/intersections
- Đặt tên interfaces theo PascalCase (VD: `SearchResult`, `NearbyPlace`)

**TRÁNH:**
- Dùng `any` - chỉ dùng khi thực sự cần thiết (external API responses)
- Implicit types khi có thể infer được
- Type assertions không cần thiết

**Ví dụ:**
```typescript
// ĐÚNG
interface SearchResult {
  id: string;
  name: string;
  coordinates: [number, number];
}

const fetchResults = async (): Promise<SearchResult[]> => {
  // ...
}

// SAI
const fetchResults = async () => {
  const data: any = await fetch(url);
  return data;
}
```

### 2. Code Style & Formatting
- **Indentation:** 2 spaces
- **Quotes:** Single quotes (`'`) cho strings
- **Semicolons:** Có (enforced by Prettier)
- **Line length:** ~100 characters (flexible)
- **Trailing commas:** Có (ES5+)

### 3. Naming Conventions
- **Files:** 
  - Components: `PascalCase.tsx` (VD: `SimpleMap.tsx`)
  - Utils: `camelCase.ts` (VD: `nearbyApi.ts`)
  - Styles: `PascalCase.css` (VD: `InfoPanel.css`)
- **Variables/Functions:** `camelCase`
- **Constants:** `UPPER_SNAKE_CASE`
- **Interfaces/Types:** `PascalCase`
- **React Components:** `PascalCase`

### 4. Internationalization (i18n)
**LUÔN:**
- Sử dụng i18next với hook `useTranslation()`
- Đặt translation keys theo namespace rõ ràng
- Hỗ trợ 2 ngôn ngữ: **Tiếng Việt (vi)** và **English (en)**
- Comments và documentation bằng tiếng Việt
- Default language: **Vietnamese (vi)**

**Cấu trúc translation keys:**
```typescript
// Namespace pattern: {feature}.{component}.{element}
{
  "common": {
    "button": {
      "search": "Tìm kiếm",
      "cancel": "Hủy",
      "save": "Lưu"
    },
    "status": {
      "loading": "Đang tải...",
      "error": "Có lỗi xảy ra"
    }
  },
  "map": {
    "search": {
      "placeholder": "Tìm địa điểm...",
      "noResults": "Không tìm thấy kết quả"
    }
  }
}
```

**Ví dụ sử dụng:**
```tsx
import { useTranslation } from 'react-i18next';

export const SearchBar: React.FC = () => {
  const { t } = useTranslation();
  
  return (
    <div>
      <input placeholder={t('map.search.placeholder')} />
      <button>{t('common.button.search')}</button>
    </div>
  );
};
```

**Setup i18next:**
```typescript
// src/i18n/config.ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import vi from './locales/vi.json';
import en from './locales/en.json';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      vi: { translation: vi },
      en: { translation: en }
    },
    lng: 'vi', // Default language
    fallbackLng: 'vi',
    interpolation: {
      escapeValue: false
    }
  });

export default i18n;
```

---

## Frontend (React) - Quy tắc sinh code

### 1. Component Structure

**Template chuẩn:**
```tsx
/**
 * Copyright (C) 2025 MFitHou
 * 
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 * 
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

import React, { useState, useEffect } from 'react';
import './ComponentName.css';

interface ComponentNameProps {
  data: string;
  onAction: () => void;
}

export const ComponentName: React.FC<ComponentNameProps> = ({ data, onAction }) => {
  const [state, setState] = useState<string>('');

  useEffect(() => {
    // Side effects
  }, []);

  const handleEvent = () => {
    // Event handler logic
  };

  return (
    <div className="component-name">
      <h2>{data}</h2>
      <button onClick={handleEvent}>Thực hiện</button>
    </div>
  );
};
```

### 2. State Management

**LUÔN:**
- Dùng `useState` cho local state
- Dùng `useEffect` cho side effects
- Props drilling cho communication giữa components
- Callback props (VD: `onNearbyPlacesChange`) để lift state up

**KHÔNG dùng:**
- Redux, Zustand, hoặc global state libraries
- Context API (trừ khi thực sự cần thiết)

### 3. Data Fetching

**LUÔN dùng native `fetch()`:**
```typescript
const fetchData = async () => {
  try {
    const response = await fetch('http://localhost:3000/api/endpoint');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching data:', error);
    return null;
  }
};
```

**KHÔNG dùng:**
- Axios
- React Query / TanStack Query
- SWR
- Any data fetching libraries

### 4. Folder Structure

**Khi tạo component mới:**
```
src/components/
├── home/
│   └── Home.tsx
├── map/
│   ├── SimpleMap.tsx
│   ├── Search.tsx
│   ├── InfoPanel.tsx
│   └── DownloadButton.tsx
└── query/
    └── Query.tsx
```

**Khi tạo utility mới:**
```
src/utils/
├── nearbyApi.ts      # API calls
├── wikidataUtils.ts  # Wikidata helpers
├── overpass.ts       # OSM queries
└── dataExport.ts     # Export logic
```

### 5. Styling

**LUÔN:**
- Tạo file CSS riêng cho mỗi component (VD: `InfoPanel.tsx` → `InfoPanel.css`)
- Dùng BEM-like class naming: `component-name`, `component-name__element`, `component-name--modifier`
- Import CSS trong component file

**KHÔNG dùng:**
- CSS Modules
- Styled Components
- Tailwind CSS
- UI Libraries (MUI, Ant Design, Chakra UI)

**Ví dụ:**
```css
/* InfoPanel.css */
.info-panel {
  position: fixed;
  right: 0;
  width: 400px;
}

.info-panel__header {
  display: flex;
  justify-content: space-between;
}

.info-panel--expanded {
  width: 600px;
}
```

### 6. Error Handling

**Pattern chuẩn:**
```tsx
const [error, setError] = useState<string | null>(null);
const [isLoading, setIsLoading] = useState(false);

const fetchData = async () => {
  setIsLoading(true);
  setError(null);
  
  try {
    const data = await fetch(url);
    // Process data
  } catch (err) {
    console.error('Error:', err);
    setError('Có lỗi xảy ra. Vui lòng thử lại.');
  } finally {
    setIsLoading(false);
  }
};

// In JSX:
{error && <div className="error">{error}</div>}
{isLoading && <div className="loading">⏳ Đang tải...</div>}
```

---

## Backend (NestJS) - Quy tắc sinh code

### 1. Module Structure

**Template Module:**
```typescript
/**
 * Copyright (C) 2025 MFitHou
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

import { Module } from '@nestjs/common';
import { ModuleNameController } from './module-name.controller';
import { ModuleNameService } from './module-name.service';

@Module({
  controllers: [ModuleNameController],
  providers: [ModuleNameService],
  exports: [ModuleNameService],
})
export class ModuleNameModule {}
```

### 2. Controller Structure

**Template Controller:**
```typescript
/**
 * Copyright (C) 2025 MFitHou
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

import { Controller, Get, Post, Body, Query, Param, HttpException, HttpStatus } from '@nestjs/common';
import { ModuleNameService } from './module-name.service';
import { CreateDto } from './dto/create.dto';

@Controller('module-name')
export class ModuleNameController {
  constructor(private readonly service: ModuleNameService) {}

  @Get()
  async findAll() {
    try {
      const data = await this.service.findAll();
      return { count: data.length, data };
    } catch (error) {
      throw new HttpException(
        { message: 'Failed to fetch data', error: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post()
  async create(@Body() dto: CreateDto) {
    try {
      return await this.service.create(dto);
    } catch (error) {
      throw new HttpException(
        { message: 'Failed to create', error: error.message },
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
```

### 3. Service Structure

**Template Service:**
```typescript
/**
 * Copyright (C) 2025 MFitHou
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

import { Injectable, BadRequestException, Logger } from '@nestjs/common';

@Injectable()
export class ModuleNameService {
  private readonly logger = new Logger(ModuleNameService.name);

  async findAll(): Promise<any[]> {
    try {
      // Business logic
      this.logger.log('Fetching all records');
      return [];
    } catch (error) {
      this.logger.error('Error in findAll:', error);
      throw error;
    }
  }

  async create(data: any): Promise<any> {
    if (!data) {
      throw new BadRequestException('Data is required');
    }
    
    // Business logic
    return { id: 1, ...data };
  }
}
```

### 4. DTO (Data Transfer Objects)

**Template DTO:**
```typescript
/**
 * Copyright (C) 2025 MFitHou
 * 
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 * 
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

export class CreateDto {
  query: string;
}

export class ResponseDto {
  count: number;
  data: any[];
}
```

**Lưu ý:** Dự án hiện tại **KHÔNG dùng class-validator**, chỉ định nghĩa types

### 5. API Response Format

**Chuẩn response:**
```typescript
// Success response
{
  count: number,
  data: any[]
}

// Nearby response
{
  center: { lon: number, lat: number },
  radiusKm: number,
  count: number,
  items: any[]
}

**Error response:**
{
  message: string,
  error: string
}
```

### 6. CORS Configuration

**Đã config trong `main.ts`:**
```typescript
app.enableCors({
  origin: ['http://localhost:5173'],
  methods: 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  credentials: true,
});
```

**Khi thêm endpoint mới:** Không cần thay đổi CORS config

---

## File Organization Rules

### Khi tạo file mới, đề xuất đường dẫn:

#### Frontend:
- **Components:** `src/components/{feature}/{ComponentName}.tsx`
- **Utils:** `src/utils/{utilName}.ts`
- **Styles:** `src/styles/{ComponentName}.css`
- **Types:** Define inline trong file sử dụng (không tách `types/` folder)

#### Backend:
- **Modules:** `src/{module-name}/{module-name}.{type}.ts`
- **DTOs:** `src/{module-name}/dto/{dto-name}.dto.ts`
- **Tests:** `src/{module-name}/{module-name}.service.spec.ts`

### Import Order:
```typescript
// 1. React/Framework imports
import React, { useState, useEffect } from 'react';

// 2. Third-party libraries
import { MapContainer, TileLayer } from 'react-leaflet';

// 3. Local imports (absolute paths preferred)
import { fetchNearbyPlaces } from '../../utils/nearbyApi';
import { SearchResult } from './types';

// 4. Styles
import './ComponentName.css';
```

---

## API Integration

### Frontend API Calls

**Pattern chuẩn:**
```typescript
// src/utils/api.ts
const API_BASE_URL = 'http://localhost:3000';

export const fetchFromAPI = async <T>(
  endpoint: string,
  options?: RequestInit
): Promise<T | null> => {
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
      },
      ...options,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('API call failed:', error);
    return null;
  }
};

// Usage in component
const data = await fetchFromAPI<ResponseType>('/fuseki/query', {
  method: 'POST',
  body: JSON.stringify({ query: sparqlQuery }),
});
```

### Backend API Endpoints

**Naming convention:**
- GET `/resource` - List all
- GET `/resource/:id` - Get one
- POST `/resource` - Create
- GET `/resource/action` - Custom action
- GET `/resource/:id/action` - Custom action on resource

**Ví dụ trong dự án:**
- `GET /fuseki/atms` - List ATMs
- `POST /fuseki/query` - Execute SPARQL query
- `GET /fuseki/atms/nearby?lon=x&lat=y&radiusKm=z` - Nearby search

---

## Documentation & Comments

### Code Comments

**Khi nào cần comment:**
- Business logic phức tạp
- SPARQL queries
- Algorithms (VD: Haversine distance calculation)
- Workarounds hoặc hacks tạm thời

**Comment bằng tiếng Việt:**
```typescript
// Tính khoảng cách Haversine giữa 2 điểm
const distance = haversineKm(lat1, lon1, lat2, lon2);

// Lọc kết quả trong bán kính yêu cầu
const filtered = results.filter(r => r.distanceKm <= radiusKm);
```

**Không cần comment:**
- Self-explanatory code
- Obvious variable names
- Standard React patterns

### JSDoc

**Cho public APIs và utils:**
```typescript
/**
 * Fetch địa điểm gần dựa trên tọa độ
 * @param lon - Kinh độ
 * @param lat - Vĩ độ
 * @param radiusKm - Bán kính tìm kiếm (km)
 * @param amenity - Loại địa điểm (toilets, atms, hospitals, bus-stops)
 * @returns Response chứa danh sách địa điểm hoặc null nếu lỗi
 */
export const fetchNearbyPlaces = async (
  lon: number,
  lat: number,
  radiusKm: number,
  amenity: string
): Promise<NearbyResponse | null> => {
  // Implementation
};
```

---

## UI/UX Guidelines

### Loading States
```tsx
{isLoading && <div className="loading">Đang tải...</div>}
```

### Error States
```tsx
{error && <div className="error">{error}</div>}
```

### Empty States
```tsx
{data.length === 0 && <div className="no-data">Không có dữ liệu</div>}
```

### Responsive
- Ưu tiên mobile-first; đảm bảo hoạt động tốt trên màn hình nhỏ (≥360px).
- Sử dụng Flexbox/Grid; hạn chế fixed width/height, ưu tiên `%`, `auto`, `minmax()`, `clamp()`.
- Breakpoints khuyến nghị: `360px` (mobile), `768px` (tablet), `1024px` (desktop).
- Typography dùng `rem`; spacing dùng `rem`/`%`; tránh giá trị tuyệt đối trừ khi cần thiết.
- Map container và panel phải co giãn; tránh tràn viewport; ẩn/thu gọn panel trên mobile khi cần.
- Kiểm tra trên Chrome DevTools (device toolbar) trước khi commit.

### Icons
**Emoji (hạn chế, chỉ cho UI hiển thị):**
- Chỉ dùng emoji làm biểu tượng trong UI/label, không dùng trong tên biến, keys, file, commit messages.
- Tránh lạm dụng; ưu tiên văn bản rõ ràng và accessible.
- 🔍 Search
- 📍 Location
- 🗺️ Map
- 🏧 ATM
- 🏥 Hospital
- 🚻 Toilet
- 🚌 Bus stop

---

## Testing

### Backend Tests (Jest)

**Test structure:**
```typescript
describe('ServiceName', () => {
  let service: ServiceName;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [ServiceName],
    }).compile();

    service = module.get<ServiceName>(ServiceName);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return data', async () => {
    const result = await service.findAll();
    expect(result).toBeInstanceOf(Array);
  });
});
```

**Frontend:** Hiện tại **KHÔNG có unit tests**, focus vào manual testing

---

## Package Management
### Adding Dependencies

**Frontend:**
```bash
cd open_data_map
npm install package-name
```

**Backend:**
```bash
cd open_data_backend
npm install package-name
```

**Lưu ý:** Cần approval trước khi thêm dependencies mới

---

## Git Workflow

### Commit Messages

**Format (Conventional Commits):**
```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Code style (formatting, no logic change)
- `refactor`: Code refactoring
- `test`: Adding tests
- `chore`: Build process, dependencies

**Examples:**
```bash
feat(map): add nearby places search functionality
fix(api): correct SPARQL query for ATMs
docs(readme): update installation instructions
refactor(utils): extract common fetch logic
```

### File Headers

**LUÔN thêm GPL v3.0 header cho file mới:**
```typescript
/**
 * Copyright (C) 2025 MFitHou
 * 
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 * 
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 * 
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */
```

---

## Domain-Specific Knowledge

### SPARQL Queries

**Prefixes chuẩn:**
```sparql
PREFIX ex: <http://opendatafithou.org/poi/>
PREFIX geo: <http://www.opendatafithou.net/ont/geosparql#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
```

### Wikidata Integration

**SPARQL service endpoint:**
```typescript
const WIKIDATA_ENDPOINT = 'https://query.wikidata.org/sparql';
```

### OpenStreetMap Integration

**Overpass API endpoint:**
```typescript
const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';
```

---

## Common Pitfalls

### TRÁNH:
1. Thêm global state management (Redux, Zustand)
3. Import UI component libraries
4. Dùng React Query, Axios
5. CSS-in-JS solutions
6. Class components (dùng functional components)
7. Inline styles (dùng CSS files)
8. Mutating state directly (dùng setState)
9. Memory leaks (cleanup trong useEffect)
10. Any types (dùng proper interfaces)
11. Lạm dụng emoji trong code (chỉ dùng cho UI hiển thị)
12. Bỏ qua responsive/mobile (không kiểm tra trên thiết bị nhỏ)

---

## Additional Resources

- **Project README:** `README.md` (Frontend & Backend)
- **License:** `LICENSE` (GNU GPL v3.0)
- **Contributing:** `CONTRIBUTING.md`
- **Code of Conduct:** `CODE_OF_CONDUCT.md`
- **Changelog:** `CHANGELOG.md`

---

## Checklist khi sinh code mới

- [ ] TypeScript types/interfaces được định nghĩa rõ ràng
- [ ] GPL v3.0 header được thêm vào file mới
- [ ] Comments bằng tiếng Việt cho business logic
- [ ] UI text sử dụng i18next (không hardcode)
- [ ] Error handling với try-catch + fallback UI
- [ ] Native fetch() API (không dùng Axios)
- [ ] CSS file riêng cho component mới
- [ ] Import order đúng chuẩn
- [ ] Naming conventions đúng (camelCase, PascalCase)
- [ ] Functional components với hooks
- [ ] No global state (component state only)
- [ ] Manual testing với backend local

---

## Quy tắc tạo file

### KHÔNG tự động tạo file Markdown documentation

**TUYỆT ĐỐI KHÔNG tạo:**
- `FEATURE_GUIDE.md`
- `HOW_TO_USE_*.md`
- `INSTRUCTIONS.md`
- `ARCHITECTURE_NOTES.md`
- `DESIGN_DECISIONS.md`
- `IMPLEMENTATION_NOTES.md`
- Bất kỳ file `.md` hướng dẫn/tài liệu nào

**CHỈ tạo khi được yêu cầu rõ ràng:**
- Code files (`.tsx`, `.ts`, `.css`, `.json`)
- Config files (`tsconfig.json`, `eslint.config.js`, `vite.config.ts`)
- Files liên quan trực tiếp đến tính năng
- Translation files (`vi.json`, `en.json`)

**Mọi giải thích:**
- Trả lời trong chat
- KHÔNG sinh file tài liệu
- Hỏi ý kiến user trước nếu cần tạo documentation

---

**Last Updated:** November 28, 2025  
**Version:** 1.2.0  
**Maintainer:** OpenDataFitHou MFitHou Team
