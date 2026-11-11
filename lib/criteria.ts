// Bộ tiêu chí đánh giá mức chất lượng PXN y học (Quyết định 2429/QĐ-BYT ngày 12/6/2017):
// 12 chương, 169 tiêu chí, 268 điểm. Điểm từng tiêu chí theo bảng kiểm chính thức; tổng điểm từng chương khớp Sổ tay hướng dẫn (BYT, 11/2018).
// Mỗi tiêu chí khai báo các HỒ SƠ cần có (req). App đối chiếu với danh mục tài liệu trong thư viện: thêm/xóa/đổi tên tệp -> kết quả tự cập nhật.
// Muốn app nhận một tài liệu mới cho tiêu chí nào: đặt tên tệp chứa MÃ (vd. "XN-BM 5.8.2.03 ...") hoặc từ khóa ghi ở cột "Hồ sơ cần có".

export type Req = { label: string; re: RegExp };
export type Mark = '' | '*' | '***'; // (*) bắt buộc mọi mức; (***) bắt buộc để đạt mức 3 trở lên
export type Criterion = { id: string; ch: number; n: number; pts: number; mark: Mark; title: string; req: Req[]; site: boolean };
export type EvDoc = { id: string; title: string; path: string; chapter: string; hidden?: boolean };
export type Status = 'du' | 'mot-phan' | 'thieu' | 'tai-cho';
export type Manual = Record<string, 'du' | 'mot-phan' | 'thieu'>;
export type CritResult = { id: string; status: Status; earned: number; manual?: boolean; matched: { label: string; docs: { id: string; title: string; path: string }[] }[]; missing: string[] };
export type ChapterSummary = { ch: number; name: string; count: number; max: number; du: number; motPhan: number; thieu: number; taiCho: number; earned: number; pct: number; mandatory: { star: number; starOk: number; tri: number; triOk: number } };

export const CHAPTERS: { ch: number; name: string }[] = [
  { ch: 1, name: 'Tổ chức và quản trị phòng xét nghiệm' },
  { ch: 2, name: 'Tài liệu và hồ sơ' },
  { ch: 3, name: 'Quản lý nhân sự' },
  { ch: 4, name: 'Cung cấp dịch vụ và quản lý khách hàng' },
  { ch: 5, name: 'Quản lý trang thiết bị' },
  { ch: 6, name: 'Đánh giá nội bộ' },
  { ch: 7, name: 'Quản lý mua sắm, trang thiết bị, vật tư, hóa chất và sinh phẩm' },
  { ch: 8, name: 'Quản lý quá trình xét nghiệm' },
  { ch: 9, name: 'Quản lý thông tin' },
  { ch: 10, name: 'Xác định sự không phù hợp, hành động khắc phục và phòng ngừa' },
  { ch: 11, name: 'Cải tiến liên tục' },
  { ch: 12, name: 'Cơ sở vật chất và an toàn' },
];
// Số tiêu chí / điểm tối đa từng chương theo Sổ tay (dùng để kiểm tra chéo dữ liệu bên dưới).
export const OFFICIAL: Record<number, { count: number; max: number }> = {
  1: { count: 15, max: 23 }, 2: { count: 8, max: 10 }, 3: { count: 17, max: 21 }, 4: { count: 10, max: 13 }, 5: { count: 19, max: 30 }, 6: { count: 9, max: 13 },
  7: { count: 17, max: 23 }, 8: { count: 27, max: 57 }, 9: { count: 6, max: 11 }, 10: { count: 6, max: 14 }, 11: { count: 8, max: 21 }, 12: { count: 27, max: 32 },
};

// ---- Cách nhận diện hồ sơ trong thư viện ------------------------------------------------------
const esc = (s: string) => s.replace(/\./g, '\\.');
// Theo MÃ tài liệu (vd. 5.8.4.01 hoặc quy trình 5.8.4): không nhầm 5.5.1 với 5.5.1.01.
const C = (code: string, label: string): Req => ({ label, re: new RegExp('(^|[^0-9.])' + esc(code) + '(?![0-9]|\\.[0-9])') });
const N = (re: RegExp, label: string): Req => ({ label, re });
const QT = (c: string, l: string) => C(c, `XN-QTQL ${c} ${l}`);
const BM = (c: string, l: string) => C(c, `XN-BM ${c} ${l}`);

const K = {
  qd: N(/quyết định thành lập|giấy phép hoạt động/i, 'Quyết định thành lập PXN / Giấy phép hoạt động'),
  stcl: N(/sổ tay chất lượng/i, 'Sổ tay chất lượng (XN-STCL)'),
  stat: N(/sổ tay an toàn/i, 'Sổ tay an toàn (XN-STAT)'),
  stdv: N(/sổ tay dịch vụ khách hàng/i, 'Sổ tay dịch vụ khách hàng / lấy mẫu (XN-STDV)'),
  csCl: N(/chính sách chất lượng/i, 'Chính sách chất lượng'),
  mtCl: N(/mục tiêu chất lượng/i, 'Mục tiêu chất lượng'),
  chiSo: N(/chỉ số chất lượng \d/i, 'Các chỉ số chất lượng (đủ 3 giai đoạn trước/trong/sau xét nghiệm)'),
  dsHl: N(/phiếu khảo sát sự hài lòng/i, 'Phiếu khảo sát sự hài lòng khách hàng'),
  vtvl: N(/vị trí việc làm/i, 'Đề án vị trí việc làm (yêu cầu trình độ từng vị trí)'),
  btnTruong: N(/bổ nhiệm.*(trưởng|phụ trách)|quyết định bổ nhiệm/i, 'Quyết định bổ nhiệm Trưởng/Phụ trách PXN'),
  btnQlcl: N(/bổ nhiệm.*(qlcl|quản lý chất lượng|quản lý kỹ thuật)|phân công.*(qlcl|quản lý chất lượng|quản lý kỹ thuật)/i, 'Quyết định phân công/bổ nhiệm nhân viên QLCL và quản lý kỹ thuật'),
  thiDua: N(/thi đua|bình xét|đánh giá kết quả công tác/i, 'Hồ sơ đánh giá kết quả công tác / bình xét thi đua hằng năm của nhân viên'),
  hdsdTtb: N(/hướng dẫn sử dụng|hdsd/i, 'Hướng dẫn sử dụng từng thiết bị bằng tiếng Việt'),
  nhuCau: N(/kế hoạch.*(nhu cầu|mua sắm|dự trù)|dự trù/i, 'Kế hoạch nhu cầu trang thiết bị, vật tư, hóa chất hằng năm'),
  qtkt: N(/qtkt|(^|[\s._-])sop($|[\s._-])|quy trình kỹ thuật/i, 'Quy trình kỹ thuật (SOP/QTKT) cho từng xét nghiệm đang thực hiện'),
  phieuYc: N(/phiếu yêu cầu xét nghiệm|phiếu chỉ định/i, 'Mẫu Phiếu yêu cầu xét nghiệm'),
  msds: N(/phiếu an toàn hóa chất|chỉ dẫn an toàn hóa chất|msds|hdat/i, 'Bảng chỉ dẫn an toàn hóa chất (MSDS) / hướng dẫn an toàn'),
  pccc: N(/pccc|phòng cháy|chữa cháy/i, 'Quy định / kiểm tra / diễn tập phòng cháy chữa cháy (PCCC)'),
  tapHuanAt: N(/tập huấn.*(atsh|an toàn)|đào tạo.*(atsh|an toàn)/i, 'Hồ sơ tập huấn an toàn sinh học (ATSH) cho người kiểm tra'),
  nvAt: N(/nhân viên an toàn|cán bộ an toàn|phân công.*an toàn/i, 'Quyết định phân công nhân viên an toàn'),
  nhatKyTb: BM('5.5.1.05', 'Nhật ký sử dụng thiết bị'),
};

type Row = [string, number, Mark, string, Req[], boolean?];
const ROWS: Row[] = [
  // ---------------- Chương I ----------------
  ['1.1', 2, '*', 'PXN có quyết định thành lập / giấy phép hoạt động do cơ quan có thẩm quyền cấp', [K.qd]],
  ['1.2', 1, '', 'Có sơ đồ tổ chức thể hiện mối liên quan giữa PXN và các phòng ban trong cơ sở y tế', [BM('5.1.1.01', 'Sơ đồ tổ chức')]],
  ['1.3', 1, '', 'Có sơ đồ tổ chức thể hiện quan hệ giữa các vị trí và các nhóm chuyên môn trong PXN', [BM('5.1.1.01', 'Sơ đồ tổ chức')]],
  ['1.4', 1, '', 'Có mục tiêu chất lượng nhất quán với chính sách chất lượng', [K.mtCl, K.csCl]],
  ['1.5', 1, '', 'Có kế hoạch chất lượng định kỳ hằng năm để đạt mục tiêu chất lượng', [BM('5.1.1.05', 'Kế hoạch chất lượng và kết quả giám sát')]],
  ['1.6', 2, '', 'Thực hiện kế hoạch chất lượng đã xây dựng', [BM('5.1.1.05', 'Kế hoạch chất lượng và kết quả giám sát')]],
  ['1.7', 1, '', 'Có chỉ số chất lượng thuộc cả 3 giai đoạn của quá trình xét nghiệm', [QT('5.1.2', 'Theo dõi chỉ số chất lượng'), BM('5.1.2.01', 'Kế hoạch theo dõi chỉ số chất lượng'), K.chiSo]],
  ['1.8', 5, '', 'Sổ tay chất lượng có đủ nội dung quy định (a–i)', [K.stcl, K.csCl, QT('5.1.1', 'Tổ chức và trách nhiệm quản lý')]],
  ['1.9', 1, '', 'Có bằng chứng phổ biến/tập huấn sổ tay chất lượng cho nhân viên', [BM('5.2.1.07', 'Biên bản phổ biến tài liệu'), BM('5.1.1.06', 'Biên bản họp nhân viên')]],
  ['1.10', 1, '', 'Có văn bản phân công công việc cho từng nhân viên', [BM('5.1.1.07', 'Sổ phân công công việc')]],
  ['1.11', 1, '', 'Tổ chức họp xem xét hệ thống QLCL ít nhất 1 lần/năm', [QT('5.1.3', 'Xem xét của lãnh đạo'), BM('5.1.3.01', 'Chương trình xem xét của lãnh đạo')]],
  ['1.12', 2, '', 'Nội dung họp xem xét có đủ các mục a–p', [BM('5.1.3.02', 'Biên bản xem xét của lãnh đạo'), N(/báo cáo hoạt động xem xét/i, 'Báo cáo hoạt động xem xét của lãnh đạo')]],
  ['1.13', 1, '', 'Lưu biên bản họp xem xét, gồm phát hiện và hành động phát sinh', [BM('5.1.3.02', 'Biên bản xem xét của lãnh đạo')]],
  ['1.14', 2, '', 'Công việc phát sinh từ họp xem xét được thực hiện theo kế hoạch', [BM('5.1.3.02', 'Biên bản xem xét của lãnh đạo'), N(/báo cáo hoạt động xem xét/i, 'Báo cáo hoạt động xem xét của lãnh đạo')]],
  ['1.15', 1, '', 'Kết quả họp xem xét được trao đổi với lãnh đạo cơ quan chủ quản và nhân viên', [BM('5.1.1.06', 'Biên bản họp nhân viên')]],
  // ---------------- Chương II ----------------
  ['2.1', 2, '', 'Có quy trình kiểm soát tài liệu bên ngoài và nội bộ (gồm hướng dẫn biên soạn quy trình)', [QT('5.2.1', 'Kiểm soát tài liệu'), QT('5.2.2', 'Hướng dẫn biên soạn quy trình thực hành chuẩn')]],
  ['2.2', 1, '', 'Tài liệu do PXN xây dựng có đủ yếu tố nhận dạng (tên, mã, ngày ban hành, trang, chữ ký)', [QT('5.2.1', 'Kiểm soát tài liệu'), QT('5.2.2', 'Hướng dẫn biên soạn quy trình thực hành chuẩn')]],
  ['2.3', 1, '', 'Tài liệu được bảo quản hợp lý, dễ truy cập', [BM('5.2.1.01', 'Danh mục tài liệu nội bộ'), BM('5.2.1.03', 'Sổ theo dõi phân phối thu hồi tài liệu')]],
  ['2.4', 2, '***', 'Kiểm soát tài liệu chặt chẽ (a–h)', [BM('5.2.1.04', 'Phiếu đề nghị biên soạn sửa đổi tài liệu'), BM('5.2.1.03', 'Sổ theo dõi phân phối thu hồi tài liệu'), BM('5.2.1.01', 'Danh mục tài liệu nội bộ'), BM('5.2.1.02', 'Danh mục tài liệu bên ngoài'), BM('5.2.1.05', 'Phiếu soát xét tài liệu định kỳ'), BM('5.2.1.06', 'Phiếu hủy tài liệu')]],
  ['2.5', 1, '', 'Quy trình rút gọn/hướng dẫn được kiểm soát', [QT('5.2.2', 'Hướng dẫn biên soạn quy trình thực hành chuẩn')]],
  ['2.6', 1, '', 'Có quy trình và thực hiện quản lý hồ sơ (nhận biết, lưu trữ, bảo quản, hủy)', [QT('5.2.3', 'Quản lý hồ sơ')]],
  ['2.7', 1, '', 'Quy định thời gian lưu từng loại hồ sơ', [BM('5.2.3.01', 'Danh mục hồ sơ')]],
  ['2.8', 1, '', 'Có nơi lưu hồ sơ phù hợp, không hư hại/thất lạc/truy cập trái phép', [BM('5.2.3.03', 'Danh mục trong từng cặp hồ sơ'), BM('5.2.3.02', 'Phiếu hủy hồ sơ')]],
  // ---------------- Chương III ----------------
  ['3.1', 1, '', 'Xây dựng yêu cầu trình độ, bằng cấp, kinh nghiệm cho từng vị trí', [K.vtvl, BM('5.3.1.03', 'Bản mô tả công việc')]],
  ['3.2', 1, '', 'Có bản mô tả công việc cho tất cả nhân viên', [BM('5.3.1.03', 'Bản mô tả công việc')]],
  ['3.3', 1, '', 'Nhân viên được đào tạo phù hợp với công việc được giao', [BM('5.3.2.03', 'Phiếu đào tạo nội bộ'), BM('5.3.2.05', 'Kết quả đào tạo nội bộ'), BM('5.3.2.06', 'Xem xét hiệu quả đào tạo')]],
  ['3.4', 1, '', 'Có quy trình quản lý nhân sự và lưu hồ sơ nhân sự', [QT('5.3.1', 'Quản lý nhân sự'), BM('5.3.1.01', 'Danh sách nhân sự')]],
  ['3.5', 2, '*', 'Người được phép ký duyệt kết quả có đủ năng lực theo quy định', [BM('5.1.1.02', 'Thẩm quyền ký'), BM('5.1.1.03', 'Bản đăng ký chữ ký')]],
  ['3.6', 1, '', 'Trưởng PXN có quyết định bổ nhiệm bằng văn bản', [K.btnTruong]],
  ['3.7', 1, '', 'Phân công/bổ nhiệm nhân viên QLCL và quản lý kỹ thuật', [K.btnQlcl, BM('5.1.1.07', 'Sổ phân công công việc')]],
  ['3.8', 2, '', 'Đào tạo định hướng cho nhân viên mới (a–e)', [BM('5.3.1.06', 'Bảng phân công định hướng cho nhân viên mới'), BM('5.3.2.08', 'Hướng dẫn nhân viên mới')]],
  ['3.9', 1, '', 'Đánh giá nhân viên mới sau tập huấn/đào tạo', [BM('5.3.3.02', 'Phiếu đánh giá năng lực nhân viên'), BM('5.3.2.06', 'Xem xét hiệu quả đào tạo')]],
  ['3.10', 1, '', 'Có kế hoạch và thực hiện giám sát nhân viên mới (tối thiểu 1 năm)', [BM('5.3.2.07', 'Kế hoạch giám sát và phân công giám sát nhân viên mới')]],
  ['3.11', 2, '', 'Thực hiện chương trình tập huấn bắt buộc cho nhân viên (a–f)', [QT('5.3.2', 'Quản lý đào tạo'), BM('5.3.2.02', 'Kế hoạch đào tạo'), BM('5.3.2.04', 'Sổ theo dõi đào tạo nội bộ')]],
  ['3.12', 1, '', 'Có quy trình đánh giá năng lực nhân viên', [QT('5.3.3', 'Đánh giá năng lực nhân viên')]],
  ['3.13', 1, '***', 'Đánh giá năng lực nhân viên định kỳ hằng năm', [BM('5.3.3.01', 'Kế hoạch đánh giá năng lực nhân viên'), BM('5.3.3.02', 'Phiếu đánh giá năng lực nhân viên'), BM('5.3.3.03', 'Xem xét năng lực nhân viên')]],
  ['3.14', 1, '', 'Đánh giá kết quả công tác của nhân viên theo định kỳ (bình xét thi đua)', [K.thiDua]],
  ['3.15', 1, '', 'Có kế hoạch đào tạo liên tục cho từng nhân viên', [BM('5.3.2.02', 'Kế hoạch đào tạo'), BM('5.3.2.01', 'Phiếu yêu cầu đào tạo cá nhân')]],
  ['3.16', 1, '', 'Nhân viên tham gia chương trình đào tạo liên tục theo quy định', [BM('5.3.2.04', 'Sổ theo dõi đào tạo nội bộ'), BM('5.3.2.05', 'Kết quả đào tạo nội bộ')]],
  ['3.17', 2, '', 'Lưu hồ sơ nhân sự của tất cả nhân viên (a–h)', [BM('5.3.1.02', 'Lý lịch cá nhân'), BM('5.3.1.03', 'Bản mô tả công việc'), BM('5.3.1.04', 'Phiếu tiêm chủng'), BM('5.3.1.05', 'Phiếu kê khai khám sức khỏe'), BM('5.3.2.04', 'Sổ theo dõi đào tạo nội bộ'), BM('5.3.3.02', 'Phiếu đánh giá năng lực nhân viên'), BM('5.12.1.13', 'Báo cáo tổng hợp tai nạn và phơi nhiễm')]],
  // ---------------- Chương IV ----------------
  ['4.1', 1, '', 'Có quy trình khảo sát sự hài lòng của khách hàng', [QT('5.4.3', 'Khảo sát sự hài lòng của khách hàng')]],
  ['4.2', 1, '***', 'Có quy trình quản lý khiếu nại/phản hồi của khách hàng, các bên liên quan và nhân viên', [QT('5.4.2', 'Giải quyết khiếu nại')]],
  ['4.3', 1, '', 'Có công cụ đánh giá định kỳ mức độ hài lòng của khách hàng', [K.dsHl, BM('5.4.3.02', 'Phiếu thu thập ý kiến khách hàng')]],
  ['4.4', 1, '', 'Có hồ sơ khảo sát ý kiến khách hàng (người bệnh, nhân viên y tế)', [BM('5.4.3.03', 'Báo cáo tổng hợp đánh giá của khách hàng'), BM('5.4.3.01', 'Kế hoạch khảo sát')]],
  ['4.5', 1, '', 'Đánh giá thỏa thuận sử dụng dịch vụ với PXN chuyển gửi', [QT('5.4.4', 'Phòng xét nghiệm tham chiếu'), BM('5.4.4.02', 'Phiếu đánh giá PXN tham chiếu')]],
  ['4.6', 1, '', 'Có hồ sơ xem xét và giải quyết khiếu nại/phản hồi của khách hàng', [BM('5.4.2.01', 'Sổ theo dõi khiếu nại'), BM('5.4.2.02', 'Biên bản giải quyết khiếu nại')]],
  ['4.7', 1, '', 'Lưu hồ sơ khiếu nại và hành động khắc phục', [BM('5.4.2.01', 'Sổ theo dõi khiếu nại'), BM('5.10.2.01', 'Sổ theo dõi hành động khắc phục')]],
  ['4.8', 2, '*', 'Sổ tay dịch vụ khách hàng/lấy mẫu được ban hành, phân phối cho các khoa liên quan', [K.stdv]],
  ['4.9', 1, '', 'Bản sao sổ tay dịch vụ khách hàng/lấy mẫu sẵn có cho nhân viên', [K.stdv]],
  ['4.10', 3, '', 'Có sẵn thông tin cần thiết cho khách hàng (a–n)', [K.stdv, QT('5.4.1', 'Dịch vụ tư vấn'), BM('5.4.1.02', 'Phiếu tư vấn')]],
  // ---------------- Chương V ----------------
  ['5.1', 1, '', 'Có quy trình quản lý trang thiết bị', [QT('5.5.1', 'Quản lý thiết bị')]],
  ['5.2', 2, '*', 'PXN được trang bị đủ thiết bị phù hợp với công việc, danh mục kỹ thuật', [BM('5.5.1.01', 'Danh mục thiết bị')]],
  ['5.3', 1, '', 'Kiểm tra thiết bị mới nhận, bảo đảm hoạt động tốt trước khi sử dụng', [BM('5.5.1.02', 'Biên bản bàn giao thiết bị')]],
  ['5.4', 1, '', 'Có hướng dẫn sử dụng thiết bị bằng tiếng Việt', [K.hdsdTtb]],
  ['5.5', 1, '', 'Hướng dẫn sử dụng từng thiết bị đặt ở nơi dễ tiếp cận', [], true],
  ['5.6', 1, '', 'Toàn bộ thiết bị được dán nhãn nhận biết duy nhất', [], true],
  ['5.7', 2, '', 'Nhân viên vận hành thiết bị được đào tạo phù hợp', [BM('5.3.2.03', 'Phiếu đào tạo nội bộ'), BM('5.3.2.04', 'Sổ theo dõi đào tạo nội bộ')]],
  ['5.8', 1, '', 'Có danh sách và thông tin liên hệ đơn vị cung cấp, bảo hành thiết bị', [BM('5.5.1.09', 'Danh sách nhà cung cấp thiết bị')]],
  ['5.9', 1, '', 'Có sổ nhật ký sử dụng cho từng thiết bị', [K.nhatKyTb]],
  ['5.10', 1, '', 'Quy trình quản lý thiết bị đề cập xử lý tránh lây nhiễm chéo và hư hỏng', [QT('5.5.1', 'Quản lý thiết bị'), BM('5.5.1.11', 'Phiếu theo dõi khử nhiễm trang thiết bị')]],
  ['5.11', 3, '***', 'Có kế hoạch và thực hiện kiểm định/hiệu chuẩn thiết bị ảnh hưởng đến kết quả', [BM('5.5.1.06', 'Kế hoạch hiệu chuẩn và bảo dưỡng thiết bị'), BM('5.5.1.07', 'Đánh giá kết quả hiệu chuẩn'), BM('5.5.1.10', 'Biên bản gửi thiết bị sửa chữa - hiệu chuẩn')]],
  ['5.12', 3, '*', 'Thực hiện bảo trì, bảo dưỡng thiết bị theo hướng dẫn của nhà sản xuất', [BM('5.5.1.08', 'Phiếu bảo trì bảo dưỡng thiết bị'), BM('5.5.1.06', 'Kế hoạch hiệu chuẩn và bảo dưỡng thiết bị')]],
  ['5.13', 1, '', 'Khử nhiễm thiết bị trước khi sửa chữa, thanh lý', [BM('5.5.1.11', 'Phiếu theo dõi khử nhiễm trang thiết bị')]],
  ['5.14', 1, '', 'Thiết bị hỏng/chờ thanh lý được dán nhãn phân biệt', [], true],
  ['5.15', 1, '', 'Sự cố nghiêm trọng/tai nạn liên quan thiết bị được thông báo và lưu hồ sơ', [QT('5.5.1', 'Quản lý thiết bị'), BM('5.12.1.07', 'Phiếu báo cáo sự cố')]],
  ['5.16', 1, '', 'Kiểm tra và ghi lại tình trạng thiết bị mới đưa vào sử dụng hoặc sau sửa chữa', [BM('5.5.1.03', 'Lý lịch thiết bị'), BM('5.5.1.07', 'Đánh giá kết quả hiệu chuẩn')]],
  ['5.17', 2, '', 'Có quy trình dự phòng khi thiết bị hư hỏng', [QT('5.5.1', 'Quản lý thiết bị')]],
  ['5.18', 3, '', 'Dịch vụ xét nghiệm liên tục, không gián đoạn do hư hỏng thiết bị trong năm', [], true],
  ['5.19', 3, '', 'Lưu giữ đầy đủ hồ sơ liên quan đến thiết bị (a–j)', [BM('5.5.1.01', 'Danh mục thiết bị'), BM('5.5.1.02', 'Biên bản bàn giao thiết bị'), BM('5.5.1.03', 'Lý lịch thiết bị'), BM('5.5.1.06', 'Kế hoạch hiệu chuẩn và bảo dưỡng thiết bị'), BM('5.5.1.08', 'Phiếu bảo trì bảo dưỡng thiết bị')]],
  // ---------------- Chương VI ----------------
  ['6.1', 1, '', 'Có quy trình và kế hoạch đánh giá nội bộ', [QT('5.6.1', 'Đánh giá nội bộ'), BM('5.6.1.01', 'Kế hoạch đánh giá nội bộ')]],
  ['6.2', 2, '', 'Chương trình đánh giá xác định tiêu chí, phạm vi, tần suất, phương pháp', [BM('5.6.1.03', 'Chương trình đánh giá nội bộ')]],
  ['6.3', 2, '', 'Tiến hành đánh giá nội bộ theo kế hoạch đề ra', [BM('5.6.1.01', 'Kế hoạch đánh giá nội bộ'), BM('5.6.1.04', 'Báo cáo phát hiện trong đánh giá nội bộ')]],
  ['6.4', 1, '', 'Đánh giá viên được đào tạo về QLCL và bảo đảm khách quan', [BM('5.6.1.02', 'Phiếu đề nghị thành lập đoàn đánh giá')]],
  ['6.5', 2, '***', 'Đánh giá nội bộ xem xét tất cả hoạt động của hệ thống QLCL', [BM('5.6.1.03', 'Chương trình đánh giá nội bộ'), BM('5.6.1.05', 'Báo cáo kết quả đánh giá nội bộ')]],
  ['6.6', 1, '', 'Lưu hồ sơ kết quả đánh giá nội bộ', [BM('5.6.1.04', 'Báo cáo phát hiện trong đánh giá nội bộ'), BM('5.6.1.05', 'Báo cáo kết quả đánh giá nội bộ')]],
  ['6.7', 1, '', 'Kết quả đánh giá nội bộ được báo cáo với trưởng PXN/lãnh đạo', [BM('5.6.1.05', 'Báo cáo kết quả đánh giá nội bộ')]],
  ['6.8', 1, '', 'Khuyến cáo HĐKP/HĐPN nêu ra dựa trên kết quả đánh giá nội bộ', [BM('5.6.1.04', 'Báo cáo phát hiện trong đánh giá nội bộ'), BM('5.10.2.02', 'Phiếu báo cáo hành động khắc phục')]],
  ['6.9', 2, '', 'Thực hiện HĐKP/HĐPN theo thời gian đề ra và lưu hồ sơ', [BM('5.10.2.01', 'Sổ theo dõi hành động khắc phục'), BM('5.10.3.01', 'Sổ theo dõi hành động phòng ngừa')]],
  // ---------------- Chương VII ----------------
  ['7.1', 1, '', 'Áp dụng quy trình lựa chọn mua sắm thiết bị, vật tư, hóa chất, sinh phẩm', [QT('5.7.1', 'Dịch vụ và vật tư bên ngoài'), BM('5.7.1.01', 'Phiếu đề nghị mua sắm và thực hiện dịch vụ')]],
  ['7.2', 1, '', 'Có kế hoạch nhu cầu thiết bị, vật tư, hóa chất, sinh phẩm hằng năm', [K.nhuCau, BM('5.7.1.01', 'Phiếu đề nghị mua sắm và thực hiện dịch vụ')]],
  ['7.3', 2, '*', 'PXN tham gia xây dựng nhu cầu, lựa chọn nhà thầu, nghiệm thu', [BM('5.7.1.01', 'Phiếu đề nghị mua sắm và thực hiện dịch vụ'), BM('5.7.1.02', 'Phiếu đề xuất chất lượng hàng hóa - dịch vụ'), BM('5.7.2.02', 'Biên bản bàn giao vật tư')]],
  ['7.4', 1, '', 'Cập nhật danh sách nhà cung ứng đã được duyệt', [BM('5.7.1.03', 'Danh sách nhà cung cấp được lựa chọn')]],
  ['7.5', 1, '', 'Đánh giá chất lượng nhà cung ứng', [BM('5.7.1.04', 'Phiếu đánh giá nhà cung cấp')]],
  ['7.6', 1, '', 'Có quy trình tiếp nhận, bảo quản, kiểm tra, lưu kho sinh phẩm và vật tư', [QT('5.7.2', 'Quản lý vật tư'), BM('5.7.2.03', 'Kiểm tra chất lượng vật tư, hóa chất')]],
  ['7.7', 3, '', 'Khu vực lưu trữ hóa chất, sinh phẩm, vật tư đủ không gian, bảo đảm yêu cầu (a–f)', [], true],
  ['7.8', 1, '', 'Nếu không lưu trữ tại PXN: kiểm tra không gian, điều kiện nơi bảo quản', [], true],
  ['7.9', 1, '', 'Đánh giá chất lượng kít/lô hóa chất, sinh phẩm mới nhận trước khi sử dụng', [BM('5.7.2.03', 'Kiểm tra chất lượng vật tư, hóa chất')]],
  ['7.10', 1, '', 'Vật tư hết hạn/không đạt được dán nhãn cảnh báo và lưu riêng', [BM('5.7.2.04', 'Phiếu theo dõi vật tư'), BM('5.7.2.05', 'Biên bản hủy vật tư, hóa chất')]],
  ['7.11', 1, '', 'Hóa chất, sinh phẩm độc hại được lưu trữ đúng quy định', [K.msds]],
  ['7.12', 1, '', 'Có hướng dẫn sử dụng hóa chất, sinh phẩm, vật tư (nhà sản xuất, an toàn)', [K.msds]],
  ['7.13', 1, '', 'Thực hiện quy tắc FEFO (hết hạn trước dùng trước)', [BM('5.7.2.04', 'Phiếu theo dõi vật tư')]],
  ['7.14', 2, '', 'Lưu hồ sơ liên quan đến vật tư, hóa chất, sinh phẩm (a–g)', [BM('5.7.2.01', 'Danh mục vật tư, hóa chất'), BM('5.7.2.02', 'Biên bản bàn giao vật tư'), BM('5.7.2.04', 'Phiếu theo dõi vật tư')]],
  ['7.15', 1, '', 'Hóa chất/môi trường tự chuẩn bị: lưu người chuẩn bị, hạn dùng, nồng độ', [BM('5.7.2.06', 'Sổ pha chế hóa chất')]],
  ['7.16', 1, '', 'Xử lý đúng quy định hóa chất, sinh phẩm, vật tư hết hạn/không đạt', [BM('5.7.2.05', 'Biên bản hủy vật tư, hóa chất')]],
  ['7.17', 3, '***', 'Không bị gián đoạn dịch vụ do hóa chất, sinh phẩm, vật tư trong năm', [], true],
  // ---------------- Chương VIII ----------------
  ['8.1', 2, '', 'Mẫu xét nghiệm được gửi cùng phiếu yêu cầu xét nghiệm', [QT('5.8.1', 'Quy trình trước xét nghiệm'), BM('5.8.1.01', 'Sổ giao nhận bệnh phẩm')]],
  ['8.2', 3, '', 'Phiếu yêu cầu xét nghiệm có đầy đủ thông tin (a–g)', [K.phieuYc]],
  ['8.3', 2, '***', 'Có quy trình nhận mẫu (a–g)', [QT('5.8.1', 'Quy trình trước xét nghiệm'), BM('5.8.1.01', 'Sổ giao nhận bệnh phẩm'), BM('5.8.1.02', 'Biên bản từ chối mẫu'), BM('5.8.1.03', 'Sổ theo dõi mẫu không đạt, không có mẫu')]],
  ['8.4', 3, '***', 'Xây dựng và thực hiện quy trình xét nghiệm cho các xét nghiệm đang thực hiện (a–n)', [K.qtkt]],
  ['8.5', 2, '', 'Xây dựng và thực hiện quy trình kiểm soát chất lượng', [QT('5.8.3', 'Đảm bảo chất lượng kết quả xét nghiệm')]],
  ['8.6', 2, '', 'Quy định tạm dừng trả kết quả nếu nội kiểm không đạt', [QT('5.8.7', 'Tạm dừng trả kết quả'), BM('5.8.7.01', 'Phiếu theo dõi tạm dừng trả kết quả')]],
  ['8.7', 3, '*', 'Nội kiểm 2 mức giá trị cho xét nghiệm định lượng', [QT('5.8.4', 'Nội kiểm tra xét nghiệm định lượng'), BM('5.8.4.01', 'Phiếu kết quả nội kiểm định lượng'), BM('5.8.4.02', 'Levey-Jennings')]],
  ['8.8', 2, '*', 'Nội kiểm chứng âm, chứng dương cho xét nghiệm định tính', [QT('5.8.5', 'Nội kiểm tra xét nghiệm định tính và bán định lượng'), BM('5.8.5.01', 'Phiếu kết quả nội kiểm định tính')]],
  ['8.9', 3, '*', 'Xét nghiệm bán định lượng: nội kiểm bằng mẫu kèm bộ kít hoặc vật liệu khác', [BM('5.8.5.02', 'Phiếu kết quả nội kiểm bán định lượng')]],
  ['8.10', 1, '*', 'Test nhanh: nội kiểm định kỳ trên mẫu nội kiểm (âm, dương)', [BM('5.8.5.01', 'Phiếu kết quả nội kiểm định tính (Test nhanh)')]],
  ['8.11', 3, '*', 'Thực hiện nội kiểm đồng thời hoặc trước khi chạy mẫu người bệnh', [BM('5.8.4.01', 'Phiếu kết quả nội kiểm định lượng'), BM('5.8.5.01', 'Phiếu kết quả nội kiểm định tính')]],
  ['8.12', 3, '***', 'Khi nội kiểm không đạt: tìm nguyên nhân, khắc phục rồi mới tiếp tục xét nghiệm', [BM('5.8.4.05', 'Phiếu theo dõi sự cố nội kiểm'), BM('5.8.5.03', 'Sổ theo dõi sự cố nội kiểm'), BM('5.8.7.01', 'Phiếu theo dõi tạm dừng trả kết quả')]],
  ['8.13', 2, '', 'Kết quả nội kiểm được xem xét định kỳ để phát hiện xu hướng', [BM('5.8.4.03', 'Phiếu đánh giá, xem xét kết quả QC định kỳ')]],
  ['8.14', 1, '', 'Xây dựng hướng dẫn thực hiện ngoại kiểm/so sánh liên phòng', [QT('5.8.6', 'Ngoại kiểm tra')]],
  ['8.15', 3, '*', 'Tham gia chương trình ngoại kiểm (EQA)/so sánh liên phòng', [BM('5.8.6.01', 'Phiếu theo dõi kết quả ngoại kiểm'), BM('5.8.6.02', 'Biên bản họp nhân viên xác nhận EQA'), BM('5.8.6.03', 'Lịch phân công chạy ngoại kiểm')]],
  ['8.16', 2, '***', 'Quy định, thực hiện và lưu hồ sơ xác nhận giá trị sử dụng/thẩm định phương pháp', [QT('5.8.2', 'Lựa chọn và phê duyệt phương pháp xét nghiệm'), BM('5.8.2.02', 'Kế hoạch thử nghiệm và phê duyệt phương pháp'), BM('5.8.2.09', 'Phiếu tổng hợp kết quả phê duyệt phương pháp')]],
  ['8.17', 3, '', 'PXN tuân thủ đúng các quy trình xét nghiệm đã xây dựng', [], true],
  ['8.18', 2, '***', 'Có quy trình rà soát kết quả xét nghiệm trước khi trả cho khách hàng', [QT('5.8.8', 'Rà soát kết quả xét nghiệm')]],
  ['8.19', 1, '', 'Quy định bảo đảm báo cáo kết quả và việc sao chép chính xác, rõ ràng', [QT('5.8.10', 'Trả kết quả xét nghiệm'), BM('5.8.10.01', 'Phiếu trả kết quả')]],
  ['8.20', 1, '', 'Thực hiện quy định về định dạng phiếu trả lời và hình thức trả kết quả', [BM('5.8.10.01', 'Phiếu trả kết quả')]],
  ['8.21', 3, '', 'Phiếu trả kết quả có đủ nội dung quy định (a–p)', [BM('5.8.10.01', 'Phiếu trả kết quả')]],
  ['8.22', 3, '', 'Có quy trình trả kết quả xét nghiệm (a–g)', [QT('5.8.10', 'Trả kết quả xét nghiệm'), BM('5.8.10.02', 'Sổ trả kết quả khoa phòng'), BM('5.8.10.03', 'Sổ trả kết quả qua điện thoại, email'), BM('5.8.10.04', 'Sổ trả kết quả có mức cảnh báo')]],
  ['8.23', 2, '', 'Có quy định sửa đổi kết quả xét nghiệm (a–c)', [QT('5.8.11', 'Công bố kết quả'), BM('5.8.11.01', 'Sổ thu hồi kết quả')]],
  ['8.24', 1, '', 'Kết quả ban đầu được lưu giữ khi sửa đổi', [BM('5.8.11.01', 'Sổ thu hồi kết quả'), BM('5.8.8.01', 'Sổ chạy lại kết quả')]],
  ['8.25', 2, '', 'Có quy trình nhận dạng, lưu trữ, bảo quản, tiêu hủy mẫu sau xét nghiệm', [QT('5.8.9', 'Lưu và hủy mẫu')]],
  ['8.26', 1, '', 'Lưu mẫu sau xét nghiệm theo đúng quy định', [BM('5.8.9.01', 'Sổ lưu và hủy bệnh phẩm')]],
  ['8.27', 1, '', 'Tiêu hủy bệnh phẩm theo đúng quy định', [BM('5.8.9.01', 'Sổ lưu và hủy bệnh phẩm'), BM('5.12.1.15', 'Sổ bàn giao chất thải')]],
  // ---------------- Chương IX ----------------
  ['9.1', 2, '***', 'Có quy định và thực hiện bảo mật thông tin, kết quả xét nghiệm của khách hàng', [QT('5.9.02', 'Bảo mật thông tin khách hàng'), BM('5.1.1.04', 'Cam kết bảo mật')]],
  ['9.2', 3, '', 'Xác định thẩm quyền, trách nhiệm truy cập/nhập/thay đổi dữ liệu, ban hành kết quả', [BM('5.9.1.03', 'Danh sách cán bộ truy cập phần mềm'), BM('5.1.1.02', 'Thẩm quyền ký')]],
  ['9.3', 2, '', 'Hệ thống thông tin điện tử được bảo vệ, ngăn truy cập trái phép', [QT('5.9.01', 'Quản lý thông tin'), BM('5.9.1.03', 'Danh sách cán bộ truy cập phần mềm')]],
  ['9.4', 1, '', 'Hệ thống được duy trì, bảo đảm toàn vẹn dữ liệu', [BM('5.9.1.02', 'Phiếu kiểm tra sao lưu'), BM('5.9.1.04', 'Phiếu đánh giá LIS sau nâng cấp')]],
  ['9.5', 1, '', 'Lưu hồ sơ những lần hệ thống trục trặc và hành động khắc phục', [BM('5.9.1.05', 'Sổ theo dõi sự cố hệ thống quản lý thông tin (LIS)')]],
  ['9.6', 2, '', 'Có kế hoạch dự phòng khi hệ thống thông tin điện tử hỏng hoặc bảo trì', [QT('5.9.01', 'Quản lý thông tin'), BM('5.9.1.02', 'Phiếu kiểm tra sao lưu')]],
  // ---------------- Chương X ----------------
  ['10.1', 3, '***', 'Có quy định bằng văn bản nhận biết và kiểm soát sự không phù hợp (a–l)', [QT('5.10.1', 'Sự không phù hợp'), BM('5.10.1.01', 'Sổ theo dõi sự không phù hợp'), BM('5.10.1.02', 'Phiếu báo cáo sự không phù hợp')]],
  ['10.2', 2, '', 'Hồ sơ sự không phù hợp ghi chép đầy đủ, lưu trữ thích hợp', [BM('5.10.1.01', 'Sổ theo dõi sự không phù hợp'), BM('5.10.1.02', 'Phiếu báo cáo sự không phù hợp')]],
  ['10.3', 3, '', 'Có quy định bằng văn bản thực hiện hành động khắc phục (a–e)', [QT('5.10.2', 'Hành động khắc phục')]],
  ['10.4', 2, '', 'Hồ sơ hành động khắc phục ghi chép đầy đủ, lưu trữ thích hợp', [BM('5.10.2.01', 'Sổ theo dõi hành động khắc phục'), BM('5.10.2.02', 'Phiếu báo cáo hành động khắc phục')]],
  ['10.5', 2, '', 'Có quy định bằng văn bản thực hiện hành động phòng ngừa (a–f)', [QT('5.10.3', 'Hành động phòng ngừa')]],
  ['10.6', 2, '***', 'Hồ sơ hành động phòng ngừa đầy đủ; đã xem xét, đánh giá hiệu quả', [BM('5.10.3.01', 'Sổ theo dõi hành động phòng ngừa'), BM('5.10.3.02', 'Phiếu hành động phòng ngừa')]],
  // ---------------- Chương XI ----------------
  ['11.1', 3, '', 'Có quy định bằng văn bản các bước thực hiện cải tiến liên tục (a–e)', [QT('5.11.1', 'Cải tiến liên tục'), BM('5.11.1.01', 'Kế hoạch cải tiến chất lượng')]],
  ['11.2', 3, '', 'Xác định và thực hiện các hoạt động/dự án cải tiến liên tục', [BM('5.11.1.02', 'Sổ theo dõi hoạt động cải tiến chất lượng'), BM('5.11.1.03', 'Phiếu đề nghị và thực hiện cải tiến chất lượng')]],
  ['11.3', 2, '', 'Họp định kỳ rà soát việc áp dụng chỉ số chất lượng, nhu cầu cải tiến', [BM('5.1.1.06', 'Biên bản họp nhân viên'), BM('5.1.3.02', 'Biên bản xem xét của lãnh đạo')]],
  ['11.4', 3, '*', 'Theo dõi định kỳ các chỉ số chất lượng', [BM('5.1.2.01', 'Kế hoạch theo dõi chỉ số chất lượng'), BM('5.1.2.02', 'Phiếu báo cáo chỉ số chất lượng')]],
  ['11.5', 2, '', 'Áp dụng công cụ đồ họa (biểu đồ, đồ thị) để trao đổi phát hiện, xu hướng chất lượng', [K.chiSo]],
  ['11.6', 2, '', 'Kết quả phân tích chỉ số chất lượng được dùng để cải tiến chất lượng PXN', [BM('5.1.2.02', 'Phiếu báo cáo chỉ số chất lượng'), BM('5.11.1.01', 'Kế hoạch cải tiến chất lượng')]],
  ['11.7', 3, '***', 'Hành động cải tiến được xem xét định kỳ, đánh giá hiệu quả', [BM('5.11.1.03', 'Phiếu đề nghị và thực hiện cải tiến chất lượng'), BM('5.11.1.02', 'Sổ theo dõi hoạt động cải tiến chất lượng')]],
  ['11.8', 3, '', 'Nhân viên PXN tham gia thực hiện các hoạt động cải tiến', [BM('5.11.1.03', 'Phiếu đề nghị và thực hiện cải tiến chất lượng')]],
  // ---------------- Chương XII ----------------
  ['12.1', 2, '*', 'Đủ diện tích/không gian, chia khu vực chức năng riêng biệt', [], true],
  ['12.2', 1, '***', 'Sổ tay an toàn cập nhật, sẵn có và dễ tiếp cận tại PXN', [K.stat]],
  ['12.3', 3, '***', 'Sổ tay an toàn có đủ nội dung (a–m)', [K.stat, QT('5.12.2', 'Hướng dẫn an toàn'), QT('5.12.4', 'Đánh giá nguy cơ'), K.msds, BM('5.12.1.09', 'Danh sách bảo hộ cá nhân')]],
  ['12.4', 1, '', 'Có khu vực sinh hoạt cho nhân viên (vệ sinh, nước uống, thay đồ)', [], true],
  ['12.5', 1, '*', 'Có khu vực lấy mẫu bệnh phẩm riêng (a–c)', [], true],
  ['12.6', 1, '', 'Kiểm soát việc tiếp cận khu vực thực hiện xét nghiệm', [BM('5.12.1.01', 'Quy định ra vào khu vực xét nghiệm'), BM('5.12.1.16', 'Nhật ký ra vào phòng xét nghiệm')]],
  ['12.7', 2, '', 'Trang bị phù hợp cho thực hiện xét nghiệm (điện dự phòng, chiếu sáng, thông gió, nước...)', [QT('5.12.1', 'Điều kiện tiện nghi và môi trường'), BM('5.12.1.03', 'Biểu mẫu theo dõi điều kiện môi trường')]],
  ['12.8', 1, '', 'Có trang bị bảo hộ lao động phù hợp, dễ tiếp cận', [BM('5.12.1.09', 'Danh sách bảo hộ cá nhân')]],
  ['12.9', 2, '', 'Thiết bị an toàn được trang bị đầy đủ và kiểm tra chức năng định kỳ', [BM('5.12.2.02', 'Biên bản kiểm tra an toàn'), BM('5.12.1.17', 'Nhật ký sử dụng và khử nhiễm tủ ATSH cấp 2')]],
  ['12.10', 1, '', 'Quá trình khử nhiễm PXN thực hiện thường xuyên và ghi chép lại', [BM('5.12.1.14', 'Phiếu theo dõi khử nhiễm'), BM('5.12.1.19', 'Nhật ký vệ sinh, tiệt khuẩn trong PXN')]],
  ['12.11', 1, '', 'Có đủ không gian riêng lưu trữ mẫu, tài liệu, thiết bị, hóa chất', [], true],
  ['12.12', 1, '', 'Điều kiện khu vực lưu trữ được kiểm soát, tránh nhiễm chéo', [BM('5.12.1.06', 'Biểu mẫu theo dõi điều kiện tủ'), BM('5.5.1.04', 'Theo dõi nhiệt độ')]],
  ['12.13', 1, '', 'Mẫu bệnh phẩm lưu trữ tách biệt với sinh phẩm, hóa chất', [], true],
  ['12.14', 1, '', 'Vật liệu nguy hiểm được lưu trữ, bảo quản, sử dụng an toàn', [K.msds]],
  ['12.15', 1, '', 'Khu vực làm việc sạch sẽ, duy trì thường xuyên, có biển cảnh báo', [BM('5.12.1.19', 'Nhật ký vệ sinh, tiệt khuẩn trong PXN'), BM('5.12.1.10', 'Các mẫu biển báo cửa phòng')]],
  ['12.16', 1, '', 'Dây điện, phích cắm, ổ cắm bố trí hợp lý, thuận tiện', [], true],
  ['12.17', 1, '', 'Có nguồn điện dự phòng cho các thiết bị ảnh hưởng đến kết quả', [], true],
  ['12.18', 1, '', 'Thiết bị đặt ở vị trí phù hợp (xa nước, xa hóa chất độc hại)', [], true],
  ['12.19', 1, '', 'Chất thải nhiễm khuẩn và không nhiễm khuẩn được tách riêng', [BM('5.12.1.08', 'Danh sách dụng cụ chứa chất thải')]],
  ['12.20', 1, '', 'Chất thải nhiễm khuẩn được xử lý đúng quy định (hấp, đốt)', [BM('5.12.1.15', 'Sổ bàn giao chất thải')]],
  ['12.21', 1, '', 'Hóa chất, vật liệu nguy hiểm được hủy bỏ/xử lý đúng quy định', [BM('5.7.2.05', 'Biên bản hủy vật tư, hóa chất'), BM('5.12.1.15', 'Sổ bàn giao chất thải')]],
  ['12.22', 1, '', 'Xử lý vật sắc nhọn và sử dụng hộp chứa vật sắc nhọn hợp lý', [BM('5.12.1.08', 'Danh sách dụng cụ chứa chất thải')]],
  ['12.23', 1, '', 'Chương trình an toàn có phòng cháy chữa cháy (bình cứu hỏa, chuông báo, diễn tập)', [K.pccc]],
  ['12.24', 1, '', 'Có kế hoạch và thực hiện kiểm tra an toàn định kỳ', [BM('5.12.2.01', 'Kế hoạch kiểm tra an toàn'), BM('5.12.2.02', 'Biên bản kiểm tra an toàn')]],
  ['12.25', 1, '', 'Việc kiểm tra an toàn do người đã được tập huấn ATSH thực hiện', [BM('5.12.2.02', 'Biên bản kiểm tra an toàn'), K.tapHuanAt]],
  ['12.26', 1, '', 'Vấn đề phát hiện khi kiểm tra an toàn được lưu hồ sơ và báo cáo', [BM('5.12.2.02', 'Biên bản kiểm tra an toàn'), BM('5.12.1.07', 'Phiếu báo cáo sự cố')]],
  ['12.27', 1, '***', 'Phân công nhân viên an toàn giám sát chương trình an toàn của PXN', [K.nvAt, BM('5.1.1.07', 'Sổ phân công công việc')]],
];

export const CRITERIA: Criterion[] = ROWS.map(([id, pts, mark, title, req, site]) => {
  const [ch, n] = id.split('.').map(Number);
  return { id, ch, n, pts, mark, title, req, site: !!site };
});

// ---- Chấm điểm theo thư viện hiện có -----------------------------------------------------------------
// Đủ hồ sơ = 100% điểm; một phần = 50% điểm (mức "Đạt một phần" của bảng kiểm); thiếu = 0.
// Tiêu chí chỉ kiểm chứng được tại chỗ (không có hồ sơ nào chứng minh): "tai-cho", chưa tính điểm cho tới khi đánh giá thực tế.
export function evaluate(docs: EvDoc[]) {
  const norm = (s: string) => s.normalize('NFC');
  const hay = docs.map((d) => ({ d, t: norm(`${d.title}`) }));
  const results: Record<string, CritResult> = {};
  for (const c of CRITERIA) {
    const matched: CritResult['matched'] = []; const missing: string[] = [];
    for (const r of c.req) {
      const hit = hay.filter((h) => r.re.test(h.t)).map((h) => h.d);
      if (hit.length) matched.push({ label: r.label, docs: hit.filter((d) => !d.hidden).slice(0, 4).map((d) => ({ id: d.id, title: d.title, path: d.path })) });
      else missing.push(r.label);
    }
    let status: Status; let earned = 0;
    if (!c.req.length) status = 'tai-cho';
    else if (!missing.length) { status = 'du'; earned = c.pts; }
    else if (!matched.length) status = 'thieu';
    else { status = 'mot-phan'; earned = c.pts / 2; }
    results[c.id] = { id: c.id, status, earned, matched, missing };
  }
  return { results, ...summarize(results) };
}

// Tổng hợp theo chương/tổng từ kết quả từng tiêu chí (dùng lại sau khi áp điểm chấm tay).
export function summarize(results: Record<string, CritResult>) {
  const chapters: ChapterSummary[] = CHAPTERS.map(({ ch, name }) => {
    const list = CRITERIA.filter((c) => c.ch === ch);
    const rs = list.map((c) => results[c.id]);
    const max = list.reduce((a, c) => a + c.pts, 0); const earned = rs.reduce((a, r) => a + r.earned, 0);
    const star = list.filter((c) => c.mark === '*'), tri = list.filter((c) => c.mark === '***');
    return {
      ch, name, count: list.length, max, earned,
      du: rs.filter((r) => r.status === 'du').length, motPhan: rs.filter((r) => r.status === 'mot-phan').length,
      thieu: rs.filter((r) => r.status === 'thieu').length, taiCho: rs.filter((r) => r.status === 'tai-cho').length,
      pct: max ? (earned / max) * 100 : 0,
      mandatory: { star: star.length, starOk: star.filter((c) => results[c.id].status === 'du').length, tri: tri.length, triOk: tri.filter((c) => results[c.id].status === 'du').length },
    };
  });
  const sum = (f: (c: ChapterSummary) => number) => chapters.reduce((a, c) => a + f(c), 0);
  const total = sum((c) => c.max), earned = sum((c) => c.earned);
  const totals = {
    count: sum((c) => c.count), max: total, earned, pct: total ? (earned / total) * 100 : 0,
    du: sum((c) => c.du), motPhan: sum((c) => c.motPhan), thieu: sum((c) => c.thieu), taiCho: sum((c) => c.taiCho),
    taiChoPts: CRITERIA.filter((c) => results[c.id].status === 'tai-cho').reduce((a, c) => a + c.pts, 0),
    star: sum((c) => c.mandatory.star), starOk: sum((c) => c.mandatory.starOk), tri: sum((c) => c.mandatory.tri), triOk: sum((c) => c.mandatory.triOk),
  };
  return { chapters, totals, level: levelOf(totals.pct) };
}
// Mức chất lượng theo tỷ lệ % điểm (Sổ tay): <20 chưa xếp mức; 20–<35: 1; 35–<65: 2; 65–<85: 3; 85–<95: 4; ≥95: 5.
// Xếp mức chính thức còn yêu cầu đạt đủ các tiêu chí bắt buộc (*)/(***) và do đoàn đánh giá kết luận.
// Chấm tay cho tiêu chí chỉ kiểm chứng được tại chỗ (không có hồ sơ nào thay thế): Đạt = 100% điểm, Một phần = 50%, Không đạt = 0.
export function applyManual(results: Record<string, CritResult>, manual: Manual): Record<string, CritResult> {
  const out = { ...results };
  for (const id of Object.keys(manual)) {
    const c = CRITERIA.find((x) => x.id === id); const m = manual[id];
    if (!c || !c.site || c.req.length || !results[id] || !['du', 'mot-phan', 'thieu'].includes(m)) continue;
    out[id] = { ...results[id], status: m, earned: m === 'du' ? c.pts : m === 'mot-phan' ? c.pts / 2 : 0, manual: true };
  }
  return out;
}
export function levelOf(pct: number): number { return pct >= 95 ? 5 : pct >= 85 ? 4 : pct >= 65 ? 3 : pct >= 35 ? 2 : pct >= 20 ? 1 : 0; }

// Kiểm tra chéo dữ liệu khai báo với số liệu chính thức (dùng khi kiểm thử).
export function selfCheck(): string[] {
  const errs: string[] = [];
  for (const ch of Object.keys(OFFICIAL).map(Number)) {
    const l = CRITERIA.filter((c) => c.ch === ch);
    if (l.length !== OFFICIAL[ch].count) errs.push(`Chương ${ch}: ${l.length} tiêu chí (chuẩn ${OFFICIAL[ch].count})`);
    const p = l.reduce((a, c) => a + c.pts, 0); if (p !== OFFICIAL[ch].max) errs.push(`Chương ${ch}: ${p} điểm (chuẩn ${OFFICIAL[ch].max})`);
  }
  return errs;
}
