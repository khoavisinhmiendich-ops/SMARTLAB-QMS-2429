import { NextRequest, NextResponse } from 'next/server';
import { AllFailed, activeProviders, askAi, providerStatus, type ChatMessage } from '@/lib/ai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Kết nối AI được cấu hình trong tệp ai.config.ts (ở thư mục gốc dự án) và các khóa trong .env.local.
// GET: xem nhanh trạng thái các kết nối (không trả về API key) để kiểm tra khi AI không trả lời.
export async function GET() {
  return NextResponse.json({ providers: providerStatus(), active: activeProviders().map((p) => p.name) });
}

export async function POST(req: NextRequest) {
  try {
    if (!activeProviders().length) {
      return NextResponse.json(
        { error: 'Trợ lý AI chưa được cấu hình. Mở tệp ai.config.ts, đặt GEMINI_API_KEY (hoặc OPENAI_API_KEY / ANTHROPIC_API_KEY) trong .env.local, hoặc bật kết nối "Máy cục bộ", rồi chạy lại ứng dụng.' },
        { status: 503 }
      );
    }

    const body = await req.json();
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    if (!message) return NextResponse.json({ error: 'Vui lòng nhập câu hỏi.' }, { status: 400 });
    if (message.length > 4000) {
      return NextResponse.json({ error: 'Câu hỏi quá dài (tối đa 4.000 ký tự).' }, { status: 413 });
    }

    const history: ChatMessage[] = Array.isArray(body.history)
      ? body.history
          .filter((m: any) => ['user', 'assistant'].includes(m?.role) && typeof m?.content === 'string')
          .slice(-8)
          .map((m: any) => ({ role: m.role, content: m.content.slice(0, 4000) }))
      : [];

    // Đảm bảo câu hỏi hiện tại nằm ở cuối hội thoại
    const last = history[history.length - 1];
    if (!last || last.role !== 'user' || last.content.trim() !== message) {
      history.push({ role: 'user', content: message });
    }

    const result = await askAi(history, (a) =>
      // Ghi log chi tiết ở server (không chứa key) để xem trong terminal / Vercel Logs
      console.error('SMARTLAB AI: kết nối lỗi', a.provider, a.model, a.status, a.kind, a.message, '|', a.detail)
    );
    return NextResponse.json({ answer: result.answer, sources: result.sources, provider: result.provider });
  } catch (error) {
    if (error instanceof AllFailed) {
      const tried = error.attempts.map((a) => a.provider).join(', ');
      const allQuota = error.attempts.length > 0 && error.attempts.every((a) => a.kind === 'quota');
      const anyAuth = error.attempts.some((a) => a.kind === 'auth');
      const anyModel = error.attempts.some((a) => a.kind === 'model');
      const text = allQuota
        ? `Các kết nối AI đã thử (${tried}) đều hết hạn mức hoặc giới hạn tốc độ. Hãy chờ vài phút rồi thử lại, hoặc bổ sung kết nối dự phòng trong tệp ai.config.ts (OPENAI_API_KEY, ANTHROPIC_API_KEY hoặc model cục bộ Ollama).`
        : anyAuth
          ? `Kết nối AI bị từ chối (${tried}): kiểm tra API key trong .env.local còn hiệu lực và đúng nhà cung cấp.`
          : anyModel
            ? `Tên model AI chưa đúng hoặc chưa được cấp quyền (${tried}). Sửa trường model trong tệp ai.config.ts.`
            : `Chưa kết nối được dịch vụ AI (${tried}). Kiểm tra mạng của máy chủ và cấu hình trong ai.config.ts rồi thử lại.`;
      // Kèm lỗi gốc của nhà cung cấp (đã cắt ngắn, không chứa khóa) để dễ xác định nguyên nhân khi không phải lỗi hạn mức.
      const raw = allQuota ? '' : (error.attempts.find((a) => a.detail)?.detail || '').replace(/\s+/g, ' ').slice(0, 220);
      return NextResponse.json({ error: raw ? `${text} [Chi tiết: ${raw}]` : text }, { status: allQuota ? 429 : 502 });
    }
    console.error('SMARTLAB AI error', error);
    return NextResponse.json(
      { error: 'Không kết nối được dịch vụ AI. Kiểm tra kết nối mạng máy chủ và thử lại.' },
      { status: 500 }
    );
  }
}
