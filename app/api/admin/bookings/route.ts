import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
const LIMO_KEY = "a3-limousine-website-bookings-v1";
const SAKURA_KEY = "a3-sakura-website-bookings-v1";

function client(){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL||process.env.SUPABASE_URL||"";
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SECRET_KEY||"";
  if(!url||!key) throw new Error("Finance cloud is not configured.");
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
async function ownerId(supabase:ReturnType<typeof client>){
  const preferred=(process.env.PRIMARY_ADMIN_EMAIL||"").toLowerCase();
  const {data,error}=await supabase.auth.admin.listUsers({page:1,perPage:100});
  if(error) throw error;
  const user=(preferred?data.users.find(item=>item.email?.toLowerCase()===preferred):undefined)||data.users[0];
  if(!user) throw new Error("No Finance owner account exists.");
  return user.id;
}
async function readAll(supabase:ReturnType<typeof client>,userId:string){
  const {data,error}=await supabase.from("a3_app_storage").select("storage_key,value").eq("user_id",userId).in("storage_key",[LIMO_KEY,SAKURA_KEY]);
  if(error) throw error;
  const map=Object.fromEntries((data||[]).map(row=>[row.storage_key,row.value]));
  const limousine=(Array.isArray(map[LIMO_KEY])?map[LIMO_KEY]:[]).map((x:any)=>({...x,bookingType:"limousine"}));
  const sakura=(Array.isArray(map[SAKURA_KEY])?map[SAKURA_KEY]:[]).map((x:any)=>({...x,bookingType:"sakura"}));
  return {limousine,sakura};
}
async function writeList(supabase:ReturnType<typeof client>,userId:string,key:string,value:any[]){
  const {error}=await supabase.from("a3_app_storage").upsert({user_id:userId,storage_key:key,value,updated_at:new Date().toISOString()},{onConflict:"user_id,storage_key"});
  if(error) throw error;
}
export async function GET(){
  try{
    const supabase=client(); const userId=await ownerId(supabase); const groups=await readAll(supabase,userId);
    const bookings=[...groups.limousine,...groups.sakura].sort((a:any,b:any)=>String(b.createdAt||"").localeCompare(String(a.createdAt||"")));
    return NextResponse.json({bookings,unread:bookings.filter((x:any)=>x.unread!==false).length},{headers:{"Cache-Control":"no-store"}});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Unable to load bookings."},{status:500});}
}
export async function PATCH(request:Request){
  try{
    const body=await request.json(); const id=String(body.id||""); const bookingType=body.bookingType==="sakura"?"sakura":"limousine";
    if(!id) return NextResponse.json({error:"Booking id is required."},{status:400});
    const supabase=client(); const userId=await ownerId(supabase); const groups=await readAll(supabase,userId);
    const key=bookingType==="sakura"?SAKURA_KEY:LIMO_KEY; const list=bookingType==="sakura"?groups.sakura:groups.limousine;
    let found=false;
    const next=list.map((item:any)=>{if(String(item.id||item.reference)!==id)return item;found=true;const {bookingType:_bt,...plain}=item;return {...plain,...body,id:item.id||item.reference,updatedAt:new Date().toISOString()}});
    if(!found) return NextResponse.json({error:"Booking not found."},{status:404});
    await writeList(supabase,userId,key,next);
    return NextResponse.json({ok:true});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Unable to update booking."},{status:500});}
}
export async function DELETE(request:Request){
  try{
    const {searchParams}=new URL(request.url); const id=searchParams.get("id")||""; const bookingType=searchParams.get("bookingType")==="sakura"?"sakura":"limousine";
    const supabase=client(); const userId=await ownerId(supabase); const groups=await readAll(supabase,userId);
    const key=bookingType==="sakura"?SAKURA_KEY:LIMO_KEY; const list=bookingType==="sakura"?groups.sakura:groups.limousine;
    await writeList(supabase,userId,key,list.filter((item:any)=>String(item.id||item.reference)!==id).map(({bookingType:_bt,...item}:any)=>item));
    return NextResponse.json({ok:true});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Unable to delete booking."},{status:500});}
}
