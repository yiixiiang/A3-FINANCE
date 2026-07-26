"use client";
import dynamic from "next/dynamic";
import { memo, useDeferredValue, useEffect, useMemo, useState, useTransition } from "react";
import { LayoutDashboard, CarFront, UtensilsCrossed, WalletCards, Percent, Network, Settings2, BarChart3, ReceiptText, FileText, Search, Bell, Menu, X, ChevronRight, Plus, TrendingUp, Users, Clock3, ShieldCheck, Globe2, Banknote, LogOut, Database, CloudUpload, CloudDownload, RefreshCw, HardDriveDownload, CheckCircle2, AlertTriangle } from "lucide-react";
import { bookings } from "@/lib/data";
import { load, saveNow, STORAGE_UPDATED_EVENT } from "@/lib/browser-storage";
import { DRIVER_STORAGE_KEY, EXPENSE_STORAGE_KEY, INCOME_STORAGE_KEY, INVOICE_STORAGE_KEY, QUOTATION_STORAGE_KEY, calculateDocumentTotals, defaultDocumentRecords, defaultDriverOverviewRecords, defaultExpenseOverviewRecords, defaultIncomeOverviewRecords, normalizeDocumentRecords, type StoredDriverRecord, type StoredExpenseRecord, type StoredIncomeRecord } from "@/lib/finance-records";
import { DEFAULT_ADMIN_PASSWORD, DEFAULT_ADMIN_USERNAME, DEFAULT_ADMIN_USER, LOGIN_SESSION_KEY, USER_ACCESS_STORAGE_KEY, USER_ACCESS_UPDATED_EVENT, normalizeUserRecords, roleLabel, visibleModuleIdsForUser, type UserAccessRecord } from "@/lib/access-control";
import { CLOUD_SYNC_STATE_EVENT, downloadLocalDataBackup, getCloudSyncSnapshot, resumeCloudSession, restoreAllCloudDataToLocal, signInAndHydrateCloud, signOutCloud, synchronizeCloudNow, uploadAllLocalDataToCloud, verifyCloudConnection, type CloudDiagnostics, type CloudSyncState } from "@/lib/supabase-cloud";

type Item={id:string;label:string;icon:any};
const nav: {label:string;items:Item[]}[]=[
 {label:"Workspace",items:[{id:"overview",label:"Executive Overview",icon:LayoutDashboard}]},
 {label:"Booking",items:[{id:"limousine",label:"Website Limousine Bookings",icon:CarFront},{id:"sakura",label:"Website Sakura Table Bookings",icon:UtensilsCrossed}]},
 {label:"Driver",items:[{id:"payout",label:"Driver Report Payout",icon:WalletCards},{id:"rebate",label:"Driver 10% Rebate",icon:Percent},{id:"network",label:"Driver Network",icon:Network},{id:"driversignup",label:"Driver Sign-Up / Profile",icon:Users},{id:"driverclaims",label:"Driver Claims",icon:ReceiptText}]},
 {label:"Fleet & Settings",items:[{id:"ratemanagement",label:"Rate Management",icon:Settings2},{id:"clientsetup",label:"Client Management",icon:Users},{id:"drivers",label:"Driver Management",icon:Users},{id:"catalogue",label:"Website Catalogue Rate",icon:Globe2},{id:"company",label:"Company Management",icon:Settings2},{id:"cloud",label:"Cloud & Backup",icon:Database},{id:"access",label:"User Access",icon:ShieldCheck}]},
 {label:"Report",items:[{id:"income",label:"Income",icon:TrendingUp},{id:"expenses",label:"Expense",icon:ReceiptText},{id:"platform",label:"Platform Earning",icon:Banknote},{id:"invoice",label:"Invoice",icon:ReceiptText},{id:"quotation",label:"Quotation",icon:FileText},{id:"reports",label:"Profit & Loss",icon:BarChart3},{id:"balancesheet",label:"Balance Sheet",icon:WalletCards}]}
];
const moneyFormatter=new Intl.NumberFormat("en-SG",{style:"currency",currency:"SGD",minimumFractionDigits:2,maximumFractionDigits:2});
const money=(n:number)=>moneyFormatter.format(n);
const corePages=new Set(["overview","limousine","sakura","cloud"]);
const defaultUsers=[{...DEFAULT_ADMIN_USER,visibleModules:[...DEFAULT_ADMIN_USER.visibleModules]}];
const ManagementModules=dynamic(()=>import("./management-modules").then(module=>module.ManagementModules),{ssr:false,loading:ModuleLoading});

export function ManagementApp(){
 const [users,setUsers]=useState<UserAccessRecord[]>(defaultUsers);
 const [signedInUserId,setSignedInUserId]=useState("");
 const [authReady,setAuthReady]=useState(false);
 const [active,setActive]=useState("overview"); const [mobile,setMobile]=useState(false); const [query,setQuery]=useState("");
 const [isNavigating,startTransition]=useTransition();
 const deferredQuery=useDeferredValue(query);

 useEffect(()=>{
  const initialUsers=normalizeUserRecords(load(USER_ACCESS_STORAGE_KEY,defaultUsers));
  setUsers(initialUsers);
  saveNow(USER_ACCESS_STORAGE_KEY,initialUsers);
  const sessionId=window.sessionStorage.getItem(LOGIN_SESSION_KEY)||"";
  setSignedInUserId(initialUsers.some(user=>user.id===sessionId&&user.status==="Active")?sessionId:"");
  setAuthReady(true);
  const refresh=(records?:unknown)=>setUsers(normalizeUserRecords(records??load(USER_ACCESS_STORAGE_KEY,defaultUsers)));
  const onAccessUpdated=(event:Event)=>refresh((event as CustomEvent<unknown>).detail);
  const onStorage=(event:StorageEvent)=>{if(event.key!==USER_ACCESS_STORAGE_KEY)return;try{refresh(event.newValue?JSON.parse(event.newValue):undefined)}catch{refresh()}};
  window.addEventListener(USER_ACCESS_UPDATED_EVENT,onAccessUpdated);
  window.addEventListener("storage",onStorage);
  return ()=>{window.removeEventListener(USER_ACCESS_UPDATED_EVENT,onAccessUpdated);window.removeEventListener("storage",onStorage)};
 },[]);

 useEffect(()=>{
  if(!authReady||!signedInUserId)return;
  if(!users.some(user=>user.id===signedInUserId&&user.status==="Active")){
   window.sessionStorage.removeItem(LOGIN_SESSION_KEY);
   setSignedInUserId("");
  }
 },[authReady,signedInUserId,users]);

 useEffect(()=>{
  if(!authReady||!signedInUserId)return;
  void resumeCloudSession();
 },[authReady,signedInUserId]);

 const currentUser=users.find(user=>user.id===signedInUserId);
 const accessUser=currentUser??DEFAULT_ADMIN_USER;
 const allowedIds=useMemo(()=>visibleModuleIdsForUser(accessUser),[accessUser]);
 const allowed=useMemo(()=>nav.map(group=>({...group,items:group.items.filter(item=>allowedIds.has(item.id))})).filter(group=>group.items.length),[allowedIds]);
 const firstAllowedId=allowed[0]?.items[0]?.id??"";
 useEffect(()=>{if(signedInUserId&&!allowedIds.has(active))startTransition(()=>setActive(firstAllowedId))},[active,allowedIds,firstAllowedId,signedInUserId]);
 useEffect(()=>{const closeOnEscape=(event:KeyboardEvent)=>{if(event.key==="Escape")setMobile(false)};window.addEventListener("keydown",closeOnEscape);return()=>window.removeEventListener("keydown",closeOnEscape)},[]);
 const selectPage=(id:string)=>{if(!allowedIds.has(id))return;startTransition(()=>setActive(id));setMobile(false)};
 const signIn=async(identifier:string,password:string)=>{
  const lookup=identifier.trim().toLowerCase();
  let user=users.find(item=>(item.username.toLowerCase()===lookup||item.email.toLowerCase()===lookup)&&item.password===password);

  // Local administrator recovery for upgrades that retained an older admin
  // username/password. This only runs when the documented bootstrap
  // credentials are entered explicitly. Existing business records are kept.
  if(!user&&lookup===DEFAULT_ADMIN_USERNAME&&password===DEFAULT_ADMIN_PASSWORD){
   const existingAdmin=users.find(item=>item.role==="ADMIN");
   const recoveredAdmin:UserAccessRecord={
    ...(existingAdmin??DEFAULT_ADMIN_USER),
    username:DEFAULT_ADMIN_USERNAME,
    password:DEFAULT_ADMIN_PASSWORD,
    role:"ADMIN",
    accessScope:"ALL_INFORMATION",
    visibleModules:[...DEFAULT_ADMIN_USER.visibleModules],
    status:"Active",
   };
   const recoveredUsers=existingAdmin
    ? users.map(item=>item.id===existingAdmin.id?recoveredAdmin:item)
    : [recoveredAdmin,...users];
   setUsers(recoveredUsers);
   saveNow(USER_ACCESS_STORAGE_KEY,recoveredUsers);
   user=recoveredAdmin;
  }

  if(!user)return "Incorrect username/email or password.";
  if(user.status!=="Active")return "This user account is suspended.";
  // A valid A3 account must never be locked out just because Supabase is
  // unconfigured, awaiting email confirmation, or temporarily unavailable.
  // Cloud authentication runs first so existing cloud records can hydrate,
  // but any cloud error remains a non-blocking status warning in the header.
  await signInAndHydrateCloud(user.email,password);

  const hydratedUsers=normalizeUserRecords(load(USER_ACCESS_STORAGE_KEY,users));
  setUsers(hydratedUsers);
  const hydratedUser=hydratedUsers.find(item=>item.id===user?.id)||hydratedUsers.find(item=>item.email.toLowerCase()===user?.email.toLowerCase())||user;
  window.sessionStorage.setItem(LOGIN_SESSION_KEY,hydratedUser.id);
  setSignedInUserId(hydratedUser.id);
  setActive(visibleModuleIdsForUser(hydratedUser).has("overview")?"overview":"");
  return "";
 };
 const signOut=()=>{window.sessionStorage.removeItem(LOGIN_SESSION_KEY);void signOutCloud();setSignedInUserId("");setActive("overview");setMobile(false)};

 const searchResults=useMemo(()=>{
  const term=deferredQuery.trim().toLowerCase();
  if(term.length<2||typeof window==="undefined")return [] as Array<{id:string;moduleId:string;title:string;detail:string}>;
  const results:Array<{id:string;moduleId:string;title:string;detail:string}>=[];
  nav.flatMap(group=>group.items).filter(item=>allowedIds.has(item.id)&&item.label.toLowerCase().includes(term)).forEach(item=>results.push({id:`module-${item.id}`,moduleId:item.id,title:item.label,detail:"Open module"}));
  bookings.filter(row=>row.join(" \ ").toLowerCase().includes(term)).slice(0,6).forEach(row=>results.push({id:`booking-${row[0]}`,moduleId:"limousine",title:row[0],detail:`${row[1]} · ${row[2]}`}));
  const keyModules:Array<[string,string,string]>= [[INCOME_STORAGE_KEY,"income","Income"],[EXPENSE_STORAGE_KEY,"expenses","Expense"],[DRIVER_STORAGE_KEY,"drivers","Driver"],[INVOICE_STORAGE_KEY,"invoice","Invoice"],[QUOTATION_STORAGE_KEY,"quotation","Quotation"],[USER_ACCESS_STORAGE_KEY,"access","User"]];
  for(const [base,moduleId,label] of keyModules){if(!allowedIds.has(moduleId))continue;for(let i=0;i<window.localStorage.length;i++){const key=window.localStorage.key(i)||"";if(key!==base&&!key.startsWith(`${base}:`))continue;try{const data=JSON.parse(window.localStorage.getItem(key)||"[]");if(!Array.isArray(data))continue;data.filter(record=>JSON.stringify(record).toLowerCase().includes(term)).slice(0,6).forEach((record:any,index:number)=>{const title=record.documentNo||record.name||record.company||record.clientName||record.customer||record.id||`${label} result`;const detail=record.description||record.email||record.phone||record.status||label;results.push({id:`${key}-${record.id||index}`,moduleId,title:String(title),detail:String(detail)});});}catch{}}}
  return results.slice(0,12);
 },[deferredQuery,allowedIds]);

 if(!authReady)return <div className="authloading" role="status"><span className="skeleton skeleton-title"/><span className="sr-only">Loading sign in…</span></div>;
 if(!currentUser)return <LoginPage onLogin={signIn}/>;

 const initials=currentUser.name.split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]).join("").toUpperCase()||"U";
 const canViewActive=Boolean(active)&&allowedIds.has(active);

 return <div className={mobile?"shell menu-open":"shell"} aria-busy={isNavigating}>
  <button className={mobile?"sidebarbackdrop show":"sidebarbackdrop"} aria-label="Close navigation" onClick={()=>setMobile(false)}/><aside className={mobile?"sidebar open":"sidebar"} aria-label="Main navigation">
   <div className="brand"><div className="brandmark">A3</div><div><strong>A3 MANAGEMENT</strong><span>Business Operating System</span></div><button className="close" aria-label="Close navigation" onClick={()=>setMobile(false)}><X/></button></div>
   <nav>{allowed.length?allowed.map(group=><div className="navgroup" key={group.label}><p>{group.label}</p>{group.items.map(item=>{const Icon=item.icon;return <button key={item.id} className={active===item.id?"navitem active":"navitem"} onClick={()=>selectPage(item.id)}><Icon size={17}/><span>{item.label}</span><ChevronRight size={15}/></button>})}</div>):<div className="navempty"><ShieldCheck size={20}/><strong>No modules assigned</strong><span>Ask an administrator to update this user.</span></div>}</nav>
   <div className="sidebarfoot"><span>Connected services</span><div><i></i> Supabase SQL sync</div><div><i></i> Vercel production</div></div>
  </aside>
  <main>
   <header>{isNavigating&&<span className="routeprogress" aria-label="Loading section"/>}<button className="menu" aria-label="Open navigation" aria-expanded={mobile} onClick={()=>setMobile(true)}><Menu/></button><div className="search searchglobal"><Search size={18}/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search all information..."/>{query.trim().length>=2&&<div className="globalsearchresults">{searchResults.length?searchResults.map(result=><button key={result.id} onClick={()=>{selectPage(result.moduleId);setQuery("")}}><strong>{result.title}</strong><span>{result.detail}</span></button>):<div className="globalsearchempty">No matching information</div>}</div>}</div><CloudStatus/><button className="iconbtn" aria-label="Notifications"><Bell size={19}/><b></b></button><div className="signedinuser"><span>{currentUser.username}</span><strong>{roleLabel(currentUser.role)}</strong></div><div className="avatar" title={currentUser.email}>{initials}</div><button className="logoutbtn" onClick={signOut}><LogOut size={16}/><span>Sign out</span></button></header>
   <section className="content">
    {!canViewActive&&<NoModuleAccess user={currentUser}/>} 
    {canViewActive&&active==="overview"&&<Overview role={roleLabel(currentUser.role)}/>} {canViewActive&&active==="limousine"&&<Bookings query={deferredQuery}/>} {canViewActive&&active==="sakura"&&<Sakura/>} {canViewActive&&active==="cloud"&&<CloudCenter/>}
    {canViewActive&&!corePages.has(active)&&<ManagementModules active={active} user={currentUser}/>} 
   </section>
  </main>
 </div>
}

function CloudStatus(){
 const [snapshot,setSnapshot]=useState(()=>getCloudSyncSnapshot());
 useEffect(()=>{
  const refresh=()=>setSnapshot(getCloudSyncSnapshot());
  refresh();
  window.addEventListener(CLOUD_SYNC_STATE_EVENT,refresh);
  return()=>window.removeEventListener(CLOUD_SYNC_STATE_EVENT,refresh);
 },[]);
 const labels:Record<CloudSyncState,string>={disabled:"Cloud not configured","signed-out":"Cloud signed out",connecting:"Cloud connecting",syncing:"Cloud syncing",connected:"Cloud connected",error:"Cloud error"};
 return <div className={`cloudstatus cloud-${snapshot.state}`} title={snapshot.error||snapshot.email||labels[snapshot.state]}><i/><span>{labels[snapshot.state]}</span></div>;
}

function LoginPage({onLogin}:{onLogin:(identifier:string,password:string)=>Promise<string>}){
 const [identifier,setIdentifier]=useState("");
 const [password,setPassword]=useState("");
 const [error,setError]=useState("");
 const [submitting,setSubmitting]=useState(false);
 const submit=async(event:React.FormEvent<HTMLFormElement>)=>{event.preventDefault();setSubmitting(true);setError("");const message=await onLogin(identifier,password);setError(message);setSubmitting(false)};
 return <main className="loginpage"><section className="logincard"><div className="loginbrand"><div className="brandmark">A3</div><div><strong>A3 MANAGEMENT</strong><span>Business Operating System</span></div></div><div className="loginintro"><span>A3 SECURE ACCESS</span><h1>Sign in</h1><p>Use your A3 username or email. The system remains accessible even while Supabase cloud setup is incomplete.</p></div>{error&&<div className="formerror" role="alert">{error}</div>}<form onSubmit={submit}><label>Username or email<input autoFocus autoComplete="username" value={identifier} onChange={event=>setIdentifier(event.target.value)} placeholder="Username or email" required disabled={submitting}/></label><label>Password<input type="password" autoComplete="current-password" value={password} onChange={event=>setPassword(event.target.value)} placeholder="Password" required disabled={submitting}/></label><button className="primary loginbutton" type="submit" disabled={submitting}>{submitting?"Signing in…":"Sign in"}</button></form><p className="loginhint">Initial administrator login: <strong>{DEFAULT_ADMIN_USERNAME}</strong> / <strong>{DEFAULT_ADMIN_PASSWORD}</strong>. Run <strong>supabase/schema.sql</strong> before the first cloud login.</p></section></main>
}

function CloudCenter(){
 const [snapshot,setSnapshot]=useState(()=>getCloudSyncSnapshot());
 const [diagnostics,setDiagnostics]=useState<CloudDiagnostics|null>(null);
 const [busy,setBusy]=useState("");
 const [notice,setNotice]=useState("");
 const [error,setError]=useState("");
 useEffect(()=>{
  const refresh=()=>setSnapshot(getCloudSyncSnapshot());
  window.addEventListener(CLOUD_SYNC_STATE_EVENT,refresh);
  void run("verify",false);
  return()=>window.removeEventListener(CLOUD_SYNC_STATE_EVENT,refresh);
 },[]);
 const run=async(action:"verify"|"sync"|"upload"|"restore",confirmAction=true)=>{
  if(confirmAction&&action==="upload"&&!window.confirm("Upload all saved records from this computer to Supabase? Existing cloud keys with the same name will be updated."))return;
  if(confirmAction&&action==="restore"&&!window.confirm("Restore all Supabase records to this computer? Cloud values will replace matching local records."))return;
  setBusy(action);setNotice("");setError("");
  try{
   const result=action==="verify"?await verifyCloudConnection():action==="sync"?await synchronizeCloudNow():action==="upload"?await uploadAllLocalDataToCloud():await restoreAllCloudDataToLocal();
   setDiagnostics(result);
   setNotice(action==="verify"?"Connection check completed.":action==="sync"?"Local and cloud records synchronized.":action==="upload"?"This computer's records were uploaded to Supabase.":"Cloud records were restored to this computer.");
  }catch(reason){setError(reason instanceof Error?reason.message:"Cloud operation failed.");}
  finally{setBusy("");setSnapshot(getCloudSyncSnapshot());}
 };
 const size=diagnostics?diagnostics.localBytes<1024?`${diagnostics.localBytes} B`:diagnostics.localBytes<1048576?`${(diagnostics.localBytes/1024).toFixed(1)} KB`:`${(diagnostics.localBytes/1048576).toFixed(2)} MB`:"—";
 return <><Heading eyebrow="SUPABASE · CLOUD STORAGE" title="Cloud & Backup" copy="Verify Supabase, synchronize saved business records, and keep a downloadable backup before moving data between computers."/>
 <div className="cloudsummary">
  <div className={`cloudhero cloudhero-${snapshot.state}`}><div><span>CONNECTION</span><h2>{snapshot.state==="connected"?"Supabase connected":snapshot.state==="syncing"?"Synchronizing records":snapshot.state==="connecting"?"Checking connection":snapshot.state==="disabled"?"Supabase not configured":"Cloud attention required"}</h2><p>{snapshot.error||snapshot.email||"Use Verify connection to test the current Supabase session."}</p></div>{snapshot.state==="connected"?<CheckCircle2 size={38}/>:<AlertTriangle size={38}/>}</div>
  <div className="cloudmetric"><span>Local storage keys</span><strong>{diagnostics?.localKeyCount??"—"}</strong><small>{size}</small></div>
  <div className="cloudmetric"><span>Cloud storage keys</span><strong>{diagnostics?.cloudKeyCount??"—"}</strong><small>{diagnostics?.email||snapshot.email||"Not signed in"}</small></div>
 </div>
 {(notice||error)&&<div className={error?"cloudnotice error":"cloudnotice success"}>{error||notice}</div>}
 <div className="cloudactiongrid">
  <section><RefreshCw size={25}/><h3>Verify and synchronize</h3><p>Checks the authenticated Supabase session and safely merges available records.</p><div><button className="primary" disabled={Boolean(busy)} onClick={()=>void run("verify")}>{busy==="verify"?"Checking…":"Verify connection"}</button><button className="ghost" disabled={Boolean(busy)} onClick={()=>void run("sync")}>{busy==="sync"?"Syncing…":"Sync now"}</button></div></section>
  <section><CloudUpload size={25}/><h3>Upload this computer</h3><p>Pushes every syncable A3 record saved in this browser to the signed-in Supabase account.</p><button className="primary" disabled={Boolean(busy)} onClick={()=>void run("upload")}>{busy==="upload"?"Uploading…":"Upload local records"}</button></section>
  <section><CloudDownload size={25}/><h3>Restore from Supabase</h3><p>Downloads cloud values and replaces matching records on this computer. Other local-only records are kept.</p><button className="primary" disabled={Boolean(busy)} onClick={()=>void run("restore")}>{busy==="restore"?"Restoring…":"Restore cloud records"}</button></section>
  <section><HardDriveDownload size={25}/><h3>Download local backup</h3><p>Creates a JSON backup of the current browser records before a migration or major update.</p><button className="ghost" onClick={downloadLocalDataBackup}>Download backup</button></section>
 </div>
 <div className="panel cloudchecklist"><div className="panelhead"><div><span>FIRST-TIME CLOUD CHECKLIST</span><h2>Activation order</h2></div></div><ol><li>Run <strong>supabase/schema.sql</strong> in the Supabase SQL Editor.</li><li>Confirm the matching user exists in Supabase Authentication and is email-confirmed.</li><li>Add both Supabase environment variables to Vercel, then redeploy production.</li><li>Sign out and sign in once to establish the cloud session.</li><li>Open this page and use <strong>Verify connection</strong>, then <strong>Upload local records</strong>.</li></ol>{diagnostics?.checkedAt&&<small>Last checked: {new Date(diagnostics.checkedAt).toLocaleString("en-SG")}</small>}</div></>;
}

function NoModuleAccess({user}:{user:UserAccessRecord}){return <div className="panel empty accessdenied"><ShieldCheck size={38}/><h2>{user.status==="Suspended"?"User access suspended":"No modules assigned"}</h2><p>{user.status==="Suspended"?`${user.name} is suspended and cannot open any workspace.`:`${user.name} does not currently have permission to view a module. Ask an administrator to update the user in User Access.`}</p></div>}
function ModuleLoading(){return <div className="panel moduleloading" role="status" aria-live="polite"><span className="skeleton skeleton-title"/><span className="skeleton skeleton-copy"/><span className="skeleton skeleton-grid"/><span className="sr-only">Loading workspace…</span></div>}
function Heading({eyebrow,title,copy,action,onAction}:{eyebrow:string;title:string;copy:string;action?:string;onAction?:()=>void}){return <div className="heading"><div><span>{eyebrow}</span><h1>{title}</h1><p>{copy}</p></div>{action&&<button className="primary" onClick={onAction}><Plus size={17}/>{action}</button>}</div>}
function Overview({role}:{role:string}){
 const [revision,setRevision]=useState(0);
 useEffect(()=>{
  const tracked=new Set([INCOME_STORAGE_KEY,EXPENSE_STORAGE_KEY,DRIVER_STORAGE_KEY,INVOICE_STORAGE_KEY,QUOTATION_STORAGE_KEY]);
  const refresh=(key?:string|null)=>{if(!key||tracked.has(key))setRevision(value=>value+1)};
  const onUpdated=(event:Event)=>refresh((event as CustomEvent<{key?:string}>).detail?.key);
  const onStorage=(event:StorageEvent)=>refresh(event.key);
  window.addEventListener(STORAGE_UPDATED_EVENT,onUpdated);
  window.addEventListener("storage",onStorage);
  return()=>{window.removeEventListener(STORAGE_UPDATED_EVENT,onUpdated);window.removeEventListener("storage",onStorage)};
 },[]);
 const snapshot=useMemo(()=>{
  const now=new Date();const offset=now.getTimezoneOffset();const today=new Date(now.getTime()-offset*60000).toISOString().slice(0,10);const month=today.slice(0,7);
  const income=load<StoredIncomeRecord[]>(INCOME_STORAGE_KEY,defaultIncomeOverviewRecords);
  const expenses=load<StoredExpenseRecord[]>(EXPENSE_STORAGE_KEY,defaultExpenseOverviewRecords);
  const drivers=load<StoredDriverRecord[]>(DRIVER_STORAGE_KEY,defaultDriverOverviewRecords);
  const invoices=normalizeDocumentRecords(load(INVOICE_STORAGE_KEY,defaultDocumentRecords("invoice")),"invoice");
  const quotations=normalizeDocumentRecords(load(QUOTATION_STORAGE_KEY,defaultDocumentRecords("quotation")),"quotation");
  const receivedThisMonth=income.filter(record=>record.status==="Received"&&record.date.startsWith(month));
  const revenue=receivedThisMonth.reduce((sum,record)=>sum+Number(record.amount||0),0);
  const expenseTotal=expenses.filter(record=>record.date.startsWith(month)).reduce((sum,record)=>sum+Number(record.amount||0),0);
  const pendingIncome=income.filter(record=>record.status==="Pending");
  const openInvoices=invoices.filter(record=>!["Paid","Cancelled"].includes(record.status));
  const outstanding=openInvoices.reduce((sum,record)=>sum+calculateDocumentTotals(record).total,0);
  const activeDrivers=drivers.filter(record=>record.status==="Active").length;
  const activeBookings=bookings.filter(row=>!["Completed","Cancelled"].includes(row[5])).length;
  const pendingBookings=bookings.filter(row=>row[5]==="Pending").length;
  const openQuotations=quotations.filter(record=>!["Accepted","Rejected","Expired"].includes(record.status)).length;
  const paidInvoices=invoices.filter(record=>record.status==="Paid").length;
  const months=Array.from({length:6},(_,index)=>{const date=new Date(now.getFullYear(),now.getMonth()-(5-index),1);const key=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}`;return {key,label:new Intl.DateTimeFormat("en-SG",{month:"short"}).format(date)}});
  const monthlyRevenue=months.map(item=>income.filter(record=>record.status==="Received"&&record.date.startsWith(item.key)).reduce((sum,record)=>sum+Number(record.amount||0),0));
  return {today,revenue,expenseTotal,pendingIncomeCount:pendingIncome.length,pendingIncomeValue:pendingIncome.reduce((sum,record)=>sum+Number(record.amount||0),0),receivedCount:receivedThisMonth.length,outstanding,openInvoiceCount:openInvoices.length,activeDrivers,activeBookings,pendingBookings,openQuotations,paidInvoices,months,monthlyRevenue};
 },[revision]);
 const maxRevenue=Math.max(...snapshot.monthlyRevenue,1);
 return <><Heading eyebrow="A3 GROUP · LIVE OPERATIONS" title="Executive Overview" copy={`Live information for ${role.toLowerCase()} operations, calculated from saved records instead of demonstration totals.`}/><div className="metrics"><Metric icon={TrendingUp} label="Revenue this month" value={money(snapshot.revenue)} note={`${snapshot.receivedCount} received income record${snapshot.receivedCount===1?"":"s"}`}/><Metric icon={ReceiptText} label="Expenses this month" value={money(snapshot.expenseTotal)} note={`Net cash movement ${money(snapshot.revenue-snapshot.expenseTotal)}`}/><Metric icon={CarFront} label="Active bookings" value={String(snapshot.activeBookings)} note={`${snapshot.pendingBookings} pending confirmation${snapshot.pendingBookings===1?"":"s"}`}/><Metric icon={FileText} label="Outstanding invoices" value={money(snapshot.outstanding)} note={`${snapshot.openInvoiceCount} open invoice${snapshot.openInvoiceCount===1?"":"s"}`}/></div><div className="grid2"><div className="panel"><div className="panelhead"><div><span>RECEIVED INCOME</span><h2>Last six months</h2></div><small>Through {snapshot.today}</small></div><div className="chart overviewchart">{snapshot.monthlyRevenue.map((value,index)=><div key={snapshot.months[index].key} style={{height:`${Math.max(8,Math.round((value/maxRevenue)*126))}px`}} title={`${snapshot.months[index].label}: ${money(value)}`}><span></span></div>)}</div><div className="months">{snapshot.months.map(item=><span key={item.key}>{item.label}</span>)}</div></div><div className="panel"><div className="panelhead"><div><span>OPERATIONAL PULSE</span><h2>Saved record status</h2></div></div><div className="pulse"><div><strong>{snapshot.activeDrivers}</strong><span>Active drivers</span></div><div><strong>{snapshot.pendingIncomeCount}</strong><span>Pending income · {money(snapshot.pendingIncomeValue)}</span></div><div><strong>{snapshot.openQuotations}</strong><span>Open quotations</span></div><div><strong>{snapshot.paidInvoices}</strong><span>Paid invoices</span></div></div></div></div><div className="panel"><div className="panelhead"><div><span>LATEST ACTIVITY</span><h2>Website limousine bookings</h2></div><span className="overviewnote">Counts reflect the booking records shown below.</span></div><BookingTable rows={bookings}/></div></>
}
const Metric=memo(function Metric({icon:Icon,label,value,note}:{icon:any;label:string;value:string;note:string}){return <div className="metric"><div className="metricicon"><Icon size={20}/></div><span>{label}</span><strong>{value}</strong><small>{note}</small></div>});
function Bookings({query}:{query:string}){const rows=bookings.filter(row=>row.join(" ").toLowerCase().includes(query.toLowerCase()));return <><Heading eyebrow="LIMOUSINE.A3GROUP.SG" title="Website Limousine Bookings" copy="Confirm rates, assign drivers and monitor every website booking from one operational queue." action="New booking"/><div className="panel"><BookingTable rows={rows}/></div></>}
const BookingTable=memo(function BookingTable({rows}:{rows:string[][]}){return <div className="tablewrap"><table><thead><tr>{["Reference","Customer","Pickup","Service","Vehicle","Status","Amount"].map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{rows.map(row=><tr key={row[0]}>{row.map((value,index)=><td key={index}>{index===5?<span className={`status ${value.toLowerCase().replace(" ","")}`}>{value}</span>:value}</td>)}</tr>)}</tbody></table></div>});
function Sakura(){return <><Heading eyebrow="SAKURA.A3GROUP.SG" title="Website Sakura Table Bookings" copy="Manage online reservations, guest counts, deposits and seating allocation." action="New reservation"/><div className="panel empty"><UtensilsCrossed size={34}/><h2>Restaurant booking workspace</h2><p>Connect the Sakura booking API to replace demonstration records with live reservations.</p><button className="primary">Configure integration</button></div></>}
