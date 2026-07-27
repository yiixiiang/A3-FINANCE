"use client";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { BadgeDollarSign, CarFront, CheckCircle2, Download, Files, MessageCircle, WalletCards, Users, X, Plus, Pencil, Save, Send, Upload, Eye, Trash2, Printer, ShieldCheck } from "lucide-react";
import { bookings, rates, services, vehicleTypes } from "@/lib/data";
import { fileToData } from "@/lib/file-to-data";
import { load, save, saveNow } from "@/lib/browser-storage";
import { EXPENSE_STORAGE_KEY, INCOME_STORAGE_KEY, calculateDocumentTotals, defaultDocumentRecords, documentStorageKey, nextDocumentNumber, normalizeDocumentRecords, DEFAULT_LIMOUSINE_TERMS_EN, DEFAULT_LIMOUSINE_TERMS_ZH, type DocumentKind, type DocumentLanguage, type DocumentLineItem, type DocumentStatus, type FinancialDocumentRecord } from "@/lib/finance-records";
import { ACCESS_MODULES, DEFAULT_ADMIN_USER, MINIMUM_PASSWORD_LENGTH, USER_ACCESS_STORAGE_KEY, USER_ACCESS_UPDATED_EVENT, accessScopeLabel, defaultAccessScope, defaultModuleIdsForRole, grantableModules, moduleLabels, normalizeUserRecord, normalizeUserRecords, normalizeVisibleModuleIds, roleLabel, type AccessRole, type AccessScope, type UserAccessRecord } from "@/lib/access-control";
import { createCombinedInvoicePdf, createDocumentPdf, downloadPdf, sharePdf, type PdfCompanyIdentity, type ShareChannel } from "@/lib/document-pdf";

type CompanyAccessContextValue={user:UserAccessRecord;isAllCompanies:boolean;companyId:string};
const CompanyAccessContext=createContext<CompanyAccessContextValue>({user:DEFAULT_ADMIN_USER,isAllCompanies:true,companyId:""});
function useCompanyAccess(){return useContext(CompanyAccessContext)}
function scopedStorageKey(base:string,access:CompanyAccessContextValue){return access.isAllCompanies?base:`${base}:${access.companyId||"unassigned"}`}
function scopedCompanies(records:CompanyRecord[],access:CompanyAccessContextValue){return access.isAllCompanies?records:records.filter(record=>record.id===access.companyId)}

export function ManagementModules({active,user}:{active:string;user:UserAccessRecord}){
 const access={user,isAllCompanies:user.role==="ADMIN"||user.accessScope==="ALL_INFORMATION",companyId:user.companyId};
 return <CompanyAccessContext.Provider value={access}>
  {active==="ratemanagement"&&<RateManagement/>}
  {active==="clientsetup"&&<ClientSetup/>}
  {active==="catalogue"&&<WebsiteCatalogueRate/>}
  {active==="company"&&<CompanySetting/>}
  {active==="driversignup"&&<DriverSignUp/>}
  {active==="driverclaims"&&<DriverClaims/>}
  {active==="access"&&<UserAccess currentUser={user}/>}
  {active==="income"&&<IncomeRecords/>}
  {active==="expenses"&&<ExpenseRecords/>}
  {active==="platform"&&<PlatformEarnings/>}
  {active==="invoice"&&<DocumentWorkspace kind="invoice"/>}
  {active==="quotation"&&<DocumentWorkspace kind="quotation"/>}
  {active==="drivers"&&<DriverManagement/>}
  {active==="reports"&&<FinancialReports/>}
  {active==="balancesheet"&&<BalanceSheetReport/>}
  {active==="payout"&&<DriverPayoutReport/>}
  {active==="network"&&<DriverNetwork/>}
  {active==="rebate"&&<Module id={active}/>}
 </CompanyAccessContext.Provider>
}

function RateManagement(){
 const [tab,setTab]=useState<"vehicle"|"driver"|"client">("vehicle");
 return <><Heading eyebrow="ADMIN · CENTRAL PRICING" title="Rate Management" copy="Manage website selling prices, job-based driver payouts and client contract rates from one unified workspace."/><div className="ratetabs" role="tablist" aria-label="Rate management sections"><button role="tab" aria-selected={tab==="vehicle"} className={tab==="vehicle"?"active":""} onClick={()=>setTab("vehicle")}><CarFront size={17}/>Vehicle Rate</button><button role="tab" aria-selected={tab==="driver"} className={tab==="driver"?"active":""} onClick={()=>setTab("driver")}><WalletCards size={17}/>Job Payout Rate</button><button role="tab" aria-selected={tab==="client"} className={tab==="client"?"active":""} onClick={()=>setTab("client")}><Users size={17}/>Client Fix Rate</button></div><div className="rateworkspace">{tab==="vehicle"&&<RateMatrix/>}{tab==="driver"&&<DriverFixRate/>}{tab==="client"&&<ClientFixRate/>}</div></>
}

function Heading({eyebrow,title,copy,action,onAction}:{eyebrow:string;title:string;copy:string;action?:string;onAction?:()=>void}){return <div className="heading"><div><span>{eyebrow}</span><h1>{title}</h1><p>{copy}</p></div>{action&&<button className="primary" onClick={onAction}><Plus size={17}/>{action}</button>}</div>}

type ManagedRateRule={service:string;tripType:"Per Trip"|"Per Hour"|"Per Seat";values:string[];status:"Active"|"Inactive"};
type JobPayoutTier={id:string;minPax:number;maxPax:number;amount:number;status:"Active"|"Inactive"};
const JOB_PAYOUT_STORAGE_KEY="a3-job-payout-tiers-v1";
const jobPayoutDefaults:JobPayoutTier[]=[
 {id:"JOB-PAX-001",minPax:1,maxPax:3,amount:30,status:"Active"},
 {id:"JOB-PAX-002",minPax:4,maxPax:6,amount:35,status:"Active"},
];
function passengerCount(value?:string){
 const text=String(value||"").trim();
 if(!text)return 0;
 const labelled=[...text.matchAll(/(\d+)\s*(?:pax|people|persons?|passengers?|人|大|小)/gi)].map(match=>Number(match[1])||0);
 if(labelled.length)return labelled.reduce((sum,value)=>sum+value,0);
 const first=text.match(/\d+/);
 return first?Number(first[0])||0:0;
}
function activeJobPayoutTier(value?:string){
 const pax=passengerCount(value);
 if(!pax)return undefined;
 return load<JobPayoutTier[]>(JOB_PAYOUT_STORAGE_KEY,jobPayoutDefaults)
  .filter(tier=>tier.status==="Active")
  .sort((a,b)=>a.minPax-b.minPax)
  .find(tier=>pax>=tier.minPax&&pax<=tier.maxPax);
}
function findJobPayoutRate(value?:string){return Number(activeJobPayoutTier(value)?.amount||0)}
function jobPayoutTierLabel(value?:string){const tier=activeJobPayoutTier(value);return tier?`${tier.minPax}-${tier.maxPax} pax · ${money2(tier.amount)}`:"No matching job payout tier"}
const rateVehicleDefaults=["5 Seater","7 Seater","5 Seater Premium","7 Seater Premium","13 Seater","23 Seater"];
const vehicleRateDefaults:ManagedRateRule[]=[
 {service:"Airport Arrival",tripType:"Per Trip",values:["65","75","95","110","130","180"],status:"Active"},
 {service:"Airport Departure",tripType:"Per Trip",values:["60","70","90","105","125","175"],status:"Active"},
 {service:"Point to Point",tripType:"Per Trip",values:["55","65","85","100","120","165"],status:"Active"},
 {service:"Hourly Disposal",tripType:"Per Hour",values:["60","70","90","105","120","160"],status:"Active"},
 {service:"Cross Border SG to JB",tripType:"Per Trip",values:["220","250","300","330","380","480"],status:"Active"},
 {service:"Midnight Charges 00:00 - 06:30",tripType:"Per Trip",values:["15","20","25","30","35","45"],status:"Active"},
 {service:"Child Seat 1-7 Year Old",tripType:"Per Seat",values:["15","15","18","18","20","20"],status:"Active"},
 {service:"Singapore Postal Code Start 60-80",tripType:"Per Trip",values:["10","10","12","12","15","20"],status:"Active"},
 {service:"Special Rates · Hourly Disposal",tripType:"Per Hour",values:["50","60","80","95","110","145"],status:"Active"}
];
const driverRateDefaults:ManagedRateRule[]=[
 {service:"Airport Arrival",tripType:"Per Trip",values:["40","45","65","70","85","120"],status:"Active"},
 {service:"Airport Departure",tripType:"Per Trip",values:["40","45","65","70","85","120"],status:"Active"},
 {service:"Point to Point",tripType:"Per Trip",values:["40","45","65","70","85","115"],status:"Active"},
 {service:"Hourly Disposal",tripType:"Per Hour",values:["40","45","65","70","80","110"],status:"Active"},
 {service:"Cross Border SG to JB",tripType:"Per Trip",values:["160","180","220","240","280","360"],status:"Active"},
 {service:"Midnight Charges 00:00 - 06:30",tripType:"Per Trip",values:["10","12","15","18","20","25"],status:"Active"},
 {service:"Child Seat 1-7 Year Old",tripType:"Per Seat",values:["5","5","6","6","8","8"],status:"Active"},
 {service:"Singapore Postal Code Start 60-80",tripType:"Per Trip",values:["5","5","6","6","8","10"],status:"Active"},
 {service:"Special Rates · Hourly Disposal",tripType:"Per Hour",values:["33","38","55","62","75","100"],status:"Active"}
];
const clientRateDefaults:ManagedRateRule[]=[
 {service:"Airport Arrival",tripType:"Per Trip",values:["58","68","88","100","118","165"],status:"Active"},
 {service:"Airport Departure",tripType:"Per Trip",values:["55","65","85","98","115","160"],status:"Active"},
 {service:"Point to Point",tripType:"Per Trip",values:["50","60","80","92","110","150"],status:"Active"},
 {service:"Hourly Disposal",tripType:"Per Hour",values:["55","65","85","98","110","145"],status:"Active"},
 {service:"Cross Border SG to JB",tripType:"Per Trip",values:["200","225","275","300","350","440"],status:"Active"},
 {service:"Midnight Charges 23:00 - 06:30",tripType:"Per Trip",values:["12","15","20","25","30","38"],status:"Active"},
 {service:"Child Seat 1-7 Year Old",tripType:"Per Seat",values:["12","12","15","15","18","18"],status:"Active"},
 {service:"Singapore Postal Code Start 60-80",tripType:"Per Trip",values:["8","8","10","10","12","15"],status:"Active"},
 {service:"Special Rates · Hourly Disposal",tripType:"Per Hour",values:["33","33","33","33","33","33"],status:"Active"}
];
function inferFixedRateService(item:DocumentLineItem){
 const text=[item.jobTitle,item.description,item.route].filter(Boolean).join(" ").toLowerCase();
 if(/送机|departure|drop.?off.*airport|to airport/.test(text))return "Airport Departure";
 if(/接机|arrival|pick.?up.*airport|from airport/.test(text))return "Airport Arrival";
 if(/hour|小时|disposal/.test(text))return "Hourly Disposal";
 if(/jb|johor|cross border/.test(text))return "Cross Border SG to JB";
 if(/child seat|儿童座椅/.test(text))return "Child Seat 1-7 Year Old";
 if(/midnight|夜间|凌晨/.test(text))return "Midnight Charges";
 return "Point to Point";
}
function findFixedRate(kind:"driver"|"client",service:string,vehicleType:string,clientId?:string){
 const vehicles=load<string[]>("a3-rate-management-vehicles-v1",rateVehicleDefaults);
 const vehicleIndex=Math.max(0,vehicles.findIndex(vehicle=>vehicle.toLowerCase()===String(vehicleType||"").toLowerCase()));
 const key=kind==="driver"?"a3-rate-management-driver-rules-v1":`a3-rate-management-client-${clientId}-rules-v1`;
 const fallback=kind==="driver"?driverRateDefaults:load<ManagedRateRule[]>("a3-rate-management-client-jsv-rules-v1",clientRateDefaults);
 const rules=load<ManagedRateRule[]>(key,fallback);
 const normalized=service.toLowerCase();
 const rule=rules.find(row=>row.status==="Active"&&(row.service.toLowerCase()===normalized||row.service.toLowerCase().includes(normalized)||normalized.includes(row.service.toLowerCase().replace(/\s*23:00.*$/,""))));
 return Number(rule?.values[vehicleIndex]||0);
}

function ManagedRateMatrix({kind,title,eyebrow,copy,defaults,client}:{kind:string;title:string;eyebrow:string;copy:string;defaults:ManagedRateRule[];client?:string}){
 const vehicleKey="a3-rate-management-vehicles-v1";
 const rulesKey=`a3-rate-management-${kind}-rules-v1`;
 const [vehicles,setVehicles]=useState<string[]>(()=>load(vehicleKey,rateVehicleDefaults));
 const [rules,setRules]=useState<ManagedRateRule[]>(()=>load(rulesKey,defaults));
 const [editing,setEditing]=useState<{index:number|null;rule:ManagedRateRule}|null>(null);
 const [vehicleOpen,setVehicleOpen]=useState(false); const [newVehicle,setNewVehicle]=useState(""); const canManageVehicles=kind==="vehicle";
 useEffect(()=>save(vehicleKey,vehicles),[vehicles]);
 useEffect(()=>save(rulesKey,rules),[rules]);
 useEffect(()=>setRules(current=>current.map(rule=>({...rule,values:vehicles.map((_,i)=>rule.values[i]??"0")}))),[vehicles.length]);
 const openAdd=()=>setEditing({index:null,rule:{service:"",tripType:"Per Trip",values:vehicles.map(()=>"0"),status:"Active"}});
 const openEdit=(index:number)=>setEditing({index,rule:{...rules[index],values:[...rules[index].values]}});
 const commit=()=>{if(!editing||!editing.rule.service.trim())return;const clean={...editing.rule,service:editing.rule.service.trim(),values:vehicles.map((_,i)=>editing.rule.values[i]||"0")};setRules(current=>editing.index===null?[...current,clean]:current.map((rule,index)=>index===editing.index?clean:rule));setEditing(null)};
 const remove=(index:number)=>{if(window.confirm(`Delete ${rules[index].service}?`))setRules(current=>current.filter((_,i)=>i!==index))};
 const addVehicle=()=>{const name=newVehicle.trim();if(!name||vehicles.some(v=>v.toLowerCase()===name.toLowerCase()))return;setVehicles(current=>[...current,name]);setRules(current=>current.map(rule=>({...rule,values:[...rule.values,"0"]})));setNewVehicle("");setVehicleOpen(false)};
 const removeVehicle=(index:number)=>{if(vehicles.length<=1)return;if(!window.confirm(`Remove ${vehicles[index]} from all rate tables?`))return;setVehicles(current=>current.filter((_,i)=>i!==index));setRules(current=>current.map(rule=>({...rule,values:rule.values.filter((_,i)=>i!==index)})))};
 return <><Heading eyebrow={eyebrow} title={title} copy={copy} action="Add rate rule" onAction={openAdd}/>
 {client&&<div className="clientbanner"><div><span>SELECTED CLIENT</span><strong>{client}</strong></div><select aria-label="Client"><option>{client}</option></select></div>}
 <div className="rateactions">{canManageVehicles&&<button className="ghost" onClick={()=>setVehicleOpen(true)}><Plus size={16}/>Add vehicle type</button>}<span>{canManageVehicles?"Vehicle types, services and prices are editable in SGD.":"Vehicle types and service structure follow Vehicle Rate. Only prices can be changed."}</span><button className="ghost" onClick={()=>saveNow(rulesKey,rules)}><Save size={16}/>Save all prices</button></div>
 <div className="panel"><div className="tablewrap"><table className="rate"><thead><tr><th>Rate rule</th><th>Trip type</th>{vehicles.map((vehicle,index)=><th key={`${vehicle}-${index}`}><div className="vehiclehead"><span>{vehicle}</span>{canManageVehicles&&<button aria-label={`Remove ${vehicle}`} title="Remove vehicle" onClick={()=>removeVehicle(index)}><X size={13}/></button>}</div></th>)}<th>Status</th><th>Actions</th></tr></thead><tbody>{rules.length?rules.map((rule,row)=><tr key={`${rule.service}-${row}`}><td><strong>{rule.service}</strong></td><td><span className="pill">{rule.tripType}</span></td>{vehicles.map((vehicle,col)=><td key={`${vehicle}-${col}`}>{money2(Number(rule.values[col]||0))}</td>)}<td><span className={`status ${rule.status.toLowerCase()}`}>{rule.status}</span></td><td><div className="rowactions"><button className="rowaction" onClick={()=>openEdit(row)}><Pencil size={14}/>Edit</button><button className="rowaction danger" onClick={()=>remove(row)}><Trash2 size={14}/>Delete</button></div></td></tr>):<tr><td colSpan={vehicles.length+4}>No rate rules. Select <strong>Add rate rule</strong>.</td></tr>}</tbody></table></div></div>
 {editing&&<div className="modalbackdrop" onMouseDown={()=>setEditing(null)}><div className="modal" onMouseDown={e=>e.stopPropagation()}><div className="modalhead"><div><span>RATE MANAGEMENT</span><h2>{editing.index===null?`Add ${title} rule`:`Edit ${title} rule`}</h2></div><button className="modalclose" onClick={()=>setEditing(null)}><X size={19}/></button></div><div className="rulegrid"><label className="wide">Rule / service name<input autoFocus value={editing.rule.service} onChange={e=>setEditing({...editing,rule:{...editing.rule,service:e.target.value}})} placeholder="Example: Additional stop"/></label><label>Trip type<select value={editing.rule.tripType} onChange={e=>setEditing({...editing,rule:{...editing.rule,tripType:e.target.value as ManagedRateRule["tripType"]}})}><option>Per Trip</option><option>Per Hour</option><option>Per Seat</option></select></label><label>Status<select value={editing.rule.status} onChange={e=>setEditing({...editing,rule:{...editing.rule,status:e.target.value as ManagedRateRule["status"]}})}><option>Active</option><option>Inactive</option></select></label>{vehicles.map((vehicle,index)=><label key={vehicle}>{vehicle} (S$)<input type="number" min="0" step="0.01" value={editing.rule.values[index]??"0"} onChange={e=>setEditing({...editing,rule:{...editing.rule,values:vehicles.map((_,i)=>i===index?e.target.value:(editing.rule.values[i]??"0"))}})}/></label>)}</div><div className="modalactions"><button className="ghost" onClick={()=>setEditing(null)}>Cancel</button><button className="primary" disabled={!editing.rule.service.trim()} onClick={commit}><Save size={16}/>Save</button></div></div></div>}
 {vehicleOpen&&canManageVehicles&&<div className="modalbackdrop" onMouseDown={()=>setVehicleOpen(false)}><div className="modal compactmodal" onMouseDown={e=>e.stopPropagation()}><div className="modalhead"><div><span>FLEET CONTROL</span><h2>Add vehicle type</h2></div><button className="modalclose" onClick={()=>setVehicleOpen(false)}><X size={19}/></button></div><label>Vehicle type name<input autoFocus value={newVehicle} onChange={e=>setNewVehicle(e.target.value)} placeholder="Example: 9 Seater Premium"/></label><div className="modalactions"><button className="ghost" onClick={()=>setVehicleOpen(false)}>Cancel</button><button className="primary" disabled={!newVehicle.trim()} onClick={addVehicle}><Save size={16}/>Add vehicle</button></div></div></div>}</>
}
function RateMatrix(){return <ManagedRateMatrix kind="vehicle" eyebrow="ADMIN · WEBSITE PRICING" title="Vehicle Rate" copy="Manage published limousine.a3group.sg selling prices with complete Add, Edit, Save and Delete controls." defaults={vehicleRateDefaults}/>}
function DriverFixRate(){
 const [tiers,setTiers]=useState<JobPayoutTier[]>(()=>load<JobPayoutTier[]>(JOB_PAYOUT_STORAGE_KEY,jobPayoutDefaults));
 const [editing,setEditing]=useState<JobPayoutTier|null>(null);
 useEffect(()=>save(JOB_PAYOUT_STORAGE_KEY,tiers),[tiers]);
 const openNew=()=>setEditing({id:`JOB-PAX-${Date.now()}`,minPax:1,maxPax:1,amount:0,status:"Active"});
 const commit=(tier:JobPayoutTier)=>{
  const clean={...tier,minPax:Math.max(1,Math.floor(Number(tier.minPax)||0)),maxPax:Math.max(1,Math.floor(Number(tier.maxPax)||0)),amount:Math.max(0,Number(tier.amount)||0)};
  if(clean.maxPax<clean.minPax||clean.amount<=0)return false;
  setTiers(current=>current.some(item=>item.id===clean.id)?current.map(item=>item.id===clean.id?clean:item):[...current,clean].sort((a,b)=>a.minPax-b.minPax));
  setEditing(null);return true;
 };
 const remove=(tier:JobPayoutTier)=>{if(window.confirm(`Delete ${tier.minPax}-${tier.maxPax} pax payout tier?`))setTiers(current=>current.filter(item=>item.id!==tier.id))};
 return <><Heading eyebrow="ADMIN · JOB PAYOUT" title="Job Fixed Payout Rate" copy="Fixed driver pay belongs to the job. The system uses the job passenger count, not the driver's name or vehicle, to calculate the driver's fixed payout." action="Add pax tier" onAction={openNew}/>
  <div className="panel"><div className="tablewrap"><table><thead><tr><th>Job passenger tier</th><th>Fixed driver pay</th><th>Status</th><th>Actions</th></tr></thead><tbody>{tiers.length?tiers.sort((a,b)=>a.minPax-b.minPax).map(tier=><tr key={tier.id}><td><strong>{tier.minPax}-{tier.maxPax} pax</strong></td><td><strong>{money2(tier.amount)}</strong></td><td><span className={`status ${tier.status.toLowerCase()}`}>{tier.status}</span></td><td><div className="rowactions"><button className="rowaction" onClick={()=>setEditing({...tier})}><Pencil size={14}/>Edit</button><button className="rowaction danger" onClick={()=>remove(tier)}><Trash2 size={14}/>Delete</button></div></td></tr>):<tr><td colSpan={4}>No job payout tiers. Add a passenger tier such as 1-3 pax.</td></tr>}</tbody></table></div></div>
  <div className="panel"><strong>How it works</strong><p>Example: a job with 1-3 passengers pays the assigned driver S$30.00. A job with 4-6 passengers pays S$35.00. You may add more tiers.</p></div>
  {editing&&<RecordModal title={tiers.some(item=>item.id===editing.id)?"Edit job payout tier":"Add job payout tier"} onCancel={()=>setEditing(null)} onSave={()=>commit(editing)}><label>Minimum passengers<input type="number" min="1" step="1" value={editing.minPax} onChange={event=>setEditing({...editing,minPax:Number(event.target.value)})}/></label><label>Maximum passengers<input type="number" min="1" step="1" value={editing.maxPax} onChange={event=>setEditing({...editing,maxPax:Number(event.target.value)})}/></label><label>Fixed driver pay (SGD)<input type="number" min="0.01" step="0.01" value={editing.amount||""} onChange={event=>setEditing({...editing,amount:Number(event.target.value)})}/></label><label>Status<select value={editing.status} onChange={event=>setEditing({...editing,status:event.target.value as JobPayoutTier["status"]})}><option>Active</option><option>Inactive</option></select></label></RecordModal>}
 </>
}
function ClientFixRate(){
 const access=useCompanyAccess();
 const clients=useMemo(()=>{const key=scopedStorageKey("a3-client-setup",access);const scoped=load<ClientSetupRecord[]>(key,[]);const source=scoped.length?scoped:load<ClientSetupRecord[]>("a3-client-setup",clientSetupDefaults);return access.isAllCompanies?source:source.filter(c=>(c.companyId||"CMP-001")===access.companyId)},[access.companyId,access.isAllCompanies]);
 const active=clients.filter(client=>client.status==="Active");
 const [clientId,setClientId]=useState(()=>active[0]?.id||clients[0]?.id||"");
 const client=clients.find(item=>item.id===clientId)||active[0]||clients[0];
 if(!client)return <><Heading eyebrow="ADMIN · CLIENT CONTRACT" title="Client Fix Rate" copy="Add a client in Client Management before creating fixed rates."/></>;
 return <><div className="clientbanner"><div><span>SELECT CLIENT RATE TABLE</span><strong>{client.contactName} · {client.company}</strong></div><select value={client.id} onChange={event=>setClientId(event.target.value)}>{clients.map(item=><option key={item.id} value={item.id}>{item.contactName} · {item.company}</option>)}</select></div><ManagedRateMatrix key={client.id} kind={`client-${client.id}`} eyebrow="ADMIN · CLIENT CONTRACT" title="Client Fix Rate" copy="Invoice selling rates follow this selected client's fixed-rate table automatically." defaults={clientRateDefaults}/></>
}


type ClientSetupRecord={id:string;companyId:string;contactName:string;phone:string;company:string;uen:string;address:string;status:"Active"|"Inactive"};
const clientSetupDefaults:ClientSetupRecord[]=[{id:"CLI-001",companyId:"CMP-001",contactName:"NICHOLE ZHENG",phone:"+65 9321 6669",company:"JSV LIMOUSINE SERVICES",uen:"53466069W",address:"322 UBI AVENUE 1 #07-593, KAMPUNG UBI ESTATE, SINGAPORE 400322",status:"Active"}];
function ClientSetup(){
 const access=useCompanyAccess();
 const allCompanies=useMemo(()=>load<Partial<CompanyRecord>[]>("a3-company-settings",companyDefaults).map(normaliseCompany),[]);
 const companies=scopedCompanies(allCompanies,access);
 const key=scopedStorageKey("a3-client-setup",access);
 const [records,setRecords]=useState<ClientSetupRecord[]>(()=>{const stored=load<ClientSetupRecord[]>(key,[]);if(stored.length)return stored.map(r=>({...r,companyId:r.companyId||access.companyId||"CMP-001"}));const legacy=load<ClientSetupRecord[]>("a3-client-setup",clientSetupDefaults).map(r=>({...r,companyId:r.companyId||"CMP-001"}));return access.isAllCompanies?legacy:legacy.filter(r=>r.companyId===access.companyId)}); const [editing,setEditing]=useState<ClientSetupRecord|null>(null); useEffect(()=>save(key,records),[key,records]);
 const openNew=()=>setEditing({id:"",companyId:access.companyId||companies[0]?.id||"CMP-001",contactName:"",phone:"",company:"",uen:"",address:"",status:"Active"});
 const commit=(record:ClientSetupRecord)=>{if(!record.contactName.trim()||!record.company.trim()||!record.phone.trim())return false;setRecords(c=>record.id?c.map(r=>r.id===record.id?record:r):[{...record,id:nextId("CLI",c.length)},...c]);setEditing(null);return true};
 return <EditableSection eyebrow="ADMIN · CLIENT MASTER" title="Client Management" copy="Maintain client identity and billing contact details for quotations, invoices and fixed rates." action="Add client" onAdd={openNew} headers={["Client ID","Owner Company","Contact","Phone","Client Company","UEN","Address","Status","Actions"]} rows={records.map(r=>[r.id,allCompanies.find(c=>c.id===r.companyId)?.company||"—",r.contactName,r.phone,r.company,r.uen,r.address,r.status,<button className="rowaction" onClick={()=>setEditing({...r})}><Pencil size={14}/>Edit</button>])}>{editing&&<RecordModal title={editing.id?"Edit client":"Add client"} onCancel={()=>setEditing(null)} onSave={()=>commit(editing)}>{access.isAllCompanies&&<label>Owner company<select value={editing.companyId} onChange={e=>setEditing({...editing,companyId:e.target.value})}>{allCompanies.map(c=><option key={c.id} value={c.id}>{c.company}</option>)}</select></label>}<label>Contact name<input value={editing.contactName} onChange={e=>setEditing({...editing,contactName:e.target.value})}/></label><label>Phone<input value={editing.phone} onChange={e=>setEditing({...editing,phone:e.target.value})}/></label><label>Company name<input value={editing.company} onChange={e=>setEditing({...editing,company:e.target.value})}/></label><label>UEN<input value={editing.uen} onChange={e=>setEditing({...editing,uen:e.target.value})}/></label><label className="wide">Address<input value={editing.address} onChange={e=>setEditing({...editing,address:e.target.value})}/></label><label>Status<select value={editing.status} onChange={e=>setEditing({...editing,status:e.target.value as ClientSetupRecord["status"]})}><option>Active</option><option>Inactive</option></select></label></RecordModal>}</EditableSection>
}

type CatalogueSite="food"|"nightclub"|"limousine";
type CatalogueRecord={
 id:string;companyId:string;site:CatalogueSite;priceKey:string;item:string;titleZh:string;category:string;subgroup:string;stallId:string;description:string;price:number;currency:string;imageUrl:string;imageAlt:string;displayOrder:number;available:boolean;status:"Published"|"Draft"
};
type CatalogueStall={id:string;companyId:string;name:string;description:string;imageUrl:string;displayOrder:number;active:boolean};
const WEBSITE_CATALOGUE_STORAGE_KEY="a3-website-catalogue-v4";
const WEBSITE_STALL_STORAGE_KEY="a3-website-food-stalls-v4";
const catalogueKey=(value:string)=>value.toLowerCase().trim().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"");
const siteLabel=(site:CatalogueSite)=>site==="food"?"Food":site==="nightclub"?"Nightclub":"Limousine";
const siteForCompanyType=(type?:CompanyType):CatalogueSite|undefined=>type==="Food & Beverage"?"food":type==="Nightlife / Entertainment"?"nightclub":type==="Limousine Company"?"limousine":undefined;
function normaliseCatalogueV4(record:Partial<CatalogueRecord>):CatalogueRecord{return {
 id:String(record.id||""),companyId:String(record.companyId||""),site:record.site==="nightclub"||record.site==="limousine"?record.site:"food",priceKey:catalogueKey(String(record.priceKey||record.item||"")),item:String(record.item||""),titleZh:String(record.titleZh||""),category:String(record.category||"Other"),subgroup:String(record.subgroup||""),stallId:String(record.stallId||""),description:String(record.description||""),price:Number(record.price||0),currency:String(record.currency||"SGD"),imageUrl:String(record.imageUrl||""),imageAlt:String(record.imageAlt||record.item||""),displayOrder:Number(record.displayOrder||0),available:record.available!==false,status:record.status==="Draft"?"Draft":"Published"
}}
function WebsiteCatalogueRate(){
 const access=useCompanyAccess();
 const companies=useMemo(()=>load<Partial<CompanyRecord>[]>("a3-company-settings",companyDefaults).map(normaliseCompany),[]);
 const assignedCompany=companies.find(company=>company.id===access.companyId);
 const allowedSites=useMemo<CatalogueSite[]>(()=>{if(access.user.role==="ADMIN")return ["food","nightclub","limousine"];const mapped=siteForCompanyType(assignedCompany?.companyType);return mapped?[mapped]:[]},[access.user.role,assignedCompany?.companyType]);
 const [site,setSite]=useState<CatalogueSite>(allowedSites[0]||"food");
 const [records,setRecords]=useState<CatalogueRecord[]>(()=>load<Partial<CatalogueRecord>[]>(WEBSITE_CATALOGUE_STORAGE_KEY,[]).map(normaliseCatalogueV4));
 const [stalls,setStalls]=useState<CatalogueStall[]>(()=>load<CatalogueStall[]>(WEBSITE_STALL_STORAGE_KEY,[]));
 const [editing,setEditing]=useState<CatalogueRecord|null>(null);
 const [editingStall,setEditingStall]=useState<CatalogueStall|null>(null);
 useEffect(()=>save(WEBSITE_CATALOGUE_STORAGE_KEY,records),[records]);
 useEffect(()=>save(WEBSITE_STALL_STORAGE_KEY,stalls),[stalls]);
 useEffect(()=>{if(!allowedSites.includes(site)&&allowedSites[0])setSite(allowedSites[0])},[allowedSites,site]);
 const ownerCompanyId=access.isAllCompanies?(companies[0]?.id||""):access.companyId;
 const visibleRecords=records.filter(record=>record.site===site&&(access.isAllCompanies||record.companyId===access.companyId));
 const visibleStalls=stalls.filter(stall=>access.isAllCompanies||stall.companyId===access.companyId);
 const categoryOptions=site==="nightclub"?["Tower","Beer","Brandy","Whisky","Vodka","Gin","Rum","Tequila","Wine","Champagne","Cocktails","Promotions","Other"]:site==="limousine"?["Vehicle","Airport Transfer","Point to Point","Hourly Service","Wedding","Package","Other"]:["Rice","Noodles","Set Meals","Side Dishes","Drinks","Dessert","Other"];
 const openNew=()=>setEditing(normaliseCatalogueV4({companyId:ownerCompanyId,site,category:categoryOptions[0],currency:"SGD",status:"Published",available:true,displayOrder:visibleRecords.length+1,stallId:site==="food"?(visibleStalls[0]?.id||""):""}));
 const commit=(record:CatalogueRecord)=>{const normalized=normaliseCatalogueV4({...record,companyId:record.companyId||ownerCompanyId,site,priceKey:record.priceKey||record.item,imageAlt:record.imageAlt||record.item});if(!normalized.companyId||!normalized.item.trim()||!normalized.priceKey||normalized.price<0)return false;const duplicate=records.some(row=>row.companyId===normalized.companyId&&row.site===normalized.site&&row.priceKey===normalized.priceKey&&row.id!==normalized.id);if(duplicate){window.alert("This key already exists in this company's catalogue.");return false}setRecords(current=>normalized.id?current.map(row=>row.id===normalized.id?normalized:row):[{...normalized,id:nextId("CAT",current.length)},...current]);setEditing(null);return true};
 const remove=(record:CatalogueRecord)=>{if(window.confirm(`Delete ${record.item}? This removes its menu entry and picture reference.`))setRecords(current=>current.filter(row=>row.id!==record.id))};
 const clearCatalogue=()=>{if(!window.confirm(`Remove ALL ${siteLabel(site)} catalogue items and pictures visible to this account?`))return;setRecords(current=>current.filter(record=>record.site!==site||(access.isAllCompanies?false:record.companyId!==access.companyId)))};
 const uploadImage=(file:File|null)=>{if(!file||!editing)return;if(file.size>1_500_000){window.alert("Please use an image smaller than 1.5 MB.");return}const reader=new FileReader();reader.onload=()=>setEditing(current=>current?{...current,imageUrl:String(reader.result||""),imageAlt:current.imageAlt||current.item}:current);reader.readAsDataURL(file)};
 const saveStall=(stall:CatalogueStall)=>{if(!stall.name.trim()||!stall.companyId)return false;setStalls(current=>stall.id?current.map(row=>row.id===stall.id?stall:row):[...current,{...stall,id:nextId("STL",current.length)}]);setEditingStall(null);return true};
 const removeStall=(stall:CatalogueStall)=>{if(!window.confirm(`Delete stall ${stall.name}? Menu items will remain but become unassigned.`))return;setStalls(current=>current.filter(row=>row.id!==stall.id));setRecords(current=>current.map(row=>row.stallId===stall.id?{...row,stallId:""}:row))};
 if(!allowedSites.length)return <div className="panel"><Heading eyebrow="WEBSITE CMS" title="Website Catalogue" copy="Assign this user to a Food & Beverage, Nightlife / Entertainment, or Limousine company to open its catalogue."/></div>;
 return <>
  <Heading eyebrow="ADMIN · WEBSITE CMS" title="Website Catalogue" copy="Each company sees only its own website catalogue. Manage products, prices, pictures, publishing and availability from one place." action={`Add ${siteLabel(site)} item`} onAction={openNew}/>
  {access.user.role==="ADMIN"&&<div className="ratetabs" role="tablist">{allowedSites.map(value=><button key={value} className={site===value?"active":""} onClick={()=>setSite(value)}>{siteLabel(value)}</button>)}</div>}
  <div className="documenttoolbar"><strong>{siteLabel(site)} Catalogue</strong><span>{visibleRecords.length} item(s)</span>{site==="food"&&<button className="ghost" onClick={()=>setEditingStall({id:"",companyId:ownerCompanyId,name:"",description:"",imageUrl:"",displayOrder:visibleStalls.length+1,active:true})}><Plus size={16}/>Add new stall</button>}<button className="rowaction danger" onClick={clearCatalogue}><Trash2 size={15}/>Remove all menu & pictures</button></div>
  {site==="food"&&<div className="panel"><h3>Food stalls</h3><div className="rowactions">{visibleStalls.length?visibleStalls.sort((a,b)=>a.displayOrder-b.displayOrder).map(stall=><div className="catalogue-stall" key={stall.id}><strong>{stall.name}</strong><small>{stall.active?"Visible":"Hidden"}</small><button className="rowaction" onClick={()=>setEditingStall({...stall})}><Pencil size={14}/>Edit</button><button className="rowaction danger" onClick={()=>removeStall(stall)}><Trash2 size={14}/>Delete</button></div>):<p>No stalls yet. Add the first stall before creating menu items.</p>}</div></div>}
  <EditableSection eyebrow={`${siteLabel(site).toUpperCase()} WEBSITE`} title={`${siteLabel(site)} items`} copy={site==="food"?"Menu items and pictures grouped by stall.":site==="nightclub"?"Tower, beer, brandy and any other drink or promotion category.":"Vehicles, transfer services, hourly rates and packages."} action={`Add ${siteLabel(site)} item`} onAdd={openNew} headers={["Photo","Item","Company","Category",site==="food"?"Stall":"Group","Price","Availability","Status","Actions"]} rows={[...visibleRecords].sort((a,b)=>a.displayOrder-b.displayOrder).map(record=>[record.imageUrl?<img src={record.imageUrl} alt={record.imageAlt} style={{width:54,height:54,objectFit:"cover",borderRadius:10}}/>:"—",<div key={record.id}><strong>{record.item}</strong><br/><small>{record.priceKey}</small></div>,companies.find(c=>c.id===record.companyId)?.company||"—",record.category,site==="food"?(visibleStalls.find(s=>s.id===record.stallId)?.name||"Unassigned"):(record.subgroup||"—"),`${record.currency} ${record.price.toFixed(2)}`,record.available?"Available":"Sold out",record.status,<div className="rowactions" key={`${record.id}-actions`}><button className="rowaction" onClick={()=>setEditing({...record})}><Pencil size={14}/>Edit</button><button className="rowaction danger" onClick={()=>remove(record)}><Trash2 size={14}/>Delete</button></div>])}>
   {editing&&<RecordModal title={editing.id?`Edit ${siteLabel(site)} item`:`Add ${siteLabel(site)} item`} onCancel={()=>setEditing(null)} onSave={()=>commit(editing)}>
    {access.isAllCompanies&&<label>Owner company<select value={editing.companyId} onChange={e=>setEditing({...editing,companyId:e.target.value})}>{companies.filter(c=>siteForCompanyType(c.companyType)===site).map(c=><option key={c.id} value={c.id}>{c.company}</option>)}</select></label>}
    {site==="food"&&<label>Stall<select value={editing.stallId} onChange={e=>setEditing({...editing,stallId:e.target.value})}><option value="">Unassigned</option>{visibleStalls.map(stall=><option key={stall.id} value={stall.id}>{stall.name}</option>)}</select></label>}
    <label>Category<select value={editing.category} onChange={e=>setEditing({...editing,category:e.target.value})}>{categoryOptions.map(option=><option key={option}>{option}</option>)}</select></label>
    <label>{site==="limousine"?"Vehicle / Service name":"Product / Menu name"}<input value={editing.item} onChange={e=>setEditing({...editing,item:e.target.value,priceKey:editing.priceKey||catalogueKey(e.target.value),imageAlt:editing.imageAlt||e.target.value})}/></label>
    {site==="food"&&<label>Chinese name<input value={editing.titleZh} onChange={e=>setEditing({...editing,titleZh:e.target.value})}/></label>}
    <label>Website key<input value={editing.priceKey} onChange={e=>setEditing({...editing,priceKey:catalogueKey(e.target.value)})} placeholder="unique-item-key"/></label>
    <label>Group / variant<input value={editing.subgroup} onChange={e=>setEditing({...editing,subgroup:e.target.value})} placeholder={site==="nightclub"?"Bottle / Tower / Promotion":"Optional"}/></label>
    <label className="wide">Description<textarea rows={3} value={editing.description} onChange={e=>setEditing({...editing,description:e.target.value})}/></label>
    <label>Price<input type="number" min="0" step="0.01" value={editing.price} onChange={e=>setEditing({...editing,price:Number(e.target.value)})}/></label>
    <label>Currency<select value={editing.currency} onChange={e=>setEditing({...editing,currency:e.target.value})}><option>SGD</option></select></label>
    <label>Display order<input type="number" min="0" step="1" value={editing.displayOrder} onChange={e=>setEditing({...editing,displayOrder:Number(e.target.value)})}/></label>
    <label>Availability<select value={editing.available?"Available":"Sold out"} onChange={e=>setEditing({...editing,available:e.target.value==="Available"})}><option>Available</option><option>Sold out</option></select></label>
    <label>Status<select value={editing.status} onChange={e=>setEditing({...editing,status:e.target.value as CatalogueRecord["status"]})}><option>Published</option><option>Draft</option></select></label>
    <label className="wide">Image URL<input value={editing.imageUrl.startsWith("data:")?"Uploaded image":editing.imageUrl} onChange={e=>setEditing({...editing,imageUrl:e.target.value})} placeholder="https://..."/></label>
    <label>Upload picture<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>uploadImage(e.target.files?.[0]||null)}/></label>
    <label>Picture alt text<input value={editing.imageAlt} onChange={e=>setEditing({...editing,imageAlt:e.target.value})}/></label>
    {editing.imageUrl&&<div className="wide"><img src={editing.imageUrl} alt={editing.imageAlt} style={{width:180,height:130,objectFit:"cover",borderRadius:14}}/><button type="button" className="rowaction danger" onClick={()=>setEditing({...editing,imageUrl:""})}><Trash2 size={14}/>Remove picture</button></div>}
   </RecordModal>}
  </EditableSection>
  {editingStall&&<RecordModal title={editingStall.id?"Edit food stall":"Add new food stall"} onCancel={()=>setEditingStall(null)} onSave={()=>saveStall(editingStall)}>{access.isAllCompanies&&<label>Owner company<select value={editingStall.companyId} onChange={e=>setEditingStall({...editingStall,companyId:e.target.value})}>{companies.filter(c=>c.companyType==="Food & Beverage").map(c=><option key={c.id} value={c.id}>{c.company}</option>)}</select></label>}<label>Stall name<input value={editingStall.name} onChange={e=>setEditingStall({...editingStall,name:e.target.value})}/></label><label>Display order<input type="number" min="0" value={editingStall.displayOrder} onChange={e=>setEditingStall({...editingStall,displayOrder:Number(e.target.value)})}/></label><label>Visibility<select value={editingStall.active?"Visible":"Hidden"} onChange={e=>setEditingStall({...editingStall,active:e.target.value==="Visible"})}><option>Visible</option><option>Hidden</option></select></label><label className="wide">Description<textarea rows={3} value={editingStall.description} onChange={e=>setEditingStall({...editingStall,description:e.target.value})}/></label></RecordModal>}
 </>
}

type CompanyType="Limousine Company"|"Nightlife / Entertainment"|"Food & Beverage"|"Other";
type CompanyRecord={
 id:string;companyType:CompanyType;contactName:string;company:string;uen:string;gst:string;gstEnabled:boolean;gstRate:number;gstEffectiveDate:string;email:string;phone:string;address:string;currency:string;pageSize:string;orientation:string;fontFamily:string;bodyFontSize:number;headingFontSize:number;pageColour:string;textColour:string;accentColour:string;termsEn:string;termsZh:string;
 bankName:string;bankAccountName:string;bankAccountNumber:string;bankBranchCode:string;bankSwiftCode:string;payNowType:string;payNowValue:string;paymentInstructions:string;
 logoName:string;logoData:string;logoWidth:number;logoHeight:number;
 chopName:string;chopData:string;chopWidth:number;chopHeight:number;
 watermarkName:string;watermarkData:string;watermarkText:string;watermarkOpacity:number
};
const companyDefaults:CompanyRecord[]=[{
 id:"CMP-001",companyType:"Limousine Company",contactName:"ANDY LOW MUN WAH",company:"AEJKY",uen:"53488486E",gst:"",gstEnabled:false,gstRate:9,gstEffectiveDate:"",email:"",phone:"+65 8484 9004",address:"887C WOODLANDS DRIVE 50 #13-607, SINGAPORE 733887",currency:"SGD",pageSize:"A4",orientation:"Portrait",fontFamily:"Arial",bodyFontSize:11,headingFontSize:16,pageColour:"#FFFFFF",textColour:"#111827",accentColour:"#1D4ED8",termsEn:DEFAULT_LIMOUSINE_TERMS_EN,termsZh:DEFAULT_LIMOUSINE_TERMS_ZH,
 bankName:"",bankAccountName:"AEJKY",bankAccountNumber:"",bankBranchCode:"",bankSwiftCode:"",payNowType:"UEN",payNowValue:"53488486E",paymentInstructions:"Please quote the invoice or quotation number when making payment.",
 logoName:"",logoData:"",logoWidth:150,logoHeight:70,
 chopName:"",chopData:"",chopWidth:150,chopHeight:100,
 watermarkName:"",watermarkData:"",watermarkText:"AEJKY",watermarkOpacity:8
}];
function clampAssetSize(value:unknown,fallback:number,min:number,max:number){const number=Number(value);return Number.isFinite(number)?Math.min(max,Math.max(min,number)):fallback}
function normaliseCompany(record:Partial<CompanyRecord>):CompanyRecord{
 const companyType:CompanyType=record.companyType??(record.id==="CMP-001"?"Limousine Company":"Other");
 return {
  ...companyDefaults[0],...record,companyType,
  gstEnabled:typeof record.gstEnabled==="boolean"?record.gstEnabled:Boolean(record.gst),
  gstRate:Number(record.gstRate??9),
  termsEn:companyType==="Limousine Company"?String(record.termsEn||DEFAULT_LIMOUSINE_TERMS_EN):"",
  termsZh:companyType==="Limousine Company"?String(record.termsZh||DEFAULT_LIMOUSINE_TERMS_ZH):"",
  bankName:String(record.bankName||""),bankAccountName:String(record.bankAccountName||record.company||""),bankAccountNumber:String(record.bankAccountNumber||""),bankBranchCode:String(record.bankBranchCode||""),bankSwiftCode:String(record.bankSwiftCode||""),payNowType:String(record.payNowType||"UEN"),payNowValue:String(record.payNowValue||record.uen||""),paymentInstructions:String(record.paymentInstructions||"Please quote the document number when making payment."),
  logoWidth:clampAssetSize(record.logoWidth,150,60,260),
  logoHeight:clampAssetSize(record.logoHeight,70,30,140),
  chopWidth:clampAssetSize(record.chopWidth,150,60,240),
  chopHeight:clampAssetSize(record.chopHeight,100,40,180)
 }
}
function companyTerms(company:CompanyRecord,language:DocumentLanguage):string{
 if(company.companyType!=="Limousine Company")return "";
 return language==="ZH"?(company.termsZh||DEFAULT_LIMOUSINE_TERMS_ZH):(company.termsEn||DEFAULT_LIMOUSINE_TERMS_EN);
}
function CompanySetting(){
 const access=useCompanyAccess();
 const [records,setRecords]=useState<CompanyRecord[]>(()=>{const saved=load<Partial<CompanyRecord>[]>("a3-company-settings",companyDefaults);return saved.length?saved.map(normaliseCompany):companyDefaults});
 const [selectedCompanyId,setSelectedCompanyId]=useState(()=>records[0]?.id||"");
 const [editing,setEditing]=useState<CompanyRecord|null>(null);
 useEffect(()=>{save("a3-company-settings",records);setSelectedCompanyId(current=>records.some(record=>record.id===current)?current:records[0]?.id||"")},[records]);
 const openNew=()=>setEditing({...companyDefaults[0],id:"",companyType:"Other",contactName:"",company:"",uen:"",gst:"",gstEnabled:false,gstRate:9,gstEffectiveDate:"",email:"",phone:"",address:"",termsEn:"",termsZh:"",bankName:"",bankAccountName:"",bankAccountNumber:"",bankBranchCode:"",bankSwiftCode:"",payNowType:"UEN",payNowValue:"",paymentInstructions:"Please quote the document number when making payment.",logoName:"",logoData:"",chopName:"",chopData:"",watermarkName:"",watermarkData:"",watermarkText:""});
 const openSelected=()=>{const selected=records.find(record=>record.id===selectedCompanyId);if(selected)setEditing(normaliseCompany(selected))};
 const commit=(record:CompanyRecord)=>{if(!record.company.trim()||!record.contactName.trim())return false;const id=record.id||nextId("CMP",records.length);const clean={...normaliseCompany(record),id,company:record.company.trim(),contactName:record.contactName.trim()};setRecords(current=>record.id?current.map(item=>item.id===record.id?clean:item):[clean,...current]);setSelectedCompanyId(id);setEditing(null);return true};
 const deleteCompany=(record:CompanyRecord)=>{
  if(!access.isAllCompanies){alert("Only an administrator with access to all companies can delete a company.");return}
  if(records.length<=1){alert("At least one company must remain. Add another company before deleting this company.");return}
  const confirmed=window.confirm(`DELETE COMPANY\n\n${record.company} (${record.id})\n\nThis permanently removes this company and its company-specific clients, income, expenses, invoices, quotations and driver claims. User accounts assigned only to this company will be suspended. Global Balance Sheet partner records will NOT be deleted.\n\nContinue?`);
  if(!confirmed)return;
  const companyId=record.id;
  const companyClients=load<ClientSetupRecord[]>("a3-client-setup",[]).filter(client=>client.companyId===companyId);
  saveNow("a3-client-setup",load<ClientSetupRecord[]>("a3-client-setup",[]).filter(client=>client.companyId!==companyId));
  saveNow(`a3-client-setup:${companyId}`,[]);
  companyClients.forEach(client=>saveNow(`a3-rate-management-client-${client.id}-rules-v1`,[]));
  saveNow(INCOME_STORAGE_KEY,load<IncomeRecord[]>(INCOME_STORAGE_KEY,[]).filter(item=>item.companyId!==companyId));
  saveNow(EXPENSE_STORAGE_KEY,load<ExpenseRecord[]>(EXPENSE_STORAGE_KEY,[]).filter(item=>item.companyId!==companyId));
  saveNow(documentStorageKey("invoice"),load<FinancialDocumentRecord[]>(documentStorageKey("invoice"),[]).filter(item=>item.companyId!==companyId));
  saveNow(documentStorageKey("quotation"),load<FinancialDocumentRecord[]>(documentStorageKey("quotation"),[]).filter(item=>item.companyId!==companyId));
  saveNow(DRIVER_CLAIM_STORAGE_KEY,load<DriverClaimRecord[]>(DRIVER_CLAIM_STORAGE_KEY,[]).filter(item=>item.companyId!==companyId));
  const users=normalizeUserRecords(load<UserAccessRecord[]>(USER_ACCESS_STORAGE_KEY,[DEFAULT_ADMIN_USER])).map(user=>user.companyId===companyId?{...user,companyId:"",status:"Suspended" as const}:user);
  saveNow(USER_ACCESS_STORAGE_KEY,users);
  window.dispatchEvent(new CustomEvent(USER_ACCESS_UPDATED_EVENT,{detail:users}));
  const nextRecords=records.filter(item=>item.id!==companyId);
  saveNow("a3-company-settings",nextRecords);
  setRecords(nextRecords);
  setSelectedCompanyId(nextRecords[0]?.id||"");
  setEditing(current=>current?.id===companyId?null:current);
 };
 const attach=(field:"logo"|"chop"|"watermark",file?:File)=>{if(!file||!editing)return;if(file.size>1500000){alert("Please use an image smaller than 1.5 MB.");return}const reader=new FileReader();reader.onload=()=>setEditing(current=>current?{...current,[`${field}Name`]:file.name,[`${field}Data`]:String(reader.result)}:current);reader.readAsDataURL(file)};
 const removeAsset=(field:"logo"|"chop"|"watermark")=>setEditing(current=>current?{...current,[`${field}Name`]:"",[`${field}Data`]:""}:current);
 const setLogoPreset=(width:number,height:number)=>setEditing(current=>current?{...current,logoWidth:width,logoHeight:height}:current);
 const setChopPreset=(width:number,height:number)=>setEditing(current=>current?{...current,chopWidth:width,chopHeight:height}:current);
 return <>
  <Heading eyebrow="ADMIN · ORGANISATION" title="Company Management" copy="Add, edit and delete company records. Deleting a company removes only that company's linked operational data; the independent Balance Sheet is protected." action="Add company" onAction={openNew}/>
  <div className="companypicker panel"><label><span>Existing company</span><select value={selectedCompanyId} onChange={event=>setSelectedCompanyId(event.target.value)}>{records.map(record=><option key={record.id} value={record.id}>{record.company} · {record.id}</option>)}</select></label><div className="rowactions"><button className="primary" disabled={!selectedCompanyId} onClick={openSelected}><Pencil size={16}/>Edit selected company</button><button className="rowaction danger" disabled={!access.isAllCompanies||records.length<=1||!selectedCompanyId} title={!access.isAllCompanies?"Only an administrator can delete a company":records.length<=1?"At least one company must remain":"Delete selected company"} onClick={()=>{const selected=records.find(record=>record.id===selectedCompanyId);if(selected)deleteCompany(selected)}}><Trash2 size={16}/>Delete selected company</button></div></div>
  <div className="panel"><div className="tablewrap"><table><thead><tr>{["Record","Company","Type","Contact","UEN","GST","Bank","Currency","Logo","Actions"].map(header=><th key={header}>{header}</th>)}</tr></thead><tbody>{records.map(record=><tr key={record.id} className={record.id===selectedCompanyId?"selectedrow":""} onClick={()=>setSelectedCompanyId(record.id)}><td>{record.id}</td><td>{record.company}</td><td>{record.companyType}</td><td>{record.contactName}</td><td>{record.uen||"—"}</td><td>{record.gstEnabled?`${record.gstRate}%`:"Disabled"}</td><td>{record.bankName||record.payNowValue||"Not set"}</td><td>{record.currency}</td><td>{record.logoData?<img loading="lazy" decoding="async" className="assetthumb" src={record.logoData} alt={`${record.company} logo`}/>:"Not uploaded"}</td><td><div className="rowactions"><button className="rowaction" onClick={event=>{event.stopPropagation();setSelectedCompanyId(record.id);setEditing(normaliseCompany(record))}}><Pencil size={14}/>Edit</button><button className="rowaction danger" disabled={!access.isAllCompanies||records.length<=1} title={!access.isAllCompanies?"Only an administrator can delete a company":records.length<=1?"At least one company must remain":"Delete company"} onClick={event=>{event.stopPropagation();deleteCompany(record)}}><Trash2 size={14}/>Delete</button></div></td></tr>)}</tbody></table></div></div>
  {editing&&<RecordModal className="companymodal" title={editing.id?`Edit ${editing.company||"company"}`:"Add company record"} onCancel={()=>setEditing(null)} onSave={()=>commit(editing)}>
   <section className="companyformsection wide"><div className="companysectionhead"><span>1</span><div><strong>Company identity</strong><small>Basic company and contact information.</small></div></div><div className="companyformgrid"><label>Company name<input value={editing.company} onChange={event=>setEditing({...editing,company:event.target.value})}/></label><label>Company type<select value={editing.companyType} onChange={event=>{const companyType=event.target.value as CompanyType;setEditing({...editing,companyType,termsEn:companyType==="Limousine Company"?(editing.termsEn||DEFAULT_LIMOUSINE_TERMS_EN):"",termsZh:companyType==="Limousine Company"?(editing.termsZh||DEFAULT_LIMOUSINE_TERMS_ZH):""})}}><option>Limousine Company</option><option>Nightlife / Entertainment</option><option>Food & Beverage</option><option>Other</option></select></label><label>Contact person<input value={editing.contactName} onChange={event=>setEditing({...editing,contactName:event.target.value})}/></label><label>UEN<input value={editing.uen} onChange={event=>setEditing({...editing,uen:event.target.value})}/></label><label>Email<input type="email" value={editing.email} onChange={event=>setEditing({...editing,email:event.target.value})}/></label><label>Phone<input value={editing.phone} onChange={event=>setEditing({...editing,phone:event.target.value})}/></label><label className="wide">Address<textarea rows={3} value={editing.address} onChange={event=>setEditing({...editing,address:event.target.value})}/></label></div></section>
   <section className="companyformsection wide"><div className="companysectionhead"><span>2</span><div><strong>GST and document defaults</strong><small>Settings applied when creating quotations and invoices.</small></div></div><div className="companyformgrid"><label>GST status<select value={editing.gstEnabled?"Enabled":"Disabled"} onChange={event=>setEditing({...editing,gstEnabled:event.target.value==="Enabled"})}><option>Disabled</option><option>Enabled</option></select></label>{editing.gstEnabled&&<><label>GST rate (%)<input type="number" min="0" max="100" step="0.01" value={editing.gstRate} onChange={event=>setEditing({...editing,gstRate:Number(event.target.value)})}/></label><label>GST registration number<input value={editing.gst} onChange={event=>setEditing({...editing,gst:event.target.value})}/></label><label>GST effective date<input type="date" value={editing.gstEffectiveDate} onChange={event=>setEditing({...editing,gstEffectiveDate:event.target.value})}/></label></>}<label>Currency<select value={editing.currency} onChange={event=>setEditing({...editing,currency:event.target.value})}><option>SGD</option><option>USD</option><option>MYR</option><option>CNY</option><option>EUR</option><option>GBP</option><option>JPY</option></select></label><label>Page size<select value={editing.pageSize} onChange={event=>setEditing({...editing,pageSize:event.target.value})}><option>A4</option><option>Letter</option><option>Legal</option></select></label><label>Orientation<select value={editing.orientation} onChange={event=>setEditing({...editing,orientation:event.target.value})}><option>Portrait</option><option>Landscape</option></select></label><label>Font family<select value={editing.fontFamily} onChange={event=>setEditing({...editing,fontFamily:event.target.value})}><option>Arial</option><option>Helvetica</option><option>Times New Roman</option><option>Georgia</option><option>Verdana</option></select></label><label>Body font size<input type="number" min="8" max="18" value={editing.bodyFontSize} onChange={event=>setEditing({...editing,bodyFontSize:Number(event.target.value)})}/></label><label>Heading font size<input type="number" min="12" max="30" value={editing.headingFontSize} onChange={event=>setEditing({...editing,headingFontSize:Number(event.target.value)})}/></label><label>Page colour<input type="color" value={editing.pageColour} onChange={event=>setEditing({...editing,pageColour:event.target.value})}/></label><label>Text colour<input type="color" value={editing.textColour} onChange={event=>setEditing({...editing,textColour:event.target.value})}/></label><label>Accent colour<input type="color" value={editing.accentColour} onChange={event=>setEditing({...editing,accentColour:event.target.value})}/></label></div></section>
   <section className="companyformsection wide"><div className="companysectionhead"><span>3</span><div><strong>Bank and payment information</strong><small>Saved under this company and printed automatically on invoices and quotations.</small></div></div><div className="companyformgrid"><label>Bank name<input value={editing.bankName} onChange={event=>setEditing({...editing,bankName:event.target.value})} placeholder="e.g. DBS Bank"/></label><label>Account name<input value={editing.bankAccountName} onChange={event=>setEditing({...editing,bankAccountName:event.target.value})} placeholder={editing.company||"Company account name"}/></label><label>Account number<input value={editing.bankAccountNumber} onChange={event=>setEditing({...editing,bankAccountNumber:event.target.value})}/></label><label>Branch code<input value={editing.bankBranchCode} onChange={event=>setEditing({...editing,bankBranchCode:event.target.value})}/></label><label>SWIFT / BIC<input value={editing.bankSwiftCode} onChange={event=>setEditing({...editing,bankSwiftCode:event.target.value.toUpperCase()})}/></label><label>PayNow type<select value={editing.payNowType} onChange={event=>setEditing({...editing,payNowType:event.target.value})}><option>UEN</option><option>Mobile</option><option>NRIC / FIN</option><option>Other</option></select></label><label className="wide">PayNow value<input value={editing.payNowValue} onChange={event=>setEditing({...editing,payNowValue:event.target.value})}/></label><label className="wide">Payment instructions<textarea rows={3} value={editing.paymentInstructions} onChange={event=>setEditing({...editing,paymentInstructions:event.target.value})}/></label></div></section>
   {editing.companyType==="Limousine Company"&&<section className="companyformsection wide"><div className="companysectionhead"><span>4</span><div><strong>Limousine Terms & Conditions</strong><small>Owned by this company and automatically translated when English or Chinese is selected on an invoice or quotation.</small></div></div><div className="companyformgrid"><label className="wide">English Terms & Conditions<textarea rows={11} value={editing.termsEn} onChange={event=>setEditing({...editing,termsEn:event.target.value})}/></label><label className="wide">中文条款与条件<textarea rows={11} value={editing.termsZh} onChange={event=>setEditing({...editing,termsZh:event.target.value})}/></label></div></section>}
   <section className="companyformsection wide"><div className="companysectionhead"><span>5</span><div><strong>Logo and company chop</strong><small>Use presets or enter exact dimensions. The preview stays contained and will not stretch the form.</small></div></div><div className="companyassetgrid"><div className="companyassetcard"><div className="companyassettitle"><strong>Company logo</strong><small>{editing.logoWidth} × {editing.logoHeight}px</small></div><div className="companyassetpreview">{editing.logoData?<img loading="lazy" decoding="async" src={editing.logoData} alt="Logo preview"/>:<span>No logo uploaded</span>}</div><div className="assetpresets"><button type="button" className="ghost" onClick={()=>setLogoPreset(110,50)}>Small</button><button type="button" className="ghost" onClick={()=>setLogoPreset(150,70)}>Standard</button><button type="button" className="ghost" onClick={()=>setLogoPreset(210,95)}>Large</button></div><div className="assetsizegrid"><label>Width (px)<input type="number" min="60" max="260" step="5" value={editing.logoWidth} onChange={event=>setEditing({...editing,logoWidth:clampAssetSize(event.target.value,150,60,260)})}/></label><label>Height (px)<input type="number" min="30" max="140" step="5" value={editing.logoHeight} onChange={event=>setEditing({...editing,logoHeight:clampAssetSize(event.target.value,70,30,140)})}/></label></div><div className="assetbuttons"><label className="filefield">Upload logo<input type="file" accept="image/png,image/jpeg,image/webp" onChange={event=>attach("logo",event.target.files?.[0])}/><span><Upload size={16}/>{editing.logoName||"Choose image"}</span></label>{editing.logoData&&<button type="button" className="rowaction danger" onClick={()=>removeAsset("logo")}><Trash2 size={14}/>Remove</button>}</div></div><div className="companyassetcard"><div className="companyassettitle"><strong>Company chop</strong><small>{editing.chopWidth} × {editing.chopHeight}px</small></div><div className="companyassetpreview">{editing.chopData?<img loading="lazy" decoding="async" src={editing.chopData} alt="Chop preview"/>:<span>No chop uploaded</span>}</div><div className="assetpresets"><button type="button" className="ghost" onClick={()=>setChopPreset(100,70)}>Small</button><button type="button" className="ghost" onClick={()=>setChopPreset(150,100)}>Standard</button><button type="button" className="ghost" onClick={()=>setChopPreset(200,140)}>Large</button></div><div className="assetsizegrid"><label>Width (px)<input type="number" min="60" max="240" step="5" value={editing.chopWidth} onChange={event=>setEditing({...editing,chopWidth:clampAssetSize(event.target.value,150,60,240)})}/></label><label>Height (px)<input type="number" min="40" max="180" step="5" value={editing.chopHeight} onChange={event=>setEditing({...editing,chopHeight:clampAssetSize(event.target.value,100,40,180)})}/></label></div><div className="assetbuttons"><label className="filefield">Upload chop<input type="file" accept="image/png,image/jpeg,image/webp" onChange={event=>attach("chop",event.target.files?.[0])}/><span><Upload size={16}/>{editing.chopName||"Choose image"}</span></label>{editing.chopData&&<button type="button" className="rowaction danger" onClick={()=>removeAsset("chop")}><Trash2 size={14}/>Remove</button>}</div></div></div></section>
   <section className="companyformsection wide"><div className="companysectionhead"><span>5</span><div><strong>Watermark</strong><small>Optional text or image shown behind document content.</small></div></div><div className="companyformgrid"><div className="assetupload"><label className="filefield">Watermark image<input type="file" accept="image/png,image/jpeg,image/webp" onChange={event=>attach("watermark",event.target.files?.[0])}/><span><Upload size={16}/>{editing.watermarkName||"Upload watermark"}</span></label>{editing.watermarkData&&<button type="button" className="rowaction danger" onClick={()=>removeAsset("watermark")}><Trash2 size={14}/>Remove watermark</button>}</div><label>Watermark text<input placeholder="e.g. AEJKY or PAID" value={editing.watermarkText} onChange={event=>setEditing({...editing,watermarkText:event.target.value})}/></label><label>Opacity ({editing.watermarkOpacity}%)<input type="range" min="3" max="30" value={editing.watermarkOpacity} onChange={event=>setEditing({...editing,watermarkOpacity:Number(event.target.value)})}/></label>{editing.watermarkData&&<div className="companywatermarkpreview"><img loading="lazy" decoding="async" src={editing.watermarkData} alt="Watermark preview"/></div>}</div></section>
  </RecordModal>}
 </>
}

function UserAccess({currentUser}:{currentUser:UserAccessRecord}){
 const companies=useMemo(()=>{const saved=load<Partial<CompanyRecord>[]>("a3-company-settings",companyDefaults);return saved.length?saved.map(normaliseCompany):companyDefaults},[]);
 const drivers=useMemo(()=>load<DriverRecord[]>("a3-driver-records",[]),[]);
 const defaults=useMemo(()=>[{...DEFAULT_ADMIN_USER,visibleModules:[...DEFAULT_ADMIN_USER.visibleModules]}],[]);
 const [records,setRecords]=useState<UserAccessRecord[]>(()=>normalizeUserRecords(load(USER_ACCESS_STORAGE_KEY,defaults)));
 const [editing,setEditing]=useState<UserAccessRecord|null>(null);
 const [currentPassword,setCurrentPassword]=useState("");
 const [newAdminPassword,setNewAdminPassword]=useState("");
 const [confirmAdminPassword,setConfirmAdminPassword]=useState("");
 const [passwordNotice,setPasswordNotice]=useState("");
 const [passwordBusy,setPasswordBusy]=useState(false);
 useEffect(()=>{save(USER_ACCESS_STORAGE_KEY,records);window.dispatchEvent(new CustomEvent(USER_ACCESS_UPDATED_EVENT,{detail:records}))},[records]);
 const nextUserId=()=>{const max=records.reduce((highest,item)=>{const match=/^USR-(\d+)$/.exec(item.id);return match?Math.max(highest,Number(match[1])):highest},0);return `USR-${String(max+1).padStart(3,"0")}`};
 const openNew=()=>setEditing({id:nextUserId(),username:"",name:"",email:"",password:"",role:"COMPANY_ADMIN",accessScope:"SELECTED_COMPANY",companyId:companies[0]?.id||"",driverId:"",visibleModules:[],status:"Active"});
 const commit=(record:UserAccessRecord)=>{
  if(!record.username.trim()||!record.name.trim()||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(record.email))return false;
  if(!/^[a-zA-Z0-9._-]{3,}$/.test(record.username.trim())){alert("Username must be at least 3 characters and use only letters, numbers, dots, underscores or hyphens.");return false}
  if(!record.id&&record.password.length<MINIMUM_PASSWORD_LENGTH){alert(`New users require a password of at least ${MINIMUM_PASSWORD_LENGTH} characters.`);return false}
  if(record.password&&record.password.length<MINIMUM_PASSWORD_LENGTH){alert(`Password must be at least ${MINIMUM_PASSWORD_LENGTH} characters.`);return false}
  const duplicate=records.find(item=>item.id!==record.id&&(item.username.toLowerCase()===record.username.trim().toLowerCase()||item.email.toLowerCase()===record.email.trim().toLowerCase()));
  if(duplicate){alert("Username and email must be unique.");return false}
  if(record.accessScope!=="ALL_INFORMATION"&&!record.companyId&&record.role!=="ADMIN")return false;
  if(record.role==="DRIVER"&&!record.driverId)return false;
  const visibleModules=normalizeVisibleModuleIds(record.visibleModules,record.role);
  const isNew=!records.some(item=>item.id===record.id);
  const clean={...normalizeUserRecord({...record,username:record.username.trim().toLowerCase(),name:record.name.trim(),email:record.email.trim(),companyId:record.accessScope==="ALL_INFORMATION"?"":record.companyId,driverId:record.role==="DRIVER"?record.driverId:"",visibleModules}),id:record.id};
  setRecords(current=>isNew?[clean,...current]:current.map(item=>item.id===clean.id?{...clean,password:clean.password||item.password}:item));
  setEditing(null);return true;
 };
 const deleteUser=(record:UserAccessRecord)=>{
  if(record.id===DEFAULT_ADMIN_USER.id||record.username.toLowerCase()===DEFAULT_ADMIN_USER.username){alert("The main administrator account cannot be deleted.");return}
  if(record.id===currentUser.id){alert("You cannot delete the account currently signed in.");return}
  if(!window.confirm(`Delete user ${record.name} (${record.id})? This removes login access but does not delete company records.`))return;
  setRecords(current=>current.filter(item=>item.id!==record.id));
  setEditing(current=>current?.id===record.id?null:current);
 };
 const companyName=(id:string)=>companies.find(company=>company.id===id)?.company||"No company selected";
 const toggleModule=(moduleId:string)=>setEditing(current=>current?{...current,visibleModules:current.visibleModules.includes(moduleId)?current.visibleModules.filter(id=>id!==moduleId):[...current.visibleModules,moduleId]}:current);
 const changeAdminPassword=async(event:React.FormEvent<HTMLFormElement>)=>{
  event.preventDefault();
  setPasswordNotice("");
  const administrator=records.find(record=>record.id===DEFAULT_ADMIN_USER.id||record.username===DEFAULT_ADMIN_USER.username);
  if(!administrator){setPasswordNotice("Primary administrator account was not found.");return}
  if(currentPassword!==administrator.password){setPasswordNotice("Current password is incorrect.");return}
  if(newAdminPassword.length<MINIMUM_PASSWORD_LENGTH){setPasswordNotice(`New password must be at least ${MINIMUM_PASSWORD_LENGTH} characters.`);return}
  if(newAdminPassword!==confirmAdminPassword){setPasswordNotice("New password and confirmation do not match.");return}
  if(newAdminPassword===currentPassword){setPasswordNotice("Choose a password different from the current password.");return}
  setPasswordBusy(true);
  try{
   const updated=records.map(record=>record.id===administrator.id?{...record,password:newAdminPassword}:record);
   setRecords(updated);
   saveNow(USER_ACCESS_STORAGE_KEY,updated);
   window.dispatchEvent(new CustomEvent(USER_ACCESS_UPDATED_EVENT,{detail:updated}));
   setCurrentPassword("");setNewAdminPassword("");setConfirmAdminPassword("");
   setPasswordNotice("Administrator password changed successfully.");
  }catch(error){setPasswordNotice(error instanceof Error?error.message:"Unable to change administrator password.")}finally{setPasswordBusy(false)}
 };
 const assignedModules=(record:UserAccessRecord)=>normalizeVisibleModuleIds(record.visibleModules,record.role);
 const moduleOptions=editing?grantableModules(editing.role):ACCESS_MODULES;
 const effectiveEditingModules=editing?normalizeVisibleModuleIds(editing.visibleModules,editing.role):[];
 const selectAllModules=()=>setEditing(current=>current?{...current,visibleModules:defaultModuleIdsForRole(current.role)}:current);
 const clearAllModules=()=>setEditing(current=>current?{...current,visibleModules:[]}:current);
 const moduleHelp="Module visibility is manual. Tick only the workspaces this user may open, or use Select all / Clear all.";
 return <><section className="panel adminpasswordpanel"><div className="panelhead"><div><span>ADMIN · SECURITY</span><h2>Change administrator password</h2><p>Update the primary administrator login. Minimum {MINIMUM_PASSWORD_LENGTH} characters.</p></div><ShieldCheck size={22}/></div>{passwordNotice&&<div className={`cloudnotice ${passwordNotice.toLowerCase().includes("changed")?"success":"error"}`} role="status">{passwordNotice}</div>}<form className="adminpasswordform" onSubmit={changeAdminPassword}><label>Current password<input type="password" autoComplete="current-password" value={currentPassword} onChange={event=>setCurrentPassword(event.target.value)} required disabled={passwordBusy}/></label><label>New password<input type="password" minLength={MINIMUM_PASSWORD_LENGTH} autoComplete="new-password" value={newAdminPassword} onChange={event=>setNewAdminPassword(event.target.value)} placeholder={`Minimum ${MINIMUM_PASSWORD_LENGTH} characters`} required disabled={passwordBusy}/></label><label>Confirm new password<input type="password" minLength={MINIMUM_PASSWORD_LENGTH} autoComplete="new-password" value={confirmAdminPassword} onChange={event=>setConfirmAdminPassword(event.target.value)} required disabled={passwordBusy}/></label><button className="primary" type="submit" disabled={passwordBusy}>{passwordBusy?"Updating…":"Change password"}</button></form></section><EditableSection eyebrow="ADMIN · SECURITY" title="User Access" copy="Choose the company data scope and visible modules separately. Module choices are never auto-selected when the role or scope changes." action="Add user" onAdd={openNew} headers={["User ID","Username","Name","Email","Role","Access Scope","Company","Visible Modules","Status","Actions"]} rows={records.map(record=>[record.id,record.username,record.name,record.email,roleLabel(record.role),accessScopeLabel(record.accessScope),record.accessScope==="ALL_INFORMATION"?"All companies":companyName(record.companyId),<ModuleBadges ids={assignedModules(record)}/>,record.status,<div className="rowactions"><button className="rowaction" onClick={()=>setEditing({...record,password:"",visibleModules:[...assignedModules(record)]})}><Pencil size={14}/>Edit</button><button className="rowaction danger" disabled={record.id===DEFAULT_ADMIN_USER.id||record.username.toLowerCase()===DEFAULT_ADMIN_USER.username||record.id===currentUser.id} title={record.id===DEFAULT_ADMIN_USER.id||record.username.toLowerCase()===DEFAULT_ADMIN_USER.username?"Main administrator cannot be deleted":record.id===currentUser.id?"Current signed-in user cannot be deleted":"Delete user"} onClick={()=>deleteUser(record)}><Trash2 size={14}/>Delete</button></div>])}>{editing&&<RecordModal title={records.some(record=>record.id===editing.id)?"Edit user access":"Add user access"} onCancel={()=>setEditing(null)} onSave={()=>commit(editing)}><label>User ID<input value={editing.id} readOnly aria-readonly="true"/></label><label>Username<input autoComplete="username" value={editing.username} onChange={event=>setEditing({...editing,username:event.target.value})} placeholder="e.g. operations1"/></label><label>Full name<input value={editing.name} onChange={event=>setEditing({...editing,name:event.target.value})}/></label><label>Email<input type="email" value={editing.email} onChange={event=>setEditing({...editing,email:event.target.value})}/></label><label>{records.some(record=>record.id===editing.id)?"New password (optional)":"Password"}<input type="password" minLength={MINIMUM_PASSWORD_LENGTH} autoComplete="new-password" value={editing.password} onChange={event=>setEditing({...editing,password:event.target.value})} placeholder={records.some(record=>record.id===editing.id)?"Leave blank to keep existing password":`Minimum ${MINIMUM_PASSWORD_LENGTH} characters`}/></label><label>Role<select value={editing.role} onChange={event=>{const role=event.target.value as AccessRole;setEditing({...editing,role,accessScope:defaultAccessScope(role),companyId:role==="ADMIN"?"":editing.companyId||companies[0]?.id||"",driverId:role==="DRIVER"?editing.driverId:"",visibleModules:normalizeVisibleModuleIds(editing.visibleModules,role)})}}><option value="ADMIN">Admin</option><option value="COMPANY_ADMIN">Company Admin</option><option value="DRIVER">Driver</option></select></label><label>Access Scope<select value={editing.accessScope} onChange={event=>{const accessScope=event.target.value as AccessScope;setEditing({...editing,accessScope,companyId:accessScope==="ALL_INFORMATION"?"":editing.companyId||companies[0]?.id||""})}}><option value="ALL_INFORMATION">All Information</option><option value="SELECTED_COMPANY">Selected Company Only</option><option value="SELECTED_MODULES">Selected Modules Only</option><option value="OWN_RECORDS">Own Records Only</option></select></label>{editing.accessScope!=="ALL_INFORMATION"&&<label>Company<select value={editing.companyId} onChange={event=>setEditing({...editing,companyId:event.target.value})}><option value="">Select company</option>{companies.map(company=><option key={company.id} value={company.id}>{company.company}</option>)}</select></label>}{editing.role==="DRIVER"&&<label>Driver profile<select value={editing.driverId} onChange={event=>setEditing({...editing,driverId:event.target.value})}><option value="">Select driver</option>{drivers.map(driver=><option key={driver.id} value={driver.id}>{driver.name} · {driver.carPlate}</option>)}</select></label>}<div className="wide modulepermission"><div className="modulepermissionhead"><div><strong>Visible Modules</strong><span>{moduleHelp}</span></div><div className="modulecheckactions"><button type="button" className="ghost" onClick={selectAllModules}>Select all</button><button type="button" className="ghost" onClick={clearAllModules}>Clear all</button></div></div><div className="modulechecks">{moduleOptions.map(module=><label key={module.id} className="checkline"><input type="checkbox" checked={effectiveEditingModules.includes(module.id)} onChange={()=>toggleModule(module.id)}/>{module.label}</label>)}</div></div><label className="wide">Permissions preview<textarea readOnly rows={3} value={`${editing.status} · ${editing.accessScope==="ALL_INFORMATION"?"All companies":companyName(editing.companyId)} · ${moduleLabels(effectiveEditingModules).join(", ")||"No modules selected"}`}/></label><label>Status<select value={editing.status} onChange={event=>setEditing({...editing,status:event.target.value as UserAccessRecord["status"]})}><option>Active</option><option>Suspended</option></select></label></RecordModal>}</EditableSection></>
}

function ModuleBadges({ids}:{ids:string[]}){const labels=moduleLabels(ids);return <div className="modulebadges">{labels.length?labels.map(label=><span key={label}>{label}</span>):<em>No modules</em>}</div>}

type IncomeRecord={id:string;date:string;companyId:string;source:string;customer:string;reference:string;description:string;amount:number;payment:string;status:"Pending"|"Received"};
const incomeRecordDefaults:IncomeRecord[]=[
 {id:"INC-001",date:"2026-07-25",companyId:"CMP-001",source:"Limousine Booking",customer:"Nicole Tan",reference:"A3L-260725-018",description:"Airport arrival booking",amount:150,payment:"PayNow",status:"Received"},
 {id:"INC-002",date:"2026-07-25",companyId:"CMP-001",source:"Limousine Booking",customer:"Daniel Koh",reference:"A3L-260725-017",description:"Point-to-point booking",amount:55,payment:"Card",status:"Received"},
 {id:"INC-003",date:"2026-07-26",companyId:"CMP-001",source:"Invoice Payment",customer:"Horizon Events",reference:"INV-2026-001",description:"Hourly disposal service",amount:880,payment:"Bank Transfer",status:"Pending"},
];
type ExpenseRecord={id:string;date:string;companyId:string;category:string;supplier:string;description:string;mileageFrom:string;mileageTo:string;amount:number;payment:string;receiptName:string;receiptType:string;receiptData:string};
const expenseRecordDefaults:ExpenseRecord[]=[{id:"EXP-001",date:"2026-07-25",companyId:"CMP-001",category:"Fuel",supplier:"Shell Singapore",description:"Fleet fuel purchase",mileageFrom:"",mileageTo:"",amount:186.4,payment:"Company Card",receiptName:"",receiptType:"",receiptData:""}];
function normalizeExpenseRecord(record:Partial<ExpenseRecord>):ExpenseRecord{return {id:String(record.id||""),date:String(record.date||""),companyId:String(record.companyId||companyDefaults[0].id),category:String(record.category||"Other"),supplier:String(record.supplier||""),description:String(record.description||""),mileageFrom:String(record.mileageFrom||""),mileageTo:String(record.mileageTo||""),amount:Number(record.amount)||0,payment:String(record.payment||"Other"),receiptName:String(record.receiptName||""),receiptType:String(record.receiptType||""),receiptData:String(record.receiptData||"")}}
type ReportPeriod="TODAY"|"THIS_WEEK"|"THIS_MONTH"|"THIS_YEAR";
type ProfitLossPeriod=ReportPeriod;
const REPORT_PERIOD_OPTIONS:Array<{value:ReportPeriod;label:string}>=[{value:"TODAY",label:"Today"},{value:"THIS_WEEK",label:"This Week"},{value:"THIS_MONTH",label:"This Month"},{value:"THIS_YEAR",label:"This Year"}];
function localToday(){const now=new Date();const offset=now.getTimezoneOffset();return new Date(now.getTime()-offset*60000).toISOString().slice(0,10)}
function parseLocalDate(value:string){const [year,month,day]=value.split("-").map(Number);return new Date(year,Math.max(0,(month||1)-1),day||1)}
function startOfReportPeriod(period:ReportPeriod,anchor=localToday()){const date=parseLocalDate(anchor);if(period==="TODAY")return anchor;if(period==="THIS_WEEK"){const day=date.getDay()||7;date.setDate(date.getDate()-day+1)}else if(period==="THIS_MONTH")date.setDate(1);else date.setMonth(0,1);return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`}
function endOfReportPeriod(period:ReportPeriod,anchor=localToday()){const date=parseLocalDate(startOfReportPeriod(period,anchor));if(period==="TODAY")return anchor;if(period==="THIS_WEEK")date.setDate(date.getDate()+6);else if(period==="THIS_MONTH")date.setMonth(date.getMonth()+1,0);else date.setMonth(11,31);return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`}
function dateInReportPeriod(value:string,period:ReportPeriod,anchor=localToday()){const date=String(value||"").slice(0,10);return Boolean(date)&&date>=startOfReportPeriod(period,anchor)&&date<=endOfReportPeriod(period,anchor)}
function reportPeriodLabel(period:ReportPeriod,anchor=localToday()){const start=startOfReportPeriod(period,anchor),end=endOfReportPeriod(period,anchor);if(period==="TODAY")return new Intl.DateTimeFormat("en-SG",{day:"2-digit",month:"short",year:"numeric"}).format(parseLocalDate(start));if(period==="THIS_YEAR")return start.slice(0,4);return `${new Intl.DateTimeFormat("en-SG",{day:"2-digit",month:"short",year:"numeric"}).format(parseLocalDate(start))} – ${new Intl.DateTimeFormat("en-SG",{day:"2-digit",month:"short",year:"numeric"}).format(parseLocalDate(end))}`}
function PeriodSelect({value,onChange}:{value:ReportPeriod;onChange:(period:ReportPeriod)=>void}){return <select aria-label="Report period" value={value} onChange={event=>onChange(event.target.value as ReportPeriod)}>{REPORT_PERIOD_OPTIONS.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select>}



type BalanceMovement="Add"|"Deduct";
type BalancePeriod="THIS_WEEK"|"THIS_MONTH"|"CUSTOM";
type BalanceSectionId="A"|"B"|"C"|"D";
type BalanceSectionConfig={id:BalanceSectionId;name:string;enabled:boolean;openingBalance:number;percentage:number};
type BalancePartnerKind="BP_THB"|"J_COMMISSION"|"X_SGD"|"SELF_KEY_SGD"|"SIMPLE"|"SECTIONED";
type BalancePartner={id:string;companyId:string;name:string;currency:"SGD"|"THB";kind:BalancePartnerKind;openingBalance:number;openingA?:number;openingB?:number;openingBp?:number;openingX?:number;sections?:BalanceSectionConfig[]};
type BalanceLedgerRecord={id:string;date:string;companyId:string;partner:string;movement:BalanceMovement;amount:number;description:string;reference:string;subAccount?:string;baseAmount?:number;percentage?:number;balanceX?:number;balanceJ?:number;selfKeyAmount?:number;thbAmount?:number;exchangeRate?:number};
const BALANCE_LEDGER_STORAGE_KEY="a3-partner-balance-ledger-v1";
const BALANCE_PARTNER_STORAGE_KEY="a3-balance-sheet-partners-v9";
const BALANCE_PARTNER_MIGRATION_KEY="a3-balance-sheet-partners-migration-v16";
const GLOBAL_BALANCE_SCOPE="GLOBAL";
const BP_THB_TO_MYR_RATE=7.55;
const BP_IMPORT_FROM="2023-10-01";
const BP_IMPORT_TO="2026-07-16";
type BpImportLine={date:string;description:string;thb:number};
const BP_AB0003_LINES:BpImportLine[]=[
 {date:"2023-10-31",description:"1-31 oct 2023",thb:132.21},
 {date:"2023-11-30",description:"1-30 Nov 2023",thb:509.58},
 {date:"2023-12-31",description:"1-31 dec 2023",thb:996.38},
 {date:"2024-01-31",description:"1-31 jan 2024",thb:1100.58},
 {date:"2024-02-29",description:"1-29 feb 2024",thb:-81.58},
 {date:"2024-03-31",description:"1-31 mar",thb:-216.10},
 {date:"2024-04-30",description:"1-31 apr 2024",thb:779.02},
 {date:"2024-05-31",description:"1-31 may 2024",thb:-664.89},
 {date:"2024-06-30",description:"1-31 june 2024",thb:332.85},
 {date:"2024-07-31",description:"1-31 july 2024",thb:714.01},
 {date:"2024-08-31",description:"1-31 aug 2024",thb:419.66},
 {date:"2024-09-30",description:"1-30 sep 2024",thb:262.40},
 {date:"2024-10-31",description:"1-31 oct 2024",thb:508.47},
 {date:"2024-11-30",description:"1-31 nov 2024",thb:156.69},
 {date:"2024-12-31",description:"1-31 dec 2024",thb:609.17},
 {date:"2025-01-31",description:"1-31 jan 2025",thb:605.87},
 {date:"2025-02-28",description:"1-28 Feb 2025",thb:1418.71},
 {date:"2025-03-31",description:"1-31 march",thb:127.08},
 {date:"2025-04-30",description:"1-30 apr 2025",thb:2196.82},
 {date:"2025-05-31",description:"1-31 may 2025",thb:760.73},
 {date:"2025-06-30",description:"1-30 june 2025",thb:1089.16},
 {date:"2025-07-31",description:"1-31 july 2025",thb:623.79},
 {date:"2025-08-31",description:"1-31 aug 2025",thb:876.47},
 {date:"2025-09-30",description:"1-30 sep 2025",thb:644.66},
 {date:"2025-10-31",description:"1-31 oct 2025",thb:1628.49},
 {date:"2025-11-30",description:"1-30 nov2025",thb:-1687.42},
 {date:"2025-12-31",description:"1-31 dec",thb:451.68},
 {date:"2026-01-31",description:"1-31 jan 2026",thb:747.36},
 {date:"2026-02-28",description:"1-28 feb 2026",thb:540.85},
 {date:"2026-03-31",description:"1-31 march 2026",thb:860.79},
 {date:"2026-04-30",description:"1-31 apr 2026",thb:1413.60},
 {date:"2026-05-31",description:"1-31 may 2026",thb:-1028.25},
 {date:"2026-06-30",description:"1-30 June 2026",thb:6619.16},
 {date:"2024-12-01",description:"M8 (9 oct 23 - 1 dec 24)",thb:1233.87},
 {date:"2025-02-16",description:"M8 (26 dec 24 - 16 feb 25)q",thb:2568.31},
 {date:"2026-07-16",description:"Mywbet",thb:38.84},
];
const DEFAULT_BALANCE_PARTNERS:Omit<BalancePartner,"companyId">[]=[
 {id:"BP",name:"BP",currency:"THB",kind:"BP_THB",openingBalance:0},
 {id:"J",name:"J",currency:"SGD",kind:"J_COMMISSION",openingBalance:0,openingA:0,openingB:0,openingBp:0,openingX:5877},
 {id:"X",name:"X",currency:"SGD",kind:"X_SGD",openingBalance:5877},
 {id:"HENG",name:"HENG",currency:"SGD",kind:"SELF_KEY_SGD",openingBalance:0},
 {id:"213",name:"213",currency:"SGD",kind:"SELF_KEY_SGD",openingBalance:0},
];
const BALANCE_PERIOD_OPTIONS:Array<{value:BalancePeriod;label:string}>=[{value:"THIS_WEEK",label:"This Week"},{value:"THIS_MONTH",label:"This Month"},{value:"CUSTOM",label:"Select Date"}];
const BALANCE_SECTION_IDS:BalanceSectionId[]=["A","B","C","D"];
function defaultBalanceSections(openingA=0):BalanceSectionConfig[]{return BALANCE_SECTION_IDS.map((id,index)=>({id,name:id,enabled:true,openingBalance:index===0?(Number(openingA)||0):0,percentage:0}))}
function normaliseBalanceSections(sections:BalanceSectionConfig[]|undefined,legacyOpening=0):BalanceSectionConfig[]{
 const source=Array.isArray(sections)?sections:[];
 return BALANCE_SECTION_IDS.map((id,index)=>{
  const existing=source.find(section=>section?.id===id);
  return {id,name:String(existing?.name||id).trim().toUpperCase()||id,enabled:existing?.enabled!==false,openingBalance:Number(existing?.openingBalance??(index===0?legacyOpening:0))||0,percentage:Math.max(0,Math.min(100,Number(existing?.percentage)||0))};
 });
}
function sectionRecordId(record:BalanceLedgerRecord):BalanceSectionId{return BALANCE_SECTION_IDS.includes(record.subAccount as BalanceSectionId)?record.subAccount as BalanceSectionId:"A"}
function balanceRange(period:BalancePeriod){const today=localToday();if(period==="THIS_WEEK")return {from:startOfReportPeriod("THIS_WEEK",today),to:endOfReportPeriod("THIS_WEEK",today)};if(period==="THIS_MONTH")return {from:startOfReportPeriod("THIS_MONTH",today),to:endOfReportPeriod("THIS_MONTH",today)};return {from:today,to:today}}
function balanceDateLabel(value:string){return new Intl.DateTimeFormat("en-SG",{day:"2-digit",month:"short",year:"numeric"}).format(parseLocalDate(value))}
function htmlEscape(value:string){return value.replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[char]||char))}
function signedBalanceAmount(record:BalanceLedgerRecord){const amount=Math.abs(Number(record.amount)||0);return record.movement==="Deduct"?-amount:amount}
function defaultBalancePartners(companyId:string):BalancePartner[]{return DEFAULT_BALANCE_PARTNERS.map(partner=>({...partner,companyId}))}
function createBpImportRecords(companyId:string):BalanceLedgerRecord[]{return BP_AB0003_LINES.map((line,index)=>({id:`BP-AB0003-${String(index+1).padStart(3,"0")}`,date:line.date,companyId,partner:"BP",movement:line.thb<0?"Deduct":"Add",amount:Math.abs(line.thb),description:line.description,reference:"AB0003",thbAmount:line.thb,exchangeRate:BP_THB_TO_MYR_RATE}))}
function normalisePartnerRecord(record:BalanceLedgerRecord,defaultCompanyId:string):BalanceLedgerRecord{const raw=record.movement==="Deduct"?-Math.abs(Number(record.amount)||0):Math.abs(Number(record.amount)||0);return {...record,companyId:record.companyId||defaultCompanyId,partner:String(record.partner||"X").trim().toUpperCase(),subAccount:String(record.subAccount||"").trim().toUpperCase()||undefined,baseAmount:record.baseAmount===undefined?undefined:Math.abs(Number(record.baseAmount)||0),percentage:record.percentage===undefined?undefined:Math.max(0,Math.min(100,Number(record.percentage)||0)),movement:raw<0?"Deduct":"Add",amount:Math.abs(raw),description:String(record.description||"").trim(),reference:String(record.reference||"")}}
function formatPartnerMoney(currency:"SGD"|"THB",value:number){return new Intl.NumberFormat("en-US",{style:"currency",currency,minimumFractionDigits:2,maximumFractionDigits:2}).format(value)}
function partnerPeriodLabel(period:BalancePeriod){return period==="THIS_WEEK"?"THIS WEEK":period==="THIS_MONTH"?"THIS MONTH":"SELECTED DATE"}

function BalanceSheetReport(){
 const companyId=GLOBAL_BALANCE_SCOPE;
 const storageKey=BALANCE_LEDGER_STORAGE_KEY;
 const partnerStorageKey=BALANCE_PARTNER_STORAGE_KEY;
 const migrationKey=BALANCE_PARTNER_MIGRATION_KEY;
 const [records,setRecords]=useState<BalanceLedgerRecord[]>(()=>load<BalanceLedgerRecord[]>(storageKey,[]));
 const [partners,setPartners]=useState<BalancePartner[]>(()=>load<BalancePartner[]>(partnerStorageKey,[]));
 const [activePartnerId,setActivePartnerId]=useState("X");
 const [period,setPeriod]=useState<BalancePeriod>("THIS_WEEK");
 const initialRange=balanceRange("THIS_WEEK");
 const [fromDate,setFromDate]=useState(initialRange.from);
 const [toDate,setToDate]=useState(initialRange.to);
 const [editingRecord,setEditingRecord]=useState<BalanceLedgerRecord|null>(null);
 const [editingPartner,setEditingPartner]=useState<BalancePartner|null>(null);
 const [migrationComplete,setMigrationComplete]=useState(()=>load<boolean>(migrationKey,false));

 useEffect(()=>{
  if(migrationComplete)return;
  setPartners(current=>{
   const next=defaultBalancePartners(companyId);
   current.forEach(original=>{
    const legacyKind=(original.kind||"SIMPLE") as BalancePartnerKind;
   const kind:BalancePartnerKind=legacyKind==="SIMPLE"?"SECTIONED":legacyKind;
   const clean:BalancePartner={...original,companyId,name:String(original.name||original.id).trim().toUpperCase(),kind,openingBalance:kind==="SECTIONED"?0:(Number(original.openingBalance)||0),sections:kind==="SECTIONED"?normaliseBalanceSections(original.sections,original.openingBalance):original.sections};
    const index=next.findIndex(item=>item.id===clean.id||item.name===clean.name);
    if(index>=0)next[index]={...next[index],...clean,companyId};
    else next.push(clean);
   });
   return next;
  });
  setRecords(current=>{
   const importedIds=new Set(BP_AB0003_LINES.map((_,index)=>`BP-AB0003-${String(index+1).padStart(3,"0")}`));
   const migrated:BalanceLedgerRecord[]=[];
   current.filter(record=>!importedIds.has(record.id)&&String(record.reference||"").trim().toUpperCase()!=="AB0003").forEach(original=>{
    const record=normalisePartnerRecord(original,companyId);
    const namedPartner=record.partner.toUpperCase();
    if(["BP","J","X","HENG","213"].includes(namedPartner)&&namedPartner!=="X"){
     migrated.push({...record,companyId,partner:namedPartner});
     return;
    }
    const legacyX=Number(original.balanceX??0)||0;
    let legacySelfKey=Number(original.selfKeyAmount??0)||0;
    const legacyJ=Number(original.balanceJ??0)||0;
    if(!legacySelfKey&&legacyJ)legacySelfKey=legacyJ/0.01;
    if(legacyX){migrated.push({...record,companyId,id:`${record.id}-X`,partner:"X",movement:legacyX<0?"Deduct":"Add",amount:Math.abs(legacyX),description:record.description||"Legacy X balance"})}
    if(legacySelfKey){migrated.push({...record,companyId,id:`${record.id}-J`,partner:"J",movement:legacySelfKey<0?"Deduct":"Add",amount:Math.abs(legacySelfKey),description:record.description||"Legacy self key amount"})}
    if(!legacyX&&!legacySelfKey)migrated.push({...record,companyId,partner:namedPartner==="X"?"X":namedPartner});
   });
   return [...migrated,...createBpImportRecords(companyId)];
  });
  saveNow(migrationKey,true);
  setMigrationComplete(true);
  setActivePartnerId("BP");
  setPeriod("CUSTOM");
  setFromDate(BP_IMPORT_FROM);
  setToDate(BP_IMPORT_TO);
 },[migrationComplete,migrationKey,companyId]);

 useEffect(()=>save(storageKey,records),[storageKey,records]);
 useEffect(()=>save(partnerStorageKey,partners),[partnerStorageKey,partners]);

 const companyPartners=partners.filter(partner=>partner.companyId===companyId);
 const activePartner=companyPartners.find(partner=>partner.id===activePartnerId)||companyPartners[0]||defaultBalancePartners(companyId)[0];
 useEffect(()=>{if(companyPartners.length&&!companyPartners.some(partner=>partner.id===activePartnerId))setActivePartnerId(companyPartners[0].id)},[companyId,companyPartners,activePartnerId]);

 const start=fromDate<=toDate?fromDate:toDate;
 const end=fromDate<=toDate?toDate:fromDate;
 const periodLabel=partnerPeriodLabel(period);
 const activePartnerRecords=records.filter(record=>record.companyId===companyId&&record.partner===activePartner.id).map(record=>normalisePartnerRecord(record,companyId));
 const allActiveRecords=activePartnerRecords;
 const selectedRecords=allActiveRecords.filter(record=>record.date>=start&&record.date<=end).sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
 const previousRecordAmount=allActiveRecords.filter(record=>record.date<start).reduce((sum,record)=>sum+signedBalanceAmount(record),0);
 const selectedRecordAmount=selectedRecords.reduce((sum,record)=>sum+signedBalanceAmount(record),0);
 const previousAmount=(Number(activePartner.openingBalance)||0)+previousRecordAmount;
 const totalAmount=previousAmount+selectedRecordAmount;
 const ab0003Records=records.filter(record=>record.companyId===companyId&&record.partner==="BP"&&String(record.reference||"").trim().toUpperCase()==="AB0003").map(record=>normalisePartnerRecord(record,companyId));
 const ab0003Total=ab0003Records.reduce((sum,record)=>sum+signedBalanceAmount(record),0);

 const jPreviousSelfKey=activePartner.kind==="J_COMMISSION"?previousRecordAmount:0;
 const jSelectedSelfKey=activePartner.kind==="J_COMMISSION"?selectedRecordAmount:0;
 const aBalance=(Number(activePartner.openingA)||0)+jPreviousSelfKey*0.03;
 const aPeriod=jSelectedSelfKey*0.03;
 const aTotal=aBalance+aPeriod;
 const bBalance=(Number(activePartner.openingB)||0)+jPreviousSelfKey*0.02;
 const bPeriod=jSelectedSelfKey*0.02;
 const bTotal=bBalance+bPeriod;
 const bpBalance=(Number(activePartner.openingBp)||0)+jPreviousSelfKey*0.02;
 const bpPeriod=jSelectedSelfKey*0.02;
 const bpTotal=bpBalance+bpPeriod;
 const xBalance=Number(activePartner.openingX)||0;
 const jBalance=aTotal-bTotal;
 const xPlusJTotal=xBalance+jBalance;
 const activeSections=activePartner.kind==="SECTIONED"?normaliseBalanceSections(activePartner.sections,activePartner.openingBalance).filter(section=>section.enabled):[];
 const sectionSummaries=activeSections.map(section=>{
  const sectionAll=allActiveRecords.filter(record=>sectionRecordId(record)===section.id);
  const sectionPrevious=sectionAll.filter(record=>record.date<start).reduce((sum,record)=>sum+signedBalanceAmount(record),0);
  const sectionSelected=sectionAll.filter(record=>record.date>=start&&record.date<=end).reduce((sum,record)=>sum+signedBalanceAmount(record),0);
  return {...section,balance:section.openingBalance+sectionPrevious,periodAmount:sectionSelected,total:section.openingBalance+sectionPrevious+sectionSelected};
 });
 const sectionGrandTotal=sectionSummaries.reduce((sum,section)=>sum+section.total,0);

 const setBalancePeriod=(next:BalancePeriod)=>{setPeriod(next);if(next!=="CUSTOM"){const range=balanceRange(next);setFromDate(range.from);setToDate(range.to)}};
 const showAllRecords=()=>{setPeriod("CUSTOM");setFromDate(BP_IMPORT_FROM);setToDate(localToday())};
 const showAb0003Records=()=>{setActivePartnerId("BP");setPeriod("CUSTOM");setFromDate(BP_IMPORT_FROM);setToDate(BP_IMPORT_TO)};
 const openNewRecord=()=>{
  const defaultSection=activeSections[0];
  setEditingRecord({id:"",date:end,companyId,partner:activePartner.id,movement:"Add",amount:0,description:"",reference:"",subAccount:activePartner.kind==="SECTIONED"?(defaultSection?.id||"A"):undefined,baseAmount:activePartner.kind==="SECTIONED"?0:undefined,percentage:activePartner.kind==="SECTIONED"?(defaultSection?.percentage||0):undefined});
 };
 const openNewXBpRecord=()=>{setActivePartnerId("BP");setEditingRecord({id:"",date:end,companyId,partner:"BP",movement:"Add",amount:0,description:"",reference:"",exchangeRate:BP_THB_TO_MYR_RATE})};
 const editRecord=(record:BalanceLedgerRecord)=>{
  const clean=normalisePartnerRecord(record,companyId);
  const section=activeSections.find(item=>item.id===sectionRecordId(clean));
  setEditingRecord({...clean,subAccount:activePartner.kind==="SECTIONED"?sectionRecordId(clean):clean.subAccount,percentage:activePartner.kind==="SECTIONED"?Number(clean.percentage??section?.percentage??0):clean.percentage,baseAmount:activePartner.kind==="SECTIONED"?Number(clean.baseAmount)||0:clean.baseAmount,amount:Math.abs(Number(clean.amount)||0)});
 };
 const commitRecord=(record:BalanceLedgerRecord)=>{
  const amount=Math.abs(Number(record.amount)||0);
  if(!record.date||!record.description.trim()||amount===0)return false;
  const signedAmount=record.movement==="Deduct"?-amount:amount;
  const subAccount=activePartner.kind==="SECTIONED"?sectionRecordId(record):undefined;
  const clean:BalanceLedgerRecord={...record,companyId,partner:activePartner.id,subAccount,movement:record.movement||"Add",amount,description:record.description.trim(),reference:record.reference||"",baseAmount:activePartner.kind==="SECTIONED"?Math.abs(Number(record.baseAmount)||0):undefined,percentage:activePartner.kind==="SECTIONED"?Math.max(0,Math.min(100,Number(record.percentage)||0)):undefined,balanceX:undefined,balanceJ:undefined,selfKeyAmount:undefined,thbAmount:activePartner.currency==="THB"?signedAmount:undefined,exchangeRate:activePartner.currency==="THB"?BP_THB_TO_MYR_RATE:undefined};
  setRecords(current=>clean.id?current.map(item=>item.id===clean.id?clean:item):[{...clean,id:`BAL-${Date.now()}`},...current]);
  setEditingRecord(null);
  return true;
 };
 const removeRecord=(record:BalanceLedgerRecord)=>{const label=record.subAccount?`${activePartner.name} → ${record.subAccount}`:activePartner.name;if(confirm(`Delete this ${label} record?`))setRecords(current=>current.filter(item=>item.id!==record.id))};

 const openNewPartner=()=>setEditingPartner({id:"",companyId,name:"",currency:"SGD",kind:"SECTIONED",openingBalance:0,sections:defaultBalanceSections()});
 const editPartner=()=>setEditingPartner({...activePartner});
 const commitPartner=(partner:BalancePartner)=>{
  const name=partner.name.trim().toUpperCase();
  if(!name)return false;
  const duplicate=partners.some(item=>item.companyId===companyId&&item.id!==partner.id&&item.name.trim().toUpperCase()===name);
  if(duplicate)return false;
  const kind:BalancePartnerKind=partner.id?partner.kind:"SECTIONED";
  const sections=kind==="SECTIONED"?normaliseBalanceSections(partner.sections,partner.openingBalance):partner.sections;
  if(kind==="SECTIONED"&&!sections?.some(section=>section.enabled))return false;
  const clean:BalancePartner={...partner,id:partner.id||`PARTNER-${Date.now()}`,companyId,name,currency:partner.currency,kind,openingBalance:kind==="SECTIONED"?0:(Number(partner.openingBalance)||0),openingA:Number(partner.openingA)||0,openingB:Number(partner.openingB)||0,openingBp:Number(partner.openingBp)||0,openingX:Number(partner.openingX)||0,sections};
  setPartners(current=>partner.id?current.map(item=>item.companyId===companyId&&item.id===partner.id?clean:item):[...current,clean]);
  setActivePartnerId(clean.id);
  setEditingPartner(null);
  return true;
 };
 const removePartner=()=>{
  if(!confirm(`Delete partner ${activePartner.name} and all of its balance records?`))return;
  setPartners(current=>current.filter(item=>!(item.companyId===companyId&&item.id===activePartner.id)));
  setRecords(current=>current.filter(item=>!(item.companyId===companyId&&item.partner===activePartner.id)));
 };

 const money=(value:number)=>formatPartnerMoney(activePartner.currency,value);
 const bpMoney=(value:number)=>formatPartnerMoney("THB",value);
 const editingIsXBp=false;
 const editingCurrency=activePartner.currency;
 const recordInputLabel=activePartner.kind==="J_COMMISSION"||activePartner.kind==="SELF_KEY_SGD"?`Self Key Amount (${activePartner.currency})`:`Amount (${activePartner.currency})`;
 const editingRecordInputLabel=recordInputLabel;
 const simpleLabels=activePartner.kind==="BP_THB"?{balance:"BALANCE",period:periodLabel,total:"TOTAL"}:activePartner.kind==="X_SGD"?{balance:"X BALANCE",period:`X ${periodLabel}`,total:"X TOTAL"}:activePartner.kind==="SELF_KEY_SGD"?{balance:"A BALANCE",period:`A ${periodLabel} · TOTAL SELF KEY AMOUNT`,total:"A TOTAL"}:{balance:"BALANCE",period:periodLabel,total:"TOTAL"};

 const statementLines=()=>{
  const base=[`PARTNER ${activePartner.name} (${activePartner.currency})`,`SHOW DATE = ${balanceDateLabel(start)} TO ${balanceDateLabel(end)}`,""];
  if(activePartner.kind==="J_COMMISSION")return [...base,
   `A BALANCE: ${money(aBalance)}`,
   `A ${periodLabel}: ${money(aPeriod)}`,
   `A TOTAL: ${money(aTotal)}`,"",
   `B BALANCE: ${money(bBalance)}`,
   `B ${periodLabel}: ${money(bPeriod)}`,
   `B TOTAL: ${money(bTotal)}`,"",
   `BP BALANCE: ${money(bpBalance)}`,
   `BP ${periodLabel}: ${money(bpPeriod)}`,
   `BP TOTAL: ${money(bpTotal)}`,"",
   `X BALANCE: ${money(xBalance)}`,
   `J BALANCE: ${money(jBalance)}`,
   `X + J TOTAL: ${money(xPlusJTotal)}`];
  if(activePartner.kind==="SECTIONED")return [...base,...sectionSummaries.flatMap(section=>[
   `${section.name} BALANCE: ${money(section.balance)}`,
   `${section.name} ${periodLabel}: ${money(section.periodAmount)}`,
   `${section.name} PERCENTAGE: ${section.percentage}%`,
   `${section.name} TOTAL: ${money(section.total)}`,""
  ]),`GRAND TOTAL: ${money(sectionGrandTotal)}`];
  const lines=[...base,`${simpleLabels.balance}: ${money(previousAmount)}`,`${simpleLabels.period}: ${money(selectedRecordAmount)}`,`${simpleLabels.total}: ${money(totalAmount)}`];
  return lines;
 };
 const shareSelected=(channel:"whatsapp"|"telegram"|"wechat")=>{
  const text=statementLines().join("\n");
  if(channel==="whatsapp"){window.open(`https://wa.me/?text=${encodeURIComponent(text)}`,"_blank","noopener,noreferrer");return}
  if(channel==="telegram"){window.open(`https://t.me/share/url?url=&text=${encodeURIComponent(text)}`,"_blank","noopener,noreferrer");return}
  void navigator.clipboard?.writeText(text);
  window.open("weixin://","_blank","noopener,noreferrer");
  alert("Partner statement copied. Open WeChat and paste it to the recipient.");
 };
 const exportSelected=()=>{
  const recordRows:(string|number)[][]=activePartner.kind==="SECTIONED"?[["Date","Section","Description","Base Amount","Percentage","Amount"],...selectedRecords.map(record=>[record.date,sectionRecordId(record),record.description,Number(record.baseAmount)||0,Number(record.percentage)||0,signedBalanceAmount(record)])]:[["Date","Description",recordInputLabel],...selectedRecords.map(record=>[record.date,record.description,signedBalanceAmount(record)])];
  const rows:(string|number)[][]=[["Independent Partner Balance Sheet"],[`Partner ${activePartner.name}`],["Currency",activePartner.currency],["Date From",start],["Date To",end],[],...recordRows,[]];
  if(activePartner.kind==="J_COMMISSION")rows.push(["A Balance",aBalance],[`A ${periodLabel}`,aPeriod],["A Total",aTotal],["B Balance",bBalance],[`B ${periodLabel}`,bPeriod],["B Total",bTotal],["BP Balance",bpBalance],[`BP ${periodLabel}`,bpPeriod],["BP Total",bpTotal],["X Balance",xBalance],["J Balance",jBalance],["X + J Total",xPlusJTotal]);
  else if(activePartner.kind==="SECTIONED"){sectionSummaries.forEach(section=>rows.push([`${section.name} Balance`,section.balance],[`${section.name} ${periodLabel}`,section.periodAmount],[`${section.name} Percentage`,section.percentage],[`${section.name} Total`,section.total]));rows.push(["Grand Total",sectionGrandTotal])}
  else rows.push([simpleLabels.balance,previousAmount],[simpleLabels.period,selectedRecordAmount],[simpleLabels.total,totalAmount]);
  downloadCsvFile(`${activePartner.name.toLowerCase()}-balance-${start}-to-${end}.csv`,rows);
 };
 const printSelected=()=>{
  const recordRows=selectedRecords.length?selectedRecords.map(record=>activePartner.kind==="SECTIONED"?`<tr><td>${htmlEscape(balanceDateLabel(record.date))}</td><td>${htmlEscape(sectionRecordId(record))}</td><td>${htmlEscape(record.description)}</td><td>${htmlEscape(money(Number(record.baseAmount)||0))}</td><td>${htmlEscape(String(Number(record.percentage)||0))}%</td><td>${htmlEscape(money(signedBalanceAmount(record)))}</td></tr>`:`<tr><td>${htmlEscape(balanceDateLabel(record.date))}</td><td>${htmlEscape(record.description)}</td><td>${htmlEscape(money(signedBalanceAmount(record)))}</td></tr>`).join(""):`<tr><td colspan="${activePartner.kind==="SECTIONED"?6:3}">No records for this date range.</td></tr>`;
  const sectionPrintSummary=sectionSummaries.map(section=>`<div class="group"><h2>${htmlEscape(section.name)}</h2><div><span>${htmlEscape(section.name)} Balance</span><strong>${htmlEscape(money(section.balance))}</strong></div><div><span>${htmlEscape(section.name)} ${htmlEscape(periodLabel)}</span><strong>${htmlEscape(money(section.periodAmount))}</strong></div><div><span>Percentage</span><strong>${htmlEscape(String(section.percentage))}%</strong></div><div class="total"><span>${htmlEscape(section.name)} Total</span><strong>${htmlEscape(money(section.total))}</strong></div></div>`).join("");
  const summary=activePartner.kind==="J_COMMISSION"?`<div class="group"><h2>A</h2><div><span>A Balance</span><strong>${htmlEscape(money(aBalance))}</strong></div><div><span>A ${htmlEscape(periodLabel)}</span><strong>${htmlEscape(money(aPeriod))}</strong></div><div class="total"><span>A Total</span><strong>${htmlEscape(money(aTotal))}</strong></div></div><div class="group"><h2>B</h2><div><span>B Balance</span><strong>${htmlEscape(money(bBalance))}</strong></div><div><span>B ${htmlEscape(periodLabel)}</span><strong>${htmlEscape(money(bPeriod))}</strong></div><div class="total"><span>B Total</span><strong>${htmlEscape(money(bTotal))}</strong></div></div><div class="group"><h2>BP</h2><div><span>BP Balance</span><strong>${htmlEscape(money(bpBalance))}</strong></div><div><span>BP ${htmlEscape(periodLabel)}</span><strong>${htmlEscape(money(bpPeriod))}</strong></div><div class="total"><span>BP Total</span><strong>${htmlEscape(money(bpTotal))}</strong></div></div><div class="final"><div><span>X Balance</span><strong>${htmlEscape(money(xBalance))}</strong></div><div><span>J Balance</span><strong>${htmlEscape(money(jBalance))}</strong></div><div><span>X + J Total</span><strong>${htmlEscape(money(xPlusJTotal))}</strong></div></div>`:activePartner.kind==="SECTIONED"?`${sectionPrintSummary}<div class="final"><div><span>Grand Total</span><strong>${htmlEscape(money(sectionGrandTotal))}</strong></div></div>`:`<div class="group single"><h2>${htmlEscape(activePartner.name)}</h2><div><span>${htmlEscape(simpleLabels.balance)}</span><strong>${htmlEscape(money(previousAmount))}</strong></div><div><span>${htmlEscape(simpleLabels.period)}</span><strong>${htmlEscape(money(selectedRecordAmount))}</strong></div><div class="total"><span>${htmlEscape(simpleLabels.total)}</span><strong>${htmlEscape(money(totalAmount))}</strong></div></div>`;
  const popup=window.open("","_blank","width=1000,height=850");
  if(!popup)return;
  popup.document.write(`<!doctype html><html><head><title>${htmlEscape(activePartner.name)} Balance Sheet</title><style>*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#172033;margin:28px}.header{display:flex;justify-content:space-between;align-items:end;border-bottom:3px solid #172033;padding-bottom:13px}.header span{font-size:10px;letter-spacing:.13em;color:#697386}.header h1{margin:4px 0 0;font-size:25px}.range{display:flex;justify-content:space-between;gap:18px;margin:15px 0;padding:10px 12px;background:#f3f5f7;border-radius:7px;font-size:11px}.groups{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.group{border:1px solid #dfe4ea;border-radius:8px;overflow:hidden}.group.single{max-width:620px}.group.bpgroup{border-color:#9a7b2f}.group.bpgroup h2{background:#6f5518}.group h2{margin:0;padding:9px 11px;background:#172033;color:#fff;font-size:12px}.group>div,.final>div{display:flex;justify-content:space-between;gap:16px;padding:9px 11px;border-top:1px solid #e5e9ee;font-size:11px}.group .total{background:#f1f4f7}.final{grid-column:1/-1;border:2px solid #172033;border-radius:8px;margin-top:10px}.final div:last-child{background:#172033;color:#fff}.final div:last-child strong{font-size:18px}.tabletitle{font-size:12px;margin:22px 0 -10px;padding-top:12px;border-top:2px solid #172033}table{width:100%;border-collapse:collapse;margin-top:18px}th,td{padding:7px 6px;border-bottom:1px solid #e0e5ea;font-size:9px;text-align:left}th:last-child,td:last-child{text-align:right}th{background:#f0f3f6;text-transform:uppercase;font-size:8px}@page{size:A4 portrait;margin:10mm}@media print{body{margin:0}.group,.final,tr{break-inside:avoid}}</style></head><body><div class="header"><div><span>INDEPENDENT PARTNER BALANCE SHEET</span><h1>Partner ${htmlEscape(activePartner.name)} (${htmlEscape(activePartner.currency)})</h1></div></div><div class="range"><strong>SHOW DATE = ${htmlEscape(balanceDateLabel(start))}</strong><strong>TO ${htmlEscape(balanceDateLabel(end))}</strong>${period==="THIS_WEEK"?"<strong>MONDAY TO SUNDAY</strong>":""}</div><div class="groups">${summary}</div><h2 class="tabletitle">${htmlEscape(activePartner.name)} RECORDS (${htmlEscape(activePartner.currency)})</h2><table><thead><tr>${activePartner.kind==="SECTIONED"?`<th>Date</th><th>Section</th><th>Description</th><th>Base Amount</th><th>Percentage</th><th>Amount</th>`:`<th>Date</th><th>Description</th><th>${htmlEscape(recordInputLabel)}</th>`}</tr></thead><tbody>${recordRows}</tbody></table><script>window.onload=()=>window.print()</script></body></html>`);
  popup.document.close();
 };

 return <><Heading eyebrow="REPORT · PARTNER BALANCE" title="Partner Balance Sheet" copy="Five default partners with fully independent records, calculations and statements. AB0003 belongs only to BP. Add more partners at any time." action="Add Partner" onAction={openNewPartner}/>
 <div className="documenttoolbar reportfilters">
  <strong className="companyscopebadge">Independent Balance Sheet</strong>
  <select aria-label="Balance period" value={period} onChange={event=>setBalancePeriod(event.target.value as BalancePeriod)}>{BALANCE_PERIOD_OPTIONS.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select>
  <label className="datefilterlabel">From<input aria-label="Balance date from" type="date" value={fromDate} disabled={period!=="CUSTOM"} onChange={event=>setFromDate(event.target.value)}/></label>
  <label className="datefilterlabel">To<input aria-label="Balance date to" type="date" value={toDate} disabled={period!=="CUSTOM"} onChange={event=>setToDate(event.target.value)}/></label>
  <button className="ghost" onClick={showAllRecords}><Eye size={17}/>Show All Records</button>
 </div>

 <div className="partnerselector">{companyPartners.map(partner=>{
  const partnerRecords=records.filter(record=>record.companyId===companyId&&record.partner===partner.id&&record.date<=end);
  const recordTotal=partnerRecords.reduce((sum,record)=>sum+signedBalanceAmount(record),0);
  const partnerTotal=partner.kind==="J_COMMISSION"?(Number(partner.openingX)||0)+(Number(partner.openingA)||0)+recordTotal*0.03-((Number(partner.openingB)||0)+recordTotal*0.02):partner.kind==="SECTIONED"?normaliseBalanceSections(partner.sections,partner.openingBalance).filter(section=>section.enabled).reduce((sum,section)=>sum+section.openingBalance+partnerRecords.filter(record=>sectionRecordId(record)===section.id).reduce((sectionSum,record)=>sectionSum+signedBalanceAmount(record),0),0):(Number(partner.openingBalance)||0)+recordTotal;
  return <button key={`${partner.companyId}-${partner.id}`} className={activePartner.id===partner.id?"active":""} onClick={()=>setActivePartnerId(partner.id)}><span>PARTNER</span><strong>{partner.name}</strong><small>{partner.currency} · {formatPartnerMoney(partner.currency,partnerTotal)}</small></button>
 })}</div>

 <div className="panel partnerstatement">
  <div className="panelhead"><div><span>INDIVIDUAL PARTNER RECORD</span><h2>Partner {activePartner.name} ({activePartner.currency})</h2></div><div className="rowactions"><button className="ghost" onClick={editPartner}><Pencil size={16}/>Edit Partner</button><button className="ghost danger" onClick={removePartner}><Trash2 size={16}/>Delete Partner</button></div></div>
  <div className="statementrange"><strong>SHOW DATE = {balanceDateLabel(start)}</strong><strong>TO {balanceDateLabel(end)}</strong>{period==="THIS_WEEK"&&<strong>MONDAY TO SUNDAY</strong>}</div>

  {activePartner.id==="BP"&&<div className="sharenotice">AB0003: {ab0003Records.length} records · {bpMoney(ab0003Total)} <button className="ghost" onClick={showAb0003Records}><Eye size={15}/>View AB0003</button></div>}

  {activePartner.kind==="J_COMMISSION"?<>
   <div className="jpartnergrid">
    <section><h3>A</h3><div><span>A Balance</span><strong>{money(aBalance)}</strong></div><div><span>A {periodLabel}</span><strong>{money(aPeriod)}</strong></div><small>Percentage: 3%</small><div className="sectiontotal"><span>A Total</span><strong>{money(aTotal)}</strong></div></section>
    <section><h3>B</h3><div><span>B Balance</span><strong>{money(bBalance)}</strong></div><div><span>B {periodLabel}</span><strong>{money(bPeriod)}</strong></div><small>Percentage: 2%</small><div className="sectiontotal"><span>B Total</span><strong>{money(bTotal)}</strong></div></section>
    <section><h3>BP</h3><div><span>BP Balance</span><strong>{money(bpBalance)}</strong></div><div><span>BP {periodLabel}</span><strong>{money(bpPeriod)}</strong></div><small>Percentage: 2%</small><div className="sectiontotal"><span>BP Total</span><strong>{money(bpTotal)}</strong></div></section>
   </div>
   <div className="jpartnerfinal"><div><span>X Balance</span><strong>{money(xBalance)}</strong></div><div><span>J Balance</span><strong>{money(jBalance)}</strong><small>Total A - Total B</small></div><div className="grand"><span>X + J Total</span><strong>{money(xPlusJTotal)}</strong></div></div>
  </>:activePartner.kind==="SECTIONED"?<><div className="sectionpartnergrid">{sectionSummaries.map(section=><section key={section.id}><h3>{section.name}</h3><div><span>{section.name} Balance</span><strong>{money(section.balance)}</strong></div><div><span>{section.name} {periodLabel}</span><strong>{money(section.periodAmount)}</strong></div><div><span>Percentage</span><strong>{section.percentage}%</strong></div><div className="sectiontotal"><span>{section.name} Total</span><strong>{money(section.total)}</strong></div></section>)}</div><div className="sectionpartnergrand"><span>Grand Total</span><strong>{money(sectionGrandTotal)}</strong></div></>:<div className="simplepartnerbalance"><div><span>{simpleLabels.balance}</span><strong>{money(previousAmount)}</strong></div><div><span>{simpleLabels.period}</span><strong>{money(selectedRecordAmount)}</strong>{activePartner.kind==="SELF_KEY_SGD"&&<small>Total Amount Self Key</small>}</div><div className="grand"><span>{simpleLabels.total}</span><strong>{money(totalAmount)}</strong></div></div>}

  <div className="partneractions"><button className="ghost" onClick={exportSelected}><Download size={16}/>CSV</button><button className="ghost" onClick={printSelected}><Printer size={16}/>Print / PDF</button><button className="ghost" onClick={()=>shareSelected("whatsapp")}><MessageCircle size={16}/>WhatsApp</button><button className="ghost" onClick={()=>shareSelected("telegram")}><Send size={16}/>Telegram</button><button className="ghost" onClick={()=>shareSelected("wechat")}><MessageCircle size={16}/>WeChat</button><button className="primary" onClick={openNewRecord}><Plus size={16}/>Add Record</button></div>
  <div className="recordsectiontitle"><span>{activePartner.name} RECORDS ({activePartner.currency})</span></div>
  <div className="tablewrap partnerrecordtable"><table><thead><tr>{activePartner.kind==="SECTIONED"?<><th>Date</th><th>Section</th><th>Description</th><th>Base Amount</th><th>Percentage</th><th>Amount</th><th>Actions</th></>:<><th>Date</th><th>Description</th><th>{recordInputLabel}</th><th>Actions</th></>}</tr></thead><tbody>{selectedRecords.length?selectedRecords.map(record=><tr key={record.id}>{activePartner.kind==="SECTIONED"?<><td>{balanceDateLabel(record.date)}</td><td>{sectionRecordId(record)}</td><td>{record.description}</td><td>{money(Number(record.baseAmount)||0)}</td><td>{Number(record.percentage)||0}%</td><td className={signedBalanceAmount(record)<0?"negativeamount":""}>{money(signedBalanceAmount(record))}</td><td><div className="rowactions"><button className="rowaction" onClick={()=>editRecord(record)}><Pencil size={14}/>Edit</button><button className="rowaction danger" onClick={()=>removeRecord(record)}><Trash2 size={14}/>Delete</button></div></td></>:<><td>{balanceDateLabel(record.date)}</td><td>{record.description}</td><td className={signedBalanceAmount(record)<0?"negativeamount":""}>{money(signedBalanceAmount(record))}</td><td><div className="rowactions"><button className="rowaction" onClick={()=>editRecord(record)}><Pencil size={14}/>Edit</button><button className="rowaction danger" onClick={()=>removeRecord(record)}><Trash2 size={14}/>Delete</button></div></td></>}</tr>):<tr><td colSpan={activePartner.kind==="SECTIONED"?7:4}>No {activePartner.name} records from {start} to {end}.</td></tr>}</tbody></table></div>
 </div>

 {editingRecord&&<RecordModal title={editingRecord.id?`Edit ${activePartner.name} record`:`Add ${activePartner.name} record`} onCancel={()=>setEditingRecord(null)} onSave={()=>commitRecord(editingRecord)}>
  <label>Date<input type="date" value={editingRecord.date} onChange={event=>setEditingRecord({...editingRecord,date:event.target.value})}/></label>
  <label>Currency<input readOnly value={editingCurrency}/></label>
  <label>Transaction Type<select value={editingRecord.movement} onChange={event=>setEditingRecord({...editingRecord,movement:event.target.value as BalanceMovement})}><option value="Add">Add Amount</option><option value="Deduct">Deduct Amount</option></select></label>
  {activePartner.kind==="SECTIONED"&&<label>Section<select value={sectionRecordId(editingRecord)} onChange={event=>{const subAccount=event.target.value as BalanceSectionId;const section=activeSections.find(item=>item.id===subAccount);const percentage=Number(section?.percentage)||0;const baseAmount=Number(editingRecord.baseAmount)||0;setEditingRecord({...editingRecord,subAccount,percentage,amount:baseAmount?Math.abs(baseAmount*percentage/100):editingRecord.amount})}}>{activeSections.map(section=><option key={section.id} value={section.id}>{section.name}</option>)}</select></label>}
  <label className="wide">Description<input autoFocus value={editingRecord.description} onChange={event=>setEditingRecord({...editingRecord,description:event.target.value})} placeholder="Description"/></label>
  {activePartner.kind==="SECTIONED"?<>
   <label>Base Amount ({editingCurrency})<input type="number" min="0" step="0.01" value={editingRecord.baseAmount??""} onChange={event=>{const baseAmount=Math.abs(Number(event.target.value)||0);const percentage=Number(editingRecord.percentage)||0;setEditingRecord({...editingRecord,baseAmount,amount:baseAmount?Number((baseAmount*percentage/100).toFixed(2)):editingRecord.amount})}} placeholder="Optional base amount"/></label>
   <label>Percentage (%)<input type="number" min="0" max="100" step="0.01" value={editingRecord.percentage??""} onChange={event=>{const percentage=Math.max(0,Math.min(100,Number(event.target.value)||0));const baseAmount=Number(editingRecord.baseAmount)||0;setEditingRecord({...editingRecord,percentage,amount:baseAmount?Number((baseAmount*percentage/100).toFixed(2)):editingRecord.amount})}} placeholder="0"/></label>
   <label>Calculated Amount<input readOnly value={money((Number(editingRecord.baseAmount)||0)*(Number(editingRecord.percentage)||0)/100)}/></label>
   <label>Editable Amount ({editingCurrency})<input type="number" min="0.01" step="0.01" value={editingRecord.amount??""} onChange={event=>setEditingRecord({...editingRecord,amount:Math.abs(Number(event.target.value)||0)})} placeholder="Enter or adjust amount"/></label>
  </>:<label className="wide">{editingRecordInputLabel}<input type="number" min="0.01" step="0.01" value={editingRecord.amount??""} onChange={event=>setEditingRecord({...editingRecord,amount:Number(event.target.value)})} placeholder="Enter amount"/></label>}
  {activePartner.kind==="J_COMMISSION"&&<div className="wide modalcalculation"><span>A · 3%</span><strong>{money((Number(editingRecord.amount)||0)*0.03)}</strong><span>B · 2%</span><strong>{money((Number(editingRecord.amount)||0)*0.02)}</strong><span>BP · 2%</span><strong>{money((Number(editingRecord.amount)||0)*0.02)}</strong></div>}
 </RecordModal>}

 {editingPartner&&<RecordModal title={editingPartner.id?`Edit partner ${editingPartner.name}`:"Add partner"} onCancel={()=>setEditingPartner(null)} onSave={()=>commitPartner(editingPartner)} className={editingPartner.kind==="SECTIONED"?"widepartnereditor":""}>
  <label className="wide">Partner Name<input autoFocus value={editingPartner.name} onChange={event=>setEditingPartner({...editingPartner,name:event.target.value})} placeholder="Partner name"/></label>
  <label>Currency<select value={editingPartner.currency} disabled={editingPartner.kind!=="SIMPLE"&&editingPartner.kind!=="SECTIONED"} onChange={event=>setEditingPartner({...editingPartner,currency:event.target.value as "SGD"|"THB"})}><option value="SGD">SGD</option><option value="THB">THB</option></select></label>
  {editingPartner.kind!=="J_COMMISSION"&&editingPartner.kind!=="SECTIONED"&&<label>Opening Balance<input type="number" step="0.01" value={editingPartner.openingBalance??""} onChange={event=>setEditingPartner({...editingPartner,openingBalance:Number(event.target.value)})}/></label>}
  {editingPartner.kind==="J_COMMISSION"&&<><label>A Balance<input type="number" step="0.01" value={editingPartner.openingA??""} onChange={event=>setEditingPartner({...editingPartner,openingA:Number(event.target.value)})}/></label><label>B Balance<input type="number" step="0.01" value={editingPartner.openingB??""} onChange={event=>setEditingPartner({...editingPartner,openingB:Number(event.target.value)})}/></label><label>BP Balance<input type="number" step="0.01" value={editingPartner.openingBp??""} onChange={event=>setEditingPartner({...editingPartner,openingBp:Number(event.target.value)})}/></label><label>X Balance<input type="number" step="0.01" value={editingPartner.openingX??""} onChange={event=>setEditingPartner({...editingPartner,openingX:Number(event.target.value)})}/></label></>}
  {editingPartner.kind==="SECTIONED"&&<div className="wide partnersectioneditor"><div className="partnersectionhead"><strong>Record Sections A / B / C / D</strong><span>Set each section name, opening balance and percentage. These values can be edited later.</span></div><div className="partnersectionrows">{normaliseBalanceSections(editingPartner.sections,editingPartner.openingBalance).map(section=><div className="partnersectionrow" key={section.id}><label className="sectiontoggle"><input type="checkbox" checked={section.enabled} onChange={event=>setEditingPartner({...editingPartner,sections:normaliseBalanceSections(editingPartner.sections,editingPartner.openingBalance).map(item=>item.id===section.id?{...item,enabled:event.target.checked}:item)})}/><strong>{section.id}</strong></label><label>Section Name<input value={section.name} onChange={event=>setEditingPartner({...editingPartner,sections:normaliseBalanceSections(editingPartner.sections,editingPartner.openingBalance).map(item=>item.id===section.id?{...item,name:event.target.value}:item)})}/></label><label>Opening Balance ({editingPartner.currency})<input type="number" step="0.01" value={section.openingBalance??""} onChange={event=>setEditingPartner({...editingPartner,sections:normaliseBalanceSections(editingPartner.sections,editingPartner.openingBalance).map(item=>item.id===section.id?{...item,openingBalance:Number(event.target.value)}:item)})}/></label><label>Percentage (%)<input type="number" min="0" max="100" step="0.01" value={section.percentage??""} onChange={event=>setEditingPartner({...editingPartner,sections:normaliseBalanceSections(editingPartner.sections,editingPartner.openingBalance).map(item=>item.id===section.id?{...item,percentage:Math.max(0,Math.min(100,Number(event.target.value)||0))}:item)})}/></label></div>)}</div></div>}
  <label className="wide">Record Type<input readOnly value={editingPartner.kind==="J_COMMISSION"?"J Commission · A 3%, B 2%, BP 2%":editingPartner.kind==="SECTIONED"?"A / B / C / D Sections with Editable Amount and Percentage":editingPartner.kind==="SELF_KEY_SGD"?"Self Key Amount":editingPartner.kind==="BP_THB"?"THB Balance":editingPartner.kind==="X_SGD"?"X Balance":"Standard Balance"}/></label>
 </RecordModal>}
 </>
}

function FinancialReports(){
 const access=useCompanyAccess();
 const allCompanies=useMemo(()=>{const loaded=load<Partial<CompanyRecord>[]>("a3-company-settings",companyDefaults).map(normaliseCompany);return loaded.length?loaded:companyDefaults},[]);
 const companies=scopedCompanies(allCompanies,access);
 const [companyId,setCompanyId]=useState(companies[0]?.id||companyDefaults[0].id);
 const [period,setPeriod]=useState<ProfitLossPeriod>("THIS_MONTH");
 const company=companies.find(item=>item.id===companyId)||companies[0]||companyDefaults[0];
 const format=useMemo(()=>new Intl.NumberFormat("en-US",{style:"currency",currency:company.currency||"SGD",minimumFractionDigits:2,maximumFractionDigits:2}),[company.currency]);
 const fmt=(value:number)=>format.format(value);
 const periodLabel=reportPeriodLabel(period);
 const inPeriod=(date:string)=>dateInReportPeriod(date,period);
 const income=load<IncomeRecord[]>(scopedStorageKey(INCOME_STORAGE_KEY,access),access.isAllCompanies?incomeRecordDefaults:[]).map(record=>({...record,companyId:record.companyId||companyDefaults[0].id,amount:Number(record.amount)||0})).filter(record=>record.companyId===companyId&&inPeriod(record.date));
 const expenses=load<Partial<ExpenseRecord>[]>(scopedStorageKey(EXPENSE_STORAGE_KEY,access),access.isAllCompanies?expenseRecordDefaults:[]).map(normalizeExpenseRecord).filter(record=>record.companyId===companyId&&inPeriod(record.date));
 const invoices=normalizeDocumentRecords(load(scopedStorageKey(documentStorageKey("invoice"),access),access.isAllCompanies?defaultDocumentRecords("invoice"):[]),"invoice").filter(record=>record.companyId===companyId&&inPeriod(record.date));
 const quotations=normalizeDocumentRecords(load(scopedStorageKey(documentStorageKey("quotation"),access),access.isAllCompanies?defaultDocumentRecords("quotation"):[]),"quotation").filter(record=>record.companyId===companyId&&inPeriod(record.date));
 const receivedIncome=income.filter(record=>record.status==="Received");
 const pendingIncome=income.filter(record=>record.status==="Pending");
 const revenue=receivedIncome.reduce((sum,record)=>sum+record.amount,0);
 const pendingIncomeTotal=pendingIncome.reduce((sum,record)=>sum+record.amount,0);
 const totalExpenses=expenses.reduce((sum,record)=>sum+record.amount,0);
 const netProfit=revenue-totalExpenses;
 const activeInvoices=invoices.filter(record=>record.status!=="Cancelled");
 const invoiceTotal=activeInvoices.reduce((sum,record)=>sum+calculateDocumentTotals(record).total,0);
 const paidInvoiceTotal=activeInvoices.filter(record=>record.status==="Paid").reduce((sum,record)=>sum+calculateDocumentTotals(record).total,0);
 const outstandingInvoiceTotal=activeInvoices.filter(record=>record.status!=="Paid").reduce((sum,record)=>sum+calculateDocumentTotals(record).total,0);
 const activeQuotations=quotations.filter(record=>!["Rejected","Expired","Cancelled","Paid"].includes(record.status));
 const quotationTotal=activeQuotations.reduce((sum,record)=>sum+calculateDocumentTotals(record).total,0);
 const acceptedQuotationTotal=activeQuotations.filter(record=>record.status==="Accepted").reduce((sum,record)=>sum+calculateDocumentTotals(record).total,0);
 const tally=(rows:{label:string;amount:number}[],label:string)=>{const values=new Map<string,number>();rows.forEach(row=>values.set(row.label,(values.get(row.label)||0)+row.amount));return [...values.entries()].map(([name,amount])=>({name,amount})).sort((a,b)=>b.amount-a.amount).concat([{name:label,amount:rows.reduce((sum,row)=>sum+row.amount,0)}])};
 const incomeBreakdown=tally(receivedIncome.map(record=>({label:record.source||"Other Income",amount:record.amount})),"Total Recognized Revenue");
 const expenseBreakdown=tally(expenses.map(record=>({label:record.category||"Other",amount:record.amount})),"Total Expenses");
 const netLabel=netProfit>=0?"Net Profit":"Net Loss";
 return <>
  <Heading eyebrow="REPORT · FINANCIAL CONTROL" title="Profit & Loss" copy="Live totals from saved income and expense records. Every report can be viewed for today, this week, this month or this year."/>
  <div className="documenttoolbar reportfilters">{access.isAllCompanies?<select value={companyId} onChange={event=>setCompanyId(event.target.value)}>{companies.map(item=><option key={item.id} value={item.id}>{item.company}</option>)}</select>:<strong className="companyscopebadge">{companies[0]?.company||"Assigned company"}</strong>}<PeriodSelect value={period} onChange={setPeriod}/><button className="ghost" onClick={()=>window.print()}><Printer size={17}/>Print Profit & Loss</button></div>
  <div className="periodsummary">Viewing <strong>{periodLabel}</strong></div>
  <div className="grid3"><div className="panel mini"><span>Recognized Revenue</span><strong>{fmt(revenue)}</strong><small>{receivedIncome.length} received income record{receivedIncome.length===1?"":"s"}</small></div><div className="panel mini"><span>Total Expenses</span><strong>{fmt(totalExpenses)}</strong><small>{expenses.length} expense record{expenses.length===1?"":"s"}</small></div><div className="panel mini"><span>{netLabel}</span><strong className={netProfit<0?"negativeamount":""}>{fmt(Math.abs(netProfit))}</strong><small>Revenue minus expenses</small></div></div>
  <div className="grid3"><div className="panel mini"><span>Invoice Total</span><strong>{fmt(invoiceTotal)}</strong><small>Paid {fmt(paidInvoiceTotal)}</small></div><div className="panel mini"><span>Outstanding Invoices</span><strong>{fmt(outstandingInvoiceTotal)}</strong><small>{activeInvoices.filter(record=>record.status!=="Paid").length} open invoice{activeInvoices.filter(record=>record.status!=="Paid").length===1?"":"s"}</small></div><div className="panel mini"><span>Quotation Pipeline</span><strong>{fmt(quotationTotal)}</strong><small>Accepted {fmt(acceptedQuotationTotal)}</small></div></div>
  <div className="grid2"><div className="panel"><div className="panelhead"><div><span>INCOME</span><h2>Recognized revenue tally</h2></div><small>Pending: {fmt(pendingIncomeTotal)}</small></div><div className="tablewrap"><table><thead><tr><th>Income Source</th><th>Amount</th></tr></thead><tbody>{incomeBreakdown.map((row,index)=><tr key={`${row.name}-${index}`}><td>{index===incomeBreakdown.length-1?<strong>{row.name}</strong>:row.name}</td><td>{index===incomeBreakdown.length-1?<strong>{fmt(row.amount)}</strong>:fmt(row.amount)}</td></tr>)}</tbody></table></div></div><div className="panel"><div className="panelhead"><div><span>EXPENSE</span><h2>Expense tally</h2></div></div><div className="tablewrap"><table><thead><tr><th>Expense Category</th><th>Amount</th></tr></thead><tbody>{expenseBreakdown.map((row,index)=><tr key={`${row.name}-${index}`}><td>{index===expenseBreakdown.length-1?<strong>{row.name}</strong>:row.name}</td><td>{index===expenseBreakdown.length-1?<strong>{fmt(row.amount)}</strong>:fmt(row.amount)}</td></tr>)}</tbody></table></div></div></div>
  <div className="grid2"><div className="panel"><div className="panelhead"><div><span>PROFIT & LOSS</span><h2>Statement for {periodLabel}</h2></div></div><div className="tablewrap"><table><tbody><tr><td>Recognized Revenue</td><td>{fmt(revenue)}</td></tr><tr><td>Operating Expenses</td><td>-{fmt(totalExpenses)}</td></tr><tr><td><strong>{netLabel}</strong></td><td><strong className={netProfit<0?"negativeamount":""}>{netProfit<0?"-":""}{fmt(Math.abs(netProfit))}</strong></td></tr></tbody></table></div><p className="reportnote">Pending income, unpaid invoices and quotations are shown as pipeline and are not counted as recognized profit until payment is recorded.</p></div><div className="panel"><div className="panelhead"><div><span>DOCUMENT TALLY</span><h2>Invoices and quotations</h2></div></div><div className="tablewrap"><table><tbody><tr><td>Total Invoiced</td><td>{fmt(invoiceTotal)}</td></tr><tr><td>Paid Invoices</td><td>{fmt(paidInvoiceTotal)}</td></tr><tr><td>Outstanding Invoices</td><td>{fmt(outstandingInvoiceTotal)}</td></tr><tr><td>Active Quotations</td><td>{fmt(quotationTotal)}</td></tr><tr><td>Accepted Quotations</td><td>{fmt(acceptedQuotationTotal)}</td></tr><tr><td>Pending Income</td><td>{fmt(pendingIncomeTotal)}</td></tr></tbody></table></div></div></div>
 </>
}

function IncomeRecords(){
 const access=useCompanyAccess();
 const allCompanies=useMemo(()=>{const loaded=load<Partial<CompanyRecord>[]>("a3-company-settings",companyDefaults).map(normaliseCompany);return loaded.length?loaded:companyDefaults},[]);
 const companies=scopedCompanies(allCompanies,access);
 const key=scopedStorageKey(INCOME_STORAGE_KEY,access);
 const [records,setRecords]=useState<IncomeRecord[]>(()=>{const stored=load<IncomeRecord[]>(key,[]);if(stored.length)return stored;const legacy=load<IncomeRecord[]>(INCOME_STORAGE_KEY,incomeRecordDefaults).map(record=>({...record,companyId:record.companyId||companyDefaults[0].id,amount:Number(record.amount)||0}));return access.isAllCompanies?legacy:legacy.filter(record=>record.companyId===access.companyId)});
 const [editing,setEditing]=useState<IncomeRecord|null>(null);
 const [period,setPeriod]=useState<ReportPeriod>("THIS_MONTH");
 useEffect(()=>save(key,records),[key,records]);
 const openNew=()=>setEditing({id:"",date:localToday(),companyId:access.companyId||companies[0]?.id||companyDefaults[0].id,source:"Limousine Booking",customer:"",reference:"",description:"",amount:0,payment:"PayNow",status:"Received"});
 const commit=(record:IncomeRecord)=>{if(!record.date||!record.companyId||!record.source.trim()||record.amount<=0)return false;setRecords(current=>record.id?current.map(item=>item.id===record.id?record:item):[{...record,id:nextId("INC",current.length)},...current]);setEditing(null);return true};
 const remove=(id:string)=>{if(confirm("Delete this income record?"))setRecords(current=>current.filter(record=>record.id!==id))};
 const companyName=(id:string)=>companies.find(company=>company.id===id)?.company||"Unknown company";
 const visible=records.filter(record=>dateInReportPeriod(record.date,period));
 const total=visible.reduce((sum,record)=>sum+record.amount,0),received=visible.filter(record=>record.status==="Received").reduce((sum,record)=>sum+record.amount,0),pending=total-received;
 return <><Heading eyebrow="REPORT · INCOME CONTROL" title="Income" copy="Record revenue received from bookings, invoices, platform settlements and other business sources." action="Add income" onAction={openNew}/>
 <div className="documenttoolbar reportfilters"><PeriodSelect value={period} onChange={setPeriod}/><button className="ghost" onClick={()=>downloadCsvFile(`income-${period.toLowerCase()}-${localToday()}.csv`,[["Income ID","Date","Company","Source","Customer","Reference","Payment","Amount","Status"],...visible.map(record=>[record.id,record.date,companyName(record.companyId),record.source,record.customer,record.reference,record.payment,record.amount,record.status])])}><Download size={17}/>Export CSV</button></div>
 <div className="periodsummary">Viewing <strong>{reportPeriodLabel(period)}</strong></div>
 <div className="grid3"><div className="panel mini"><span>Total Income</span><strong>{money2(total)}</strong><small>{visible.length} records</small></div><div className="panel mini"><span>Received</span><strong>{money2(received)}</strong><small>Cleared payments</small></div><div className="panel mini"><span>Pending</span><strong>{money2(pending)}</strong><small>Awaiting payment</small></div></div>
 <div className="panel"><div className="tablewrap"><table><thead><tr>{["Income ID","Date","Company","Source","Customer","Reference","Payment","Amount","Status","Actions"].map(header=><th key={header}>{header}</th>)}</tr></thead><tbody>{visible.length?visible.map(record=><tr key={record.id}><td>{record.id}</td><td>{record.date}</td><td>{companyName(record.companyId)}</td><td>{record.source}</td><td>{record.customer||"—"}</td><td>{record.reference||"—"}</td><td>{record.payment}</td><td><strong>{money2(record.amount)}</strong></td><td><span className={`status ${record.status.toLowerCase()}`}>{record.status}</span></td><td><div className="rowactions"><button className="rowaction" onClick={()=>setEditing({...record})}><Pencil size={14}/>Edit</button><button className="rowaction danger" onClick={()=>remove(record.id)}><Trash2 size={14}/>Delete</button></div></td></tr>):<tr><td colSpan={10}>No income records for {reportPeriodLabel(period)}.</td></tr>}</tbody></table></div></div>
 {editing&&<RecordModal title={editing.id?"Edit income":"Add income"} onCancel={()=>setEditing(null)} onSave={()=>commit(editing)}><label>Income date<input type="date" value={editing.date} onChange={event=>setEditing({...editing,date:event.target.value})}/></label><label>Company<select value={editing.companyId} onChange={event=>setEditing({...editing,companyId:event.target.value})}>{companies.map(company=><option key={company.id} value={company.id}>{company.company}</option>)}</select></label><label>Income source<select value={editing.source} onChange={event=>setEditing({...editing,source:event.target.value})}><option>Limousine Booking</option><option>Sakura Table Booking</option><option>Food Catalogue Sale</option><option>Platform Settlement</option><option>Invoice Payment</option><option>Other Income</option></select></label><label>Customer / Payer<input value={editing.customer} onChange={event=>setEditing({...editing,customer:event.target.value})}/></label><label>Reference<input value={editing.reference} onChange={event=>setEditing({...editing,reference:event.target.value})} placeholder="Booking, invoice or settlement ID"/></label><label>Amount (SGD)<input type="number" min="0" step="0.01" value={editing.amount||""} onChange={event=>setEditing({...editing,amount:Number(event.target.value)})}/></label><label>Payment method<select value={editing.payment} onChange={event=>setEditing({...editing,payment:event.target.value})}><option>PayNow</option><option>Bank Transfer</option><option>Card</option><option>Cash</option><option>Platform Payout</option><option>Other</option></select></label><label>Status<select value={editing.status} onChange={event=>setEditing({...editing,status:event.target.value as IncomeRecord["status"]})}><option>Received</option><option>Pending</option></select></label><label className="wide">Description<input value={editing.description} onChange={event=>setEditing({...editing,description:event.target.value})}/></label></RecordModal>}</>
}

function ExpenseRecords(){
 const access=useCompanyAccess();
 const allCompanies=useMemo(()=>{const loaded=load<Partial<CompanyRecord>[]>("a3-company-settings",companyDefaults).map(normaliseCompany);return loaded.length?loaded:companyDefaults},[]);
 const companies=scopedCompanies(allCompanies,access);
 const key=scopedStorageKey(EXPENSE_STORAGE_KEY,access);
 const [records,setRecords]=useState<ExpenseRecord[]>(()=>{const stored=load<Partial<ExpenseRecord>[]>(key,[]);if(stored.length)return stored.map(normalizeExpenseRecord);const legacy=load<Partial<ExpenseRecord>[]>(EXPENSE_STORAGE_KEY,expenseRecordDefaults).map(normalizeExpenseRecord);return access.isAllCompanies?legacy:legacy.filter(record=>record.companyId===access.companyId)});
 const [editing,setEditing]=useState<ExpenseRecord|null>(null);const [preview,setPreview]=useState<ExpenseRecord|null>(null);const [period,setPeriod]=useState<ReportPeriod>("THIS_MONTH");
 useEffect(()=>save(key,records),[key,records]);
 const openNew=()=>setEditing({id:"",date:localToday(),companyId:companies[0]?.id||companyDefaults[0].id,category:"Fuel",supplier:"",description:"",mileageFrom:"",mileageTo:"",amount:0,payment:"Company Card",receiptName:"",receiptType:"",receiptData:""});
 const readReceipt=(file?:File)=>{if(!file||!editing)return;if(file.size>1_500_000){alert("Receipt must be 1.5 MB or smaller for browser storage.");return}const reader=new FileReader();reader.onload=()=>setEditing(current=>current?{...current,receiptName:file.name,receiptType:file.type,receiptData:String(reader.result||"")}:current);reader.readAsDataURL(file)};
 const commit=(record:ExpenseRecord)=>{if(!record.date||!record.companyId||!record.category.trim()||!record.supplier.trim()||record.amount<=0)return false;const clean={...record,mileageFrom:record.mileageFrom.trim(),mileageTo:record.mileageTo.trim()};setRecords(current=>clean.id?current.map(item=>item.id===clean.id?clean:item):[{...clean,id:nextId("EXP",current.length)},...current]);setEditing(null);return true};
 const remove=(id:string)=>{if(confirm("Delete this expense record?"))setRecords(current=>current.filter(record=>record.id!==id))};
 const companyName=(id:string)=>companies.find(company=>company.id===id)?.company||"Unknown company";
 const mileage=(record:ExpenseRecord)=>record.mileageFrom||record.mileageTo?`${record.mileageFrom||"—"} → ${record.mileageTo||"—"}`:"—";
 const visible=records.filter(record=>dateInReportPeriod(record.date,period));
 const total=visible.reduce((sum,record)=>sum+record.amount,0);const average=visible.length?total/visible.length:0;const categories=new Set(visible.map(record=>record.category)).size;
 return <><Heading eyebrow="REPORT · EXPENSE CONTROL" title="Expense" copy="Record operating expenses, optional mileage details, and attach a receipt image or PDF to each transaction." action="Add expense" onAction={openNew}/>
 <div className="documenttoolbar reportfilters"><PeriodSelect value={period} onChange={setPeriod}/><button className="ghost" onClick={()=>downloadCsvFile(`expenses-${period.toLowerCase()}-${localToday()}.csv`,[["Expense ID","Date","Company","Category","Supplier","Description","Mileage","Payment","Amount"],...visible.map(record=>[record.id,record.date,companyName(record.companyId),record.category,record.supplier,record.description,mileage(record),record.payment,record.amount])])}><Download size={17}/>Export CSV</button></div>
 <div className="periodsummary">Viewing <strong>{reportPeriodLabel(period)}</strong></div>
 <div className="grid3"><div className="panel mini"><span>Total Expense</span><strong>{money2(total)}</strong><small>{visible.length} transactions</small></div><div className="panel mini"><span>Average Expense</span><strong>{money2(average)}</strong><small>Per transaction</small></div><div className="panel mini"><span>Expense Categories</span><strong>{categories}</strong><small>In selected period</small></div></div>
 <div className="panel"><div className="tablewrap"><table><thead><tr>{["Expense ID","Date","Company","Category","Supplier","Description","Mileage","Payment","Amount","Receipt","Actions"].map(header=><th key={header}>{header}</th>)}</tr></thead><tbody>{visible.length?visible.map(record=><tr key={record.id}><td>{record.id}</td><td>{record.date}</td><td>{companyName(record.companyId)}</td><td>{record.category}</td><td>{record.supplier}</td><td>{record.description||"—"}</td><td>{mileage(record)}</td><td>{record.payment}</td><td><strong>{money2(record.amount)}</strong></td><td>{record.receiptName?<button className="rowaction" onClick={()=>setPreview(record)}><Eye size={14}/>View</button>:"No receipt"}</td><td><div className="rowactions"><button className="rowaction" onClick={()=>setEditing({...record})}><Pencil size={14}/>Edit</button><button className="rowaction danger" onClick={()=>remove(record.id)}><Trash2 size={14}/>Delete</button></div></td></tr>):<tr><td colSpan={11}>No expense records for {reportPeriodLabel(period)}.</td></tr>}</tbody></table></div></div>
 {editing&&<RecordModal title={editing.id?"Edit expense":"Add expense"} onCancel={()=>setEditing(null)} onSave={()=>commit(editing)}><label>Expense date<input type="date" value={editing.date} onChange={event=>setEditing({...editing,date:event.target.value})}/></label><label>Company<select value={editing.companyId} onChange={event=>setEditing({...editing,companyId:event.target.value})}>{companies.map(company=><option key={company.id} value={company.id}>{company.company}</option>)}</select></label><label>Category<select value={editing.category} onChange={event=>setEditing({...editing,category:event.target.value})}><option>Fuel</option><option>Parking / ERP</option><option>Vehicle Maintenance</option><option>Driver Payout</option><option>Food Supplies</option><option>Office</option><option>Marketing</option><option>Other</option></select></label><label>Supplier<input value={editing.supplier} onChange={event=>setEditing({...editing,supplier:event.target.value})}/></label><label>Amount (SGD)<input type="number" min="0" step="0.01" value={editing.amount||""} onChange={event=>setEditing({...editing,amount:Number(event.target.value)})}/></label><label>Payment method<select value={editing.payment} onChange={event=>setEditing({...editing,payment:event.target.value})}><option>Company Card</option><option>Bank Transfer</option><option>PayNow</option><option>Cash</option><option>Other</option></select></label><label className="wide">Description<input value={editing.description} onChange={event=>setEditing({...editing,description:event.target.value})}/></label><div className="wide expensemileage"><div><strong>Optional mileage</strong><span>Leave both fields blank when mileage does not apply.</span></div><div className="mileagegrid"><label>Mileage From<input value={editing.mileageFrom} onChange={event=>setEditing({...editing,mileageFrom:event.target.value})} placeholder="Leave blank if not applicable"/></label><label>Mileage To<input value={editing.mileageTo} onChange={event=>setEditing({...editing,mileageTo:event.target.value})} placeholder="Leave blank if not applicable"/></label></div></div><label className="filefield wide">Receipt image / PDF<input type="file" accept="image/*,application/pdf" onChange={event=>readReceipt(event.target.files?.[0])}/><span><Upload size={16}/>{editing.receiptName||"Choose receipt file"}</span></label>{editing.receiptName&&<label className="wide">Attachment<input value={editing.receiptName} disabled/></label>}</RecordModal>}
 {preview&&<div className="modalbackdrop" onMouseDown={()=>setPreview(null)}><div className="modal receiptmodal" onMouseDown={event=>event.stopPropagation()}><div className="modalhead"><div><span>EXPENSE RECEIPT</span><h2>{preview.receiptName}</h2></div><button className="modalclose" onClick={()=>setPreview(null)}><X size={19}/></button></div>{preview.receiptType==="application/pdf"?<iframe className="receiptframe" src={preview.receiptData} title="Receipt PDF"/>:<img loading="lazy" decoding="async" className="receiptimage" src={preview.receiptData} alt="Expense receipt"/>}</div></div>}</>
}

type PlatformRecord={id:string;date:string;period:string;platform:string;reference:string;description:string;gross:number;commission:number;incentives:number;adjustments:number;gst:number;net:number;status:"Pending"|"Received"};
function PlatformEarnings(){
 const defaults:PlatformRecord[]=[{id:"PLT-001",date:"2026-07-25",period:"2026-07-20 to 2026-07-26",platform:"Grab",reference:"GRAB-W30-2026",description:"Weekly driver settlement",gross:1820,commission:364,incentives:120,adjustments:-20,gst:32.76,net:1523.24,status:"Received"}];
 const storageKey="a3-platform-earnings";
 const [records,setRecords]=useState<PlatformRecord[]>(()=>load(storageKey,defaults));
 const [editing,setEditing]=useState<PlatformRecord|null>(null);
 const [reportPeriod,setReportPeriod]=useState<ReportPeriod>("THIS_MONTH");
 useEffect(()=>save(storageKey,records),[records]);
 useEffect(()=>{
  const refresh=(key?:string|null)=>{if(!key||key===storageKey)setRecords(load(storageKey,defaults))};
  const onUpdated=(event:Event)=>refresh((event as CustomEvent<{key?:string}>).detail?.key);
  const onStorage=(event:StorageEvent)=>refresh(event.key);
  window.addEventListener("a3-storage-updated",onUpdated);
  window.addEventListener("storage",onStorage);
  return()=>{window.removeEventListener("a3-storage-updated",onUpdated);window.removeEventListener("storage",onStorage)};
 },[]);
 const openNew=()=>setEditing({id:"",date:localToday(),period:"",platform:"Grab",reference:"",description:"",gross:0,commission:0,incentives:0,adjustments:0,gst:0,net:0,status:"Pending"});
 const calculateNet=(r:PlatformRecord)=>Math.max(0,r.gross-r.commission+r.incentives+r.adjustments-r.gst);
 const commit=(record:PlatformRecord)=>{if(!record.date||!record.platform||record.gross<=0)return false;const saved={...record,net:calculateNet(record)};setRecords(current=>{const next=saved.id?current.map(item=>item.id===saved.id?saved:item):[{...saved,id:nextId("PLT",current.length)},...current];saveNow(storageKey,next);return next});setEditing(null);return true};
 const remove=(record:PlatformRecord)=>{if(!window.confirm(`Delete platform settlement ${record.id}?\n\n${record.platform} · ${money2(record.net)}\n\nThis deletion will sync to all devices.`))return;setRecords(current=>{const next=current.filter(item=>item.id!==record.id);saveNow(storageKey,next);return next});if(editing?.id===record.id)setEditing(null)};
 const visible=records.filter(record=>dateInReportPeriod(record.date,reportPeriod));
 const gross=visible.reduce((n,r)=>n+r.gross,0),deductions=visible.reduce((n,r)=>n+r.commission+r.gst,0),extras=visible.reduce((n,r)=>n+r.incentives+r.adjustments,0),net=visible.reduce((n,r)=>n+r.net,0);
 return <><Heading eyebrow="REPORT · TRANSPORT PLATFORMS" title="Platform Earning" copy="Track settlements from Grab, TADA, Gojek, Ryde, CDG Zig and other external transport platforms." action="Add settlement" onAction={openNew}/>
 <div className="documenttoolbar reportfilters"><PeriodSelect value={reportPeriod} onChange={setReportPeriod}/><button className="ghost" onClick={()=>downloadCsvFile(`platform-earnings-${reportPeriod.toLowerCase()}-${localToday()}.csv`,[["Settlement ID","Date","Statement Period","Platform","Reference","Gross","Commission","Incentives","Adjustments","GST","Net","Status"],...visible.map(record=>[record.id,record.date,record.period,record.platform,record.reference,record.gross,record.commission,record.incentives,record.adjustments,record.gst,record.net,record.status])])}><Download size={17}/>Export CSV</button></div>
 <div className="periodsummary">Viewing <strong>{reportPeriodLabel(reportPeriod)}</strong></div>
 <div className="grid3"><div className="panel mini"><span>Gross fares</span><strong>{money2(gross)}</strong><small>Before platform deductions</small></div><div className="panel mini"><span>Commission and GST</span><strong>{money2(deductions)}</strong><small>Total deductions</small></div><div className="panel mini"><span>Net platform payout</span><strong>{money2(net)}</strong><small>Includes {money2(extras)} incentives / adjustments</small></div></div>
 <div className="panel"><div className="tablewrap"><table><thead><tr>{["Settlement ID","Date","Statement Period","Platform","Reference","Gross Fares","Commission","Incentives","Adjustments","GST","Net Payout","Status","Actions"].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{visible.length?visible.map(r=><tr key={r.id}><td>{r.id}</td><td>{r.date}</td><td>{r.period||"—"}</td><td>{r.platform}</td><td>{r.reference||"—"}</td><td>{money2(r.gross)}</td><td>{money2(r.commission)}</td><td>{money2(r.incentives)}</td><td>{money2(r.adjustments)}</td><td>{money2(r.gst)}</td><td><strong>{money2(r.net)}</strong></td><td><span className={`status ${r.status.toLowerCase()}`}>{r.status}</span></td><td><div className="rowactions"><button className="rowaction" onClick={()=>setEditing({...r})}><Pencil size={14}/>Edit</button><button className="rowaction danger" onClick={()=>remove(r)}><Trash2 size={14}/>Delete</button></div></td></tr>):<tr><td colSpan={13}>No platform settlements for {reportPeriodLabel(reportPeriod)}.</td></tr>}</tbody></table></div></div>
 {editing&&<RecordModal title={editing.id?"Edit platform settlement":"Add platform settlement"} onCancel={()=>setEditing(null)} onSave={()=>commit(editing)}><label>Settlement date<input type="date" value={editing.date} onChange={e=>setEditing({...editing,date:e.target.value})}/></label><label>Statement period<input placeholder="e.g. 20 Jul–26 Jul 2026" value={editing.period} onChange={e=>setEditing({...editing,period:e.target.value})}/></label><label>Platform<select value={editing.platform} onChange={e=>setEditing({...editing,platform:e.target.value})}><option>Grab</option><option>TADA</option><option>Gojek</option><option>Ryde</option><option>CDG Zig</option><option>Other Platform</option></select></label><label>Settlement reference<input value={editing.reference} onChange={e=>setEditing({...editing,reference:e.target.value})}/></label><label>Gross fares (SGD)<input type="number" min="0" step="0.01" value={editing.gross||""} onChange={e=>setEditing({...editing,gross:Number(e.target.value)})}/></label><label>Platform commission (SGD)<input type="number" min="0" step="0.01" value={editing.commission||""} onChange={e=>setEditing({...editing,commission:Number(e.target.value)})}/></label><label>Incentives / bonuses (SGD)<input type="number" min="0" step="0.01" value={editing.incentives||""} onChange={e=>setEditing({...editing,incentives:Number(e.target.value)})}/></label><label>Adjustments (SGD)<input type="number" step="0.01" value={editing.adjustments||""} onChange={e=>setEditing({...editing,adjustments:Number(e.target.value)})}/></label><label>GST deducted (SGD)<input type="number" min="0" step="0.01" value={editing.gst||""} onChange={e=>setEditing({...editing,gst:Number(e.target.value)})}/></label><label>Description<input value={editing.description} onChange={e=>setEditing({...editing,description:e.target.value})}/></label><label>Status<select value={editing.status} onChange={e=>setEditing({...editing,status:e.target.value as PlatformRecord["status"]})}><option>Pending</option><option>Received</option></select></label><label>Calculated net payout<input value={money2(calculateNet(editing))} disabled/></label></RecordModal>}</>
}



type ParsedInvoiceJob={jobTitle:string;tripTime:string;route:string;flight:string;passenger:string;vehicleType?:string;pickup?:string;dropoff?:string;duration?:string;description:string};
function cleanJobText(value:string){return value.replace(/[：﹕]/g,":").replace(/[；;]/g,";").replace(/[，]/g,",").replace(/[‐‑–—]/g,"-").replace(/\s+/g," ").trim()}
function splitInvoiceJobs(raw:string){
 const lines=raw.split(/\r?\n/).map(line=>line.trim()).filter(Boolean).filter(line=>!/^[-_=]{4,}$/.test(line));
 const blocks:string[][]=[];let current:string[]=[];
 const startsJob=(line:string,index:number)=>/^工作\s*[一二三四五六七八九十\d]+/i.test(line)||(/^\d{1,2}月\d{1,2}日/.test(line)&&/(包车|接机|送机|transfer|disposal|hour)/i.test(line))||(index>0&&/^(job\s*\d+|trip\s*\d+)/i.test(line));
 lines.forEach((line,index)=>{if(startsJob(line,index)&&current.length){blocks.push(current);current=[]}current.push(line)});if(current.length)blocks.push(current);
 return blocks.length?blocks:[lines];
}
function firstMatch(text:string,patterns:RegExp[]){for(const pattern of patterns){const match=text.match(pattern);if(match?.[1])return cleanJobText(match[1])}return ""}
function parseInvoiceJobBlock(lines:string[],index:number):ParsedInvoiceJob{
 const joined=lines.join("\n");
 const flat=cleanJobText(lines.join(" "));
 const explicitTitle=lines.find(line=>/^工作\s*[一二三四五六七八九十\d]+/i.test(line)||/^\d{1,2}月\d{1,2}日/.test(line));
 const serviceText=firstMatch(flat,[/(接机|送机|包车\s*\d*\s*小时|落地散\s*\d*\s*小时|机场接送|点到点|hourly disposal|airport arrival|airport departure|point to point)/i]);
 const jobTitle=cleanJobText(explicitTitle||serviceText||`工作${index+1}`);
 const tripTime=firstMatch(flat,[/(?:时间|time)\s*[:：]?\s*\(?\s*([0-2]?\d[.:][0-5]\d(?:\s*[-~至到]\s*[0-2]?\d[.:][0-5]\d)?)/i,/\b([0-2]?\d:[0-5]\d)\b/]);
 const flight=firstMatch(flat,[/(?:航班|flight)\s*[:：]?\s*([A-Z0-9]{2,3}\s*\d{2,4})/i,/\b([A-Z]{2,3}\s?\d{2,4})\b/i]).replace(/\s+/g,"").toUpperCase();
 const passenger=firstMatch(flat,[/(?:人数|乘客|贵宾|passenger(?:s)?)\s*[:：]?\s*([^;\n]+?)(?=\s+(?:时间|行程|车型|上车|下车|航班|pickup|drop|vehicle)\s*[:：]|$)/i,/([\u4e00-\u9fffA-Za-z·]+\s*\d+\s*(?:大|小|人|pax)(?:\s*\d+\s*(?:大|小|人|pax))?)/i]);
 const vehicleType=firstMatch(flat,[/(?:车型|vehicle)\s*[:：]?\s*([^;\n]+?)(?=\s+(?:上车|下车|时间|行程|航班|人数|pickup|drop)\s*[:：]|$)/i]);
 const pickup=firstMatch(flat,[/(?:上车|接客|pickup)\s*[:：]?\s*([^;\n]+?)(?=\s+(?:下车|时间|行程|航班|人数|车型|drop)\s*[:：]|$)/i]);
 const dropoff=firstMatch(flat,[/(?:下车|drop\s*off|dropoff)\s*[:：]?\s*([^;\n]+?)(?=\s+(?:上车|时间|行程|航班|人数|车型|pickup)\s*[:：]|$)/i]);
 const duration=firstMatch(flat,[/(\d+(?:\.\d+)?\s*小时)/i,/(\d+(?:\.\d+)?\s*hours?)/i]);
 const itineraryLines=lines.filter(line=>/(?:行程|路线|route|itinerary)\s*[:：;]/i.test(line));
 let route=itineraryLines.map(line=>cleanJobText(line.replace(/^(?:行程|路线|route|itinerary)\s*[:：;]?\s*/i,""))).join(" → ");
 if(!route&&pickup&&dropoff)route=`${pickup} → ${dropoff}`;
 if(!route){
  const candidates=lines.filter(line=>!/^工作/i.test(line)&&!/^\d{1,2}月\d{1,2}日/.test(line)&&!/(?:人数|车型|航班|时间)\s*[:：]/.test(line));
  route=cleanJobText(candidates.join(" ").replace(/\b[0-2]?\d:[0-5]\d\b/g,"").replace(/\b[A-Z]{2,3}\s?\d{2,4}\b/ig,""));
 }
 const parts=[jobTitle,serviceText&&serviceText!==jobTitle&&`Service: ${serviceText}`,tripTime&&`Time: ${tripTime.replace(".",":")}`,duration&&`Duration: ${duration}`,flight&&`Flight: ${flight}`,passenger&&`Passenger: ${passenger}`,vehicleType&&`Vehicle: ${vehicleType}`,pickup&&`Pickup: ${pickup}`,dropoff&&`Drop-off: ${dropoff}`,route&&`Itinerary: ${route}`].filter(Boolean);
 return {jobTitle,tripTime:tripTime.replace(".",":"),route,flight,passenger,vehicleType,pickup,dropoff,duration,description:parts.join("\n")};
}
function parseInvoiceJobs(raw:string):ParsedInvoiceJob[]{return splitInvoiceJobs(raw).filter(block=>block.length).map(parseInvoiceJobBlock)}
function parseInvoiceJob(raw:string):ParsedInvoiceJob{return parseInvoiceJobs(raw)[0]||{jobTitle:"Transport service",tripTime:"",route:"",flight:"",passenger:"",description:"Transport service"}}
function DocumentWorkspace({kind}:{kind:DocumentKind}){
 const access=useCompanyAccess();
 const isInvoice=kind==="invoice";
 const [quickJobText,setQuickJobText]=useState("");
 const sharedDrivers=useMemo(()=>loadSharedDrivers([]),[]);
 const baseStorageKey=documentStorageKey(kind);
 const storageKey=scopedStorageKey(baseStorageKey,access);
 const allCompanies=useMemo(()=>load<Partial<CompanyRecord>[]>("a3-company-settings",companyDefaults).map(normaliseCompany),[]);
 const companies=scopedCompanies(allCompanies,access);
 const clients=useMemo(()=>{const key=scopedStorageKey("a3-client-setup",access);const scoped=load<ClientSetupRecord[]>(key,[]);const source=scoped.length?scoped:load<ClientSetupRecord[]>("a3-client-setup",clientSetupDefaults);return access.isAllCompanies?source:source.filter(c=>(c.companyId||"CMP-001")===access.companyId)},[access.companyId,access.isAllCompanies]);
 const [records,setRecords]=useState<FinancialDocumentRecord[]>(()=>{const scoped=normalizeDocumentRecords(load(storageKey,[]),kind);if(scoped.length)return scoped;const legacy=normalizeDocumentRecords(load(baseStorageKey,defaultDocumentRecords(kind)),kind);return access.isAllCompanies?legacy:legacy.filter(record=>record.companyId===access.companyId)});
 const [selectedId,setSelectedId]=useState(()=>records[0]?.id||"");
 const [previewLanguage,setPreviewLanguage]=useState<DocumentLanguage>(()=>records[0]?.language||"EN");
 const [editing,setEditing]=useState<FinancialDocumentRecord|null>(null);
 const [combineOpen,setCombineOpen]=useState(false);
 const [combinedIds,setCombinedIds]=useState<string[]>([]);
 const [shareNotice,setShareNotice]=useState("");
 const [shareBusy,setShareBusy]=useState(false);
 const [documentPeriod,setDocumentPeriod]=useState<ReportPeriod>("THIS_MONTH");
 const selected=records.find(record=>record.id===selectedId)||records[0]||null;
 const company=companies.find(item=>item.id===selected?.companyId)||companies[0]||companyDefaults[0];
 const editingCompany=editing?(companies.find(item=>item.id===editing.companyId)||companies[0]||companyDefaults[0]):null;
 const previewRecord=selected?{...selected,language:previewLanguage,terms:companyTerms(company,previewLanguage)}:null;
 const selectedTotals=selected?calculateDocumentTotals(selected):null;
 const statusOptions:DocumentStatus[]=isInvoice?["Draft","Sent","Paid","Cancelled"]:["Draft","Sent","Accepted","Paid","Rejected","Expired"];
 const visibleRecords=records.filter(record=>dateInReportPeriod(record.date,documentPeriod));
 const openRecords=visibleRecords.filter(record=>isInvoice?!["Paid","Cancelled"].includes(record.status):!["Accepted","Paid","Rejected","Expired"].includes(record.status));
 const completedCount=visibleRecords.filter(record=>isInvoice?record.status==="Paid":["Accepted","Paid"].includes(record.status)).length;
 useEffect(()=>{if(selected){setPreviewLanguage(selected.language);return}setSelectedId(records[0]?.id||"")},[selected?.id,selected?.language,records]);
 const persist=(updater:(current:FinancialDocumentRecord[])=>FinancialDocumentRecord[])=>setRecords(current=>{const next=updater(current);saveNow(storageKey,next);return next});
 const stamp=()=>new Date().toISOString();
 const markStatus=(record:FinancialDocumentRecord,status:DocumentStatus)=>{
  const changedAt=stamp();
  persist(current=>current.map(item=>item.id===record.id?{...item,status,sentAt:status==="Sent"||status==="Paid"||status==="Accepted"?(item.sentAt||changedAt):item.sentAt,paidAt:status==="Paid"?changedAt:item.paidAt,acceptedAt:status==="Accepted"?changedAt:item.acceptedAt}:item));
  setShareNotice(`${record.documentNo} marked as ${status}.`);
 };
 const markManySent=(ids:string[])=>{
  const changedAt=stamp();
  persist(current=>current.map(item=>ids.includes(item.id)?{...item,status:item.status==="Paid"||item.status==="Accepted"?item.status:"Sent",sentAt:item.sentAt||changedAt}:item));
  setShareNotice(`${ids.length} invoice${ids.length===1?"":"s"} marked as Sent.`);
 };
 const localDate=()=>{const date=new Date();const offset=date.getTimezoneOffset();return new Date(date.getTime()-offset*60000).toISOString().slice(0,10)};
 const openNew=()=>{
  const date=localDate();
  const activeCompany=companies[0]||companyDefaults[0];
  const client=clients.find(item=>item.status==="Active")||clients[0];
  const number=nextDocumentNumber(kind,records,new Date(`${date}T00:00:00`));
  setEditing({id:`DOC-${kind.toUpperCase()}-${Date.now()}`,documentNo:number,date,dueDate:isInvoice?addDays(date,7):"",validUntil:isInvoice?"":addDays(date,14),companyId:activeCompany.id,language:"EN",clientName:client?.company||"",clientContact:client?.contactName||"",clientPhone:client?.phone||"",clientAddress:client?.address||"",clientUen:client?.uen||"",items:[{id:`ITEM-${Date.now()}`,description:"",quantity:1,rate:0}],discount:0,gstEnabled:activeCompany.gstEnabled,gstRate:activeCompany.gstRate,status:"Draft",terms:companyTerms(activeCompany,"EN"),notes:""});
 };
 const editRecord=(record:FinancialDocumentRecord)=>{const recordCompany=companies.find(item=>item.id===record.companyId)||companyDefaults[0];setEditing({...record,terms:companyTerms(recordCompany,record.language),items:record.items.map(item=>({...item}))})};
 const commit=(record:FinancialDocumentRecord)=>{
  const cleanItems=record.items.map(item=>({...item,description:item.description.trim(),quantity:Number(item.quantity),rate:Number(item.rate),claimRate:Math.max(0,Number(item.claimRate)||0)}));
  if(!record.documentNo.trim()||!record.date||!record.companyId||!record.clientName.trim()||!cleanItems.length||cleanItems.some(item=>!item.description||item.quantity<=0||item.rate<=0))return false;
  if(records.some(item=>item.id!==record.id&&item.documentNo.trim().toLowerCase()===record.documentNo.trim().toLowerCase())){alert("Document number already exists. Use a unique number.");return false}
  const recordCompany=companies.find(item=>item.id===record.companyId)||companyDefaults[0];
  const clean={...record,documentNo:record.documentNo.trim(),clientName:record.clientName.trim(),clientContact:record.clientContact.trim(),clientPhone:record.clientPhone.trim(),clientAddress:record.clientAddress.trim(),clientUen:record.clientUen.trim(),items:cleanItems,discount:Math.max(0,Number(record.discount)||0),gstRate:Math.max(0,Number(record.gstRate)||0),terms:companyTerms(recordCompany,record.language),notes:record.notes.trim()};
  if(isInvoice){
   const existingClaims=load<DriverClaimRecord[]>(DRIVER_CLAIM_STORAGE_KEY,[]);
   const nextClaims=[...existingClaims];
   clean.items=clean.items.map(item=>{
    if(!item.driverId||!item.driverName||!item.claimRate)return item;
    const claimId=item.claimId||`CLM-${Date.now()}-${item.id}`;
    const claim:DriverClaimRecord={id:claimId,bookingRef:`${clean.documentNo}/${item.id}`,invoiceNo:clean.documentNo,lineItemId:item.id,companyId:clean.companyId,driverId:item.driverId,driverName:item.driverName,customer:clean.clientName,service:item.jobTitle||item.description.split("\n")[0]||"Transport service",tripDate:[clean.date,item.tripTime].filter(Boolean).join(" "),route:item.route||item.description,baseRate:item.claimRate,extras:0,total:item.claimRate,notes:[item.flight&&`Flight: ${item.flight}`,item.passenger&&`Passenger: ${item.passenger}`].filter(Boolean).join(" · "),status:"Submitted",submittedAt:new Date().toISOString()};
    const index=nextClaims.findIndex(existing=>existing.id===claimId);
    if(index>=0)nextClaims[index]={...nextClaims[index],...claim};else nextClaims.unshift(claim);
    return {...item,claimId};
   });
   saveNow(DRIVER_CLAIM_STORAGE_KEY,nextClaims);
  }
  persist(current=>current.some(item=>item.id===clean.id)?current.map(item=>item.id===clean.id?clean:item):[clean,...current]);
  setSelectedId(clean.id);setPreviewLanguage(clean.language);setEditing(null);return true;
 };
 const remove=(record:FinancialDocumentRecord)=>{if(!confirm(`Delete ${record.documentNo}? This cannot be undone.`))return;persist(current=>current.filter(item=>item.id!==record.id));if(selectedId===record.id)setSelectedId(records.find(item=>item.id!==record.id)?.id||"")};
 const chooseClient=(clientId:string)=>{const client=clients.find(item=>item.id===clientId);if(client)setEditing(current=>current?{...current,clientName:client.company,clientContact:client.contactName,clientPhone:client.phone,clientAddress:client.address,clientUen:client.uen,items:current.items.map(item=>{const driver=sharedDrivers.find(row=>row.id===item.driverId);if(!driver)return item;const service=inferFixedRateService(item);const vehicleType=driver.vehicleType||"5 Seater";return {...item,rateService:service,vehicleType,rate:findFixedRate("client",service,vehicleType,client.id)||item.rate,claimRate:findFixedRate("driver",service,vehicleType)||item.claimRate}})}:current)};
 const chooseCompany=(companyId:string)=>{const nextCompany=companies.find(item=>item.id===companyId)||companyDefaults[0];setEditing(current=>current?{...current,companyId,gstEnabled:nextCompany.gstEnabled||false,gstRate:nextCompany.gstRate??9,terms:companyTerms(nextCompany,current.language)}:current)};
 const addItem=()=>setEditing(current=>current?{...current,items:[...current.items,{id:`ITEM-${Date.now()}-${current.items.length}`,description:"",quantity:1,rate:0}]}:current);
 const updateItem=(id:string,patch:Partial<DocumentLineItem>)=>setEditing(current=>current?{...current,items:current.items.map(item=>item.id===id?{...item,...patch}:item)}:current);
 const removeItem=(id:string)=>setEditing(current=>current&&current.items.length>1?{...current,items:current.items.filter(item=>item.id!==id)}:current);
 const addFormattedJob=()=>{
  if(!editing||!quickJobText.trim())return;
  const parsedJobs=parseInvoiceJobs(quickJobText);
  if(!parsedJobs.length)return;
  const blankIndex=editing.items.findIndex(item=>!item.description.trim());
  const nextItems=[...editing.items];
  parsedJobs.forEach((parsed,index)=>{
   const item={id:`ITEM-${Date.now()}-${nextItems.length}-${index}`,quantity:1,rate:0,...parsed};
   if(index===0&&blankIndex>=0)nextItems[blankIndex]={...nextItems[blankIndex],...parsed};else nextItems.push(item);
  });
  setEditing({...editing,items:nextItems});
  setQuickJobText("");
 };
 const formatter=useMemo(()=>new Intl.NumberFormat("en-SG",{style:"currency",currency:company.currency||"SGD",minimumFractionDigits:2}),[company.currency]);
 const format=(value:number)=>formatter.format(value);
 const formatRecord=(record:FinancialDocumentRecord,value:number)=>{const recordCompany=companies.find(item=>item.id===record.companyId)||companyDefaults[0];return new Intl.NumberFormat("en-SG",{style:"currency",currency:recordCompany.currency||"SGD",minimumFractionDigits:2}).format(value)};
 const pdfCompanyFor=(record:FinancialDocumentRecord):PdfCompanyIdentity=>{const recordCompany=companies.find(item=>item.id===record.companyId)||companyDefaults[0];return {company:recordCompany.company,companyType:recordCompany.companyType,uen:recordCompany.uen,gst:recordCompany.gst,email:recordCompany.email,phone:recordCompany.phone,address:recordCompany.address,currency:recordCompany.currency||"SGD",accentColour:recordCompany.accentColour,bankName:recordCompany.bankName,bankAccountName:recordCompany.bankAccountName,bankAccountNumber:recordCompany.bankAccountNumber,bankBranchCode:recordCompany.bankBranchCode,bankSwiftCode:recordCompany.bankSwiftCode,payNowType:recordCompany.payNowType,payNowValue:recordCompany.payNowValue,paymentInstructions:recordCompany.paymentInstructions,logoData:recordCompany.logoData,chopData:recordCompany.chopData,logoWidth:recordCompany.logoWidth,logoHeight:recordCompany.logoHeight,chopWidth:recordCompany.chopWidth,chopHeight:recordCompany.chopHeight}};
 const recordDescriptions=(record:FinancialDocumentRecord)=>record.items.map(item=>item.description.trim()).filter(Boolean).join(" · ")||record.notes||"Services rendered";
 const channelName=(channel:ShareChannel)=>channel==="whatsapp"?"WhatsApp":channel==="wechat"?"WeChat":"Telegram";
 const shareSelected=async(channel:ShareChannel)=>{
  if(!selected||shareBusy)return;
  setShareBusy(true);setShareNotice("");
  try{
   const total=formatRecord(selected,calculateDocumentTotals(selected).total);
   const selectedCompany=companies.find(item=>item.id===selected.companyId)||companyDefaults[0];
   const includeTotal=isInvoice||selectedCompany.companyType!=="Limousine Company";
   const file=await createDocumentPdf({...selected,language:previewLanguage,terms:companyTerms(selectedCompany,previewLanguage)},kind,pdfCompanyFor(selected));
   const result=await sharePdf(file,channel,`${isInvoice?"Invoice":"Quotation"} ${selected.documentNo}\n${selected.clientName}${includeTotal?`\nTotal: ${total}`:""}`);
   if(result==="shared"){markStatus(selected,"Sent");setShareNotice(`${selected.documentNo} shared through ${channelName(channel)} and marked as Sent.`)}
   else setShareNotice(`${file.name} downloaded. Attach it in ${channelName(channel)}, then use Mark Sent after delivery.`);
  }catch(error){if(!(error instanceof DOMException&&error.name==="AbortError"))setShareNotice(`Unable to share through ${channelName(channel)}. Please download the PDF and attach it manually.`)}
  finally{setShareBusy(false)}
 };
 const documentPdfFile=async()=>selected?await createDocumentPdf({...selected,language:previewLanguage,terms:companyTerms(companies.find(item=>item.id===selected.companyId)||companyDefaults[0],previewLanguage)},kind,pdfCompanyFor(selected)):null;
 const downloadSelected=async()=>{const file=await documentPdfFile();if(!file)return;downloadPdf(file);setShareNotice(`${file.name} downloaded.`)};
 const printSelected=async()=>{
  const file=await documentPdfFile();if(!file)return;
  const url=URL.createObjectURL(file);
  const popup=window.open(`${url}#toolbar=1&navpanes=0&view=FitH`,"_blank","noopener,noreferrer");
  if(!popup){downloadPdf(file);setShareNotice(`${file.name} downloaded because the browser blocked the print window.`)}
  else setShareNotice(`${file.name} opened in the professional PDF viewer. Use Print or Save PDF there.`);
  window.setTimeout(()=>URL.revokeObjectURL(url),300000);
 };
 const combinedRecords=records.filter(record=>combinedIds.includes(record.id));
 const combinedTotal=combinedRecords.reduce((sum,record)=>sum+calculateDocumentTotals(record).total,0);
 const combineAnchor=combinedRecords[0]||null;
 const compatibleForBundle=(record:FinancialDocumentRecord)=>!combineAnchor||(record.companyId===combineAnchor.companyId&&record.clientName.trim().toLowerCase()===combineAnchor.clientName.trim().toLowerCase());
 const canCombine=isInvoice&&combinedRecords.length>=2&&combinedRecords.every(record=>record.companyId===combinedRecords[0].companyId&&record.clientName.trim().toLowerCase()===combinedRecords[0].clientName.trim().toLowerCase());
 const openCombine=()=>{
  const anchor=selected||records[0];
  const initial=anchor?records.filter(record=>record.companyId===anchor.companyId&&record.clientName.trim().toLowerCase()===anchor.clientName.trim().toLowerCase()).slice(0,2).map(record=>record.id):[];
  setCombinedIds(initial);setShareNotice("");setCombineOpen(true);
 };
 const toggleCombined=(record:FinancialDocumentRecord)=>{
  setCombinedIds(current=>{
   if(current.includes(record.id))return current.filter(id=>id!==record.id);
   const first=records.find(item=>item.id===current[0]);
   if(first&&(first.companyId!==record.companyId||first.clientName.trim().toLowerCase()!==record.clientName.trim().toLowerCase())){alert("Combined invoices must belong to the same company and client.");return current}
   return [...current,record.id];
  });
 };
 const combinedFile=async()=>canCombine?await createCombinedInvoicePdf(combinedRecords.map(record=>({...record,terms:companyTerms(companies.find(item=>item.id===record.companyId)||companyDefaults[0],record.language)})),pdfCompanyFor(combinedRecords[0])):null;
 const downloadCombined=async()=>{const file=await combinedFile();if(!file)return;downloadPdf(file);setShareNotice(`${file.name} downloaded as one PDF with ${combinedRecords.length} invoices listed separately.`)};
 const shareCombined=async(channel:ShareChannel)=>{
  const file=await combinedFile();if(!file||shareBusy)return;
  setShareBusy(true);setShareNotice("");
  try{
   const result=await sharePdf(file,channel,`Combined invoice PDF for ${combinedRecords[0].clientName}\nInvoices: ${combinedRecords.map(record=>record.documentNo).join(", ")}\nCombined total: ${formatRecord(combinedRecords[0],combinedTotal)}`);
   if(result==="shared"){markManySent(combinedRecords.map(record=>record.id));setShareNotice(`${combinedRecords.length} invoices shared as one PDF through ${channelName(channel)}. Each invoice description remains listed separately.`)}
   else setShareNotice(`${file.name} downloaded. Attach this one PDF in ${channelName(channel)}, then mark the selected invoices as Sent.`);
  }catch(error){if(!(error instanceof DOMException&&error.name==="AbortError"))setShareNotice(`Unable to share the combined PDF through ${channelName(channel)}. Please download and attach it manually.`)}
  finally{setShareBusy(false)}
 };
 const dateLabel=(value:string)=>value?new Intl.DateTimeFormat(previewLanguage==="ZH"?"zh-CN":"en-SG",{day:"2-digit",month:"long",year:"numeric"}).format(new Date(`${value}T00:00:00`)):"—";
 const title=previewLanguage==="EN"?(isInvoice?"INVOICE":"QUOTATION"):(isInvoice?"发票":"报价单");
 const hideDocumentTotals=!isInvoice&&company.companyType==="Limousine Company";
 return <><Heading eyebrow="DOCUMENTS · RECORD MANAGEMENT" title={`${isInvoice?"Invoice":"Quotation"} · English / 中文`} copy={`Create, edit, save, delete, preview and print ${isInvoice?"invoices":"quotations"} with company branding, clients, GST and line items.`} action={`Add ${isInvoice?"invoice":"quotation"}`} onAction={openNew}/>
 <div className="documenttoolbar reportfilters"><PeriodSelect value={documentPeriod} onChange={setDocumentPeriod}/><button className="ghost" onClick={()=>downloadCsvFile(`${kind}-${documentPeriod.toLowerCase()}-${localToday()}.csv`,[["Document No.","Date","Client","Status","Subtotal","GST","Total"],...visibleRecords.map(record=>{const totals=calculateDocumentTotals(record);return [record.documentNo,record.date,record.clientName,record.status,totals.subtotal,totals.gst,totals.total]})])}><Download size={17}/>Export CSV</button></div>
 <div className="periodsummary">Viewing <strong>{reportPeriodLabel(documentPeriod)}</strong></div>
 <div className="grid3"><div className="panel mini"><span>Total documents</span><strong>{visibleRecords.length}</strong><small>In selected period</small></div><div className="panel mini"><span>{isInvoice?"Open invoices":"Open quotations"}</span><strong>{openRecords.length}</strong><small>Draft and sent records</small></div><div className="panel mini"><span>{isInvoice?"Paid invoices":"Completed quotations"}</span><strong>{completedCount}</strong><small>Accepted or paid records</small></div></div>
 <div className="panel documentlist"><div className="panelhead"><div><span>SAVED RECORDS</span><h2>{isInvoice?"Invoices":"Quotations"}</h2></div><button className="primary" onClick={openNew}><Plus size={16}/>Add {isInvoice?"invoice":"quotation"}</button></div><div className="tablewrap"><table><thead><tr>{(isInvoice?["Document No.","Date","Client","Status","Subtotal","GST","Total","Actions"]:["Document No.","Date","Client","Status","Service Items","Actions"]).map(header=><th key={header}>{header}</th>)}</tr></thead><tbody>{visibleRecords.length?visibleRecords.map(record=>{const totals=calculateDocumentTotals(record);return <tr key={record.id} className={selected?.id===record.id?"selectedrow":""}><td><button className="documentlink" onClick={()=>setSelectedId(record.id)}>{record.documentNo}</button></td><td>{record.date}</td><td>{record.clientName}</td><td><span className={`status ${record.status.toLowerCase()}`}>{record.status}</span></td>{isInvoice?<><td>{formatRecord(record,totals.subtotal)}</td><td>{formatRecord(record,totals.gst)}</td><td><strong>{formatRecord(record,totals.total)}</strong></td></>:<td>{record.items.length} item{record.items.length===1?"":"s"}</td>}<td><div className="rowactions"><button className="rowaction" onClick={()=>{setSelectedId(record.id);editRecord(record)}}><Pencil size={14}/>Edit</button><button className="rowaction danger" onClick={()=>remove(record)}><Trash2 size={14}/>Delete</button></div></td></tr>}):<tr><td colSpan={isInvoice?8:6}>No saved {isInvoice?"invoices":"quotations"} for {reportPeriodLabel(documentPeriod)}.</td></tr>}</tbody></table></div></div>
 {selected&&selectedTotals?<><div className="documentactionpanel">
 <div className="documenttoolbar"><select aria-label="Select document" value={selected.id} onChange={event=>setSelectedId(event.target.value)}>{records.map(record=><option key={record.id} value={record.id}>{record.documentNo} · {record.clientName}</option>)}</select><select aria-label="Preview language" value={previewLanguage} onChange={event=>setPreviewLanguage(event.target.value as DocumentLanguage)}><option value="EN">English</option><option value="ZH">中文</option></select><button className="ghost" onClick={()=>editRecord(selected)}><Pencil size={17}/>Edit</button>{isInvoice&&<button className="ghost" disabled={records.length<2} onClick={openCombine}><Files size={17}/>Combine invoices</button>}<button className="ghost" onClick={()=>markStatus(selected,"Sent")}><CheckCircle2 size={17}/>Mark Sent</button><button className="ghost" onClick={()=>markStatus(selected,"Paid")}><BadgeDollarSign size={17}/>Mark Paid</button>{!isInvoice&&<button className="ghost" onClick={()=>markStatus(selected,"Accepted")}><CheckCircle2 size={17}/>Mark Accepted</button>}<button className="ghost" onClick={downloadSelected}><Download size={17}/>Download PDF</button><button className="primary" onClick={printSelected}><Printer size={17}/>Open Print PDF</button></div>
 <div className="documentsharebar"><span>Send PDF</span><button disabled={shareBusy} onClick={()=>shareSelected("whatsapp")}><MessageCircle size={16}/>WhatsApp</button><button disabled={shareBusy} onClick={()=>shareSelected("wechat")}><MessageCircle size={16}/>WeChat</button><button disabled={shareBusy} onClick={()=>shareSelected("telegram")}><Send size={16}/>Telegram</button></div>
 {shareNotice&&<div className="sharenotice">{shareNotice}</div>}
 </div><PdfExactPreview record={previewRecord||selected} language={previewLanguage} kind={kind} company={pdfCompanyFor(selected)} title={`${selected.documentNo} PDF preview`}/><div className="a4sheet legacypreview" style={{backgroundColor:company.pageColour,color:company.textColour,fontFamily:company.fontFamily,fontSize:`${company.bodyFontSize}px`}}>{company.watermarkData?<img loading="lazy" decoding="async" className="docwatermark image" style={{opacity:company.watermarkOpacity/100}} src={company.watermarkData} alt="Watermark"/>:company.watermarkText&&<div className="docwatermark text" style={{opacity:company.watermarkOpacity/100}}>{company.watermarkText}</div>}<div className="docheader"><div>{company.logoData?<img loading="lazy" decoding="async" className="doclogo" style={{width:`${company.logoWidth}px`,height:`${company.logoHeight}px`}} src={company.logoData} alt="Company logo"/>:<div className="doclogofallback">A3</div>}<h2 style={{fontSize:`${company.headingFontSize}px`}}>{company.company}</h2><p>UEN: {company.uen||"—"}</p>{selected.gstEnabled&&company.gst&&<p>GST Reg. No.: {company.gst}</p>}<p>{company.address}</p><p>{company.phone}{company.email?` · ${company.email}`:""}</p></div><div><h1>{title}</h1><p>{previewLanguage==="EN"?"Document No.":"文件编号"}: {selected.documentNo}</p><p>{previewLanguage==="EN"?"Date":"日期"}: {dateLabel(selected.date)}</p>{isInvoice&&<p>{previewLanguage==="EN"?"Due Date":"付款日期"}: {dateLabel(selected.dueDate)}</p>}{!isInvoice&&<p>{previewLanguage==="EN"?"Valid Until":"有效期至"}: {dateLabel(selected.validUntil)}</p>}<p>{previewLanguage==="EN"?"Status":"状态"}: {selected.status}</p></div></div><div className="docclient"><strong>{previewLanguage==="EN"?(isInvoice?"Bill To":"Prepared For"):"客户"}</strong><p>{selected.clientName}</p>{selected.clientContact&&<p>{previewLanguage==="EN"?"Attn":"联系人"}: {selected.clientContact}{selected.clientPhone?` · ${selected.clientPhone}`:""}</p>}{selected.clientUen&&<p>UEN: {selected.clientUen}</p>}<p>{selected.clientAddress}</p></div><table className="doctable"><thead><tr><th>{previewLanguage==="EN"?"Description":"项目"}</th><th>{previewLanguage==="EN"?"Qty":"数量"}</th><th>{previewLanguage==="EN"?"Rate":"单价"}</th><th>{previewLanguage==="EN"?"Amount":"金额"}</th></tr></thead><tbody>{selected.items.map(item=><tr key={item.id}><td>{item.description}</td><td>{item.quantity}</td><td>{format(item.rate)}</td><td>{format(item.quantity*item.rate)}</td></tr>)}</tbody></table>{!hideDocumentTotals&&<div className="doctotals"><p><span>{previewLanguage==="EN"?"Line subtotal":"项目小计"}</span><strong>{format(selectedTotals.lineSubtotal)}</strong></p>{selectedTotals.discount>0&&<p><span>{previewLanguage==="EN"?"Discount":"折扣"}</span><strong>-{format(selectedTotals.discount)}</strong></p>}<p><span>{previewLanguage==="EN"?"Subtotal":"小计"}</span><strong>{format(selectedTotals.subtotal)}</strong></p>{selected.gstEnabled&&<p><span>GST ({selected.gstRate}%)</span><strong>{format(selectedTotals.gst)}</strong></p>}<p className="grand"><span>{previewLanguage==="EN"?"Total":"总计"}</span><strong>{format(selectedTotals.total)}</strong></p></div>}{selected.notes&&<div className="docnotes"><strong>{previewLanguage==="EN"?"Notes":"备注"}</strong><p>{selected.notes}</p></div>}<div className="docfooter"><div><strong>{previewLanguage==="EN"?"Terms":"条款"}</strong><p>{previewRecord?.terms||""}</p></div><div className="choparea" style={{width:`${Math.max(180,company.chopWidth+30)}px`,minHeight:`${Math.max(105,company.chopHeight+5)}px`}}>{company.chopData?<img loading="lazy" decoding="async" style={{width:`${company.chopWidth}px`,height:`${company.chopHeight}px`}} src={company.chopData} alt="Company chop"/>:<span>{previewLanguage==="EN"?"Company chop":"公司印章"}</span>}</div></div></div></>:<div className="panel empty"><h2>No document selected</h2><p>Create a record to begin.</p></div>}
 {combineOpen&&<div className="modalbackdrop" onMouseDown={()=>setCombineOpen(false)}><div className="modal combinemodal" onMouseDown={event=>event.stopPropagation()}><div className="modalhead"><div><span>COMBINED INVOICE DELIVERY</span><h2>Send multiple invoices as one PDF</h2></div><button className="modalclose" onClick={()=>setCombineOpen(false)}><X size={19}/></button></div><div className="combineexplanation"><strong>No combined description is added.</strong><p>The PDF starts with a summary, then lists Invoice 1, Invoice 2 and every selected invoice separately. Each invoice keeps its own descriptions, quantities, rates, GST, notes and total.</p></div><div className="combineexample"><span>EXAMPLE OUTPUT</span><ol>{(combinedRecords.length?combinedRecords:records.slice(0,2)).map((record,index)=><li key={record.id}><strong>{index+1}. {record.documentNo}</strong><small>{recordDescriptions(record)} · {formatRecord(record,calculateDocumentTotals(record).total)}</small></li>)}</ol><b>One PDF file · descriptions listed invoice by invoice</b></div><div className="combinecontrols"><div><strong>Select at least two invoices</strong><span>Invoices must use the same company and client.</span></div><button className="ghost" onClick={()=>setCombinedIds([])}>Clear all</button></div><div className="tablewrap combinetable"><table><thead><tr><th>Select</th><th>Invoice</th><th>Date</th><th>Client</th><th>Description</th><th>Total</th></tr></thead><tbody>{records.map(record=>{const checked=combinedIds.includes(record.id);const compatible=compatibleForBundle(record);return <tr key={record.id} className={checked?"selectedrow":""}><td><input type="checkbox" checked={checked} disabled={!checked&&!compatible} onChange={()=>toggleCombined(record)} aria-label={`Select ${record.documentNo}`}/></td><td><strong>{record.documentNo}</strong></td><td>{record.date}</td><td>{record.clientName}</td><td className="combinedescription">{recordDescriptions(record)}</td><td>{formatRecord(record,calculateDocumentTotals(record).total)}</td></tr>})}</tbody></table></div><div className="combinefooter"><div><span>{combinedRecords.length} invoices selected</span><strong>{canCombine?formatRecord(combinedRecords[0],combinedTotal):"Select matching invoices"}</strong></div><div className="combineactions"><button className="ghost" disabled={!canCombine} onClick={()=>markManySent(combinedRecords.map(record=>record.id))}><CheckCircle2 size={16}/>Mark all Sent</button><button className="ghost" disabled={!canCombine} onClick={downloadCombined}><Download size={16}/>Download one PDF</button><button className="sharechoice" disabled={!canCombine||shareBusy} onClick={()=>shareCombined("whatsapp")}><MessageCircle size={16}/>WhatsApp</button><button className="sharechoice" disabled={!canCombine||shareBusy} onClick={()=>shareCombined("wechat")}><MessageCircle size={16}/>WeChat</button><button className="sharechoice" disabled={!canCombine||shareBusy} onClick={()=>shareCombined("telegram")}><Send size={16}/>Telegram</button></div></div>{shareNotice&&<div className="sharenotice">{shareNotice}</div>}</div></div>}
 {editing&&<RecordModal title={`${editing.documentNo?"Edit":"Add"} ${isInvoice?"invoice":"quotation"}`} onCancel={()=>setEditing(null)} onSave={()=>commit(editing)}><label>Document number<input value={editing.documentNo} onChange={event=>setEditing({...editing,documentNo:event.target.value.toUpperCase()})}/></label><label>Document date<input type="date" value={editing.date} onChange={event=>setEditing({...editing,date:event.target.value})}/></label>{isInvoice?<label>Due date<input type="date" value={editing.dueDate} onChange={event=>setEditing({...editing,dueDate:event.target.value})}/></label>:<label>Valid until<input type="date" value={editing.validUntil} onChange={event=>setEditing({...editing,validUntil:event.target.value})}/></label>}{access.isAllCompanies?<label>Company<select value={editing.companyId} onChange={event=>chooseCompany(event.target.value)}>{companies.map(item=><option key={item.id} value={item.id}>{item.company}</option>)}</select></label>:<label>Company<input value={companies[0]?.company||"Assigned company"} readOnly/></label>}<label>Document language<select value={editing.language} onChange={event=>{const language=event.target.value as DocumentLanguage;const ownCompany=companies.find(item=>item.id===editing.companyId)||companyDefaults[0];setEditing({...editing,language,terms:companyTerms(ownCompany,language)})}}><option value="EN">English</option><option value="ZH">中文</option></select></label><label>Status<select value={editing.status} onChange={event=>setEditing({...editing,status:event.target.value as DocumentStatus})}>{statusOptions.map(status=><option key={status}>{status}</option>)}</select></label>{clients.length>0&&<label className="wide">Load saved client<select defaultValue="" onChange={event=>chooseClient(event.target.value)}><option value="">Choose a client to fill the fields</option>{clients.map(client=><option key={client.id} value={client.id}>{client.company} · {client.contactName}</option>)}</select></label>}<label>Client / company<input value={editing.clientName} onChange={event=>setEditing({...editing,clientName:event.target.value})}/></label><label>Contact person<input value={editing.clientContact} onChange={event=>setEditing({...editing,clientContact:event.target.value})}/></label><label>Phone<input value={editing.clientPhone} onChange={event=>setEditing({...editing,clientPhone:event.target.value})}/></label><label>Client UEN<input value={editing.clientUen} onChange={event=>setEditing({...editing,clientUen:event.target.value})}/></label><label className="wide">Client address<input value={editing.clientAddress} onChange={event=>setEditing({...editing,clientAddress:event.target.value})}/></label>{isInvoice&&<div className="wide panel invoicejobformatter"><div className="panelhead"><div><span>SMART JOB FORMATTER</span><h2>Paste customer trip details</h2></div></div><textarea rows={12} value={quickJobText} onChange={event=>setQuickJobText(event.target.value)} placeholder={"Paste any customer message in Chinese or English. Multiple jobs, dates, routes, flights, passenger counts, vehicle types, pickup and drop-off points are supported."}/><div className="invoicejobexample"><strong>Detects multiple jobs automatically</strong><span>Time · service · duration · flight · passenger · vehicle · pickup · drop-off · itinerary</span></div><button type="button" className="primary" onClick={addFormattedJob}><Plus size={16}/>Arrange and add job(s)</button></div>}<div className="wide documentitemseditor"><div className="documentitemshead"><div><strong>Line items</strong><span>Add services, quantities and rates.</span></div><button className="ghost" onClick={addItem}><Plus size={15}/>Add line</button></div><div className="tablewrap"><table><thead><tr><th>Description</th><th>Qty</th>{isInvoice&&<th>Pax</th>}<th>Client Rate</th>{isInvoice&&<><th>Driver</th><th>Job Payout</th></>}<th>Amount</th><th></th></tr></thead><tbody>{editing.items.map(item=><tr key={item.id}><td><textarea aria-label="Item description" rows={5} value={item.description} onChange={event=>updateItem(item.id,{description:event.target.value})}/>{item.claimId&&<small>Linked claim: {item.claimId}</small>}</td><td><input aria-label="Quantity" type="number" min="0.01" step="0.01" value={item.quantity||""} onChange={event=>updateItem(item.id,{quantity:Number(event.target.value)})}/></td>{isInvoice&&<td><input aria-label="Passenger count" value={item.passenger||""} onChange={event=>{const passenger=event.target.value;updateItem(item.id,{passenger,claimRate:item.driverId?(findJobPayoutRate(passenger)||item.claimRate||0):item.claimRate})}} placeholder="e.g. 3 pax"/><small>{jobPayoutTierLabel(item.passenger)}</small></td>}<td><input aria-label="Rate" type="number" min="0" step="0.01" value={item.rate||""} onChange={event=>updateItem(item.id,{rate:Number(event.target.value)})}/><small>{item.rateService?`Client fixed rate · ${item.rateService} · ${item.vehicleType||"vehicle"}`:"Client rate may be entered manually; driver is optional"}</small></td>{isInvoice&&<><td><select value={item.driverId||""} onChange={event=>{const driver=sharedDrivers.find(row=>row.id===event.target.value);const client=clients.find(row=>row.company.trim().toLowerCase()===editing.clientName.trim().toLowerCase());const service=inferFixedRateService(item);const vehicleType=driver?.vehicleType||"5 Seater";const clientRate=driver?findFixedRate("client",service,vehicleType,client?.id):item.rate;const jobPayout=driver?findJobPayoutRate(item.passenger):0;updateItem(item.id,{driverId:driver?.id||"",driverName:driver?.name||"",rateService:service,vehicleType,rate:clientRate||item.rate,claimRate:jobPayout||item.claimRate||0})}}><option value="">No driver claim</option>{sharedDrivers.filter(driver=>driver.status==="Active").map(driver=><option key={driver.id} value={driver.id}>{driver.name} · {driver.carPlate}</option>)}</select></td><td><input aria-label="Driver claim rate" type="number" min="0" step="0.01" value={item.claimRate||""} onChange={event=>updateItem(item.id,{claimRate:Number(event.target.value)})} placeholder="Driver payout"/><small>{item.driverId?(findJobPayoutRate(item.passenger)?`Job payout applied · ${jobPayoutTierLabel(item.passenger)}`:"Enter pax or set payout manually"):"Select driver"}</small></td></>}<td>{format(item.quantity*item.rate)}</td><td><button className="rowaction danger" aria-label="Delete line item" disabled={editing.items.length===1} onClick={()=>removeItem(item.id)}><Trash2 size={14}/></button></td></tr>)}</tbody></table></div></div><label>Discount (SGD)<input type="number" min="0" step="0.01" value={editing.discount||""} onChange={event=>setEditing({...editing,discount:Number(event.target.value)})}/></label><label>GST<select value={editing.gstEnabled?"Enabled":"Disabled"} onChange={event=>setEditing({...editing,gstEnabled:event.target.value==="Enabled"})}><option>Disabled</option><option>Enabled</option></select></label>{editing.gstEnabled&&<label>GST rate (%)<input type="number" min="0" max="100" step="0.01" value={editing.gstRate} onChange={event=>setEditing({...editing,gstRate:Number(event.target.value)})}/></label>}{editingCompany?.companyType==="Limousine Company"&&<label className="wide">{editing.language==="ZH"?"中文条款与条件":"Terms & Conditions"}<textarea rows={10} value={companyTerms(editingCompany,editing.language)} readOnly/><small>Managed under Company Management → Limousine Terms & Conditions.</small></label>}<label className="wide">Notes<textarea rows={3} value={editing.notes} onChange={event=>setEditing({...editing,notes:event.target.value})}/></label></RecordModal>}</>
}

function addDays(dateValue:string,days:number){const [year,month,day]=dateValue.split("-").map(Number);const date=new Date(Date.UTC(year,month-1,day));date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10)}


type DriverClaimStatus="Submitted"|"Approved"|"Rejected"|"Paid";
type DriverClaimRecord={id:string;bookingRef:string;invoiceNo?:string;lineItemId?:string;companyId:string;driverId:string;driverName:string;customer:string;service:string;tripDate:string;route:string;baseRate:number;extras:number;total:number;notes:string;status:DriverClaimStatus;submittedAt:string};
const DRIVER_CLAIM_STORAGE_KEY="a3-driver-claims-v1";
function parseBookingAmount(value:string){return Number(String(value).replace(/[^0-9.]/g,""))||0}
function DriverClaims(){
 const access=useCompanyAccess();
 const [records,setRecords]=useState<DriverClaimRecord[]>(()=>load(DRIVER_CLAIM_STORAGE_KEY,[]));
 const [editing,setEditing]=useState<DriverClaimRecord|null>(null);
 const visible=useMemo(()=>records.filter(record=>access.user.role==="ADMIN"||(access.user.role==="DRIVER"?record.driverId===access.user.driverId:record.companyId===access.companyId)),[records,access]);
 useEffect(()=>save(DRIVER_CLAIM_STORAGE_KEY,records),[records]);
 const openNew=()=>setEditing({id:`CLM-${Date.now()}`,bookingRef:"",companyId:access.companyId,driverId:access.user.driverId,driverName:access.user.name,customer:"",service:"",tripDate:"",route:"",baseRate:0,extras:0,total:0,notes:"",status:"Submitted",submittedAt:new Date().toISOString()});
 const chooseBooking=(ref:string)=>{if(!editing)return;const row=bookings.find(item=>item[0].trim().toLowerCase()===ref.trim().toLowerCase());if(!row){setEditing({...editing,bookingRef:ref});return}const baseRate=parseBookingAmount(row[6]);setEditing({...editing,bookingRef:ref,customer:row[1],service:row[3],tripDate:row[2],route:row[2],baseRate,extras:0,total:baseRate})};
 const commit=(claim:DriverClaimRecord)=>{if(!claim.driverName||claim.total<=0)return false;const clean={...claim,bookingRef:claim.bookingRef.trim(),extras:0,total:Math.max(0,Number(claim.baseRate)||0)};setRecords(current=>current.some(item=>item.id===clean.id)?current.map(item=>item.id===clean.id?clean:item):[clean,...current]);setEditing(null);return true};
 const updateStatus=(id:string,status:DriverClaimStatus)=>setRecords(current=>current.map(item=>item.id===id?{...item,status}:item));
 const remove=(record:DriverClaimRecord)=>{if(window.confirm(`Delete claim ${record.id}?`))setRecords(current=>current.filter(item=>item.id!==record.id))};
 return <><Heading eyebrow="DRIVER · JOB CLAIMS" title="Driver Claims" copy="Drivers may type a booked job ID. Matching jobs fill the customer, service and job-based payout automatically before submission." action={access.user.role==="DRIVER"?"Submit claim":"Add claim"} onAction={openNew}/><div className="panel"><div className="tablewrap"><table><thead><tr>{["Claim","Booking","Driver","Customer","Service","Rate","Total","Status","Actions"].map(item=><th key={item}>{item}</th>)}</tr></thead><tbody>{visible.length?visible.map(record=><tr key={record.id}><td>{record.id}</td><td>{record.bookingRef}<br/><small>{record.invoiceNo?`Invoice ${record.invoiceNo} · `:""}{record.tripDate}</small></td><td>{record.driverName}</td><td>{record.customer}</td><td>{record.service}</td><td>S${record.baseRate.toFixed(2)}</td><td><strong>S${record.total.toFixed(2)}</strong></td><td><span className={`status ${record.status.toLowerCase()}`}>{record.status}</span></td><td><div className="rowactions">{access.user.role!=="DRIVER"&&record.status==="Submitted"&&<><button className="rowaction" onClick={()=>updateStatus(record.id,"Approved")}><CheckCircle2 size={14}/>Approve</button><button className="rowaction danger" onClick={()=>updateStatus(record.id,"Rejected")}><X size={14}/>Reject</button></>}{access.user.role!=="DRIVER"&&record.status==="Approved"&&<button className="rowaction" onClick={()=>updateStatus(record.id,"Paid")}><BadgeDollarSign size={14}/>Mark paid</button>}<button className="rowaction" onClick={()=>setEditing({...record})}><Pencil size={14}/>View/Edit</button><button className="rowaction danger" onClick={()=>remove(record)}><Trash2 size={14}/>Delete</button></div></td></tr>):<tr><td colSpan={9}>No driver claims submitted yet.</td></tr>}</tbody></table></div></div>{editing&&<RecordModal title={records.some(item=>item.id===editing.id)?"Driver claim":"Submit driver claim"} onCancel={()=>setEditing(null)} onSave={()=>commit(editing)}><label>Booked Job ID <span className="optional">(optional)</span><input list="driver-claim-bookings" value={editing.bookingRef} onChange={event=>chooseBooking(event.target.value)} placeholder="Driver may type the job ID or leave blank"/><datalist id="driver-claim-bookings">{bookings.map(row=><option key={row[0]} value={row[0]}>{row[1]} · {row[3]}</option>)}</datalist></label><label>Driver<input value={editing.driverName} onChange={event=>setEditing({...editing,driverName:event.target.value})} readOnly={access.user.role==="DRIVER"}/></label><label>Customer<input value={editing.customer} readOnly/></label><label>Service<input value={editing.service} readOnly/></label><label>Trip date / time<input value={editing.tripDate} readOnly/></label><label>Booked rate<input value={`S$${editing.baseRate.toFixed(2)}`} readOnly/></label><label>Total claim<input value={`S$${editing.total.toFixed(2)}`} readOnly/></label><label className="wide">Claim notes<textarea rows={3} value={editing.notes} onChange={event=>setEditing({...editing,notes:event.target.value})} placeholder="Example: Airport transfer completed. Customer and route verified."/></label>{access.user.role!=="DRIVER"&&<label>Status<select value={editing.status} onChange={event=>setEditing({...editing,status:event.target.value as DriverClaimStatus})}><option>Submitted</option><option>Approved</option><option>Rejected</option><option>Paid</option></select></label>}</RecordModal>}</>
}

function EditableSection({eyebrow,title,copy,action,onAdd,headers,rows,children}:{eyebrow:string;title:string;copy:string;action:string;onAdd:()=>void;headers:string[];rows:ReactNode[][];children?:ReactNode}){return <><Heading eyebrow={eyebrow} title={title} copy={copy} action={action} onAction={onAdd}/><div className="panel"><div className="tablewrap"><table><thead><tr>{headers.map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{rows.length?rows.map((row,i)=><tr key={String(row[0]??i)}>{row.map((cell,j)=><td key={j}>{cell}</td>)}</tr>):<tr><td colSpan={headers.length}>No records yet. Select <strong>{action}</strong> to create one.</td></tr>}</tbody></table></div></div>{children}</>}
function PdfExactPreview({record,language,kind,company,title}:{record:FinancialDocumentRecord;language:DocumentLanguage;kind:DocumentKind;company:PdfCompanyIdentity;title:string}){
 const [url,setUrl]=useState("");
 useEffect(()=>{
  let cancelled=false;
  const timer=window.setTimeout(()=>{
   void (async()=>{
    const file=await createDocumentPdf({...record,language},kind,company);
    const next=URL.createObjectURL(file);
    if(cancelled){URL.revokeObjectURL(next);return}
    setUrl(current=>{if(current)URL.revokeObjectURL(current);return next});
   })();
  },80);
  return()=>{cancelled=true;window.clearTimeout(timer)};
 },[record,language,kind,company.company,company.companyType,company.uen,company.gst,company.email,company.phone,company.address,company.currency,company.accentColour,company.bankName,company.bankAccountName,company.bankAccountNumber,company.bankBranchCode,company.bankSwiftCode,company.payNowType,company.payNowValue,company.paymentInstructions,company.logoData,company.chopData,company.logoWidth,company.logoHeight,company.chopWidth,company.chopHeight]);
 useEffect(()=>()=>{if(url)URL.revokeObjectURL(url)},[url]);
 return <div className="pdfexactpreview"><div className="pdfpreviewlabel"><strong>Exact PDF Preview</strong><span>The preview below is the same file used for download and sharing.</span></div>{url?<iframe src={`${url}#toolbar=0&navpanes=0&view=FitH`} title={title}/>:<div className="panel empty">Preparing PDF preview…</div>}</div>
}

function RecordModal({title,onCancel,onSave,children,className=""}:{title:string;onCancel:()=>void;onSave:()=>boolean;children:ReactNode;className?:string}){const [error,setError]=useState("");const submit=()=>{if(!onSave())setError("Complete the required fields and enter a rate greater than zero where applicable.")};return <div className="modalbackdrop" onMouseDown={onCancel}><div className={`modal ${className}`} onMouseDown={e=>e.stopPropagation()}><div className="modalhead"><div><span>RECORD MANAGEMENT</span><h2>{title}</h2></div><button className="modalclose" onClick={onCancel}><X size={19}/></button></div>{error&&<div className="formerror">{error}</div>}<div className="rulegrid">{children}</div><div className="modalactions"><button className="ghost" onClick={onCancel}>Cancel</button><button className="primary" onClick={submit}><Save size={16}/>Save</button></div></div></div>}
function nextId(prefix:string,count:number){return `${prefix}-${String(count+1).padStart(3,"0")}`}
const money2Formatter=new Intl.NumberFormat("en-SG",{style:"currency",currency:"SGD",minimumFractionDigits:2});
function money2(value:number){return money2Formatter.format(value)}


type VehicleModelMap={id:string;model:string;vehicleType:string;active:boolean};
type DriverRecord={id:string;name:string;mobile:string;carModel:string;vehicleType:string;carPlate:string;licenceName:string;licenceData:string;pdvlStatus:"Active"|"Inactive";pdvlExpiry:string;bankName:string;bankAccount:string;paynow:string;commission:number;shopRebate:boolean;joinDate:string;status:"Active"|"Inactive"|"Suspended"};
const defaultVehicleModels:VehicleModelMap[]=[
 {id:"VM-001",model:"Toyota Camry",vehicleType:"5 Seater",active:true},
 {id:"VM-002",model:"Toyota Corolla Altis",vehicleType:"5 Seater",active:true},
 {id:"VM-003",model:"Honda Accord",vehicleType:"5 Seater",active:true},
 {id:"VM-004",model:"Honda Civic",vehicleType:"5 Seater",active:true},
 {id:"VM-005",model:"Hyundai Avante",vehicleType:"5 Seater",active:true},
 {id:"VM-006",model:"Kia Cerato",vehicleType:"5 Seater",active:true},
 {id:"VM-007",model:"Mercedes-Benz E-Class",vehicleType:"5 Seater Premium",active:true},
 {id:"VM-008",model:"BMW 5 Series",vehicleType:"5 Seater Premium",active:true},
 {id:"VM-009",model:"Audi A6",vehicleType:"5 Seater Premium",active:true},
 {id:"VM-010",model:"Lexus ES",vehicleType:"5 Seater Premium",active:true},
 {id:"VM-011",model:"Toyota Noah",vehicleType:"7 Seater",active:true},
 {id:"VM-012",model:"Toyota Voxy",vehicleType:"7 Seater",active:true},
 {id:"VM-013",model:"Toyota Sienta",vehicleType:"7 Seater",active:true},
 {id:"VM-014",model:"Toyota Innova",vehicleType:"7 Seater",active:true},
 {id:"VM-015",model:"Honda Freed",vehicleType:"7 Seater",active:true},
 {id:"VM-016",model:"Kia Carnival",vehicleType:"7 Seater",active:true},
 {id:"VM-017",model:"Hyundai Staria",vehicleType:"7 Seater",active:true},
 {id:"VM-018",model:"Toyota Alphard",vehicleType:"7 Seater Premium",active:true},
 {id:"VM-019",model:"Toyota Vellfire",vehicleType:"7 Seater Premium",active:true},
 {id:"VM-020",model:"Mercedes-Benz V-Class",vehicleType:"7 Seater Premium",active:true},
 {id:"VM-021",model:"Lexus LM",vehicleType:"7 Seater Premium",active:true},
 {id:"VM-022",model:"Maxus MIFA 9",vehicleType:"7 Seater Premium",active:true},
 {id:"VM-023",model:"Toyota Hiace Commuter",vehicleType:"13 Seater",active:true},
 {id:"VM-024",model:"Mercedes-Benz Sprinter",vehicleType:"13 Seater",active:true},
 {id:"VM-025",model:"King Long Minibus",vehicleType:"13 Seater",active:true},
 {id:"VM-026",model:"Toyota Coaster",vehicleType:"23 Seater",active:true},
 {id:"VM-027",model:"Mitsubishi Rosa",vehicleType:"23 Seater",active:true},
 {id:"VM-028",model:"Isuzu Journey",vehicleType:"23 Seater",active:true}
];

function loadSharedDrivers(fallback:DriverRecord[]):DriverRecord[]{
 if(typeof window==="undefined")return fallback;
 const sources:DriverRecord[][]=[load("a3-driver-records",fallback)];
 for(let index=0;index<window.localStorage.length;index+=1){
  const key=window.localStorage.key(index);
  if(key?.startsWith("a3-driver-records:"))sources.push(load<DriverRecord[]>(key,[]));
 }
 const merged=new Map<string,DriverRecord>();
 for(const records of sources)for(const record of records){
  const identity=record.id||`${record.mobile}|${record.carPlate}`;
  if(!merged.has(identity))merged.set(identity,record);
 }
 const result=Array.from(merged.values());
 // Pure read only: do not write or emit cloud status while React is rendering.
 return result;
}
const defaultDrivers:DriverRecord[]=[{id:"DRV-001",name:"Muhammad Firdaus",mobile:"+65 9123 4567",carModel:"Toyota Noah",vehicleType:"7 Seater",carPlate:"SNA 1234A",licenceName:"",licenceData:"",pdvlStatus:"Active",pdvlExpiry:"2027-06-30",bankName:"DBS",bankAccount:"123-456789-0",paynow:"+65 9123 4567",commission:10,shopRebate:true,joinDate:"2026-07-25",status:"Active"}];

type DriverPayoutAdjustment={claimId:string;incentive:number;deduction:number;paymentReference:string;notes:string;updatedAt:string};
const DRIVER_PAYOUT_ADJUSTMENT_STORAGE_KEY="a3-driver-payout-adjustments-v1";
type DriverPayoutPeriod=ReportPeriod;
function csvCell(value:unknown){const text=String(value??"");return /[",\n]/.test(text)?`"${text.replace(/"/g,'""')}"`:text}
function downloadCsvFile(filename:string,rows:unknown[][]){const content=rows.map(row=>row.map(csvCell).join(",")).join("\n");const blob=new Blob(["\uFEFF",content],{type:"text/csv;charset=utf-8"});const url=URL.createObjectURL(blob);const link=document.createElement("a");link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url)}
function payoutReportDate(record:DriverClaimRecord){const match=String(record.tripDate||"").match(/\d{4}-\d{2}-\d{2}/);return match?.[0]||record.submittedAt.slice(0,10)}
function claimDate(record:DriverClaimRecord){const direct=new Date(`${payoutReportDate(record)}T00:00:00`);return Number.isNaN(direct.getTime())?new Date(record.submittedAt):direct}
function inPayoutPeriod(record:DriverClaimRecord,period:DriverPayoutPeriod){return dateInReportPeriod(payoutReportDate(record),period)}
function payoutNet(claim:DriverClaimRecord,adjustment?:DriverPayoutAdjustment){return Math.max(0,Number(claim.total)||0)+Math.max(0,Number(adjustment?.incentive)||0)-Math.max(0,Number(adjustment?.deduction)||0)}

function DriverPayoutReport(){
 const access=useCompanyAccess();
 const [claims,setClaims]=useState<DriverClaimRecord[]>(()=>load(DRIVER_CLAIM_STORAGE_KEY,[]));
 const [adjustments,setAdjustments]=useState<DriverPayoutAdjustment[]>(()=>load(DRIVER_PAYOUT_ADJUSTMENT_STORAGE_KEY,[]));
 const [driverFilter,setDriverFilter]=useState(access.user.role==="DRIVER"?access.user.driverId:"ALL");
 const [statusFilter,setStatusFilter]=useState<"ALL"|DriverClaimStatus>("ALL");
 const [period,setPeriod]=useState<DriverPayoutPeriod>("THIS_MONTH");
 const [editing,setEditing]=useState<{claim:DriverClaimRecord;adjustment:DriverPayoutAdjustment}|null>(null);
 useEffect(()=>save(DRIVER_CLAIM_STORAGE_KEY,claims),[claims]);
 useEffect(()=>save(DRIVER_PAYOUT_ADJUSTMENT_STORAGE_KEY,adjustments),[adjustments]);
 const accessible=useMemo(()=>claims.filter(record=>access.user.role==="ADMIN"||(access.user.role==="DRIVER"?record.driverId===access.user.driverId:record.companyId===access.companyId)),[claims,access.user.role,access.user.driverId,access.companyId]);
 const drivers=useMemo(()=>{const directory=loadSharedDrivers(defaultDrivers);const map=new Map<string,{id:string;name:string}>();for(const driver of directory)map.set(driver.id,{id:driver.id,name:driver.name});for(const claim of accessible)if(claim.driverId&&!map.has(claim.driverId))map.set(claim.driverId,{id:claim.driverId,name:claim.driverName});return Array.from(map.values()).sort((a,b)=>a.name.localeCompare(b.name))},[accessible]);
 const adjustmentByClaim=useMemo(()=>new Map(adjustments.map(item=>[item.claimId,item])),[adjustments]);
 const visible=useMemo(()=>accessible.filter(record=>(driverFilter==="ALL"||record.driverId===driverFilter)&&(statusFilter==="ALL"||record.status===statusFilter)&&inPayoutPeriod(record,period)).sort((a,b)=>claimDate(b).getTime()-claimDate(a).getTime()),[accessible,driverFilter,statusFilter,period]);
 const gross=visible.reduce((sum,record)=>sum+Math.max(0,Number(record.total)||0),0);
 const incentives=visible.reduce((sum,record)=>sum+(adjustmentByClaim.get(record.id)?.incentive||0),0);
 const deductions=visible.reduce((sum,record)=>sum+(adjustmentByClaim.get(record.id)?.deduction||0),0);
 const net=visible.reduce((sum,record)=>sum+payoutNet(record,adjustmentByClaim.get(record.id)),0);
 const paid=visible.filter(record=>record.status==="Paid").reduce((sum,record)=>sum+payoutNet(record,adjustmentByClaim.get(record.id)),0);
 const outstanding=visible.filter(record=>record.status!=="Paid"&&record.status!=="Rejected").reduce((sum,record)=>sum+payoutNet(record,adjustmentByClaim.get(record.id)),0);
 const setStatus=(id:string,status:DriverClaimStatus)=>setClaims(current=>current.map(record=>record.id===id?{...record,status}:record));
 const editAdjustment=(claim:DriverClaimRecord)=>setEditing({claim,adjustment:adjustmentByClaim.get(claim.id)||{claimId:claim.id,incentive:0,deduction:0,paymentReference:"",notes:"",updatedAt:new Date().toISOString()}});
 const commitAdjustment=(record:DriverPayoutAdjustment)=>{const clean={...record,incentive:Math.max(0,Number(record.incentive)||0),deduction:Math.max(0,Number(record.deduction)||0),updatedAt:new Date().toISOString()};setAdjustments(current=>current.some(item=>item.claimId===clean.claimId)?current.map(item=>item.claimId===clean.claimId?clean:item):[clean,...current]);setEditing(null);return true};
 const exportReport=()=>downloadCsvFile(`driver-payout-${new Date().toISOString().slice(0,10)}.csv`,[["Claim","Booking","Driver","Trip Date","Customer","Service","Gross","Incentive","Deduction","Net Payout","Status","Payment Reference","Notes"],...visible.map(claim=>{const adjustment=adjustmentByClaim.get(claim.id);return [claim.id,claim.bookingRef,claim.driverName,claim.tripDate,claim.customer,claim.service,claim.total,adjustment?.incentive||0,adjustment?.deduction||0,payoutNet(claim,adjustment),claim.status,adjustment?.paymentReference||"",adjustment?.notes||""]})]);
 return <><Heading eyebrow="DRIVER · PAYOUT CONTROL" title="Driver Report Payout" copy="Live payout report generated from driver claims and invoice-assigned jobs. Review gross earnings, incentives, deductions, net payout and payment status." action="Print report" onAction={()=>window.print()}/>
 <div className="documenttoolbar reportfilters"><PeriodSelect value={period} onChange={setPeriod}/>{access.user.role!=="DRIVER"&&<select value={driverFilter} onChange={event=>setDriverFilter(event.target.value)}><option value="ALL">All Drivers</option>{drivers.map(driver=><option key={driver.id} value={driver.id}>{driver.name}</option>)}</select>}<select value={statusFilter} onChange={event=>setStatusFilter(event.target.value as "ALL"|DriverClaimStatus)}><option value="ALL">All Statuses</option><option>Submitted</option><option>Approved</option><option>Paid</option><option>Rejected</option></select><button className="ghost" onClick={exportReport}><Download size={17}/>Export CSV</button></div>
 <div className="periodsummary">Viewing <strong>{reportPeriodLabel(period)}</strong> · Based on trip date where available.</div>
 <div className="grid3"><div className="panel mini"><span>Gross Claims</span><strong>{money2(gross)}</strong><small>{visible.length} payout record{visible.length===1?"":"s"}</small></div><div className="panel mini"><span>Net Payout</span><strong>{money2(net)}</strong><small>+{money2(incentives)} incentives · -{money2(deductions)} deductions</small></div><div className="panel mini"><span>Outstanding</span><strong>{money2(outstanding)}</strong><small>Paid {money2(paid)}</small></div></div>
 <div className="panel"><div className="tablewrap"><table><thead><tr>{["Claim / Booking","Driver","Trip / Customer","Service","Gross","Incentive","Deduction","Net Payout","Status","Payment Ref.","Actions"].map(header=><th key={header}>{header}</th>)}</tr></thead><tbody>{visible.length?visible.map(claim=>{const adjustment=adjustmentByClaim.get(claim.id);return <tr key={claim.id}><td><strong>{claim.id}</strong><br/><small>{claim.bookingRef||"Manual claim"}</small></td><td>{claim.driverName}</td><td>{claim.tripDate||"—"}<br/><small>{claim.customer||"—"}</small></td><td>{claim.service||"Transport service"}</td><td>{money2(claim.total)}</td><td>{money2(adjustment?.incentive||0)}</td><td>{money2(adjustment?.deduction||0)}</td><td><strong>{money2(payoutNet(claim,adjustment))}</strong></td><td><span className={`status ${claim.status.toLowerCase()}`}>{claim.status}</span></td><td>{adjustment?.paymentReference||"—"}</td><td><div className="rowactions">{access.user.role!=="DRIVER"&&<><button className="rowaction" onClick={()=>editAdjustment(claim)}><Pencil size={14}/>Adjust</button>{claim.status==="Submitted"&&<button className="rowaction" onClick={()=>setStatus(claim.id,"Approved")}><CheckCircle2 size={14}/>Approve</button>}{claim.status==="Approved"&&<button className="rowaction" onClick={()=>setStatus(claim.id,"Paid")}><BadgeDollarSign size={14}/>Mark paid</button>}{claim.status==="Paid"&&<button className="rowaction" onClick={()=>setStatus(claim.id,"Approved")}>Reopen</button>}</>}</div></td></tr>}):<tr><td colSpan={11}>No payout records match the selected filters. Assign a driver and claim rate in an invoice, or submit a record under Driver Claims.</td></tr>}</tbody></table></div></div>
 {editing&&<RecordModal title={`Payout adjustment · ${editing.claim.id}`} onCancel={()=>setEditing(null)} onSave={()=>commitAdjustment(editing.adjustment)}><label>Driver<input value={editing.claim.driverName} readOnly/></label><label>Gross claim<input value={money2(editing.claim.total)} readOnly/></label><label>Incentive (SGD)<input type="number" min="0" step="0.01" value={editing.adjustment.incentive||""} onChange={event=>setEditing({...editing,adjustment:{...editing.adjustment,incentive:Number(event.target.value)}})}/></label><label>Deduction (SGD)<input type="number" min="0" step="0.01" value={editing.adjustment.deduction||""} onChange={event=>setEditing({...editing,adjustment:{...editing.adjustment,deduction:Number(event.target.value)}})}/></label><label>Net payout<input value={money2(payoutNet(editing.claim,editing.adjustment))} readOnly/></label><label>Payment reference<input value={editing.adjustment.paymentReference} onChange={event=>setEditing({...editing,adjustment:{...editing.adjustment,paymentReference:event.target.value}})} placeholder="PayNow / bank reference"/></label><label className="wide">Payout notes<textarea rows={3} value={editing.adjustment.notes} onChange={event=>setEditing({...editing,adjustment:{...editing.adjustment,notes:event.target.value}})}/></label></RecordModal>}</>
}

type DriverAvailability="Available"|"On Job"|"Offline";
type DriverNetworkRecord={driverId:string;availability:DriverAvailability;coverage:string;services:string;notes:string;updatedAt:string};
const DRIVER_NETWORK_STORAGE_KEY="a3-driver-network-v1";
function availabilityClass(value:DriverAvailability){return value==="Available"?"available":value==="On Job"?"onjob":"offline"}
function whatsappNumber(value:string){const digits=value.replace(/\D/g,"");return digits.startsWith("65")?digits:`65${digits}`}
function DriverNetwork(){
 const access=useCompanyAccess();
 const drivers=useMemo(()=>loadSharedDrivers(defaultDrivers),[]);
 const [network,setNetwork]=useState<DriverNetworkRecord[]>(()=>load(DRIVER_NETWORK_STORAGE_KEY,[]));
 const [query,setQuery]=useState("");
 const [vehicleFilter,setVehicleFilter]=useState("ALL");
 const [availabilityFilter,setAvailabilityFilter]=useState<"ALL"|DriverAvailability>("ALL");
 const [editing,setEditing]=useState<DriverNetworkRecord|null>(null);
 useEffect(()=>save(DRIVER_NETWORK_STORAGE_KEY,network),[network]);
 const networkByDriver=useMemo(()=>new Map(network.map(record=>[record.driverId,record])),[network]);
 const recordFor=(driver:DriverRecord):DriverNetworkRecord=>networkByDriver.get(driver.id)||{driverId:driver.id,availability:driver.status==="Active"?"Available":"Offline",coverage:"Singapore Islandwide",services:driver.vehicleType.includes("7 Seater")?"Airport · Point to Point · Hourly · SG-JB":"Airport · Point to Point · Hourly",notes:"",updatedAt:driver.joinDate?`${driver.joinDate}T00:00:00.000Z`:new Date().toISOString()};
 const accessible=useMemo(()=>drivers.filter(driver=>access.user.role!=="DRIVER"||driver.id===access.user.driverId),[drivers,access.user.role,access.user.driverId]);
 const visible=useMemo(()=>accessible.filter(driver=>{const record=recordFor(driver);const text=`${driver.name} ${driver.mobile} ${driver.carModel} ${driver.vehicleType} ${driver.carPlate} ${record.coverage} ${record.services}`.toLowerCase();return (!query.trim()||text.includes(query.trim().toLowerCase()))&&(vehicleFilter==="ALL"||driver.vehicleType===vehicleFilter)&&(availabilityFilter==="ALL"||record.availability===availabilityFilter)}),[accessible,query,vehicleFilter,availabilityFilter,networkByDriver]);
 const available=accessible.filter(driver=>recordFor(driver).availability==="Available").length;
 const onJob=accessible.filter(driver=>recordFor(driver).availability==="On Job").length;
 const fleetTypes=new Set(accessible.filter(driver=>driver.status==="Active").map(driver=>driver.vehicleType)).size;
 const commit=(record:DriverNetworkRecord)=>{const clean={...record,coverage:record.coverage.trim()||"Singapore Islandwide",services:record.services.trim()||"Airport · Point to Point · Hourly",updatedAt:new Date().toISOString()};setNetwork(current=>current.some(item=>item.driverId===clean.driverId)?current.map(item=>item.driverId===clean.driverId?clean:item):[clean,...current]);setEditing(null);return true};
 return <><Heading eyebrow="DRIVER · LIVE DIRECTORY" title="Driver Network" copy="Search the shared driver directory, view real-time availability and fleet capability, and keep coverage or service information current."/>
 <div className="documenttoolbar reportfilters"><input className="networksearch" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search driver, mobile, plate or vehicle"/><select value={vehicleFilter} onChange={event=>setVehicleFilter(event.target.value)}><option value="ALL">All Vehicle Types</option>{vehicleTypes.map(type=><option key={type}>{type}</option>)}</select><select value={availabilityFilter} onChange={event=>setAvailabilityFilter(event.target.value as "ALL"|DriverAvailability)}><option value="ALL">All Availability</option><option>Available</option><option>On Job</option><option>Offline</option></select></div>
 <div className="grid3"><div className="panel mini"><span>Available Now</span><strong>{available}</strong><small>Ready for assignment</small></div><div className="panel mini"><span>On Job</span><strong>{onJob}</strong><small>Currently occupied</small></div><div className="panel mini"><span>Fleet Capability</span><strong>{fleetTypes}</strong><small>Active vehicle types</small></div></div>
 <div className="panel"><div className="tablewrap"><table><thead><tr>{["Driver","Contact","Vehicle","Availability","Coverage","Services","PDVL","Last Update","Actions"].map(header=><th key={header}>{header}</th>)}</tr></thead><tbody>{visible.length?visible.map(driver=>{const record=recordFor(driver);const canEdit=access.user.role!=="DRIVER"||driver.id===access.user.driverId;return <tr key={driver.id}><td><strong>{driver.name}</strong><br/><small>{driver.id} · {driver.status}</small></td><td>{driver.mobile}<br/><small>{driver.paynow?`PayNow ${driver.paynow}`:"No PayNow"}</small></td><td>{driver.carModel}<br/><small>{driver.vehicleType} · {driver.carPlate}</small></td><td><span className={`status ${availabilityClass(record.availability)}`}>{record.availability}</span></td><td>{record.coverage}</td><td>{record.services}</td><td>{driver.pdvlStatus}<br/><small>{driver.pdvlExpiry||"No expiry date"}</small></td><td>{new Intl.DateTimeFormat("en-SG",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}).format(new Date(record.updatedAt))}</td><td><div className="rowactions"><a className="rowaction" href={`https://wa.me/${whatsappNumber(driver.mobile)}`} target="_blank" rel="noreferrer"><MessageCircle size={14}/>WhatsApp</a>{canEdit&&<button className="rowaction" onClick={()=>setEditing({...record})}><Pencil size={14}/>Update</button>}</div></td></tr>}):<tr><td colSpan={9}>No drivers match the search or filters. Add drivers under Driver Management first.</td></tr>}</tbody></table></div></div>
 {editing&&<RecordModal title={`Network status · ${drivers.find(driver=>driver.id===editing.driverId)?.name||editing.driverId}`} onCancel={()=>setEditing(null)} onSave={()=>commit(editing)}><label>Availability<select value={editing.availability} onChange={event=>setEditing({...editing,availability:event.target.value as DriverAvailability})}><option>Available</option><option>On Job</option><option>Offline</option></select></label><label>Coverage<input value={editing.coverage} onChange={event=>setEditing({...editing,coverage:event.target.value})} placeholder="Singapore Islandwide / East / SG-JB"/></label><label className="wide">Services<input value={editing.services} onChange={event=>setEditing({...editing,services:event.target.value})} placeholder="Airport · Point to Point · Hourly"/></label><label className="wide">Network notes<textarea rows={3} value={editing.notes} onChange={event=>setEditing({...editing,notes:event.target.value})} placeholder="Shift timing, luggage capacity, child seat, special notes"/></label></RecordModal>}</>
}
function DriverManagement(){
 const [models,setModels]=useState<VehicleModelMap[]>(()=>load("a3-vehicle-model-map",defaultVehicleModels));
 const [drivers,setDrivers]=useState<DriverRecord[]>(()=>loadSharedDrivers(defaultDrivers));
 const [editing,setEditing]=useState<DriverRecord|null>(null);
 const [mapping,setMapping]=useState<VehicleModelMap|null>(null);
 useEffect(()=>save("a3-vehicle-model-map",models),[models]);
 useEffect(()=>save("a3-driver-records",drivers),[drivers]);
 const modelType=(model:string)=>models.find(m=>m.model===model)?.vehicleType||"";
 const saveDriver=(record:DriverRecord)=>{if(!record.name.trim()||!record.mobile.trim()||!record.carModel||!record.carPlate.trim())return false;const final={...record,vehicleType:modelType(record.carModel)};setDrivers(list=>record.id?list.map(x=>x.id===record.id?final:x):[...list,{...final,id:nextId("DRV",list.length)}]);setEditing(null);return true};
 const saveMap=(record:VehicleModelMap)=>{if(!record.model.trim()||!record.vehicleType)return false;setModels(list=>record.id?list.map(x=>x.id===record.id?record:x):[...list,{...record,id:nextId("VM",list.length)}]);setMapping(null);return true};
 return <><Heading eyebrow="ADMIN · DRIVER & VEHICLE MAPPING" title="Driver Management" copy="Shared driver directory for every company. All permitted users see the same drivers, vehicle mappings and payout details." action="Add Driver" onAction={()=>setEditing({id:"",name:"",mobile:"",carModel:models.find(m=>m.active)?.model||"",vehicleType:models.find(m=>m.active)?.vehicleType||"",carPlate:"",licenceName:"",licenceData:"",pdvlStatus:"Active",pdvlExpiry:"",bankName:"",bankAccount:"",paynow:"",commission:0,shopRebate:false,joinDate:new Date().toISOString().slice(0,10),status:"Active"})}/><div className="panel"><div className="panelhead"><div><span>Driver records</span><h2>Active driver directory</h2></div></div><div className="tablewrap"><table><thead><tr>{["Driver","Mobile","Car Model","Vehicle Type","Car Plate","PDVL","Commission","Shop Rebate","Status","Action"].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{drivers.map(d=><tr key={d.id}><td><strong>{d.name}</strong><br/><small>{d.id}</small></td><td>{d.mobile}</td><td>{d.carModel}</td><td>{d.vehicleType}</td><td>{d.carPlate}</td><td>{d.pdvlStatus}<br/><small>{d.pdvlExpiry||"No expiry"}</small></td><td>{d.commission}%</td><td>{d.shopRebate?"On":"Off"}</td><td><span className={`status ${d.status.toLowerCase()}`}>{d.status}</span></td><td><button className="rowaction" onClick={()=>setEditing({...d})}><Pencil size={14}/>Edit</button> <button className="rowaction danger" onClick={()=>setDrivers(list=>list.filter(x=>x.id!==d.id))}><Trash2 size={14}/>Delete</button></td></tr>)}</tbody></table></div></div><div className="panel"><div className="panelhead"><div><span>Vehicle Type Setup</span><h2>Car model mapping library</h2></div><button className="primary" onClick={()=>setMapping({id:"",model:"",vehicleType:vehicleTypes[0],active:true})}><Plus size={16}/>Add Model</button></div><div className="tablewrap"><table><thead><tr><th>Car Model</th><th>Automatic Vehicle Type</th><th>Status</th><th>Action</th></tr></thead><tbody>{models.map(m=><tr key={m.id}><td>{m.model}</td><td>{m.vehicleType}</td><td>{m.active?"Active":"Inactive"}</td><td><button className="rowaction" onClick={()=>setMapping({...m})}><Pencil size={14}/>Edit</button> <button className="rowaction danger" onClick={()=>setModels(list=>list.filter(x=>x.id!==m.id))}><Trash2 size={14}/>Delete</button></td></tr>)}</tbody></table></div></div>{editing&&<RecordModal title={editing.id?"Edit Driver":"Add Driver"} onCancel={()=>setEditing(null)} onSave={()=>saveDriver(editing)}><label>Driver Name<input value={editing.name} onChange={e=>setEditing({...editing,name:e.target.value})}/></label><label>Mobile<input value={editing.mobile} onChange={e=>setEditing({...editing,mobile:e.target.value})}/></label><label>Car Model<select value={editing.carModel} onChange={e=>setEditing({...editing,carModel:e.target.value,vehicleType:modelType(e.target.value)})}>{models.filter(m=>m.active).map(m=><option key={m.id}>{m.model}</option>)}</select></label><label>Vehicle Type<input value={editing.vehicleType} readOnly/></label><label>Car Plate<input value={editing.carPlate} onChange={e=>setEditing({...editing,carPlate:e.target.value.toUpperCase()})}/></label><label>Driving Licence<input type="file" accept="image/*,.pdf" onChange={e=>{const f=e.target.files?.[0];if(f)fileToData(f,(name,data)=>setEditing({...editing,licenceName:name,licenceData:data}))}}/>{editing.licenceName&&<small>{editing.licenceName}</small>}</label><label>PDVL Status<select value={editing.pdvlStatus} onChange={e=>setEditing({...editing,pdvlStatus:e.target.value as DriverRecord["pdvlStatus"]})}><option>Active</option><option>Inactive</option></select></label><label>PDVL Expiry<input type="date" value={editing.pdvlExpiry} onChange={e=>setEditing({...editing,pdvlExpiry:e.target.value})}/></label><label>Bank Name<input value={editing.bankName} onChange={e=>setEditing({...editing,bankName:e.target.value})}/></label><label>Bank Account<input value={editing.bankAccount} onChange={e=>setEditing({...editing,bankAccount:e.target.value})}/></label><label>PayNow<input value={editing.paynow} onChange={e=>setEditing({...editing,paynow:e.target.value})}/></label><label>Commission / Rebate %<input type="number" min="0" max="100" value={editing.commission} onChange={e=>setEditing({...editing,commission:Number(e.target.value)})}/></label><label>Shop Rebate<select value={editing.shopRebate?"On":"Off"} onChange={e=>setEditing({...editing,shopRebate:e.target.value==="On"})}><option>On</option><option>Off</option></select></label><label>Join Date<input type="date" value={editing.joinDate} onChange={e=>setEditing({...editing,joinDate:e.target.value})}/></label><label>Status<select value={editing.status} onChange={e=>setEditing({...editing,status:e.target.value as DriverRecord["status"]})}><option>Active</option><option>Inactive</option><option>Suspended</option></select></label></RecordModal>}{mapping&&<RecordModal title={mapping.id?"Edit Car Model Mapping":"Add Car Model Mapping"} onCancel={()=>setMapping(null)} onSave={()=>saveMap(mapping)}><label>Car Model<input value={mapping.model} onChange={e=>setMapping({...mapping,model:e.target.value})}/></label><label>Vehicle Type<select value={mapping.vehicleType} onChange={e=>setMapping({...mapping,vehicleType:e.target.value})}>{vehicleTypes.map(v=><option key={v}>{v}</option>)}</select></label><label>Status<select value={mapping.active?"Active":"Inactive"} onChange={e=>setMapping({...mapping,active:e.target.value==="Active"})}><option>Active</option><option>Inactive</option></select></label></RecordModal>}</>
}

const names:Record<string,[string,string,string]>={reports:["REPORTING","Profit & Loss","Live income, expense, invoice and quotation tallies with net profit or loss."],balancesheet:["REPORTING","Balance Sheet","Automatic partner opening, current-period and closing balances."],invoice:["DOCUMENTS","Invoice · English / 中文 A4 PDF","Create bilingual A4 invoices and print or save them as PDF."],quotation:["DOCUMENTS","Quotation · English / 中文 A4 PDF","Create bilingual A4 quotations using your company identity and approved rates."],payout:["DRIVER PRIVATE","Driver Report Payout","Review trip earnings, deductions, incentives and payout status."],rebate:["DRIVER PRIVATE","Driver 10% Rebate","Track qualifying revenue and automatic 10% rebate calculations."],network:["DRIVER PRIVATE","Driver Network","View active drivers, coverage, availability and fleet capability."],clientsetup:["ADMIN","Client Management","Maintain client identity and billing contact details."],driverfix:["ADMIN","Job Payout Rate","Maintain fixed driver pay by job passenger tier."],clientfix:["ADMIN","Client Fix Rate","Maintain client-specific contracted prices."],drivers:["ADMIN","Driver Management","Manage onboarding, documents, vehicles and account status."],catalogue:["ADMIN","Website Catalogue","Manage separate Food, Nightclub and Limousine website catalogues."],company:["ADMIN","Company Management","Configure company identity, GST, currency and document preferences."],access:["ADMIN","User Access","Manage role-based access for administrators, operations staff and drivers."]};

function DriverSignUp(){
 const models=useMemo(()=>load<VehicleModelMap[]>("a3-vehicle-model-map",defaultVehicleModels).filter(m=>m.active),[]);
 const defaults:Record<string,string>={name:"Muhammad Firdaus",mobile:"+65 9123 4567",carModel:"Toyota Noah",vehicleType:"7 Seater",carPlate:"SNA 1234A",licenceName:"",licenceData:"",frontName:"",frontData:"",phvName:"",phvData:"",bankName:"DBS",bankAccount:"123-456789-0",paynow:"+65 9123 4567"};
 const [form,setForm]=useState<Record<string,string>>(()=>load("a3-driver-self-profile",defaults));
 const vehicleTypeFor=(model:string)=>models.find(m=>m.model===model)?.vehicleType||"";
 const upload=(field:string,file?:File)=>{if(!file)return;fileToData(file,(name,data)=>setForm((f:any)=>({...f,[field+"Name"]:name,[field+"Data"]:data}))) };
 const removeUpload=(field:string)=>setForm((f:any)=>({...f,[field+"Name"]:"",[field+"Data"]:""}));
 const submit=()=>{saveNow("a3-driver-self-profile",form);alert("Driver profile saved and submitted for review.")};
 const UploadField=({field,label,accept}:{field:string,label:string,accept:string})=><div className="driver-upload-card"><div><strong>{label}</strong><small>{form[field+"Name"]||"No file selected"}</small></div><label className="filefield"><input type="file" accept={accept} onChange={e=>upload(field,e.target.files?.[0])}/><span><Upload size={16}/>{form[field+"Name"]?"Replace file":"Upload file"}</span></label>{form[field+"Data"]&&<><a className="rowaction" href={form[field+"Data"]} target="_blank" rel="noreferrer">Preview</a><button className="rowaction danger" type="button" onClick={()=>removeUpload(field)}>Remove</button></>}</div>;
 return <><Heading eyebrow="DRIVER SELF-SERVICE" title="Driver Sign-Up / Profile" copy="Drivers can submit their onboarding details and edit them whenever information changes."/><div className="driver-form-layout"><div className="driver-form-main"><section className="panel driver-section"><div className="panelhead"><div><span>1 · PERSONAL INFORMATION</span><h2>Driver details</h2></div></div><div className="rulegrid"><label>Driver Name<input value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label><label>Mobile<input value={form.mobile} onChange={e=>setForm({...form,mobile:e.target.value})}/></label></div></section><section className="panel driver-section"><div className="panelhead"><div><span>2 · VEHICLE INFORMATION</span><h2>Vehicle assignment</h2></div></div><div className="rulegrid"><label>Car Model<select value={form.carModel} onChange={e=>setForm({...form,carModel:e.target.value,vehicleType:vehicleTypeFor(e.target.value)})}><option value="">Select car model</option>{models.map(m=><option key={m.id} value={m.model}>{m.model}</option>)}</select></label><label>Car Plate<input value={form.carPlate} onChange={e=>setForm({...form,carPlate:e.target.value.toUpperCase()})}/></label><label>Vehicle Type<input value={form.vehicleType||vehicleTypeFor(form.carModel)} readOnly/></label></div></section><section className="panel driver-section"><div className="panelhead"><div><span>3 · REQUIRED UPLOADS</span><h2>Licence and vehicle documents</h2></div></div><div className="driver-upload-list"><UploadField field="licence" label="Driving Licence" accept="image/*,.pdf"/><UploadField field="front" label="Vehicle Straight Front View" accept="image/*"/><UploadField field="phv" label="PHV Decal" accept="image/*"/></div></section><section className="panel driver-section"><div className="panelhead"><div><span>4 · PAYMENT INFORMATION</span><h2>Bank and PayNow</h2></div></div><div className="rulegrid"><label>Bank Name<input value={form.bankName} onChange={e=>setForm({...form,bankName:e.target.value})}/></label><label>Bank Account<input value={form.bankAccount} onChange={e=>setForm({...form,bankAccount:e.target.value})}/></label><label>PayNow Number<input value={form.paynow} onChange={e=>setForm({...form,paynow:e.target.value})}/></label></div><div className="modalactions"><button className="ghost" type="button" onClick={()=>setForm(defaults)}>Reset</button><button className="primary" type="button" onClick={submit}><Save size={16}/>Save & Submit</button></div></section></div><aside className="panel driver-example-panel"><div className="panelhead"><div><span>PHOTO GUIDE</span><h2>Required examples</h2></div></div><div className="uploadguide"><div><strong>Vehicle Straight Front View</strong><img loading="lazy" decoding="async" className="driver-example-image" src="/examples/vehicle-front-example.svg" alt="Example of a vehicle photographed straight from the front"/><p>Photograph the full vehicle directly from the front. Keep the car centred and make the number plate readable.</p>{form.frontData&&<img loading="lazy" decoding="async" className="receiptimage" src={form.frontData} alt="Uploaded vehicle front preview"/>}</div><div><strong>PHV Decal</strong><img loading="lazy" decoding="async" className="driver-example-image" src="/examples/phv-decal-example.svg" alt="Example close-up of a PHV decal"/><p>Take a sharp close-up showing the full decal, vehicle number and expiry information.</p>{form.phvData&&<img loading="lazy" decoding="async" className="receiptimage" src={form.phvData} alt="Uploaded PHV decal preview"/>}</div></div></aside></div></>
}
function Module({id}:{id:string}){const n=names[id];return <><Heading eyebrow={n[0]} title={n[1]} copy={n[2]} action="Create record"/><div className="grid3"><div className="panel mini"><span>Current records</span><strong>128</strong><small>Across active entities</small></div><div className="panel mini"><span>Pending action</span><strong>7</strong><small>Requires review</small></div><div className="panel mini"><span>Last synchronised</span><strong>Just now</strong><small>System healthy</small></div></div><div className="panel empty"><ShieldCheck size={34}/><h2>{n[1]} workspace ready</h2><p>The interface and permissions are ready for database and API integration.</p></div></>}
