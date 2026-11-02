
import crypto from 'node:crypto';

import { supabase, explainSupabaseError } from './storage';
import {
  DriveError,
  driveEnv,
  ensureFolder,
  uploadJson,
  downloadText,
  listFiles,
  writeState,
  type DriveFile,
} from './drive';
import { canonicalId, idVariants } from './docId';
import { auditLog } from './security';

/**
 * SMARTLAB QMS 2429
 * Quản lý lưu trữ và khôi phục dữ liệu giữa Supabase và Google Drive.
 *
 * Chế độ:
 * - due: Sao lưu bản ghi cũ lên Drive, kiểm tra MD5,
 *        sau đó thay dữ liệu trong Supabase bằng con trỏ Drive.
 * - copy: Sao lưu bản ghi lên Drive nhưng giữ nguyên dữ liệu Supabase.
 *
 * Lưu ý:
 * Chế độ due chỉ nên sử dụng khi đã kiểm thử thành công
 * chức năng khôi phục dữ liệu.
 */

// ============================================================
// 1. KIỂU DỮ LIỆU VÀ CẤU HÌNH
// ============================================================

export type Stub = {
  archived: true;
  archive: {
    provider: 'gdrive';
    fileId: string;
    md5?: string;
    bytes: number;
    archivedAt: string;
    version: number;
    name: string;
  };
  savedAt?: number;
};

export const isStub = (data: any): data is Stub => {
  return (
    !!data &&
    typeof data === 'object' &&
    data.archived === true &&
    !!data.archive &&
    data.archive.provider === 'gdrive' &&
    typeof data.archive.fileId === 'string' &&
    data.archive.fileId.length > 0
  );
};

const SCHEMA = 'smartlab-qms-archive-v1';

// Không chuyển các bản ghi nhỏ hơn 8 KB sang chế độ lưu trữ due.
const MIN_BYTES = 8192;

// Số bản ghi tối đa mỗi trang truy vấn Supabase.
const PAGE_SIZE = 20;

export type ArchiveRun = {
  at: string;
  mode: 'due' | 'copy';
  afterDays: number;
  scanned: number;
  archived: number;
  copied: number;
  skipped: number;
  raced: number;
  failed: number;
  bytes: number;
  errors: string[];
  durationMs: number;
  done: boolean;
};

type Row = {
  id: string;
  document_id: string;
  form_id?: string | null;
  user_id: string;
  data: any;
  version?: number | null;
  created_at?: string;
  updated_at: string;
};

let running = false;

// ============================================================
// 2. HÀM HỖ TRỢ
// ============================================================

/**
 * Tạo mã SHA-1 ổn định từ document_id.
 * Dùng để đối chiếu tệp trên Google Drive.
 */
const did = (docId: string): string => {
  return crypto.createHash('sha1').update(docId).digest('hex');
};

/**
 * Tạo tên tệp dễ đọc từ document_id.
 */
function readable(docId: string): string {
  let base = docId;

  try {
    const decoded = Buffer.from(docId, 'base64url').toString('utf8');

    if (
      decoded.includes('/') ||
      decoded.includes('\\') ||
      /\.(docx|xlsx|pdf)$/i.test(decoded)
    ) {
      base = decoded.split(/[\\/]/).pop() || decoded;
    }
  } catch {
    // Nếu không giải mã được thì sử dụng document_id gốc.
  }

  return (
    base
      .replace(/\.(docx|xlsx|pdf)$/i, '')
      .replace(/[^\p{L}\p{N}._ -]+/gu, '_')
      .trim()
      .slice(0, 70) || 'record'
  );
}

/**
 * Tạo nội dung JSON chuẩn để lưu lên Google Drive.
 */
const payloadOf = (row: Row, timestamp: string) => ({
  schema: SCHEMA,
  document_id: row.document_id,
  form_id: row.form_id ?? null,
  user_id: row.user_id,
  version: Number(row.version) || 0,
  created_at: row.created_at,
  updated_at: row.updated_at,
  archived_at: timestamp,
  data: row.data,
});

/**
 * Kiểm tra bản sao cùng document_id và version đã tồn tại trên Drive.
 */
async function driveHas(
  folderId: string,
  docId: string,
  version: number
): Promise<boolean> {
  const query =
    "appProperties has { key='did' and value='" +
    did(docId) +
    "' } and appProperties has { key='ver' and value='" +
    version +
    "' }";

  const result = await listFiles(folderId, query, undefined, 1);

  return result.files.length > 0;
}

/**
 * Chuyển lỗi thành nội dung dễ đọc.
 */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// ============================================================
// 3. SAO LƯU SUPABASE LÊN GOOGLE DRIVE
// ============================================================

export async function runArchive(
  opts: {
    mode?: 'due' | 'copy';
    limit?: number;
    afterDays?: number;
    maxMs?: number;
  } = {}
): Promise<ArchiveRun> {
  if (running) {
    throw new DriveError(
      'busy',
      'Một tiến trình sao lưu khác đang chạy. Vui lòng đợi rồi thử lại.'
    );
  }

  const db = supabase();

  if (!db) {
    throw new DriveError(
      'no_supabase',
      'Chưa cấu hình Supabase nên không thể sao lưu dữ liệu.'
    );
  }

  running = true;

  const t0 = Date.now();

  // Giới hạn tham số đầu vào.
  const mode = opts.mode || 'due';

  const afterDays = Math.max(
    0,
    Number.isFinite(opts.afterDays)
      ? Number(opts.afterDays)
      : driveEnv().afterDays
  );

  const limit = Math.max(
    1,
    Math.min(
      Number.isFinite(opts.limit) ? Number(opts.limit) : 40,
      200
    )
  );

  const maxMs = Math.max(
    1000,
    Number.isFinite(opts.maxMs) ? Number(opts.maxMs) : 50000
  );

  const run: ArchiveRun = {
    at: new Date().toISOString(),
    mode,
    afterDays,
    scanned: 0,
    archived: 0,
    copied: 0,
    skipped: 0,
    raced: 0,
    failed: 0,
    bytes: 0,
    errors: [],
    durationMs: 0,
    done: true,
  };

  try {
    // Kiểm tra thư mục lưu trữ trên Google Drive.
    const folder = await ensureFolder();

    const cutoff = new Date(
      Date.now() - afterDays * 86400000
    ).toISOString();

    // Phân trang ổn định bằng hai trường updated_at và id.
    let cursorUpdatedAt = '';
    let cursorId = '';

    let worked = 0;

    outer: while (true) {
      let query = db
        .from('form_records')
        .select(
          'id,document_id,form_id,user_id,data,version,created_at,updated_at'
        )
        .order('updated_at', { ascending: true })
        .order('id', { ascending: true })
        .limit(PAGE_SIZE);

      // Chỉ xử lý bản ghi đã quá thời hạn lưu trữ.
      if (mode === 'due') {
        query = query.lt('updated_at', cutoff);
      }

      // Điều kiện phân trang kết hợp để không bỏ sót
      // các bản ghi có cùng updated_at.
      if (cursorUpdatedAt && cursorId) {
        query = query.or(
          `updated_at.gt.${cursorUpdatedAt},and(updated_at.eq.${cursorUpdatedAt},id.gt.${cursorId})`
        );
      }

      const result = await query;

      if (result.error) {
        throw new Error(explainSupabaseError(result.error));
      }

      const rows = (result.data || []) as Row[];

      if (rows.length === 0) {
        break;
      }

      for (const row of rows) {
        cursorUpdatedAt = row.updated_at;
        cursorId = row.id;

        run.scanned++;

        // Bỏ qua bản ghi đã được lưu trữ trước đó.
        if (isStub(row.data)) {
          run.skipped++;
          continue;
        }

        const jsonText = JSON.stringify(row.data ?? {});

        // Chế độ due không lưu bản ghi nhỏ hơn 8 KB.
        if (
          mode === 'due' &&
          Buffer.byteLength(jsonText, 'utf8') < MIN_BYTES
        ) {
          run.skipped++;
          continue;
        }

        // Bỏ qua dữ liệu rỗng.
        if (
          !row.data ||
          (typeof row.data === 'object' &&
            Object.keys(row.data).length === 0)
        ) {
          run.skipped++;
          continue;
        }

        // Kiểm tra giới hạn số lượng và thời gian xử lý.
        if (worked >= limit || Date.now() - t0 > maxMs) {
          run.done = false;
          break outer;
        }

        try {
          const version = Number(row.version) || 0;

          // Chế độ copy không tạo bản sao trùng version.
          if (
            mode === 'copy' &&
            (await driveHas(folder, row.document_id, version))
          ) {
            run.skipped++;
            continue;
          }

          const timestamp = new Date().toISOString();

          const filename =
            readable(row.document_id) +
            '__v' +
            version +
            '__' +
            timestamp.replace(/[:.]/g, '-') +
            '.json';

          // Tải dữ liệu lên Google Drive.
          const uploaded = await uploadJson(
            filename,
            payloadOf(row, timestamp),
            {
              did: did(row.document_id),
              ver: String(version),
              kind: mode === 'due' ? 'archive' : 'copy',
            },
            folder
          );

          // Kiểm tra MD5 sau khi tải lên.
          if (
            uploaded.md5 &&
            uploaded.md5 !== uploaded.localMd5
          ) {
            throw new Error(
              'Kiểm tra toàn vẹn MD5 không khớp sau khi tải lên Drive. Dữ liệu Supabase được giữ nguyên.'
            );
          }

          worked++;
          run.bytes += uploaded.size;

          // Chế độ copy: giữ nguyên dữ liệu Supabase.
          if (mode === 'copy') {
            run.copied++;
            continue;
          }

          // Chế độ due: tạo con trỏ tham chiếu đến Google Drive.
          const stub: Stub = {
            archived: true,
            archive: {
              provider: 'gdrive',
              fileId: uploaded.id,
              md5: uploaded.md5 || uploaded.localMd5,
              bytes: uploaded.size,
              archivedAt: timestamp,
              version,
              name: readable(row.document_id),
            },
            savedAt: Number(row.data?.savedAt) || undefined,
          };

          // Chỉ thay dữ liệu nếu bản ghi chưa bị người khác sửa.
          let updateQuery = db
            .from('form_records')
            .update({ data: stub })
            .eq('id', row.id)
            .eq('updated_at', row.updated_at);

          if (row.version !== undefined && row.version !== null) {
            updateQuery = updateQuery.eq('version', row.version);
          }

          const updateResult = await updateQuery.select('id');

          if (updateResult.error) {
            throw new Error(
              explainSupabaseError(updateResult.error)
            );
          }

          // Không cập nhật được nghĩa là dữ liệu đã thay đổi
          // hoặc có tiến trình khác xử lý trước.
          if (!updateResult.data?.length) {
            run.raced++;
            continue;
          }

          run.archived++;
        } catch (error) {
          run.failed++;

          if (run.errors.length < 5) {
            run.errors.push(
              errorMessage(error) +
                ' [' +
                readable(row.document_id) +
                ']'
            );
          }

          // Nếu gặp lỗi hệ thống chung thì dừng sớm.
          if (
            error instanceof DriveError &&
            [
              'quota',
              'invalid_grant',
              'network',
              'not_connected',
              'api_disabled',
            ].includes(error.code)
          ) {
            run.done = false;
            break outer;
          }
        }
      }

      if (rows.length < PAGE_SIZE) {
        break;
      }
    }
  } finally {
    // Luôn giải phóng trạng thái chạy,
    // kể cả khi xảy ra lỗi trong quá trình sao lưu.
    run.durationMs = Date.now() - t0;
    running = false;
  }

  // Lưu trạng thái lần sao lưu gần nhất.
  await writeState({ lastRun: run }).catch(() => false);

  // Ghi nhật ký hoạt động.
  await auditLog('data', 'drive_archive_run', {
    mode,
    scanned: run.scanned,
    archived: run.archived,
    copied: run.copied,
    failed: run.failed,
  }).catch(() => {});

  return run;
}

// ============================================================
// 4. KHÔI PHỤC DỮ LIỆU TỪ GOOGLE DRIVE
// ============================================================

/**
 * Đọc nội dung thật từ Google Drive thông qua con trỏ Stub.
 *
 * Được sử dụng khi người dùng mở tài liệu đã lưu trữ.
 */
export async function rehydrate(stub: Stub): Promise<any> {
  if (!isStub(stub)) {
    throw new DriveError(
      'corrupt',
      'Thông tin con trỏ lưu trữ không hợp lệ.'
    );
  }

  const text = await downloadText(stub.archive.fileId);

  let obj: any;

  try {
    obj = JSON.parse(text);
  } catch {
    throw new DriveError(
      'corrupt',
      'Tệp sao lưu trên Google Drive bị hỏng hoặc không đọc được JSON.'
    );
  }

  // Kiểm tra định dạng dữ liệu.
  if (
    obj?.schema !== SCHEMA ||
    obj.data === undefined
  ) {
    throw new DriveError(
      'corrupt',
      'Tệp trên Google Drive không phải bản sao lưu hợp lệ của SMARTLAB QMS 2429.'
    );
  }

  // Kiểm tra tính toàn vẹn MD5.
  if (stub.archive.md5) {
    const actualMd5 = crypto
      .createHash('md5')
      .update(Buffer.from(text, 'utf8'))
      .digest('hex');

    if (actualMd5 !== stub.archive.md5) {
      throw new DriveError(
        'corrupt',
        'Tệp sao lưu trên Google Drive đã bị thay đổi hoặc không khớp mã MD5.'
      );
    }
  }

  return obj.data;
}

// ============================================================
// 5. DANH SÁCH TỆP SAO LƯU TRÊN GOOGLE DRIVE
// ============================================================

export async function listArchive(
  pageToken?: string,
  pageSize = 50
): Promise<{
  files: DriveFile[];
  nextPageToken?: string;
}> {
  const folder = await ensureFolder();

  const safePageSize = Math.max(
    1,
    Math.min(Math.floor(pageSize), 100)
  );

  const query =
    "(appProperties has { key='kind' and value='archive' } " +
    "or appProperties has { key='kind' and value='copy' })";

  return listFiles(
    folder,
    query,
    pageToken,
    safePageSize
  );
}

// ============================================================
// 6. NHẬP DỮ LIỆU TỪ GOOGLE DRIVE VỀ SUPABASE
// ============================================================

export type ImportResult = {
  imported: number;
  rehydrated: number;
  skipped: number;
  failed: number;
  errors: string[];
  nextPageToken?: string;
};

/**
 * Nhập dữ liệu sao lưu từ Google Drive vào Supabase.
 *
 * Hỗ trợ:
 * - Thêm bản ghi chưa tồn tại.
 * - Khôi phục bản ghi đang là Stub.
 * - Cập nhật khi bản sao lưu có version mới hơn.
 * - Cho phép ghi đè khi overwrite = true.
 */
export async function importFromDrive(
  options: {
    fileIds?: string[];
    all?: boolean;
    pageToken?: string;
    overwrite?: boolean;
  }
): Promise<ImportResult> {
  const db = supabase();

  if (!db) {
    throw new DriveError(
      'no_supabase',
      'Chưa cấu hình Supabase nên không có nơi để nhập dữ liệu.'
    );
  }

  const output: ImportResult = {
    imported: 0,
    rehydrated: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  let fileIds = options.fileIds || [];

  // Lấy danh sách tệp sao lưu nếu chọn nhập tất cả.
  if (options.all) {
    const archiveList = await listArchive(
      options.pageToken,
      25
    );

    fileIds = archiveList.files
      .sort(
        (a, b) =>
          (Number(a.appProperties.ver) || 0) -
          (Number(b.appProperties.ver) || 0)
      )
      .map((file) => file.id);

    output.nextPageToken = archiveList.nextPageToken;
  }

  // Giới hạn tối đa 50 tệp trong một lần nhập.
  for (const fileId of fileIds.slice(0, 50)) {
    try {
      const text = await downloadText(fileId);

      let obj: any;

      try {
        obj = JSON.parse(text);
      } catch {
        throw new DriveError(
          'corrupt',
          'Tệp sao lưu không có định dạng JSON hợp lệ.'
        );
      }

      // Kiểm tra cấu trúc bản sao lưu.
      if (
        obj?.schema !== SCHEMA ||
        !obj.document_id ||
        obj.data === undefined
      ) {
        output.skipped++;
        continue;
      }

      const documentId = canonicalId(
        String(obj.document_id)
      );

      const userId = String(
        obj.user_id || 'anonymous'
      );

      const version = Number(obj.version) || 0;

      // Tìm bản ghi hiện có trong Supabase.
      const existingResult = await db
        .from('form_records')
        .select('id,version,data,document_id')
        .in('document_id', idVariants(documentId))
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(1);

      if (existingResult.error) {
        throw new Error(
          explainSupabaseError(existingResult.error)
        );
      }

      const current = existingResult.data?.[0] as any;

      // ------------------------------------------------------
      // 6.1. Chưa có bản ghi: tạo bản ghi mới.
      // ------------------------------------------------------

      if (!current) {
        const base = {
          document_id: documentId,
          form_id: obj.form_id ?? null,
          user_id: userId,
          data: obj.data,
          created_at: obj.created_at || undefined,
          updated_at:
            obj.updated_at || new Date().toISOString(),
        };

        let insertResult: any = await db
          .from('form_records')
          .insert({
            ...base,
            version: version || 1,
          })
          .select('id');

        // Tương thích với bảng cũ chưa có cột version.
        if (insertResult.error) {
          insertResult = await db
            .from('form_records')
            .insert(base)
            .select('id');
        }

        if (insertResult.error) {
          throw new Error(
            explainSupabaseError(insertResult.error)
          );
        }

        output.imported++;
        continue;
      }

      const currentVersion = Number(current.version) || 0;

      // ------------------------------------------------------
      // 6.2. Bản ghi hiện tại là con trỏ Stub: khôi phục.
      // ------------------------------------------------------

      if (isStub(current.data)) {
        const archivedVersion =
          Number(current.data.archive.version) ||
          currentVersion;

        if (
          version < archivedVersion &&
          !options.overwrite
        ) {
          output.skipped++;
          continue;
        }

        const updateResult = await db
          .from('form_records')
          .update({
            data: obj.data,
          })
          .eq('id', current.id)
          .select('id');

        if (updateResult.error) {
          throw new Error(
            explainSupabaseError(updateResult.error)
          );
        }

        if (!updateResult.data?.length) {
          output.skipped++;
          continue;
        }

        output.rehydrated++;
        continue;
      }

      // ------------------------------------------------------
      // 6.3. Bản sao lưu mới hơn: cập nhật dữ liệu.
      // ------------------------------------------------------

      if (
        version > currentVersion ||
        options.overwrite
      ) {
        const nextVersion = Math.max(
          currentVersion,
          version
        ) +
          (options.overwrite && version <= currentVersion
            ? 1
            : 0);

        const updateResult = await db
          .from('form_records')
          .update({
            data: obj.data,
            version: nextVersion,
            updated_at: new Date().toISOString(),
          })
          .eq('id', current.id)
          .select('id');

        if (updateResult.error) {
          throw new Error(
            explainSupabaseError(updateResult.error)
          );
        }

        if (!updateResult.data?.length) {
          output.skipped++;
          continue;
        }

        output.imported++;
      } else {
        output.skipped++;
      }
    } catch (error) {
      output.failed++;

      if (output.errors.length < 5) {
        output.errors.push(errorMessage(error));
      }

      // Dừng nếu lỗi kết nối hoặc xác thực Drive.
      if (
        error instanceof DriveError &&
        [
          'invalid_grant',
          'network',
          'not_connected',
        ].includes(error.code)
      ) {
        break;
      }
    }
  }

  // Ghi nhật ký nhập dữ liệu.
  await auditLog('data', 'drive_import', {
    imported: output.imported,
    rehydrated: output.rehydrated,
    skipped: output.skipped,
    failed: output.failed,
  }).catch(() => {});

  return output;
}
