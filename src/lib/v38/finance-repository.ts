"use client";
import { getCloudAccessToken } from "../supabase-cloud";

type FinanceRecord = { id?: string; companyId?: string; module: string; recordKey: string; documentNo?: string; status?: string; payload: Record<string, unknown>; revision?: number };
const url=(process.env.NEXT_PUBLIC_SUPABASE_URL||"").replace(/\/$/,"");
const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||"";
async function headers(){const token=await getCloudAccessToken(); if(!token) throw new Error("Sign in to Supabase first."); return {apikey:key,Authorization:`Bearer ${token}`,"Content-Type":"application/json",Prefer:"return=representation"};}
export async function listFinanceRecords(module:string):Promise<FinanceRecord[]>{const r=await fetch(`${url}/rest/v1/a3_finance_records?module=eq.${encodeURIComponent(module)}&select=*&order=updated_at.desc`,{headers:await headers()});if(!r.ok)throw new Error(await r.text());return (await r.json()).map((x:any)=>({id:x.id,companyId:x.company_id,module:x.module,recordKey:x.record_key,documentNo:x.document_no,status:x.status,payload:x.payload,revision:x.revision}));}
export async function saveFinanceRecord(record:FinanceRecord):Promise<FinanceRecord>{const body={company_id:record.companyId||"",module:record.module,record_key:record.recordKey,document_no:record.documentNo||null,status:record.status||"Draft",payload:record.payload,revision:(record.revision||0)+1};const r=await fetch(`${url}/rest/v1/a3_finance_records?on_conflict=owner_id,module,record_key`,{method:"POST",headers:{...(await headers()),Prefer:"resolution=merge-duplicates,return=representation"},body:JSON.stringify(body)});if(!r.ok)throw new Error(await r.text());return (await r.json())[0];}
