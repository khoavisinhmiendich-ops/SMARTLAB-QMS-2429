export async function register(){
  if(process.env.NEXT_RUNTIME==='nodejs'){const {auditConfig}=await import('./lib/audit');await auditConfig();const {startArchiveScheduler}=await import('./lib/archiveScheduler');startArchiveScheduler();}
}
