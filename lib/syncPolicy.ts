// Quy tắc chọn bản dữ liệu khi mở tài liệu (thuần logic, không phụ thuộc trình duyệt để dễ kiểm thử).
// Mỗi bản ghi trên máy chủ có số phiên bản (rev) tăng dần sau mỗi lần lưu. Bản lưu trong trình duyệt nhớ
// rev của bản máy chủ mà nó dựa trên (rev) và có còn thay đổi chưa gửi lên máy chủ hay không (unsynced).
// Nhờ đó KHÔNG phụ thuộc đồng hồ của từng thiết bị (điện thoại lệch giờ vẫn đúng).
export type SavedRecord = { note?: string; editedContent?: string; savedAt?: number };
export type LocalRecord = SavedRecord & { rev?: number; unsynced?: boolean };
export type LoadChoice = 'remote' | 'local' | 'conflict';

export function decideOnLoad(o: { local: LocalRecord; remote: SavedRecord; remoteRev: number; remoteAt: number; serverConfigured: boolean }): LoadChoice {
  const { local, remote, remoteRev, remoteAt, serverConfigured } = o;
  const hasLocal = !!(local.note || local.editedContent);
  const hasRemote = !!(remote.note || remote.editedContent);
  if (!hasRemote) return 'local';
  if (!hasLocal) return 'remote';
  // Bản trong trình duyệt do phiên bản mới của ứng dụng ghi (có cờ unsynced).
  if (typeof local.unsynced === 'boolean') {
    if (!local.unsynced) return 'remote'; // bản trình duyệt chỉ là bản sao của máy chủ: máy chủ mới nhất
    if (!serverConfigured) return 'local';
    if (typeof local.rev === 'number' && local.rev === remoteRev) return 'local'; // thay đổi chưa gửi, dựa trên bản máy chủ hiện tại
    return 'conflict'; // thiết bị khác đã lưu bản mới trong lúc thiết bị này còn thay đổi chưa gửi
  }
  // Dữ liệu cũ (trước khi có số phiên bản): giữ cách cũ, bản có thời điểm lưu muộn hơn thắng.
  return remoteAt >= (Number(local.savedAt) || 0) ? 'remote' : 'local';
}
