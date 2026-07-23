import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const fail = (error:string,status=400)=>NextResponse.json({error},{status});

async function authorised(){
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return false;
  const {data:p}=await supabase.from("profiles").select("role,status").eq("id",user.id).maybeSingle();
  return p?.status==="active" && ["administrator","finance"].includes(p.role);
}

async function assetUrl(admin:ReturnType<typeof createAdminClient>,path:string|null){
  if(!path)return null;
  const {data}=await admin.storage.from("company-assets").createSignedUrl(path,3600);
  return data?.signedUrl??null;
}

export async function GET(request:NextRequest){
  if(!(await authorised()))return fail("Authorised staff access is required.",403);
  const type=request.nextUrl.searchParams.get("type");
  const id=Number(request.nextUrl.searchParams.get("id"));
  if(!Number.isInteger(id))return fail("A valid document ID is required.");
  const admin=createAdminClient();
  let result:any;
  if(type==="invoice") result=await admin.from("customer_invoices").select("*,companies(*),customer_invoice_items(*)").eq("id",id).maybeSingle();
  else if(type==="payout") result=await admin.from("driver_payouts").select("*,companies(*),drivers(*),driver_payout_items(*,driver_jobs(*))").eq("id",id).maybeSingle();
  else if(type==="job") result=await admin.from("driver_jobs").select("*,companies(*),drivers(*)").eq("id",id).maybeSingle();
  else return fail("Unsupported document type.");
  if(result.error)return fail(result.error.message,500);
  if(!result.data)return fail("Document not found.",404);
  const company=result.data.companies;
  const branding=company?{logo_url:await assetUrl(admin,company.logo_path),chop_url:await assetUrl(admin,company.company_chop_path)}:{};
  return NextResponse.json({document:result.data,branding});
}
