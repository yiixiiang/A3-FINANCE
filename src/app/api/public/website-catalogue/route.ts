import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const STORAGE_KEY = "a3-website-catalogue-v4";
const STALL_KEY = "a3-website-food-stalls-v4";
type CatalogueSite="food"|"nightclub"|"limousine";
type CatalogueRecord={id:string;companyId:string;site:CatalogueSite;priceKey:string;item:string;titleZh?:string;category?:string;subgroup?:string;stallId?:string;description?:string;price:number;currency?:string;status:"Published"|"Draft";imageUrl?:string;imageAlt?:string;displayOrder?:number;available?:boolean};
type StallRecord={id:string;companyId:string;name:string;description?:string;imageUrl?:string;displayOrder?:number;active?:boolean};
const slug=(value:string)=>value.toLowerCase().trim().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"");
function cors(origin:string|null){const allowed=new Set(["https://food.a3group.sg","https://www.food.a3group.sg","https://nightclub.a3group.sg","https://limousine.a3group.sg","http://localhost:3000"]);return {"Access-Control-Allow-Origin":origin&&allowed.has(origin)?origin:"*","Access-Control-Allow-Methods":"GET, OPTIONS","Access-Control-Allow-Headers":"Content-Type","Cache-Control":"no-store, max-age=0",Vary:"Origin"}}
export async function OPTIONS(request:Request){return new NextResponse(null,{status:204,headers:cors(request.headers.get("origin"))})}
export async function GET(request:Request){const origin=request.headers.get("origin");try{
 const requestUrl=new URL(request.url);const requested=(requestUrl.searchParams.get("site")||"food").toLowerCase() as CatalogueSite;const companyId=requestUrl.searchParams.get("company_id")||"";if(!["food","nightclub","limousine"].includes(requested))return NextResponse.json({ok:false,items:[],message:"Invalid site."},{status:400,headers:cors(origin)});
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL||process.env.SUPABASE_URL;const key=process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SECRET_KEY;if(!url||!key)throw new Error("Finance catalogue service is not configured.");
 const supabase=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});const preferred=(process.env.PRIMARY_ADMIN_EMAIL||"").toLowerCase();const {data:users,error:userError}=await supabase.auth.admin.listUsers({page:1,perPage:100});if(userError)throw userError;const owner=(preferred?users.users.find(user=>user.email?.toLowerCase()===preferred):undefined)||users.users[0];if(!owner)throw new Error("No Finance cloud owner exists.");
 const {data:rows,error}=await supabase.from("a3_app_storage").select("storage_key,value,updated_at").eq("user_id",owner.id).in("storage_key",[STORAGE_KEY,STALL_KEY]);if(error)throw error;
 const catalogueRow=rows?.find(row=>row.storage_key===STORAGE_KEY);const stallRow=rows?.find(row=>row.storage_key===STALL_KEY);const records=(Array.isArray(catalogueRow?.value)?catalogueRow.value:[]) as CatalogueRecord[];const stalls=(Array.isArray(stallRow?.value)?stallRow.value:[]) as StallRecord[];
 const scoped=records.filter(record=>record.site===requested&&record.status==="Published"&&(!companyId||record.companyId===companyId));const selectedCompany=companyId||(scoped[0]?.companyId||"");
 const items=scoped.filter(record=>!selectedCompany||record.companyId===selectedCompany).sort((a,b)=>Number(a.displayOrder||0)-Number(b.displayOrder||0)).map((record,index)=>({id:record.id||index+1,company_id:record.companyId,price_key:slug(record.priceKey||record.item),site:record.site,stall_id:record.stallId||null,category:record.category||"Other",subgroup:record.subgroup||"",service_name:record.item,title_en:record.item,title_zh:record.titleZh||"",description_en:record.description||"",description_zh:"",price:Number(record.price||0),currency:record.currency||"SGD",available:record.available!==false,image_url:record.imageUrl||null,image_alt:record.imageAlt||record.item,display_order:Number(record.displayOrder??index),metadata:{company_id:record.companyId,site:record.site}}));
 const publicStalls=requested==="food"?stalls.filter(stall=>stall.active!==false&&(!selectedCompany||stall.companyId===selectedCompany)).sort((a,b)=>Number(a.displayOrder||0)-Number(b.displayOrder||0)):[];
 return NextResponse.json({ok:true,source:"a3-finance-v4",site:requested,company_id:selectedCompany||null,updated_at:catalogueRow?.updated_at||null,stalls:publicStalls,items},{headers:cors(origin)});
}catch(error){console.error("Website catalogue API:",error);return NextResponse.json({ok:false,items:[],message:error instanceof Error?error.message:"Catalogue unavailable"},{status:503,headers:cors(origin)})}}
