import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const STORAGE_KEY = "a3-limousine-bookings-v1";

async function clientAndOwner(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL||process.env.SUPABASE_URL;
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SECRET_KEY;
 if(!url||!key) throw new Error("Finance cloud service is not configured.");
 const supabase=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const preferred=(process.env.PRIMARY_ADMIN_EMAIL||"").toLowerCase();
 const {data,error}=await supabase.auth.admin.listUsers({page:1,perPage:100});
 if(error) throw error;
 const owner=(preferred?data.users.find(user=>user.email?.toLowerCase()===preferred):undefined)||data.users[0];
 if(!owner) throw new Error("No Finance cloud owner exists.");
 return {supabase,owner};
}

export async function POST(request:Request){
 try{
  const body=await request.json();
  for(const key of ["name","contact","service","vehicle","date","time","pickup","destination"]){
   if(!String(body[key]||"").trim()) return NextResponse.json({ok:false,error:`${key} is required.`},{status:400});
  }
  const {supabase,owner}=await clientAndOwner();
  const {data}=await supabase.from("a3_app_storage").select("value").eq("user_id",owner.id).eq("storage_key",STORAGE_KEY).maybeSingle();
  const current=Array.isArray(data?.value)?data.value:[];
  const reference=`A3L-${new Date().toISOString().slice(0,10).replaceAll("-","")}-${String(Date.now()).slice(-6)}`;
  const record={...body,id:reference,reference,status:"Pending",submittedAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
  const {error}=await supabase.from("a3_app_storage").upsert({user_id:owner.id,storage_key:STORAGE_KEY,value:[record,...current],updated_at:new Date().toISOString()},{onConflict:"user_id,storage_key"});
  if(error) throw error;
  return NextResponse.json({ok:true,reference,status:"Pending"});
 }catch(error){return NextResponse.json({ok:false,error:error instanceof Error?error.message:"Unable to submit booking."},{status:500})}
}
