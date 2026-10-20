// =====================================================================================================
//  KẾT NỐI TRỢ LÝ AI (SMARTLAB AI) — chỉnh trực tiếp trong VS Code, lưu tệp là áp dụng (chạy lại `npm run dev`)
// =====================================================================================================
//  • Danh sách `providers` được thử LẦN LƯỢT từ trên xuống. Nếu một kết nối bị hết hạn mức (429), sai khóa hoặc
//    lỗi mạng, hệ thống tự chuyển sang kết nối kế tiếp — người dùng không phải làm gì thêm.
//  • API key đặt trong tệp `.env.local` (cùng thư mục với tệp này), KHÔNG dán trực tiếp vào đây nếu tệp được đưa lên Git:
//        GEMINI_API_KEY=...        OPENAI_API_KEY=...        ANTHROPIC_API_KEY=...
//  • Kết nối nào chưa có key sẽ tự bị bỏ qua. Muốn tắt hẳn một kết nối: đặt enabled: false.
//  • Muốn chạy hoàn toàn tại máy, không giới hạn hạn mức: cài Ollama (https://ollama.com) hoặc LM Studio, tải một
//    model (ví dụ `ollama pull llama3.1`) rồi đặt enabled: true cho kết nối "Máy cục bộ" bên dưới.
//
//  type:  'gemini' | 'openai' | 'anthropic' | 'openai-compatible' (Ollama, LM Studio, Groq, OpenRouter, ...)
//  webSearch: true = cho phép tra cứu Internet nếu nhà cung cấp hỗ trợ (hiện nguồn tham khảo trong khung chat).
// =====================================================================================================
export type ProviderType = 'gemini' | 'openai' | 'anthropic' | 'openai-compatible';
export type ProviderConfig = {
  name: string;
  type: ProviderType;
  enabled: boolean;
  model: string;
  /** Tên biến môi trường chứa API key (khuyên dùng). */
  apiKeyEnv?: string;
  /** Hoặc ghi trực tiếp key (không khuyên dùng: dễ lộ khi đưa mã lên Git). */
  apiKey?: string;
  /** Chỉ cho type 'openai-compatible' (và tùy chọn cho 'openai'): địa chỉ gốc API, ví dụ http://localhost:11434/v1 */
  baseUrl?: string;
  webSearch?: boolean;
};

export const aiConfig = {
  providers: [
    {
      name: 'Gemini',
      type: 'gemini',
      enabled: true,
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      apiKeyEnv: 'GEMINI_API_KEY',
      webSearch: true,
    },
    {
      // Hạn mức Gemini tính riêng theo từng model: model khác thường vẫn còn hạn mức khi model chính đã hết.
      // (Nếu trùng model với kết nối phía trên thì tự bỏ qua.)
      name: 'Gemini 2.5 Flash',
      type: 'gemini',
      enabled: true,
      model: 'gemini-2.5-flash',
      apiKeyEnv: 'GEMINI_API_KEY',
      webSearch: true,
    },
    {
      name: 'Gemini (dự phòng)',
      type: 'gemini',
      enabled: true,
      model: 'gemini-2.5-flash-lite',
      apiKeyEnv: 'GEMINI_API_KEY',
      webSearch: false,
    },
    {
      name: 'OpenAI',
      type: 'openai',
      enabled: true,
      model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
      apiKeyEnv: 'OPENAI_API_KEY',
      webSearch: true,
    },
    {
      name: 'Claude',
      type: 'anthropic',
      enabled: true,
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
      apiKeyEnv: 'ANTHROPIC_API_KEY',
      webSearch: true,
    },
    {
      // Model chạy ngay trên máy bạn (không có hạn mức, không cần Internet, không tra cứu web).
      name: 'Máy cục bộ (Ollama / LM Studio)',
      type: 'openai-compatible',
      enabled: false,
      model: process.env.LOCAL_AI_MODEL || 'llama3.1',
      baseUrl: process.env.LOCAL_AI_URL || 'http://localhost:11434/v1',
      apiKey: 'local',
      webSearch: false,
    },
  ] as ProviderConfig[],

  /** Số lượt hội thoại gần nhất gửi kèm cho AI. */
  historyLimit: 8,
  /** Thời gian chờ tối đa cho mỗi kết nối (mili-giây). */
  timeoutMs: 60_000,
  /** Gặp lỗi 429 kèm thời gian chờ ngắn (≤ số giây này) thì chờ rồi thử lại đúng kết nối đó 1 lần. */
  retryRateLimitUpToSeconds: 8,

  systemPrompt:
    'Bạn là SMARTLAB AI, trợ lý tiếng Việt cho quản lý chất lượng phòng xét nghiệm y tế. ' +
    'Trả lời rõ ràng, có cấu trúc, phân biệt thông tin từ nguồn chính thức với nhận định. ' +
    'Khi câu hỏi cần thông tin mới, hãy tra cứu Internet và nêu nguồn liên quan. ' +
    'Ưu tiên Bộ Y tế Việt Nam, WHO, ISO, cơ quan quản lý và nhà xuất bản chính thức. ' +
    'Không tự bịa điều khoản, văn bản hay trích dẫn. ' +
    'Không thay thế quyết định của chuyên gia y tế. ' +
    'Nhắc người dùng không cung cấp dữ liệu định danh người bệnh.',
};
