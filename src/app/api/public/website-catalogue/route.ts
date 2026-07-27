import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const STORAGE_KEY = "a3-catalogue-rates";

type CatalogueRecord = { id:string; website:string; priceKey?:string; item:string; titleZh?:string; category?:string; subgroup?:string; stallId?:string; description?:string; price:number; currency?:string; status:"Published"|"Draft"; imageUrl?:string; imageAlt?:string; displayOrder?:number; available?:boolean };
const slug=(value:string)=>value.toLowerCase().trim().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"");
const siteDomain=(site:string|null)=>site==="food"?"FOOD.A3GROUP.SG":site==="sakura"?"SAKURA.A3GROUP.SG":site==="limousine"?"LIMOUSINE.A3GROUP.SG":site?.toUpperCase()||"";
function cors(origin:string|null){const allowed=new Set(["https://food.a3group.sg","https://www.food.a3group.sg","http://localhost:3000"]);return {"Access-Control-Allow-Origin":origin&&allowed.has(origin)?origin:"https://food.a3group.sg","Access-Control-Allow-Methods":"GET, OPTIONS","Access-Control-Allow-Headers":"Content-Type","Cache-Control":"no-store, max-age=0",Vary:"Origin"}}
export async function OPTIONS(request:Request){return new NextResponse(null,{status:204,headers:cors(request.headers.get("origin"))})}
export async function GET(request:Request){const origin=request.headers.get("origin");try{
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL||process.env.SUPABASE_URL;const key=process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SECRET_KEY;if(!url||!key)throw new Error("Finance catalogue service is not configured.");
 const supabase=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});const preferred=(process.env.PRIMARY_ADMIN_EMAIL||"").toLowerCase();const {data:users,error:userError}=await supabase.auth.admin.listUsers({page:1,perPage:100});if(userError)throw userError;const owner=(preferred?users.users.find(user=>user.email?.toLowerCase()===preferred):undefined)||users.users[0];if(!owner)throw new Error("No Finance cloud owner exists.");
 const {data,error}=await supabase.from("a3_app_storage").select("value,updated_at").eq("user_id",owner.id).eq("storage_key",STORAGE_KEY).order("updated_at",{ascending:false}).limit(1).maybeSingle();if(error)throw error;
 const requested=siteDomain(new URL(request.url).searchParams.get("site"));const records=(Array.isArray(data?.value)?data.value:[]) as CatalogueRecord[];
 const items=records.filter(record=>record.status==="Published"&&(!requested||record.website.toUpperCase()===requested)).sort((a,b)=>Number(a.displayOrder||0)-Number(b.displayOrder||0)).map((record,index)=>({id:record.id||index+1,price_key:slug(record.priceKey||record.item),site:requested?requested.split(".")[0].toLowerCase():record.website.split(".")[0].toLowerCase(),stall_id:record.stallId||"chicken-rice",category:record.category||"Food",subgroup:record.subgroup||"Menu",service_name:record.item,title_en:record.item,title_zh:record.titleZh||"",description_en:record.description||"",description_zh:"",price:Number(record.price||0),currency:record.currency||"SGD",available:record.available!==false,minimum_hours:null,image_url:record.imageUrl||null,image_alt:record.imageAlt||record.item,display_order:Number(record.displayOrder??index),metadata:{website:record.website,stall_id:record.stallId||"chicken-rice"}}));
 return NextResponse.json({ok:true,source:"a3-finance",updated_at:data?.updated_at||null,items},{headers:cors(origin)});
}catch(error){console.error("Website catalogue API:",error);return NextResponse.json({ok:false,items:[],message:error instanceof Error?error.message:"Catalogue unavailable"},{status:503,headers:cors(origin)})}}
