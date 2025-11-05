const clientTools = [
  {
    functionDeclarations: [
      {
        name: "fetchNearbyPlaces",
        description: "Tìm kiếm các địa điểm gần đây theo loại tiện ích trong bán kính nhất định (nhà vệ sinh, ATM, bệnh viện, trạm xe buýt, nước uống, sân chơi)",
        parameters: {
          type: "OBJECT",
          properties: {
            lon: { type: "NUMBER", description: "Kinh độ" },
            lat: { type: "NUMBER", description: "Vĩ độ" },
            radiusKm: { type: "NUMBER", description: "Bán kính tìm kiếm (km)" },
            amenity: { type: "STRING", description: "Loại địa điểm: toilets, atms, hospitals, bus-stops, drinking-water, playgrounds" }
          },
          required: ["lon", "lat", "radiusKm", "amenity"]
        }
      },
      {
        name: "fetchWikidataInfo",
        description: "Lấy thông tin đầy đủ về một thực thể từ Wikidata bao gồm các thuộc tính, nhãn và tham chiếu",
        parameters: {
          type: "OBJECT",
          properties: {
            qid: { type: "STRING", description: "Mã định danh Wikidata (ví dụ: 'Q1858')" }
          },
          required: ["qid"]
        }
      },
      {
        name: "fetchOverpassOutline",
        description: "Lấy đường viền ranh giới hành chính từ OpenStreetMap sử dụng mã Wikidata QID",
        parameters: {
          type: "OBJECT",
          properties: {
            qid: { type: "STRING", description: "Mã định danh Wikidata" }
          },
          required: ["qid"]
        }
      },
      {
        name: "searchWikidata",
        description: "Tìm kiếm các địa điểm tại Việt Nam trên Wikidata với thông tin chi tiết (tọa độ, mô tả, hình ảnh)",
        parameters: {
          type: "OBJECT",
          properties: {
            searchTerm: { type: "STRING", description: "Từ khóa tìm kiếm" }
          },
          required: ["searchTerm"]
        }
      },
      {
        name: "calculatePolygonArea",
        description: "Tính diện tích của một đa giác theo km² sử dụng hình học cầu",
        parameters: {
          type: "OBJECT",
          properties: {
            coordinates: { type: "ARRAY", description: "Mảng tọa độ [kinh độ, vĩ độ]" }
          },
          required: ["coordinates"]
        }
      },
      {
        name: "fetchPopulationData",
        description: "Lấy dữ liệu dân số và diện tích từ Wikidata sử dụng OSM relation ID",
        parameters: {
          type: "OBJECT",
          properties: {
            osmId: { type: "NUMBER", description: "OpenStreetMap relation ID" }
          },
          required: ["osmId"]
        }
      },
      {
        name: "executeQuery",
        description: "Thực thi truy vấn SPARQL với Fuseki endpoint để truy vấn dữ liệu RDF",
        parameters: {
          type: "OBJECT",
          properties: {
            query: { type: "STRING", description: "Chuỗi truy vấn SPARQL" }
          },
          required: ["query"]
        }
      },
      {
        name: "sendMessage",
        description: "Gửi tin nhắn đến chatbot API và nhận phản hồi AI",
        parameters: {
          type: "OBJECT",
          properties: {
            contents: { type: "STRING", description: "Tin nhắn/câu hỏi của người dùng" },
            userId: { type: "STRING", description: "ID người dùng (tùy chọn)" },
            language: { type: "STRING", description: "Mã ngôn ngữ (mặc định: 'en')" }
          },
          required: ["contents"]
        }
      },
      {
        name: "generateXML",
        description: "Tạo file XML xuất dữ liệu thực thể với tất cả thuộc tính và thành viên",
        parameters: {
          type: "OBJECT",
          properties: {
            data: { type: "OBJECT", description: "Dữ liệu thực thể cần xuất" }
          },
          required: ["data"]
        }
      },
      {
        name: "generateRDF",
        description: "Tạo file RDF/XML xuất dữ liệu thực thể dưới dạng semantic triples",
        parameters: {
          type: "OBJECT",
          properties: {
            data: { type: "OBJECT", description: "Dữ liệu thực thể cần xuất" }
          },
          required: ["data"]
        }
      },
      {
        name: "loadATMsFromAPI",
        description: "Tải dữ liệu ATM từ Fuseki triple store API",
        parameters: {
          type: "OBJECT",
          properties: {
            apiEndpoint: { type: "STRING", description: "API endpoint (mặc định: 'http://localhost:3000/fuseki/atms')" }
          },
          required: []
        }
      }
    ]
  }
];
