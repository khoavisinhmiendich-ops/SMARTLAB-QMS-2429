import {decodeEscapes} from './gate';
// Chuẩn hóa tên tệp để nhận biết "cùng một tệp": không phân biệt hoa/thường, dạng Unicode (NFC/NFD),
// khoảng trắng thừa, dấu "_" và hậu tố bản sao do hệ điều hành thêm như " (1)" hoặc " - Copy".
// Dùng chung cho trình duyệt và máy chủ (không import module Node).
export function normFileName(name:string):string{
  const base=decodeEscapes(String(name||'').split(/[\\/]/).pop()||'').trim();
  const dot=base.lastIndexOf('.');
  const ext=dot>0?base.slice(dot).toLowerCase():'';
  let stem=dot>0?base.slice(0,dot):base;
  stem=stem.toLocaleLowerCase('vi').replace(/_/g,' ').replace(/\s+/g,' ').trim();
  stem=stem.replace(/\s*(\(\d+\)|-\s*copy(\s*\(\d+\))?|-\s*bản sao(\s*\(\d+\))?)$/i,'').trim();
  return stem+ext;
}
