"use client";

export type CloudSyncState = "disabled" | "signed-out" | "connecting" | "syncing" | "connected" | "error";
export type CloudDiagnostics = { configured:boolean;signedIn:boolean;email:string;localKeyCount:number;cloudKeyCount:number;localBytes:number;checkedAt:string;lastSyncAt:string;pendingWriteCount:number;conflictCount:number;backupTableReady:boolean;backupCount:number;latestBackupAt:string;auditTableReady:boolean;auditCount:number;latestAuditAt:string };
export type CloudBackupSummary = { id:string;createdAt:string;reason:string;keyCount:number;deviceId:string };
export type CloudAuditEntry = { id:string;createdAt:string;action:string;storageKey:string;deviceId:string;details:Record<string,unknown> };
export type CloudConflict = { id:string;storageKey:string;detectedAt:string;localUpdatedAt:string;cloudUpdatedAt:string;resolution:"local"|"cloud"|"cloud-first-sync" };
export const CLOUD_SYNC_STATE_EVENT="a3-cloud-sync-state";
export const CLOUD_SYNCED_EVENT="a3-cloud-storage-hydrated";
const META="a3-cloud-server-meta-v30", PREFIX="a3-", LOCAL=new Set([META]);
let state:CloudSyncState="connecting", lastError="", pending=new Map<string,unknown>(), timer:number|null=null;
const emit=(next:CloudSyncState,error="")=>{state=next;lastError=error;if(typeof window!=="undefined")window.dispatchEvent(new CustomEvent(CLOUD_SYNC_STATE_EVENT,{detail:{state,error}}));};
const syncable=(k:string)=>k.startsWith(PREFIX)&&!LOCAL.has(k);
const localRecords=()=>{const records:Array<{storage_key:string;value:unknown}>=[];if(typeof window==="undefined")return records;for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i)||"";if(!syncable(k))continue;try{records.push({storage_key:k,value:JSON.parse(localStorage.getItem(k)||"null")})}catch{records.push({storage_key:k,value:localStorage.getItem(k)})}}return records};
async function api(action?:string,body:Record<string,unknown>={}){const r=await fetch("/api/cloud",action?{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,...body}),cache:"no-store"}:{cache:"no-store"});const p=await r.json().catch(()=>({ok:false,message:"Invalid cloud response"}));if(!r.ok||!p.ok)throw new Error(p.message||"Cloud request failed");return p;}
const stamp=()=>{const now=new Date().toISOString();localStorage.setItem(META,now);return now};
export function queueCloudAudit(action:string,storageKey:string,details:Record<string,unknown>={}){void api("audit",{events:[{created_at:new Date().toISOString(),action,storage_key:storageKey,device_id:"browser",details}]}).catch(()=>undefined)}
export function queueCloudWrite(key:string,value:unknown,immediate=false){if(!syncable(key))return;pending.set(key,value);if(timer)window.clearTimeout(timer);timer=window.setTimeout(()=>void flushPendingCloudWrites(),immediate?50:900)}
export function isSupabaseConfigured(){return true}
export function getCloudSyncSnapshot(){return {state,error:lastError,email:"Server managed",lastSyncAt:typeof window!=="undefined"?localStorage.getItem(META)||"":"",pendingWriteCount:pending.size,conflictCount:0}}
export function getLocalCloudInventory(){const records=localRecords();return {keyCount:records.length,bytes:new Blob(records.map(r=>JSON.stringify(r.value))).size}}
export function getCloudConflictHistory():CloudConflict[]{return []}
export function clearCloudConflictHistory(){}
export async function listCloudBackups(){try{const p=await api("list-backups");return {ready:true,backups:(p.backups||[]).map((x:any)=>({id:x.id,createdAt:x.created_at,reason:x.reason,keyCount:x.key_count,deviceId:x.device_id}))}}catch{return {ready:false,backups:[]}}}
export async function listCloudAudit(limit=50){try{const p=await api("list-audit",{limit});return {ready:true,entries:(p.entries||[]).map((x:any)=>({id:x.id,createdAt:x.created_at,action:x.action,storageKey:x.storage_key,deviceId:x.device_id,details:x.details||{}}))}}catch{return {ready:false,entries:[]}}}
export async function clearCloudAuditHistory(){await api("clear-audit")}
export async function verifyCloudConnection():Promise<CloudDiagnostics>{emit("connecting");try{const p=await api();const inv=getLocalCloudInventory();emit("connected");return {configured:true,signedIn:true,email:"Server managed",localKeyCount:inv.keyCount,cloudKeyCount:p.storageCount||0,localBytes:inv.bytes,checkedAt:new Date().toISOString(),lastSyncAt:localStorage.getItem(META)||"",pendingWriteCount:pending.size,conflictCount:0,backupTableReady:true,backupCount:p.backupCount||0,latestBackupAt:"",auditTableReady:true,auditCount:p.auditCount||0,latestAuditAt:""}}catch(e){emit("error",e instanceof Error?e.message:String(e));throw e}}
export async function signInAndHydrateCloud(){return resumeCloudSession()}
export async function hydrateCloudStorage(){await restoreAllCloudDataToLocal()}
export async function flushPendingCloudWrites(){if(!pending.size)return;const records=[...pending].map(([storage_key,value])=>({storage_key,value}));pending.clear();emit("syncing");try{await api("push",{records});stamp();emit("connected")}catch(e){records.forEach(r=>pending.set(r.storage_key,r.value));emit("error",e instanceof Error?e.message:String(e));throw e}}
export async function resumeCloudSession(){try{await verifyCloudConnection();await synchronizeCloudNow();return {ok:true,message:"Server cloud connected."}}catch(e){return {ok:false,message:e instanceof Error?e.message:String(e)}}}
export async function uploadAllLocalDataToCloud(){emit("syncing");await api("push",{records:localRecords()});stamp();emit("connected");return verifyCloudConnection()}
export async function restoreAllCloudDataToLocal(){emit("syncing");const p=await api("pull");for(const r of p.records||[])localStorage.setItem(r.storage_key,JSON.stringify(r.value));stamp();window.dispatchEvent(new Event(CLOUD_SYNCED_EVENT));window.dispatchEvent(new Event("storage"));emit("connected");return verifyCloudConnection()}
export async function synchronizeCloudNow(){await flushPendingCloudWrites();const p=await api("pull");for(const r of p.records||[]){if(localStorage.getItem(r.storage_key)===null)localStorage.setItem(r.storage_key,JSON.stringify(r.value))}await api("push",{records:localRecords()});stamp();window.dispatchEvent(new Event(CLOUD_SYNCED_EVENT));emit("connected");return verifyCloudConnection()}
export async function createCloudBackup(reason="manual"){const p=await api("backup",{reason,deviceId:"browser"});const x=p.backup;return {id:x.id,createdAt:x.created_at,reason:x.reason,keyCount:x.key_count,deviceId:x.device_id}}
export async function restoreCloudBackup(backupId:string){const p=await api("restore-backup",{backupId});for(const [k,v] of Object.entries(p.payload||{}))localStorage.setItem(k,JSON.stringify(v));await uploadAllLocalDataToCloud();window.dispatchEvent(new Event(CLOUD_SYNCED_EVENT));return verifyCloudConnection()}
export function downloadLocalDataBackup(){const blob=new Blob([JSON.stringify(Object.fromEntries(localRecords().map(r=>[r.storage_key,r.value])),null,2)],{type:"application/json"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`a3-finance-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(a.href)}
export async function importLocalDataBackup(file:File){const data=JSON.parse(await file.text());let count=0;for(const [k,v] of Object.entries(data)){if(syncable(k)){localStorage.setItem(k,JSON.stringify(v));count++}}await uploadAllLocalDataToCloud();return count}
export function startCloudAutoSync(intervalMs=30000){void resumeCloudSession();const id=window.setInterval(()=>void synchronizeCloudNow().catch(()=>undefined),intervalMs);const online=()=>void synchronizeCloudNow().catch(()=>undefined);window.addEventListener("online",online);return()=>{window.clearInterval(id);window.removeEventListener("online",online)}}
export async function signOutCloud(){emit("connected")}
export async function getCloudAccessToken(){return ""}
