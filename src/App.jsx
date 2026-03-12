import { useState, useMemo, useCallback, useEffect } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, PieChart, Pie, Cell, AreaChart, Area
} from "recharts";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
  deleteUser as firebaseDeleteUser,
} from "firebase/auth";
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc
} from "firebase/firestore";
import { auth, db } from "./firebase";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const DEFAULT_ASSETS = ["US30","XAUUSD","BTC","NAS100","EURUSD","GBPUSD","GER40","UK100"];
const SESSIONS = ["NY","LDN","ASIA","LDN/NY"];
const SETUPS   = ["SVF","BOS","OB","FVG","MSS","CHOCH","LIQUIDITY","BREAKER","OTHER"];
const SIDES    = ["BUY","SELL"];
const DEFAULT_RR_PRESETS = [-3,-2,-1.5,-1,0.5,1,1.5,2,2.5,3,4,5];
const ACCOUNT_TYPES = [
  { id:"real",      label:"Capital Real",    color:"#00C076", icon:"💰" },
  { id:"funded",    label:"Fondeo",          color:"#64D2FF", icon:"🏦" },
  { id:"demo",      label:"Demo",            color:"#8E8E9A", icon:"🧪" },
  { id:"challenge", label:"Prop Challenge",  color:"#FFD60A", icon:"🎯" },
];

// ─── FIREBASE HELPERS ─────────────────────────────────────────────────────────
const LS_THEME = "svf_theme";

async function fbGetUserData(uid) {
  try {
    const snap = await getDoc(doc(db, "users", uid));
    return snap.exists() ? snap.data() : null;
  } catch { return null; }
}

async function fbSaveUserData(uid, data) {
  try {
    await setDoc(doc(db, "users", uid), data, { merge: true });
  } catch(e) { console.error("fbSave:", e); }
}

const DEMO_SEED_DATA = {
  customAssets: [],
  rrPresets: [...DEFAULT_RR_PRESETS],
  accounts:[
    { id:"demo-acct", name:"Cuenta Demostración 🧪", type:"demo", broker:"SVF Demo", balance:10000, currency:"USD", isDemo:true },
  ],
  trades:[
    { id:1,  accountId:"demo-acct", date:"2026-01-06", asset:"US30",   side:"BUY",  entry:43200, exit:43350, qty:1,   pnl:150,  rr:2.1, session:"NY",   setup:"BOS",  notes:"BOS limpio H1" },
    { id:2,  accountId:"demo-acct", date:"2026-01-07", asset:"XAUUSD", side:"SELL", entry:2640,  exit:2628,  qty:0.5, pnl:120,  rr:1.8, session:"LDN",  setup:"OB",   notes:"OB bajista" },
    { id:3,  accountId:"demo-acct", date:"2026-01-08", asset:"US30",   side:"BUY",  entry:43400, exit:43320, qty:1,   pnl:-80,  rr:-1,  session:"NY",   setup:"FVG",  notes:"Stop spread" },
    { id:4,  accountId:"demo-acct", date:"2026-01-09", asset:"BTC",    side:"BUY",  entry:95200, exit:96100, qty:0.1, pnl:90,   rr:1.5, session:"ASIA", setup:"BOS",  notes:"" },
    { id:5,  accountId:"demo-acct", date:"2026-01-13", asset:"XAUUSD", side:"BUY",  entry:2655,  exit:2672,  qty:0.5, pnl:170,  rr:2.4, session:"LDN",  setup:"OB",   notes:"" },
    { id:6,  accountId:"demo-acct", date:"2026-01-14", asset:"US30",   side:"SELL", entry:43600, exit:43510, qty:1,   pnl:90,   rr:1.2, session:"NY",   setup:"MSS",  notes:"" },
    { id:7,  accountId:"demo-acct", date:"2026-01-20", asset:"US30",   side:"BUY",  entry:43700, exit:43900, qty:1,   pnl:200,  rr:2.8, session:"NY",   setup:"OB",   notes:"Día perfecto" },
    { id:8,  accountId:"demo-acct", date:"2026-01-21", asset:"XAUUSD", side:"BUY",  entry:2670,  exit:2682,  qty:1,   pnl:120,  rr:1.6, session:"LDN",  setup:"BOS",  notes:"" },
    { id:9,  accountId:"demo-acct", date:"2026-01-22", asset:"NAS100", side:"SELL", entry:21500, exit:21400, qty:0.5, pnl:50,   rr:1.0, session:"NY",   setup:"FVG",  notes:"Práctica" },
    { id:10, accountId:"demo-acct", date:"2026-01-27", asset:"BTC",    side:"BUY",  entry:98500, exit:97800, qty:0.1, pnl:-70,  rr:-1.2,session:"ASIA", setup:"OB",   notes:"Falsa ruptura" },
    { id:11, accountId:"demo-acct", date:"2026-02-03", asset:"US30",   side:"BUY",  entry:44100, exit:44280, qty:1,   pnl:180,  rr:2.5, session:"NY",   setup:"BOS",  notes:"" },
    { id:12, accountId:"demo-acct", date:"2026-02-04", asset:"XAUUSD", side:"BUY",  entry:2710,  exit:2728,  qty:0.5, pnl:180,  rr:2.6, session:"LDN",  setup:"OB",   notes:"Excelente" },
    { id:13, accountId:"demo-acct", date:"2026-02-05", asset:"BTC",    side:"SELL", entry:99200, exit:98400, qty:0.1, pnl:80,   rr:1.1, session:"ASIA", setup:"MSS",  notes:"" },
    { id:14, accountId:"demo-acct", date:"2026-02-10", asset:"EURUSD", side:"BUY",  entry:1.0850,exit:1.0880,qty:1,   pnl:30,   rr:1.5, session:"LDN",  setup:"FVG",  notes:"Demo Forex" },
  ]
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const fmt$ = (v, d=2) => {
  const abs = Math.abs(v);
  const s   = abs.toLocaleString("en-US",{minimumFractionDigits:d,maximumFractionDigits:d});
  return (v<0?"-$":"$")+s;
};
const fmtPct   = v => (v*100).toFixed(1)+"%";
const pnlColor = v => v>0?"#00C076":v<0?"#FF3B30":"#8A8A9A";
const pnlBg    = v => v>0?"rgba(0,192,118,.12)":v<0?"rgba(255,59,48,.12)":"rgba(138,138,154,.08)";
const fmtRR    = v => v===0?"0":v<0?`${v}`:`1:${v}`;
const acctType = id => ACCOUNT_TYPES.find(a=>a.id===id)||ACCOUNT_TYPES[0];

function calcStats(trades) {
  if (!trades.length) return {net:0,winRate:0,pf:0,avgWin:0,avgLoss:0,expectancy:0,totalTrades:0,wins:0,losses:0,maxDD:0,maxDDPct:0,bestTrade:0,worstTrade:0,avgRR:0};
  const wins=trades.filter(t=>t.pnl>0), losses=trades.filter(t=>t.pnl<0);
  const net=trades.reduce((a,t)=>a+t.pnl,0);
  const grossW=wins.reduce((a,t)=>a+t.pnl,0);
  const grossL=Math.abs(losses.reduce((a,t)=>a+t.pnl,0));
  const avgWin=wins.length?grossW/wins.length:0;
  const avgLoss=losses.length?grossL/losses.length:0;
  const winRate=wins.length/trades.length;
  const pf=grossL>0?grossW/grossL:grossW>0?999:0;
  const expectancy=winRate*avgWin-(1-winRate)*avgLoss;
  const avgRR=trades.filter(t=>t.rr>0).reduce((a,t)=>a+t.rr,0)/(trades.filter(t=>t.rr>0).length||1);
  let peak=0,bal=0,maxDD=0,maxDDPct=0;
  [...trades].sort((a,b)=>a.date.localeCompare(b.date)).forEach(t=>{bal+=t.pnl;if(bal>peak)peak=bal;const dd=peak-bal;if(dd>maxDD){maxDD=dd;maxDDPct=peak>0?(dd/peak)*100:0;}});
  return {net,winRate,pf,avgWin,avgLoss,expectancy,totalTrades:trades.length,wins:wins.length,losses:losses.length,maxDD,maxDDPct,bestTrade:Math.max(...trades.map(t=>t.pnl)),worstTrade:Math.min(...trades.map(t=>t.pnl)),avgRR};
}

function buildEquity(trades, start=5000) {
  const sorted=[...trades].sort((a,b)=>a.date.localeCompare(b.date));
  let bal=start;
  const out=[{date:"Inicio",balance:bal}];
  sorted.forEach(t=>{bal+=t.pnl;out.push({date:t.date.slice(5),balance:parseFloat(bal.toFixed(2))});});
  return out;
}

// ─── CSS ──────────────────────────────────────────────────────────────────────
const css = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;0,9..40,800&family=DM+Mono:wght@400;500&display=swap');
*{box-sizing:border-box;margin:0;padding:0;}
html,body,#root{height:100%;}
body{font-family:'DM Sans',sans-serif;background:#080A0D;color:#E2E4EA;}
::-webkit-scrollbar{width:4px;height:4px;}
::-webkit-scrollbar-track{background:transparent;}
::-webkit-scrollbar-thumb{background:#252830;border-radius:4px;}

/* ── LOGIN ── */
.login-wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;
  background:radial-gradient(ellipse 80% 60% at 50% 0%,rgba(0,192,118,.08) 0%,transparent 70%),#080A0D;padding:20px;}
.login-card{width:100%;max-width:400px;background:#0F1116;border:1px solid #1E2028;border-radius:20px;
  padding:36px 32px;display:flex;flex-direction:column;gap:24px;}
.login-logo{text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:center;}
.login-logo-name{font-size:26px;font-weight:800;color:#00C076;letter-spacing:-1px;margin-top:10px;}
.login-logo-sub{font-size:12px;color:#5A5E6A;margin-top:2px;letter-spacing:.5px;}
.login-title{font-size:20px;font-weight:700;text-align:center;}
.login-sub{font-size:13px;color:#5A5E6A;text-align:center;margin-top:-16px;}
.form-group{display:flex;flex-direction:column;gap:7px;}
.form-label{font-size:11.5px;font-weight:600;color:#8A8E9A;text-transform:uppercase;letter-spacing:.5px;}
.form-input{background:#161820;border:1px solid #252830;border-radius:10px;padding:11px 14px;
  color:#E2E4EA;font-size:14px;font-family:'DM Sans',sans-serif;outline:none;width:100%;transition:border .15s;}
.form-input:focus{border-color:#00C076;}
.form-select{background:#161820;border:1px solid #252830;border-radius:10px;padding:11px 14px;
  color:#E2E4EA;font-size:14px;font-family:'DM Sans',sans-serif;outline:none;width:100%;transition:border .15s;}
.form-select:focus{border-color:#00C076;}
.form-textarea{background:#161820;border:1px solid #252830;border-radius:10px;padding:11px 14px;
  color:#E2E4EA;font-size:13.5px;font-family:'DM Sans',sans-serif;outline:none;width:100%;resize:none;height:72px;transition:border .15s;}
.form-textarea:focus{border-color:#00C076;}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:11px 18px;border-radius:10px;
  font-size:14px;font-weight:600;cursor:pointer;border:none;transition:all .15s;font-family:'DM Sans',sans-serif;}
.btn-primary{background:#00C076;color:#fff;}
.btn-primary:hover{background:#00A865;}
.btn-primary:disabled{background:#1A3D2A;color:#2A6A42;cursor:not-allowed;}
.btn-ghost{background:#161820;color:#8A8E9A;border:1px solid #252830;}
.btn-ghost:hover{background:#1E2028;color:#E2E4EA;}
.btn-danger{background:rgba(255,59,48,.12);color:#FF3B30;border:1px solid rgba(255,59,48,.2);}
.btn-danger:hover{background:rgba(255,59,48,.2);}
.btn-sm{padding:7px 12px;font-size:12.5px;border-radius:8px;}
.login-hint{background:#0D1A12;border:1px solid #1A3D22;border-radius:10px;padding:12px 14px;font-size:12.5px;color:#5A9A6A;line-height:1.6;}
.login-hint strong{color:#00C076;}

/* ── LAYOUT ── */
.app{display:flex;height:100vh;overflow:hidden;background:#080A0D;}
.sidebar{width:240px;min-width:240px;background:#0C0E13;border-right:1px solid #1A1C24;
  display:flex;flex-direction:column;overflow:hidden;}

/* ── MOBILE ── */
@media(max-width:768px){
  .sidebar{display:none;}
  .main{width:100%;padding-bottom:60px;}
  .topbar{padding:0 10px;height:52px;min-height:52px;gap:6px;}
  .topbar-title{font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:80px;}
  .topbar-date{display:none;}
  .topbar-scope{display:none;}
  .topbar-right{gap:6px;flex-shrink:0;}
  .topbar-add span{display:none;}
  .topbar-add{width:36px;height:36px;border-radius:50%;padding:0;justify-content:center;}
  .content{padding:12px 14px;}
  .metrics-row{grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:14px;}
  .metric-value{font-size:18px;}
  .charts-row{grid-template-columns:1fr;gap:10px;}
  .stats-grid{grid-template-columns:1fr;gap:10px;}
  .mini-stats{padding:10px 14px;gap:8px;}
  .mini-stat{min-width:80px;padding:7px 10px;}
  .mini-stat-v{font-size:14px;}
  .cal-day{min-height:52px;padding:5px 4px;}
  .cal-pnl{font-size:11px;}
  /* Scope toggle — visible y compacto en mobile */
  .scope-toggle{height:28px;}
  .scope-btn{padding:0 7px;font-size:10.5px;gap:2px;}
  .btn-primary{padding:8px 12px;font-size:12.5px;}
  .filter-bar{padding:8px 14px;gap:6px;}
  .filter-select{font-size:12px;padding:5px 8px;}
  .acct-manage-grid{grid-template-columns:1fr;}
  .modal{margin:10px;max-width:calc(100vw - 20px);}
  .form-row{grid-template-columns:1fr;}
  /* Bottom row del Dashboard — 1 columna */
  .dash-bottom{grid-template-columns:1fr !important;}
  /* Banner de cuentas activas para desktop se oculta en mobile */
  .desktop-scope-banner{display:none !important;}
  /* Mobile account bar — ACTIVAR en mobile */
  .mobile-acct-bar{display:flex !important;}
  /* Bottom nav */
  .bottom-nav{display:flex !important;}
}
@media(min-width:769px){
  .mobile-acct-bar{display:none !important;}
}

/* MOBILE ACCOUNT SELECTOR BAR */
.mobile-acct-bar{display:none;padding:6px 12px 6px;border-bottom:1px solid #1A1C24;
  background:#0A0C10;align-items:center;gap:6px;overflow-x:auto;flex-wrap:nowrap;
  -webkit-overflow-scrolling:touch;}
.mobile-acct-chip{display:inline-flex;align-items:center;gap:5px;padding:4px 10px;
  border-radius:20px;font-size:11.5px;font-weight:600;cursor:pointer;
  border:1.5px solid transparent;white-space:nowrap;transition:all .15s;flex-shrink:0;}
.mobile-acct-chip.on{border-color:currentColor;background:rgba(0,192,118,.1);}
.mobile-acct-chip.off{opacity:0.4;border-color:#252830;background:#141620;}
.mobile-scope-label{font-size:10px;color:#4A4E5A;font-weight:700;letter-spacing:.5px;
  text-transform:uppercase;white-space:nowrap;flex-shrink:0;}
@media(min-width:769px){
  .bottom-nav{display:none !important;}
}
.bottom-nav{position:fixed;bottom:0;left:0;right:0;height:calc(62px + env(safe-area-inset-bottom));background:#0C0E13;
  border-top:1px solid #1A1C24;display:none;align-items:center;justify-content:center;
  z-index:100;padding:0 20px;padding-bottom:env(safe-area-inset-bottom);gap:20px;}
.bn-add-btn{width:52px;height:52px;border-radius:14px;background:#00C076;display:flex;
  align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;
  box-shadow:0 0 24px rgba(0,192,118,.45);transition:transform .15s,box-shadow .15s;}
.bn-add-btn:active{transform:scale(.93);box-shadow:0 0 12px rgba(0,192,118,.3);}
.bn-menu-btn{display:flex;flex-direction:column;align-items:center;gap:4px;padding:8px 12px;
  cursor:pointer;border-radius:12px;transition:background .15s;}
.bn-menu-btn:active{background:#161820;}
.bn-menu-icon{display:flex;flex-direction:column;gap:4px;align-items:center;}
.bn-menu-icon span{display:block;width:20px;height:2px;border-radius:2px;background:#4A4E5A;transition:background .15s;}
.bn-menu-btn.active .bn-menu-icon span{background:#00C076;}
.bn-menu-label{font-size:10px;font-weight:600;color:#4A4E5A;}
.bn-menu-btn.active .bn-menu-label{color:#00C076;}
.bn-cur-tab{display:flex;flex-direction:column;align-items:center;gap:2px;padding:8px 10px;
  cursor:pointer;border-radius:12px;transition:background .15s;min-width:70px;}
.bn-cur-label{display:none;}
.bn-cur-name{font-size:12px;font-weight:700;color:#E2E4EA;}

/* NAV SHEET */
.nav-sheet-overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:300;backdrop-filter:blur(4px);}
.nav-sheet{position:fixed;bottom:0;left:0;right:0;background:#13151D;border-radius:20px 20px 0 0;
  z-index:301;border-top:1px solid #252830;overflow:hidden;
  animation:slideUp .22s cubic-bezier(.4,0,.2,1);}
@keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
.nav-sheet-handle{width:36px;height:4px;background:#252830;border-radius:4px;margin:12px auto 16px;}
.nav-sheet-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:0 16px 8px;}
.nav-sheet-item{display:flex;flex-direction:column;align-items:center;gap:6px;padding:14px 8px;
  border-radius:14px;cursor:pointer;transition:background .15s;border:1px solid transparent;}
.nav-sheet-item.active{background:#0D1E14;border-color:rgba(0,192,118,.25);}
.nav-sheet-item:not(.active):active{background:#161820;}
.nav-sheet-label{font-size:11px;font-weight:600;color:#6A6E7A;}
.nav-sheet-item.active .nav-sheet-label{color:#00C076;}
.nav-sheet-footer{padding:12px 16px 28px;border-top:1px solid #1A1C24;margin-top:4px;
  display:flex;align-items:center;justify-content:center;}

.bn-label{font-size:10px;font-weight:600;color:#4A4E5A;}

.sidebar-top{padding:18px 16px 14px;border-bottom:1px solid #1A1C24;}
.sidebar-brand{font-size:16px;font-weight:800;color:#00C076;letter-spacing:-.5px;}
.sidebar-brand-sub{font-size:10.5px;color:#4A4E5A;margin-top:1px;}
.sidebar-nav{flex:1;padding:10px 10px;overflow-y:auto;display:flex;flex-direction:column;gap:1px;}
.nav-section{font-size:10px;font-weight:700;color:#3A3E4A;letter-spacing:1.2px;text-transform:uppercase;
  padding:12px 8px 5px;}
.nav-item{display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:9px;cursor:pointer;
  font-size:13.5px;font-weight:500;color:#6A6E7A;transition:all .15s;}
.nav-item:hover{background:#161820;color:#C0C4D0;}
.nav-item.active{background:#0D1E14;color:#00C076;}
.nav-badge{margin-left:auto;background:#1A3D22;color:#00C076;font-size:10px;font-weight:700;
  padding:2px 6px;border-radius:20px;}

/* ACCOUNT SWITCHER in sidebar */
.acct-switcher{padding:10px;border-top:1px solid #1A1C24;}
.acct-current{display:flex;align-items:center;gap:10px;padding:10px 10px;border-radius:10px;
  background:#161820;cursor:pointer;border:1px solid #252830;transition:all .15s;}
.acct-current:hover{border-color:#00C076;}
.acct-icon{width:34px;height:34px;border-radius:9px;display:flex;align-items:center;justify-content:center;
  font-size:16px;flex-shrink:0;}
.acct-info{flex:1;overflow:hidden;}
.acct-name{font-size:13px;font-weight:600;color:#E2E4EA;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.acct-type{font-size:11px;margin-top:1px;}
.acct-balance{font-size:12px;font-weight:700;font-family:'DM Mono',monospace;margin-left:auto;white-space:nowrap;}
.acct-dropdown{position:fixed;bottom:0;left:0;width:240px;background:#13151D;border:1px solid #252830;
  border-radius:14px 14px 0 0;z-index:200;overflow:hidden;box-shadow:0 -10px 40px rgba(0,0,0,.5);}
.acct-dropdown-head{padding:14px 16px 10px;display:flex;align-items:center;justify-content:space-between;
  border-bottom:1px solid #1E2028;}
.acct-dropdown-head span{font-size:13px;font-weight:700;color:#C0C4D0;}
.acct-list{max-height:300px;overflow-y:auto;padding:8px;}
.acct-row{display:flex;align-items:center;gap:10px;padding:10px 10px;border-radius:9px;cursor:pointer;
  transition:background .1s;}
.acct-row:hover{background:#1E2028;}
.acct-row.selected{background:#0D1E14;}
.acct-row-check{width:18px;height:18px;border-radius:50%;border:2px solid #252830;margin-left:auto;
  display:flex;align-items:center;justify-content:center;font-size:10px;flex-shrink:0;}
.acct-row-check.on{background:#00C076;border-color:#00C076;color:#fff;}
.sidebar-user{display:flex;align-items:center;gap:10px;padding:14px 16px;border-top:1px solid #1A1C24;}
.avatar{width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#00C076,#006B42);
  display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;color:#fff;flex-shrink:0;}
.user-name{font-size:13px;font-weight:600;color:#E2E4EA;}
.user-email{font-size:11px;color:#4A4E5A;}
.logout-btn{margin-left:auto;background:none;border:none;color:#4A4E5A;cursor:pointer;font-size:18px;
  line-height:1;padding:4px;}
.logout-btn:hover{color:#FF3B30;}

/* ── MAIN ── */
.main{flex:1;display:flex;flex-direction:column;overflow:hidden;}
.topbar{height:56px;min-height:56px;border-bottom:1px solid #1A1C24;display:flex;align-items:center;
  padding:0 24px;gap:12px;background:#0C0E13;}
.topbar-title{font-size:16px;font-weight:700;color:#E2E4EA;}
.topbar-right{margin-left:auto;display:flex;align-items:center;gap:10px;}

/* GLOBAL TOGGLE */
.scope-toggle{display:flex;align-items:center;background:#161820;border:1px solid #252830;border-radius:8px;overflow:hidden;height:34px;}
.scope-btn{padding:0 12px;height:100%;display:flex;align-items:center;font-size:12.5px;font-weight:600;
  cursor:pointer;color:#6A6E7A;border:none;background:none;transition:all .15s;}
.scope-btn.active{background:#1A3D22;color:#00C076;}

/* CONTENT */
.content{flex:1;overflow-y:auto;padding:20px 24px;}

/* METRIC CARDS */
.metrics-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:20px;}
.metric-card{background:#0F1116;border:1px solid #1A1C24;border-radius:12px;padding:14px 16px;}
.metric-label{font-size:10.5px;color:#4A4E5A;font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;}
.metric-value{font-size:22px;font-weight:800;font-family:'DM Mono',monospace;line-height:1;}
.metric-sub{font-size:11px;color:#4A4E5A;margin-top:4px;}

/* CHARTS */
.charts-row{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px;}
.chart-card{background:#0F1116;border:1px solid #1A1C24;border-radius:12px;padding:16px;}
.chart-title{font-size:13px;font-weight:600;color:#A0A4B0;margin-bottom:14px;display:flex;align-items:center;gap:8px;}
.chart-title span{font-size:11px;color:#4A4E5A;font-weight:400;margin-left:auto;}

/* TABLE */
.table-card{background:#0F1116;border:1px solid #1A1C24;border-radius:12px;overflow:hidden;}
.table-header{display:flex;align-items:center;padding:14px 16px;border-bottom:1px solid #1A1C24;gap:12px;flex-wrap:wrap;}
.table-title{font-size:13px;font-weight:600;color:#A0A4B0;}
.table-wrap{overflow-x:auto;}
table{width:100%;border-collapse:collapse;font-size:13px;}
thead th{padding:10px 14px;text-align:left;font-size:10.5px;font-weight:700;color:#4A4E5A;
  text-transform:uppercase;letter-spacing:.5px;background:#0A0C10;white-space:nowrap;}
tbody tr{border-top:1px solid #141620;cursor:pointer;transition:background .1s;}
tbody tr:hover{background:#141620;}
tbody td{padding:11px 14px;color:#A0A4B0;white-space:nowrap;}
.tag{display:inline-flex;align-items:center;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;}
.tag-buy{background:rgba(0,192,118,.15);color:#00C076;}
.tag-sell{background:rgba(255,59,48,.15);color:#FF3B30;}
.tag-gray{background:#1A1C24;color:#6A6E7A;}

/* FILTER BAR */
.filter-bar{display:flex;gap:8px;padding:12px 16px;border-bottom:1px solid #1A1C24;flex-wrap:wrap;align-items:center;}
.filter-select{background:#161820;border:1px solid #252830;color:#A0A4B0;border-radius:8px;
  padding:6px 10px;font-size:12.5px;cursor:pointer;outline:none;font-family:'DM Sans',sans-serif;}
.filter-select:focus{border-color:#00C076;}

/* PROGRESS */
.progress-track{height:6px;background:#1A1C24;border-radius:3px;overflow:hidden;}
.progress-fill{height:100%;border-radius:3px;transition:width .5s;}

/* CALENDAR */
.cal-header-row{display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin-bottom:4px;}
.cal-dow{text-align:center;font-size:10.5px;font-weight:700;color:#4A4E5A;padding:4px 0;}
.cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:4px;}
.cal-day{border-radius:9px;padding:8px 6px;min-height:70px;background:#141620;border:1px solid #1A1C24;cursor:pointer;transition:all .15s;}
.cal-day:hover{border-color:#252830;}
.cal-day.empty{background:transparent;border-color:transparent;cursor:default;}
.cal-day.today{border-color:#00C076;}
.cal-day.win-day{background:#071512;border-color:#164028;}
.cal-day.loss-day{background:#150707;border-color:#3D1414;}
.cal-num{font-size:11px;font-weight:700;color:#4A4E5A;margin-bottom:3px;}
.cal-pnl{font-size:12px;font-weight:800;font-family:'DM Mono',monospace;}
.cal-trades{font-size:10px;color:#4A4E5A;margin-top:1px;}

/* STATS */
.stats-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px;}
.stats-row-item{display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #141620;}
.stats-row-item:last-child{border-bottom:none;}
.stats-key{font-size:13px;color:#6A6E7A;}
.stats-val{font-size:13px;font-weight:700;font-family:'DM Mono',monospace;color:#E2E4EA;}

/* MODAL */
.modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.75);backdrop-filter:blur(6px);
  display:flex;align-items:center;justify-content:center;z-index:500;padding:20px;}
.modal{background:#0F1116;border:1px solid #252830;border-radius:18px;width:100%;max-width:540px;
  max-height:90vh;overflow-y:auto;}
.modal-head{padding:20px 20px 14px;border-bottom:1px solid #1A1C24;display:flex;align-items:center;gap:12px;}
.modal-head h3{font-size:15px;font-weight:700;flex:1;}
.modal-close{width:28px;height:28px;border-radius:7px;background:#1A1C24;border:none;
  color:#6A6E7A;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:17px;}
.modal-body{padding:20px;display:flex;flex-direction:column;gap:14px;}
.form-row{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
.side-toggle{display:flex;border-radius:10px;overflow:hidden;border:1px solid #252830;}
.side-btn{flex:1;padding:10px;text-align:center;font-size:13.5px;font-weight:700;cursor:pointer;
  border:none;background:#161820;color:#4A4E5A;transition:all .15s;}
.side-btn.long.active{background:rgba(0,192,118,.2);color:#00C076;}
.side-btn.short.active{background:rgba(255,59,48,.2);color:#FF3B30;}
.modal-foot{padding:14px 20px;border-top:1px solid #1A1C24;display:flex;gap:10px;justify-content:flex-end;}

/* ACCOUNT MANAGEMENT */
.acct-manage-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;}
.acct-manage-card{background:#0F1116;border:1px solid #1A1C24;border-radius:14px;padding:16px;
  display:flex;flex-direction:column;gap:12px;transition:border .15s;}
.acct-manage-card:hover{border-color:#252830;}
.acct-manage-card.active-card{border-color:#1A3D22;}
.acct-top{display:flex;align-items:center;gap:10px;}
.acct-emoji{width:40px;height:40px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:20px;}
.acct-card-name{font-size:14px;font-weight:700;color:#E2E4EA;}
.acct-card-type{font-size:11px;font-weight:600;margin-top:1px;}
.acct-card-stats{display:grid;grid-template-columns:1fr 1fr;gap:8px;}
.acct-stat{background:#141620;border-radius:8px;padding:9px 10px;}
.acct-stat-label{font-size:10px;color:#4A4E5A;margin-bottom:3px;}
.acct-stat-value{font-size:14px;font-weight:700;font-family:'DM Mono',monospace;}

/* TOOLTIP */
.ct{background:#13151D;border:1px solid #252830;border-radius:9px;padding:8px 12px;font-size:12px;}
.ct .l{color:#6A6E7A;margin-bottom:2px;}
.ct .v{font-weight:700;font-family:'DM Mono',monospace;}

/* MINI STATS BAR */
.mini-stats{display:flex;gap:10px;padding:14px 24px;border-bottom:1px solid #1A1C24;flex-wrap:wrap;}
.mini-stat{background:#141620;border-radius:9px;padding:8px 14px;min-width:100px;}
.mini-stat-l{font-size:10px;color:#4A4E5A;text-transform:uppercase;letter-spacing:.4px;margin-bottom:2px;}
.mini-stat-v{font-size:16px;font-weight:800;font-family:'DM Mono',monospace;}

/* ── TOAST ── */
.toast-wrap{position:fixed;top:20px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:8px;pointer-events:none;}
.toast{display:flex;align-items:center;gap:10px;padding:11px 16px;border-radius:12px;font-size:13px;font-weight:600;
  box-shadow:0 8px 24px rgba(0,0,0,.4);pointer-events:all;animation:toastIn .25s ease;min-width:220px;max-width:320px;}
.toast-success{background:#0D1E14;border:1px solid #1A4A2A;color:#00C076;}
.toast-error{background:#1E0D0D;border:1px solid #4A1A1A;color:#FF3B30;}
.toast-info{background:#0D1220;border:1px solid #1A2A4A;color:#64D2FF;}
@keyframes toastIn{from{opacity:0;transform:translateX(20px);}to{opacity:1;transform:translateX(0);}}

/* ── THEME TOGGLE ── */
.theme-toggle-btn{display:flex;align-items:center;gap:7px;background:#161820;border:1px solid #252830;border-radius:8px;
  padding:6px 12px;cursor:pointer;font-size:12px;font-weight:600;color:#6A6E7A;transition:all .15s;}
.theme-toggle-btn:hover{border-color:#00C076;color:#00C076;}
.settings-btn{background:none;border:none;color:#4A4E5A;cursor:pointer;font-size:16px;padding:4px;line-height:1;transition:color .15s;}
.settings-btn:hover{color:#64D2FF;}

/* ── SETTINGS MODAL ── */
.settings-section{margin-bottom:6px;}
.settings-section-title{font-size:11px;font-weight:700;color:#4A4E5A;text-transform:uppercase;letter-spacing:.8px;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #1A1C24;}
.danger-zone{background:rgba(255,59,48,.05);border:1px solid rgba(255,59,48,.15);border-radius:10px;padding:14px;}

/* ── LIGHT THEME ── */
.theme-light body,.theme-light{background:#F0F2F7;color:#12141A;}
.theme-light .app{background:#F0F2F7;}
.theme-light .sidebar{background:#FFFFFF;border-right-color:#DDE0E8;}
.theme-light .sidebar-brand{color:#00A865;}
.theme-light .sidebar-brand-sub{color:#9A9EA8;}
.theme-light .sidebar-top{border-bottom-color:#DDE0E8;}
.theme-light .nav-item{color:#5A5E6A;}
.theme-light .nav-item:hover{background:#F0F2F7;color:#12141A;}
.theme-light .nav-item.active{background:#E6F7F0;color:#00A865;}
.theme-light .acct-switcher{border-top-color:#DDE0E8;}
.theme-light .acct-current{background:#F5F6FA;border-color:#DDE0E8;}
.theme-light .acct-name{color:#12141A;}
.theme-light .sidebar-user{border-top-color:#DDE0E8;}
.theme-light .user-name{color:#12141A;}
.theme-light .main{background:#F0F2F7;}
.theme-light .topbar{background:#FFFFFF;border-bottom-color:#DDE0E8;}
.theme-light .topbar-title{color:#12141A;}
.theme-light .metric-card{background:#FFFFFF;border-color:#DDE0E8;}
.theme-light .metric-label{color:#9A9EA8;}
.theme-light .chart-card{background:#FFFFFF;border-color:#DDE0E8;}
.theme-light .chart-title{color:#5A5E6A;}
.theme-light .table-card{background:#FFFFFF;border-color:#DDE0E8;}
.theme-light .table-header{border-bottom-color:#DDE0E8;}
.theme-light .table-title{color:#5A5E6A;}
.theme-light thead th{background:#F5F6FA;color:#9A9EA8;}
.theme-light tbody tr{border-top-color:#EEF0F5;}
.theme-light tbody tr:hover{background:#F5F6FA;}
.theme-light tbody td{color:#5A5E6A;}
.theme-light .content{background:#F0F2F7;}
.theme-light .modal{background:#FFFFFF;border-color:#DDE0E8;}
.theme-light .modal-head{border-bottom-color:#DDE0E8;}
.theme-light .modal-foot{border-top-color:#DDE0E8;}
.theme-light .form-input,.theme-light .form-select,.theme-light .form-textarea{background:#F5F6FA;border-color:#DDE0E8;color:#12141A;}
.theme-light .btn-ghost{background:#F5F6FA;color:#5A5E6A;border-color:#DDE0E8;}
.theme-light .btn-ghost:hover{background:#EEF0F5;color:#12141A;}
.theme-light .filter-select{background:#F5F6FA;border-color:#DDE0E8;color:#5A5E6A;}
.theme-light .cal-day{background:#EEF0F5;border-color:#DDE0E8;}
.theme-light .cal-num{color:#9A9EA8;}
.theme-light .acct-manage-card{background:#FFFFFF;border-color:#DDE0E8;}
.theme-light .acct-stat{background:#F5F6FA;}
.theme-light .acct-stat-label{color:#9A9EA8;}
.theme-light .mini-stats{border-bottom-color:#DDE0E8;}
.theme-light .mini-stat{background:#EEF0F5;}
.theme-light .mini-stat-l{color:#9A9EA8;}
.theme-light .scope-toggle{background:#F5F6FA;border-color:#DDE0E8;}
.theme-light .scope-btn{color:#9A9EA8;}
.theme-light .scope-btn.active{background:#E6F7F0;color:#00A865;}
.theme-light .acct-dropdown{background:#FFFFFF;border-color:#DDE0E8;}
.theme-light .acct-dropdown-head{border-bottom-color:#DDE0E8;}
.theme-light .acct-row:hover{background:#F5F6FA;}
.theme-light .acct-row.selected{background:#E6F7F0;}
.theme-light .login-wrap{background:radial-gradient(ellipse 80% 60% at 50% 0%,rgba(0,160,101,.07) 0%,transparent 70%),#F0F2F7;}
.theme-light .login-card{background:#FFFFFF;border-color:#DDE0E8;}
.theme-light .login-logo-name{color:#00A865;}
.theme-light .login-logo-sub{color:#9A9EA8;}
.theme-light .login-hint{background:#E6F7F0;border-color:#C0E8D5;}
.theme-light .settings-section-title{color:#9A9EA8;border-bottom-color:#DDE0E8;}
.theme-light .danger-zone{background:rgba(255,59,48,.03);border-color:rgba(255,59,48,.12);}
.theme-light .bottom-nav{background:#FFFFFF;border-top-color:#DDE0E8;}
.theme-light .mobile-acct-bar{background:#FFFFFF;border-bottom-color:#DDE0E8;}
.theme-light .mobile-acct-chip.off{background:#F5F6FA;border-color:#DDE0E8;}
.theme-light .ct{background:#FFFFFF;border-color:#DDE0E8;}
.theme-light .stats-row-item{border-bottom-color:#EEF0F5;}
.theme-light .stats-key{color:#9A9EA8;}
.theme-light .stats-val{color:#12141A;}
.theme-light .tag-gray{background:#EEF0F5;color:#9A9EA8;}
`;

// ─── ICONS ────────────────────────────────────────────────────────────────────
const Ico = ({n,s=16,c="currentColor"}) => {
  const paths={
    dash:  <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>,
    log:   <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>,
    cal:   <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>,
    stats: <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>,
    accts: <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>,
    plus:  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/>,
    trash: <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>,
    chevL: <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>,
    chevR: <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>,
    filt:  <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"/>,
    globe: <path strokeLinecap="round" strokeLinejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>,
    chev: <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/>,
  };
  return <svg width={s} height={s} fill="none" stroke={c} strokeWidth="2" viewBox="0 0 24 24">{paths[n]}</svg>;
};

const CT = ({active,payload,label}) => {
  if(!active||!payload?.length) return null;
  return <div className="ct"><div className="l">{label}</div>{payload.map((p,i)=><div key={i} className="v" style={{color:p.color||"#00C076"}}>{fmt$(p.value)}</div>)}</div>;
};

// ─── TOAST ────────────────────────────────────────────────────────────────────
function ToastContainer({toasts}) {
  if(!toasts.length) return null;
  return (
    <div className="toast-wrap">
      {toasts.map(t=>(
        <div key={t.id} className={`toast toast-${t.type||"success"}`}>
          <span style={{fontSize:16}}>{t.type==="error"?"❌":t.type==="info"?"ℹ️":"✅"}</span>
          <span>{t.msg}</span>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// LOGIN
// ═══════════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════════
// LOGIN + REGISTRO
// ═══════════════════════════════════════════════════════════════════════════════
function Login() {
  const [mode,setMode]=useState("login");
  const [email,setEmail]=useState("");
  const [pass,setPass]=useState("");
  const [rName,setRName]=useState("");
  const [rEmail,setREmail]=useState("");
  const [rPass,setRPass]=useState("");
  const [rPass2,setRPass2]=useState("");
  const [fpEmail,setFpEmail]=useState("");
  const [fpResult,setFpResult]=useState(null);
  const [err,setErr]=useState("");
  const [loading,setLoading]=useState(false);

  const handleLogin = async () => {
    if(!email||!pass) return setErr("Completa todos los campos.");
    setLoading(true); setErr("");
    try {
      await signInWithEmailAndPassword(auth, email.trim(), pass);
      // onLogin is called via onAuthStateChanged in App
    } catch(e) {
      const msg = e.code==="auth/invalid-credential"||e.code==="auth/wrong-password"||e.code==="auth/user-not-found"
        ? "Email o contraseña incorrectos."
        : "Error al iniciar sesión.";
      setErr(msg); setLoading(false);
    }
  };

  const handleRegister = async () => {
    setErr("");
    if(!rName.trim()) return setErr("Ingresa tu nombre.");
    if(!rEmail.includes("@")) return setErr("Email inválido.");
    if(rPass.length<6) return setErr("Contraseña: mínimo 6 caracteres.");
    if(rPass!==rPass2) return setErr("Las contraseñas no coinciden.");
    setLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, rEmail.trim().toLowerCase(), rPass);
      await fbSaveUserData(cred.user.uid, {
        name: rName.trim(),
        email: rEmail.trim().toLowerCase(),
        accounts: [],
        trades: [],
      });
      // onLogin triggered via onAuthStateChanged
    } catch(e) {
      const msg = e.code==="auth/email-already-in-use"
        ? "Este email ya está registrado."
        : "Error al crear cuenta.";
      setErr(msg); setLoading(false);
    }
  };

  const logoBlock = (
    <div className="login-logo">
      <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAZAAAAEkCAYAAAAB5GevAACTAElEQVR42uydd5xcVdnHf885506fnd3NbnqBAAETikpRAWUXQRAQxdcZEKRjQgu9t9kBBJHeSZDeZEalqFhecBcbqPCqSELv6WWzO33m3nOe94+7k0ISsgkBEjhfP0s+JrMzc8899/zOUw9gsVgsFovFYrFYLBaLxWKxWCwWi8VisVgsFosFACDtEFgsn22y2aScODFJTz/9NNvRsFgsFstgITsEFovFYlkr0um0IAC3Xj/lkJuuOWYSADCzFRSLxWKxfLDlwcwCAP3+4VNKPY903QcA3d1pZYfGMliEHQKL5bNHd3daEpHJ/vTYGyaMaY1I6IIdFcvaYncbFstnjGnTJjudnRn3vptPOnmLsU0nlis1dmFsQo3FCojFYvlAy0N1dmbcO289fp8JY6PXuW6p5shokODYwbGsNdaFZbF8Rkin06qzM+P96NzDOrcclcgq4RlXMwkigLQdIIu1QCwWy6rFI5PJeNdefPLnJm0pfx113EipZowgCGKGgBUQixUQi8XyPrLZpEylMt6t1568ybabN/0qHqxEyiVoIYUEG2NHyGIFxGKxrARnk5JSOX3t5SdvMml86MmmoLtZoQxN0khiAkC2lNCyztgYiMXyKaW7O60oldM/ven8cZ//nHyyNUybFcuuJsESAJhs5xKLtUAsFssqxKOzM+PddevZm0wYxU8mImKzQsHTUJBgxjKzw4qIxVogFovlfeJxxYXf323zkfTXppC3WaFAGoolY3nxsFisBWKxWHyouzstOzsz3j23nrnP+JEq2xR0o/kytFBGghkEaa0Oi7VALBbLMtLptGBOU2dnxntg2tTjthgjfhNVHC1XjCGpJZgGHncrHhYrIBaLZYBsNikzmYwhyphf3nXqNRPHR28JUl3XvJohSYJsg13LR4R1YVksGzGNeMfUqcn2fXced/eYYYF9isWa9kxAkHQJbECQYGt5WKyAWCwWwHdZdU2aRNSZ8q66ZPKuX5jUdM+w5sD4fKHqMZESwgUG6jyseFisgFgsFgBANpuVqVRKZwDcf+sJZ2w6JnxJk3JC+f66JknKd1hZt5XFCojFYhmAGQRkBVFKn3pYctSe3xh906jh0e+4lRqK1aohKWxLdsvHig2iWywbAel0WhGBiVL6p9cdl9zv22P/scmI+HcqpbJXN4YhhH2WLdYCsVgsKwiH6OoCiDLe5EMOGLHPXptcMaY9fCiRi75CXpOQyjqrLFZALBbLUhignoGiwEwGuH/aSQcPa3GuGT0kOKy/VDHagEhKaePjFisgFoulAXWn05IyGQ+dGe+aHx8zafOxsZ+MaovvA1NBf6GmWQgpBNuaQMsnjvWbWiwbCNlsUhKBOzMZb5/ddhv+yH1nXLbTxLa/jx8e3adWK+hq1WNQI1BuHVcWa4FYLBaAmNNElNEA1L23HTtleHPkglFDw8PL5TLyeaMFKckEMNnznyxWQCwWyzJTgokyfPetp6RGD1HnDW0Nbud6HgqFkmdAkoSW7L/MjpbFCojFYvHrOrq60rRw4cLot7/adPfwdvofaEK5VNWajRBCLJdhZcXDsuFhYyAWyydFLisymYzZZRu+erOxwf+pler1UqVuGCSFIBvksFgBsVgsq4QoldLbb799pK1F7VsqVLUHKBJG+PFx+2harIBYLJZVwOy7pA4+eL+QEwhGPY8lAMLSWId1WVmsgFgslg8gHA6xkGxgs6ssVkAsFstaY0DW3rBYAbFYLGsNwT+3w2KxAmKxWCwWKyAWi8VisVgBsVgsFosVEIvFYrFYAbFYLBaLFRCLxWKxWAGxWCwWi8UKiMXykULpdNo+RxYrIBaLZXCikc0mZXd3WhGBM5mM7UNi+UxizwOxWAYBMyiXS4r29onU2ZnxUqmcbvzbOeccN/6NNxa9k8st+zuLxQqIxfKZFg2mrq4u2TVpEhOlNNAQiImB267c9ctjRyc6IiH6nwWLKy133fWnzwEoAfboQIsVEIvlM0k6nRYdHRAdHTBEZAB4GQCTk5MTO+0sdhvepvYOBwN7RMLBLaIRQtgRKObzc+bPn29Fw2IFxGL5jEGcTlNPB8Tuu1/sZTIZk8nAAED6zBNGThhv9hg6JLBnQKjdY9HQyFCQUXc1qrUaF0twTSCgDCvrurJYAbFYPiuikc0ui2dQJsMYEI3rrjhpi1Ft9M2WuNhTktitNRGKOxKo1DTqbtnU6zAMEkQkAFYDf9pWuhYrIBbLpxVmplwuJ5JJgCillwuCywdvOXvbULj6rXBAfCsaCW7T0iSDAgaVqodytaIBZmaWBCkIJOzpHRaLFRDLp5x0Oi06ANHRtTSeoQFg5513jv/ggC/uOnJE8BuxAO0dCtJWLfEItGZUai6KxbrHRASGICIJEGjAxmAbH7dYrIBYPsWi0QHR0dGlichkAIMMcMbxyeFf2WmTncJh/Z2A4D0T0cDoaEii5nmoVl30F4QHGAGAiEgRYM94slisgFg+7WSzSdnePpF23z2zXBA8gyuvPHHTzYbKzlBAfSuoqKO1KdgcUoxqzUNNV01fURowCQKEIK3YKobFYgXE8tli+aK+qy4+9gtjhwb3TTQF9gqFafu2WCBMBJTrNVSrJVMFGSYSBEcQWGCpa8qKh8ViBcTyWYKmTp0a2H7LwJdam529EmHzDRLYoaVZAJpRrXrIl0saEGCwIBICgKABybBYLFZALJ9BurvTqrMz432jI3Hg2BZ5j9QePBjUqh6KefYYkvx0WyEJDLIWhsViBcRiWZ6YNBGHifvL5RqDAiAhiKBoBaeUFQ+L5aPAduO1bNQwwzCIAFJEJAgM657aoCC2ASZrgVgsFsu6aDxZ+bAWiMVisQyWdNpfW849N7X1hece8lX/7+zBW1ZALBaLZQ10dPhisf0WI78+aUxzyv87u9582rAuLIvF8pHR0iQjOqS+OCAg9uRGa4FYLBbL4CiX62Olw1tvv/32DlHG2HCIFRCLxWL5QDo6JjEAONIZ0pIINx3zgz1GAcBFNg5iBcRisXx6YAbMevcuJQ0AaO2NjkYltyVq2/l/32PXHCsgFovFslqIiHjECESUQ8MUMWm39hXfMumwo2MFxGKxfErW+oE2L+tvKUin0wQAyeR+bY7CMLfOiEYCE30B6bKBdCsgFovFsmomzZxJALDlyBGjQwEZrdU8SMUTADhCkBUQKyAWi8WyatonTiQAaGlq2iIacVCruwgF5PDTTvt+gtk/XtiOkhUQi8ViWZkO/49okCY5woFh7QUdJz5pk6ZRAJDLpey6YwXEYrFYVqEfAwWD4Rg+x2zAECYclEKSGg8AM2YssBaIFRCLxWJZGaKM2XvvvYNC6q1dV4PBCDoCba1NQ32B6bCDZAXEYrFYVqTRMHGvvTbZJBRQI6suM8MTxBLalDe3I2QFxGKxrDf6/Uq+TwkdA2tKHPVd4uFAgOFpYgkBg+amaMLebysgFovFsloFAYC25uBOQQkwDABBbDSW9PWPB2wtiBUQi8ViWZV+dHRpANJxnF1rngZYCBDBNUBLvKlp4GX2yEgrIBbLOkPZZFJ2d6cVc1bauoBPB+l0WhARX3LGYZtEw4EtanUPAAlmJgajVqvGAThExLAH1VsBsVgGCwOUzfqiAYBTuZzu7Mx4RCk9sKBYNnrrAwIAbTmh7cstTcGANkYTAQwmZoNyrT4skUjE7Eh9erAHSlk+OtFgplwuJ5JJgCilkcpp/1+S8tpMfKfWdrXziNb4l4wQf987deXV2WxSppa+xrLxCcgkBsCRsPdNRzLAYJC/S/UYiIQl9t13Gzz44F/ADNiz0q2AWCwruTE6ANHRBUNEBoAGgL333rvp4P3G79zaKvcOB0N7hpSaGA0Dra1xvD2vrwIA7e0T7ZKy8UJEKb333js1SSH2rNZdMEjSss0EAo7ErtuMxYN2rKyAWCyNhSOdTlNHB0RHBwxRxmQAgwzwo3NPGjZ+HHU0x+U3A4q/kYiHR0RChJrnoVatc6UiasX+oiKmsh3GjZtsNilSqZz+3t5b79jWGhpac+uGiAZc5ARmhqMUxm6zTUNSYMMgVkAsn1HRyGaTor19Iu2+e8bLZDKcyfjtK669/OxNhg8tfzMeUN+KhYNfaW4SzQHFqNYMam7V9BfIACwACMBToJACs43FfYLw0v+sOw3rcUhL9DuRsOR8PwyoEWMdEAu2oS4rIJbP5iLDTLlcSiSTSRCl9HKxCnnLVVO3HTE8vGdLVH5dstm1ORGPEBjVmodKta4rDDaAFETCX1Ro6bri1wnYheWTF5EPV5qx++4Zb++9pwajIfWtWs0lQIhl95V8K8QOsxUQy2fHykgmk+L44yeS75pqxDNy2G23ZOzkoyZ8Xqnyt4JS7xsJOZNa4wqGDSpVjWLRaAYDYEFEshFItWygN/pD/n46vZvKZJ7W+3QUdx/SNGxcvVY1gCOW3xgQCdRdF/+d+d/19KkWKyCWDW4tyWaTIplMQlBK53I5ncv5/3DllemhI5sW7R4JOfs3RdUu8TCPjYcjcF2DSr2C/lLFY0giZgEyA8FTu0h8FujqOoEzmad5zPDQIZGgg/5a3UB4orFtYACCBKrVunjssX/bSWEFxPJpo5FC67umcgAgLz3vmB0njo9/tSmuvu4EajslIomWoFSoeFXUalXuK0AzIEBSEKAIPKAZdo34rMDsZ19NPfLI9uZY9JulWhWGSNLyc4CYJTFpo0vPPjuz7lskduysgFg+JYsAExHpESO2j9xw5V67hUz12/GQ3FUpOSmRcAC4qNZcVGqsyyxAZAh+ho2y68Bnm56etAQy3h4dw/YZ0hxsLZXzmkjIFcxaAgsitLY0vQeg6IuODYlYAbFs9Ay0nzA3Zo45YJuJQ66MJ7BZUEXguS5qtRoXi3XN/n5REIS0XSgsKwoIDAAVlO6JxMwMsfLsGCgaXNJXlkv/ws4hKyCWjV88MpmMuSp9woRJn4v9vK1FiEKpousgZpAACUHUsDLshtGyIr7bM2OuvPyYr7W0OjuUK1UDSLmyiUusFOAEA6/6f5ETGCgwtWzc2OSYzzADvYswYqTz3WHtjsiXKnWQlCBSRBAr7hHtjtHyfpIAwJ8b1/LDSNiwMcqsapYQGAaEuqY+32qZYSeTFRDLp4UhcbUZ2DDBEYA9qsEyOOs1mUyZ6644YouWOH27UtRgwXLVr2YwCbDgV+zIWQGxfMqIJ+IakOQXk9nNoWXNdE2aRETgoUNi5zbHVJg9oQmractPRJ7noa+3shgAeuzwWQGxfHowWi8rDbd8NueAGbzlmU6nBZJJkz7lu+NHNAcOrhQ1m/dlXi2zPQACiXJVc92rvgIAkxbOtBPNCojF8uEhEDzt2YH4hCkXB9/PsqtrEhERf26rEecPHRIN1o2rWXir7jfAzEoSVWum8NLbS94FgGQyZ/2kVkAsny74E+pWZDejn+Q9ZwBMDD3IpSCdTgsgaS5LH735iKHxQ8rlqgFBfsDcYUcp1F131tVXP9Jra0CsgFg+ZXjGPs+fXQlpyMjglgI/9kG81Waxi9paRFC7xhCI/NgZr8LChHEciWoNrwLwgKxdc6yAWD5V7oty0Q6CZY1ks0kpDkzpGy49eqdhzaEflIplY4jWWEtmiFGt0vOATeG1AmL5FG5DBWx18GeR5e43r/neJ5EEM7DJpi1XNEeItHZ4jcfZE0S16oGl9xcAWGgD6FZALJ/GhcQ+1+usv/xpUF61RuuDUik97cajDx49NNJRLLqahSfXMC6slBTFsu6bM6v6AgAkk1kbQLcCYrFYli69UngbvwKv3gRJpyGSyYl8dDLZOqY9eq0wZaNBAw13+YP2JSYYUKhU3ZdPz9yxZKBpp92pWAGxWCwEYhCQSMTmA6gMWCK8MS4DXs2rru5fOzrSgihj9ti75ZLxQ5uHVipsSHhCGIkPcnsSG5ZSoFQq/wUA9/R0STtrPmWbJzsEFsu67tl5QC021n2Yf2i5YYNgMPSvVb0im03Kzs6Md9OPj99102GJYwvlomYiSZDgDzImGACxKFcMZi9ynwJs/MMKiMVi+fQIIIOlJNHbX3VnvNX7NLC0PXvj3wm5JL785ffCW4wL3h5XJJbU2finRdEa3ps5FAiKvrw7/z+vL/krAKRStoDw04Z1YVksn0kIDO0lYmGxeIF+/NzMXW9ms1mZyWSWLvI9PWlJqZQ+85gvXTJmeHSrQq3kOazEYLL1iKCDgSBqXu2pO+98vMCclbCZGlZALJ/KtWTgPzaN97NwqwmAMZ6ORUPOnEXu7HcXmxOYmWbMmLF0gW+4rm77ydF7jxkRPa1YqniGlDRkBvtB5HkGS0p4zBcjW/9hBcTyqaRardpB+IzAIBijvWgsKBfnxfwX36l985Tzb5gPdFHD+vBbtU/kc6cm2zfbtOkuJT14mgUNcofBDFYOyQV9lfxTf3z7aQDo6MjYA6SsgFg+nQJSs4Pw6Tcx/cXdaC8ej6gFi82sP/599p5TT7/2v9lsUhItc111dEAQZczOO42+c+SQ2PBKrW6ISAz+01iHgyEuVau/u+Nnv5rPnJW2/5UVEMundXkhOw0+3RgQE0gbL5EIq4X95rl//Kd/p0uvuPu/2WxWplK5pdZBd3dadXZmvPtvOT49bnRiv0Kh4Ek4g0y/1QPlJCxqdU19/XQ3AHR1WffVpxWbhWWxfMphJiaq63hzi3pzVuFPT/yt8p1bb52+xD/TPLVMPNK+eNx19eS9N9+kqatS6fcMSA56e8EKDDbhkCPm99bf+s2Dz/X43Xcztl+/FRCLxbLR2R6GWQnBkWhCvTar777vHHr9kQA0p9OCUsviEtlsUnamMl763OTE8ZsnHggSm2qNBAkxcFLlYExZA2JjAiom+vsWPZB79tlKT09aAVZAPq1Y34XF8imEADCzDgUCJJQQr72dv+A7h15/GDObdDotaLl0XT9onjXf+c7Xh+y6w6hcc1S1VmqaSUgx+MxbBjOxkkouyZdL/3pl7l3AinUlFmuBWCyWjcPy8JoiYbWkUu9/e4535KHHXf+IH8wmA6xYLNjTA0FE+N3DZ987ssWZWOiveqS0Yl6b/aUAgXUk4qj5s0u/+PF1v3zT/7yUzb6yFojFYtkohIOZCaybEnE1p6/0nz/9ef7XDj3u2ke6u9NqYDFf3qSgnp607OzMeA/fftLdY4cF9ikUyi5LVuC1WxoYgBBGFIp18+o71RsBUC6XszfEWiAWi2VDhUAwMAABpKHDjpJwAvLN9xbfedkt80989tlchbNZSZ2pleIQzGlJlPF+cfeZl245NnRIob/kGSKHYACsXeE4sfFi0ah6e27f46ddMP05P0Cfs9aHFRCLxbJhwgBpkBdgQVrH4iG1uFDrf2fWkpMPnXLzPUSAHyxf2Y00bdpkhyjjTrty8sXjx0TOL5XynoZUtPR427Ur2yABka/WzZy8uNjm7H52sC4si2Ujtj+METqgPIolQuqdRZWevzxb2enQKTffw5yVzKDlg+UNnps22ZkyZbr7RLbrkB22HXqhW+33tCFJ67ryM3uxaFjMWVT+zQ+Pv+H5h99XW2KxFojFYtmAMGxYsNDxeED1F0zt1Zcrl3z/uGsuB2C602lFlFpl6uxz0yY7O0yZ7v72wYu+3xb37tNeRbuulJKIAF7rcnFmYqUEFUr1+luvLUoz29iHtUAsFssGCoOM1iEZoEhTSM1epP/67Ev5r3z/uGt+xMycTqdFZ2bVdRfcnVY7TJnuPp790cHtrXgQusyuCyEEaNnZJmtj/wDErJvCQblggb7rjEt/9i8gK6z1YS0Qi8WyQUFgNgbEaGqKyN4+nZ81p5j5/uTrrweg/SwrWt3RutTdnZbUmfF+Nu3U40fGqzdrXTCeJhJC0Lp2WddsOBx0xNwF5f4nn5l5aTqdFl1dM2zPKysgFovlk7Y0Gk4Cw8wCno6EwsoYgbdmlR5/9tX5Z1x66UOvMTN1dXWJzs7VWB0A9XT7qbrTrvnhJVtuGr5A18va84RYN/FYdmqvgNCBQFC9Obuv68af/m4WZ4+SqwrYW6yAWCyWj9niAANgrYNKyVA4pOYtKr/a20dnpqZc9zjgNz78AKsD6XRaoAvopIz3yD3nXLLpKOeCerXkeRryw1geftU563gspN6ZU/jb0adPvyGbTUpKpWzVuRUQi8XyidsfzNohyGg8Ihflvf5XXs7feNIND/5k8SuLC8xp0dUFrM7qAIBsMilTmYzOZEA/m37CfZuPUT+olPKeqwNSCPMhxEMDRnDQkSgUTfXt2bVjiGBmzJi49rm/FisgFotlvUiG/18DQ4IRj4dkqcjeq7PqDzz7r7cv/fG1udcBv+kh0QcfzpROp1Uqk/F22237trOO3f3u8cND+xbyeU9DKEnmQ67yBALpYCSoXn2tdO4J59z6UqMFvL2HVkAsn0HK5RqYbPnXJyYdJAAjDFHZRCNxVasLzFpQ/u2Cheaiw6de9xwAcDYrKZUya8pwaizmZ56Z3PIbO23y8Kg2tV1/vuoyOc66pOmu9F0N6XhTUL0xq/8v359849W235UVEMtnHK3t8//x4wv2o4/+H21+xBYcHdEsqvWEmLuo+I8lZXX+QUdf82RDOLpmzOA1BaeZQUBWEKW86Vceu/vm4yPZ9kRgSL6v7BklHFoPziVmNuGQpMX99d5n/m/ekczMXV1dy8wnixUQi8XyMcgHgf3Dlv5QOP3orfPzC96ct97p/9GRU2/LAjCNOMdgspo4nRZCZAxzSt9xzdFnbblZ04+jQUnFYk1DCkXMGORx5h8kUFCSjIZSb8wpHvHja3Ovf/ErOZnJ2LPOrYBYLJ8gYiM9UpfYX5bNOu6/icDpdFov7C394AfHXfEPAC4R4eGHv7fGOEeD7u60os6MN2L77SO3n9J505gR4SNrlSKXa64REhJMAAv/y66reBBBMNx4NOr869XFVxx1wk2/8l1lKRv3sAJisXzCAqI23oYIBIK31AW49jv9jN+r6q+AHyBPpXJ6MJXcy7uspl114lbjx4XvHzkkvH2hWPQMCymIBJiXKd2HQcOLJwLOW3OLjx485abzBuIs1vKw2FYmlk8WBrDxn1n34RbobDYpAdBgW4D4mVhgopS+99YTj560ZfiZEc1y+3y+32OQIgKtr0E1bHRTLKzmLHb/c80jPUcwM/f0ZAxs3MNiLRCL5ZMVDwBYi95R1D1QVZ5M7t1+xHe2vnJUe+hwz62iv1QzQigFJoDMOllD77etjPFMJByR8/tKC5/642vfezL3fH8qlZK5HKz1YbEWiMWyIQjIWlgp3NmZ8e688bQ9j01N+semI8KHV6tlXfMMCyH8Z5kawvHhHm3NngkHFRVruvDuPP2NH9/yq9ez2aTM5WyjRIu1QCyWjUOelsU6dDKZjP1g/1E/GtqqTopKgXy+7LEgJWh9fyabUCCASp35mefePvSsSx7+d3c6rTpTtljQYgXEYllPloffWJCIPxIzJJ1OK6KMB6T0temjvrPNtq2Xj2wJbVUoVk2/rkEJR61fC0jAsGeCjoTrEV58pXDQWZc8/JitNLdYAbFY1htmYKdORkKiUqk661WaBpogEmW8KYftO2rfvbbIDGsOHx1WLvoKFQ+AUqSwvt1nbLQJBQg1LfDKG6WDppx1a86Kh8UKiMWyvhZZZgZgCETBgHLC8SDK75QeA4Ceni4JwPsQ701AThClNDLAwz897aj2hLh8+JDg0GKhYsp1AVJageX6l0RjTDDoUKVu8PLrfQcec/r03LRpk53Ozoxr77rFCojFslbQQA6TAYPAzIYAo6RQ4bAj655CPl9967VZfQ+JxC4/Zr6OiGhdA8zEnBUDv6+nXz31y5uNjV3S1iz38HTVtzpIKJIMYrGe7Q4CG+hIKCDzFV3/27/m/+Dci+/LTRs4N93OA4sVEItlba0BEAxrFmAjQRQKKUGOEouX1Gq9Be+JUo3vzlzz+6deeOGFEnDtOq/e2WxWpFIpTZTS6bMPHfvlHcadGQ+6xzdFIErlsjYGQghSvtuMwFifEXMCG+PFIwHVV6JFb77b/61zL77v2QG3lRUPixUQi2WtxYPZEDQHHMhwKCTLVY3FRe+FRX31n785e/7Pzr7oodeWvXbdutFms1l5YCqlU6mU3m233ZpPOuwLU9sTzmmtraK5VPBQKkGDSAqxbLFf/9fpefFEWC1Y6L79p3+8c0Dmqty/bczDYgXEYhmEjbFsYSYYZiawFgQZjQQEkYNFfdX+2Yvqv1nc79591NS5fwT8GoiBmgykUjmztuKRzSblgQfmdCqV0sC40L037XvMmKGhM9uHRMbWqjUU8wXNJCQI8iO7cmYWBJ1IJNSb7xX+8deZ3v6XX5Wb3929mxUPixUQi2XN4kFgZmaCEWCEAyRDobDqLVQwf3H97y6J6X/5z+u/veyyR+Y2ZOaP3WnV0wOTSmXWzeI4MNXoc6UevP2kg4Y1B89uawluzZ6LfLGoGUIIIeSK4vbhIWaACAYEMtooxQhGYuqVd4r3Tj38mmNnAZVsNik7O3NWPCxWQCwbF0Qfb18lZjYSxkgKqlBEShcG+T6ePX9h/ZcvvbY4d9old/956WuzWZlDDqlUzqzt7pwB6kmnZWcm4/kWB9R9Nx930LC2xGlDhogvSOOhXC5rwxCCpFwmF+vXXcUkwGQA43rhUEhVXMEz3+w76/vH3HQlESF90UViXUTRYrECYvnEcT3P+ag/wzc2oIlIhENBIQNC9PXrWu98t7u/qu/9378Xn5g+fXq/L2gE8/DDEsmUWZf4RjqdFl1dk8hPx814wG4qd8cXDxqSkKcNaQp+gclFpaQ1mAmCpKCP+trBgrWOxRNqfp8375VX5x11/Dl3/XYgfmMGOgJbLFZALBsPPGB7zJ3buxkAdHR0GSCznt7dwK+XYE3wEHAcGQw7qlw1WNhff6VUDjy0YJH70OQzrnm18Rvd3Wm18JaZnMrl9GAOcno/2WRSJpNJUCqlMxng4IP3bdlnt02PGDM0ckRzNLgto45ytaoNgwQZCSJ8FMHxZXYMQxtjpBSiKdKk3plb/d+ev790zBU3/Prd7u60IrLneVisgFg2eiFhWs/vZ8goQ1KrSCggiSJYkq/1LujTv563sO+hI0+e/kcAdX93nha53CRKJlPGbxuytp8FymWzIplMGiLSyOVw05XHjxvR4hzbkpCHtbcGRxoXKFdL2j+BsGFxfMR9TFmC2PXikYAqusJ98e38pamjr7/Yt5BssNxiBcRiWdqHikHsWxtAKKBkKBAQSwp1zF/i/XnR4mL276/M/sV11/kB8Ya10dMDQ7Ru7psV3FQD1sotPzr2qyPHBCcPiTvfHpIIxCs1jULR1SCPCFISfTxjwmyMJIN4U1TNWaxfend28ZijTr7xb8xMXV1dlMlY8bBYAbFYoE1AMoyniEQ8HJJVJiwpVN8pLSz8cn5f4MFjpl713LKFNStzuXULiK9obcxgoozJZIBvf/vbzQftO+Y7ra3BIxIBtVtTzEGxUkV/oeYxsxQkJGP9961a7jsBIAgmeMKD1MKLhkOqqoG35tRuuPvRt8/P5XJF32VFHuxBUBYrIJbPPD3+H/PmLclvOrRN9faVyn3V8v8u6K0+dMsT/3nib4//reCLBlNPV5fs6MrodQmIN6yNjg4I6sx4S62N607aesRQcVgioA5uawqOkgDy1Sr3FVwDkCCCIiLwx7JeMwy0DhhHRBNKze3TL/33pYXnnHrenY8Dfu2JdVlZrIBYLEv1w3c9vTW7+Ff2xEXvLV700HmZ+19v/Ht3d1p19MAQkQHgrW1snhmUy61gbZhkMhk7YPdh30o0yaMT0fDX2uLKqdTqKFVL2o9pkCQi+fGNAoENsaC6iUZjslB0zUtv5K+/8b7/Xvj0008XG1lWazrxMJtNyhkzJrLNxrJYAbF8Jshk/J7qF/7ozncAXOIv+mmRy82kdXVRNRbTZDIJ31rxrY3brzt622GticOaos53m2O0qZCESqWKJQVXA0awlFIYBujj8A81WjwaSE1eNMQKgZicM9995rVZfadPPWv6M43rWJPF1RDJVCpla0AsVkAsGx/+grvuGUnMoJ6etPywAfGODojdd894/m49h+MO3rdl986t9m9qokOjId6tpSmsajUXlVpdMxNAQpBgCQg/fP9xRcjBgIF2pJLRZkct6nNnL5pf6fqfI665E4AZvNXR6OGV0rdfe3LH3AWLRl90+QP3p9NpYS0RixUQy8YhIMwgEtEV9GRt9uMEBtbJ2qBsNimSWFq3YQDg1mtO3GV4szo80eTs19rsjJAwKJeNf3wsQRBouWwq+njHCqyJQLFESPb3efrdd6q3PPns/Etvu+3+BYII+qKLxJqsDj97DCBK6dMmT277ys6x87caHT7l7//unQ7g/o4OiMZYWCxWQCwbNEQCsVhwlv//cgLAR+pOaVgbnZ3LrI3zpx642XbbDf12cyx4cCxG2yciCrWqQaVUa3wXASJFH/vo+HpqmIwQhmPhsKzWgHdm1x/992tzL7kg88D/NayJVCql6QMsh+XPVs9kgLtvPuHITYaHM0OagmOkAlzNRTsbLVZALBuP9QE2RCzAzrsA0NMz4yNZo5lBXV1p2dXlu7kyGZhth20bvSiz5+5OnA6LB7Hv0OZQWLNGpVLjfMHTDEgiIRvnnn/8GMBIIwgcCUupWWFhr+55Z3bhx0edevPv/evKSmDN7VaWd1fdeM3kHcaPav7xqFbxdeMZFMqVajweCdJH2P3XYgXEYlnPizrroCNEqcr03pzqzwBg4cKZ63Ol9l1USwPiGS+TAW657titRyZiB0cidGB7Qo53HIFyrYJCqeQxhCCi91kb/AmMjTFExOEoScNBzF9U+8/rby+4+vjzbr9vYOxEV1cXBueu6mIi0t+fvF/b93bZ9IL2lugJLVGlysWK9tgIIlJETHZGWqyAWDZwi4MAsBYwFI2FZL1G+M9L/ekTzrn1b+l0er10hGVmQi4nxIEH6qUB8eMObtll2+bvDR8STYWCtFtzPODU3Soq1bqpVYk9IYUCFBF/AnJBWHbaILQAEImEpGGBBX3V/8xZsOCqI06Y/jMAHjNTLpcSgzg6d+CI3JTOZDK499YTjxjdHrt42BA5plSsoljwNASkANmqQosVEMuGDsEYNkJoxMMhWXWB+f3uU6+/ueSK48644385nRb04TJ/lgXEB84VB0C3XXn8V0cNix6ciPK3EonQSAGDSqWOfKHsARAEIVhoSIiPMYtqRQw0E8NIAkXDIVk1jMVLzD9mzeu9+bCTpj0IwCMCHn44KZe7ttWyNB5CKX37zSdtO25I6Mqhrc43jHFR6Hc9Q1AktO+aIwGwjZdbrIBYNlCMYSYBE49I6ekg5vbrpxbkq1cectT1A378tFjX9NtGlfnuFy8LiP8kffzwTcbQgU3R0OGJmPhCIipRq2qUy2U90PZDEJFq2ETLUog/3r04M5jAOkBSRWIBWap5WJgvP/XWu+Xbjzp1+sMA0BCOVCq3xrTc5d1Vh0w9pOl7XxyeHtJKJ7XEWJWLNe2xEUI0XHOfzDVbrIBYLINeIAFjwuGAlOTIOfMr/+5zA+cfdNRlTzQWf98ds/ZuK06nBbom0cCO3AMg77zuhN2HtTuHRSOBfdviwRZjXBSrde4rGM0gKYgkbRjjYghsHEeqSDioFuerev6Cwm/enefecvypt/1++bEZjHDgfe6qB2448bARIyOZoUOcTcrFOgoF+O4qsmEOixUQywYNgWHAbLRylIwGw3Leovrbvf31dGrytQ8C8BrV4oNxx7z/zbPL2qYbZIDTjvv2mC99ccL3hsTNYYm48/lwWKFSrSBfKmqAiUgKEBRB4yNvn77Sqk4wZMBkIIxg8gMdiAQDUjlKLOwv9efL6q6X3uy758SzfvrvFUV1cGOTzSZlKpXTRCl980+O23azMaGfDB8S2YtNHf39VU3CSBJC+tdurQ2LFRDLhiwfhg0REIvHZW9fqTRrdumqa+95/vq//OUvS5b58dfO4mBm6unpkn7dhp91NO36qTuPaPV+GA9HDhjSqhLwDMrVuskX6uy7qMT7UlLFJzAYHpglSx3QUhoVjCnpuQr9RW/GvMLiB556Zs5D06Y99rZ/jWsnqsuKATP6qKPOjO+/S+2itpbAKYlEQBVLFc1+nbxcdt02zmGxAmLZQGHfj+KFQgFVJ4N3F1Qe/nP3/Isvn/bAzIEFT2UyGT0Id8z7Fsllbqqddtqp6ZSjv3jAkERgciIS3TkaF6hWqqjk655HQggiIT6RLKqVxoL9yLREJCCkE1Kqt69uFs+pPdlbK9x28NHb/hqY4vrCkZVdXX6zxsHKUnd3WnZ2+inJd1w3+QebjKBLRrS1bJKv5JEvVbXAhuGqs1gBsVg+0EUDEDS0UQTEmqJq7qLSW739oampYy77DeB3xO3szOi1OcAonU6LrkmTqHEsbDp9zOgdJjQdFo2oY4bExabSSBSqVS7m2RCTYAEFckHGGegs8jHvtskARoHJM8QwUpCKhENSG0JfofZuqdfNvjq7/MCpZ93y78avLDvMavBNDBvuqs7OjHdl+titd9yu+aJEjJIwBn3Ffg+QShBJ66qyWAGxbARWhx/riIUDsuwBr80u3nhX7s2LHnvssb7GznptOuI2miJ2dma8DIArLjhiiy02j5zc2hz+fltTpLVer6Fcrg+cJ04CRLJR/iZYgunjd9Mwg5mlIXIpFAyKoAqI3nxdFxbrJxfnS/f//A/zf5XL5fr9165bp+DlTz7cfvvJkQvPjJ/WHMb57TGECiV/PIjkclllFosVEMuGann4NR1Myph4rEkuWlR59aW3F550/Bl3/76xU17Lg5uWZhEBGe+ycw6d8LnNms4e1hZOJhLheLVcRylf8rTwGxmKT9g/03BREYCAkjIaUrLkSvT2mTdK1dJDb83qz51y/h0vrGxtrH2q8oAF52UywN03Hrv/2NGxH7U3h7aulirIF1wNYSSRbwlaLFZALBusvdGQD2bWIUdIdkLyrXcKdz/6dP9Jd955d6HhrlqbOMfyWURnnXXA6M4dtjyxKUDHtTSJpmK5joIvHJIkKfoENtfEBBDDwO/bJcBGkVSRUEgaEujtr/Qtzru/6c0HHjjzkqd7Zs16trK8tZFM5Qytw7kk2WxSHnig764654QDJ3x9900uaAnLQwPSRbG/4jGRJGEkWAJkrQ6LFRDLBq0fAgQCjPZisYDqK6H/3bcLJx58wg33Nxa8tXfL+FlE7RN3i91y2jYnDW0On97W6rSWKhX0FYwGSJCAEiCAP/6GhgyAmZkALRkyEnKECDhiSb7u9vWWnylW5f1//vc7T1x7bW72+rA2fOFZ1jEXgMrde9LU9niga2gi2NRfLJq6SyABRQOtT6x4WKyAWDYG+4MFPNOUiKv35lWe/9M/3zn60muz/1nWDXbwVsfAgUd+S/Fbp35vdJu6dFRL05ZFt4C+QtEjiOWOhaX3WUAfw7Wy76JSEHACJIMhRxXLGovy/MKifOVX5Zr3wOEnXP/S0tdnszKHHD7MKYgNEfbHMaVvuuKor2+1acsVw4ZEt69Vi+jLFzWJT+4cEovFCohlXXw4YAOjJBAIReXL7xTvOuDK947FzFy9uzutiFJraXX4rTYuOOugSV/54ojLRraE9hfQ6C3nNRkhpCD1cUkFwy97JBYw/t7fAEDAgQyFQtKtCyzqr8yt9OpHFy4uP3z0yTf+qaFkjRYqHV1dehCNDdf8XdJpQamMPmXyASP22G1sV1siMDkSlCgXip4GSRK21brFCohlY0OTDgWUrLrAO+9Vjkseec1tRMDDybVzWXWn06ozk/EymYx4cNrUc0YMjV04pBnhar6iPUgiQVKIj8fOaPSfNRAQTBoMOMrIcCgi2RD6StWFvQX9hznzyo/m/vDcU7/5zV+WNPb8f1zqoiIDwEMm86G/T3qgkeTtNx578IQRzdcMaXWGFUt5UyhJCAFFS/t1WXeVxQqIZSPBMLxElFRvkXtnvNN/0HGnTPtf5qwEpQzlBuey8kMIXUSU8a6++oRtJo4O3jqmLbJLtVpFIe9qooAkGIA/vrbihskQjFHkqUg4LKUEFverQn9B/6l3UfXR1+box86//MaFy64hK3O5HBo1GOvzu/hJBBl90xUnff3zmzU9oEQN+XzNAzlKCCwnGlY8LFZALBs8A44dw15zU1At7DMzn/zziwdfeu1v/rO2Livfp08aAP/irjNOGN7uXJ4Ic7xQLHgMISUCEjwQH/8I7Q2AwWwYICMIFAo5IuAosaS/hrl95m/lopud3YtfnnDGNe8tHYWBuEYymTNrmZK8ViSTSQA5DB9GU2NBw315zyMpHQzkfX0iLVgsFisglnWTDwlw3UskmtRb7xX+2f23RftdfdtvFnSn/XqEwb5Po35h8uQDRhyw+1Y3j25zDqhUy8gXjQYpNbCsf6THGflZVMYQgQNKyXBYyXKNsHhJ/fWy52Xfezf/6Ann3f7PZZZGWvR0QXR0ZfRHKRoryBul9Lhx40KxELauuZpYkKTlUqYtFisglo0GQXAT8Vj4nfmlR9Jn//kHz899vpzNJmVnatDisbRX0zU/OXKPz49vv3NEK8b0F4qeAZbLrsKAhHwEwjGQeitIyEhUCBYKi5d4S+Ytrvz23d7+h44/5c0ngaerA6+lnp4u2dHRpQfiGgaZj224/eMZtY7Ua14bM4HBRLCFgRYrIJaNCAOAjTHhqBP+16sLfnnwlNtTRNBrc8zscllW3v3TTjl1s1GBK0OKZF9/3YNc/ozxj8jiYPatjYCS4aCj+opVzF1knimX+Z4nn3/1Vzff/Pic5S2kFYLh66gaDQFauHAmr00BZcNCIgCbtLSwUqRtx1yLFRDLRkkAxjQ3xcQz/11028FTbj+RmU1XV5fIDPKY2UYwOJPJiMfvP/PmccODx9XLVS7XjCEFRes10NEoKjRgVgyGIVEX8XBYEEn0lrzZC3rdR9+dveSBY8+685lli/3SYPiHqtdgBuVyWQHksNyBVuvwRv6ljN1mG0jpELO1OyxWQCwbIRqxljdnebemjrrmeGYWACGTwVqIR04fd/DBLXvvM/SRzUZHdyvme7XHUggSYv37qQyYmQUrrZRR0Ygj+ythzOnXzyzprd3z93/Myl17R653qYXQ1SU/bFzDP+gpJ5LIoVHsBwBXXZVu26S1ctDiJYVRU06/9VwigG3ClMUKiOWzQEeH7556a1blsslnXfRCOp0WADENMrqdTqdVKpXxTjnmfyZ9a68xPxsxRGyd7y+6jJAjaP3HoZnZEGBCAUeFgkE1L18uz5tb/tW8BXTbD0+9vqfxuu7utOpYoV5j3S2NJIDlD3o684SDRu643Yg9mpqc70aDtZ1Hj4i0Pzej7yUA5xrDRGT7i1isgFg+AzSE4vIb7n2BAaJMxgy2Nq6RaTXt6rO32WKs+d9hzWpYf3/Vg+SBNNQP65AZCCYzg+EZSZJDoaAkRWJxX23OkpK59e//NT87L3PD6ytbG+vmolpRNFJLLY2pU6e277F90x6xqD5ASHePtniwhYRBqVJHqUCe0LJv3a+zH4R2//P9jmMWixUQy8ZDoxp6sK9viMd908774qYj9e+bgtyWL1U1JNT68uQbMiCGJhBFIjEB0lic916ct6B8x2//Ovu+++57dPGAcIhcLrX05MK1tTZ80UiKZDL5PtE4sn2nbdr2aI/SAaEg755I8JCAIJSrCsVKVfuuKmImUgy9Dq1G/CDINtuMRSAgYdjKh8UKiGUjJLMO4nHL1cd+ecsx9GhIoK1cgoaEBGmAFT5s5TQDWhmiWDggq0ZgUX/12bdn995+zMnP3g/MrDe+x3KZVGv7/pTLLi8aOQ3kcGRy7/bddtt8j/amyAGxEHZPNDtDpGNQL7uol6u6QgCYBJHf2JAHcX75mkgkEiC4dhJarIBYPt00Cgp/9bMfbd0aLv7OETpRrHqalJHMEsRyncSDQQAMwGwkFIcjSrrGYEFeP91fUVd+59CrfrP8d1hHNxVllxeNlC8ayb33bj/oexO/Eo3JA4JkvtXSHBqiHEat6qFaLWtdFQOiAQkICLBtLGKxWAGxrA3ZbFZ2plLevT89d+sh8dKTUeklSjWtSUD654Ws27JKYLAGC5ImHBHSQKC3KJ5+b2H++kMn3/wI0MiCSolUKmc6M5m1cVOtIBqpAdE4/fTTo1+eGPxaCOUfBCJyr7ZWZ0hISVRrHqq1ijZVAP7JuVIAA+duDNTPWy+TxWIFxLI24pGUqVRKn35sautxrfy/ceUOK5WhSQr5YQrgmImJpY6GtCInJOctdme8PWfeTyafete9ywvH8llQ6yoae+65Z/TwAyZ+rT0R/k4wjL1jETE24kRQq3mo16q6v0oAxFL3lMVisQJi+ZCk02mRTHaZWy4/vmXzzZxHW+NieKEEj6RRxASmtWk13uiCxSCGVgoyFA6qhYsqc3tL1YuTR/7mTmBmfR2EY9Wise2e0YOO2fJrw1uD344E6ZuxmDM2HFSo1auo18umrxZgBgsBJf1QSsPSsFgsVkAsHwr/iNVJRJSiX98/4jej2+Kb9eWrHgl/3vBaljwQA8xkBDHi8YBcnOfKm7MW3PrYr2Zf/tCvf72IADy8rIvvoC0OANwQjYkTk4Gukzf5igqZ78fD9M2WeGBsKKhQr1dRq1dNvk4GRILgCKLlGzpa4bBYrIBY1hs9PWnZ2ZnyfnnXmfdsNjr0lf4lFY8kK6xlwz8CgZlhqO6FwhHFWuH198q/+ufMeedfesWD/wX8FuqUSpm17Snlmw1Jef1lLV8fMzT43ZZEdPdoBFvEwkFU63XU6hVTr0vjd3MXguj9PdKtcFgsVkAs65VGuu5Dt5165oRxocP6+4seSyhgsJlWtPR1rNkIZSgST6h5C6uvz1mSP+Pwybc81vicjs6MptTatRpJp9Mik8nwY/detllzrPRoKKgnxcISbr2Gcl1zod/TRkAwCSHICLZCYbFYAbF89GSzWdnZmfLuuX7qbpuODl5RrZQ9DSnF0oOOBmMWMAAGMXuxWFAVytq8Oad8xTVXPHnF0//5Tx9zWnR1Aeva2HDSpJkEwFCot701EZhULld1f0EwCIJYCJZGLbV+NmjxSAC02E46ixUQy8aPHzRPmjNPOGrk6NGhn4Ulo1QzQghBa+XuMcYIyRSLxdWcBaV/v/xG+aSTzr/tz75AJSVRZv00y5Lslauu8VgIQQP5UwRYi8Ni+eixZ2Zaloe6uiYREWGXHeP3Dm8JDi/Vy4aEWKt5wmy8WDgsNAfppXf6L//GQb/4yknn3/bn7u60AkDrEOdY/RfWhohIWLmwWKwFYvkE6e5OS6KU98BtU0/bbFz06/n+ikdSqcFm6WoGO4BpijepBX2VmTNmLDz5+AvvepIIePjhpPww53BYLBZrgVg2ULLZpNy9M+Nd/ePJ24wdGb68XtaaiSV4cFPEMJuwEBSIKvnK7NJ9N93y1s7HX3jXk93dacW8fq0Oi8ViLRDLhgMBSTByctK46O3NERHIl1y9NKawJvEwrKMRRxYqVJv7Dp2QOvqKOxqiZK0Oi8UKiOVTTHc6LTtTKe/RO848deyw0Jfy+YF6j9U0fiIQDHkASwhDXmtTUM3v915+4ZVFh590zh3/YM5KIGX80/ssFosVEMunknQ6LTq6uvQV+r0t21qdS8u1ijZkJBkJrNQpneAXiAuQViyJdDwRUu8uKP76Zz9/6ai7cr9b2N2dVkSpQVkd2WxSJpMTmShj7J2wWKyAWDYyuiZNIiIyj9550m3NCY7kC54mUrTqeg8GiKA1OCg9dsJh9eqs0rXfPvTaMwCYwbqs0mm/BqSRyuu/q+2SbrFYAbFsNGT99iE6e8dJB4wbE+soFlxNcFbTYdcAEDBamJAjhGZFM9+oT/3+lGtuYmbq6uoSqdQaazuouzstOzszXiYD3Hb5UV8LJ8LHnvjM7Km479HFzCAiKyQWixUQywYNMxPQxZMn75FIRAM3samzAa8mbE5gKJAxOh4SsuTK4j//vXDySRf+9CHfZUUaa+jr7reEz+nOzox3wZmHbLn91s0XjGpv+kGpUtMvxdwT7B2xWDY+bBrvZ5VcThBlzFe/sMWFI4cHRtYq0ERmNfPBAMbV0UhALiq4fS+/WdzzpAt/+tC0aZOdAZfVaq2GdDotmFmkUjm9xx57JLL3nnzxnruMfm6rUa0/EOyyknLJrrvu2pA1e18sFisglg2ZdDotkEyaay+fssnY4ZETquWyAfwjW5ezUZZaH2TIS8QCMl+TM//43PyvHXnyjc92d6fVlCnTP/Aw7+50WmUyGUNE5pf3nP7d8074wj+2Ht10YVTpWG+x6IFBQkBGRw63ymGxWAGxbAxM8gPnPG5Y6Mq2RCjkuoIhVpWzKwHDXlMspBblxcx/vLZgj0uvePC/jU69a7A6qDOT8S5LHzrhiQdO+dWmw6O/aIliQj5f8uqamQSUAaNWc5seuOunowCgq6vLdiSxWKyAWDZUstmkPDCV0j+95pQdRg4Nf7dYqhgQyZVfqQBT8+JNjprVV5/555m9e5x22vS56fRuHygey1kduOeWY87c5fNDnx83vGm/Wq2oK2U2TFIRgcACYGJBJAOSYgAwc+ZMKyAWy0aEDaJ/xkgmJ3IKQEuifk0sHBH5IvTKgXMCtPbiTQE1dwlm/uP/+ve44LLpcwcC4asUD2YQcllBqZR38VkHTdr+8yNuGjMs0eFWS+gvFjRBSiICyPP3LeS3fCch0NzcZl1YFosVEMuGbn0QZfS1mSP2GjOy6aulUl0TCbn04CcMnJ9hXN0Si6t5/e7M7j+/t8dl1z3QEA+9+vfNaSClfzZt6jEj2sPXtTaraKmQ9wxIkiAJZrz/zHFmQErCkCGOL24AcvY2WSwbDdaF9RmzPgBg07FtF4SCAhrLJ1AxiBhsSDdFQ3JBpT7z1bdraxSP7u60SqVyet+Dd235zUOn3/e5zZpujwW9aCFf00w04K6iFa2b5ZCSMGRYK5YqiMVisRaIZUOzPrKSKKWvuvSYvUYPdXYtF8sGUHL5bCv2YGIRyIUFmjO3t3XPKaedvUbx6OzMeNdeO/krXxjbfFf7ELFlvr+mYYQQ0sgPOtSJADAzhJBobm6xsQ+LxQqIZcO1PmYwAGw+On5mKAQUioKJCAQDJgOjlYmGJIo109fz7Cv/k/nJI3PS6bRKpVYOmA8UIRJRxrvzhpOO33xc4LqWMJx8n+ex9BQJAvNgzk5nCCIMH9JkO/ZaLFZALBum9ZGUgjL6p7dM/cKwoaGvlcr1gcwrA4YAPMmhgEaxqsTL73rfzfzkkWdXl6rrxztIA+DH7jnt+nGjgifpSp3zZW2EIEUsl4rDmiBBRhDkM8/8dxyA52fMWPAZtET6/WCQPYLXYgXEsoHaH2Dk0BzABfEInEI/eyASvoAQBxQbUiH56mv5I4455ebu1YlHOr2bSqVy3uTJkxPf26P5/jHD1H6FvprWxhFSeoJh1mohJAYLARSK7jB7jyyWjQ8bRP+Uk06nRSqV0leef8ym7a3BfctFj5kgG7efWOpQNCZfeLXvkqNOufkeXo14+PUdT3vnnrjfVt/fu/npMW1qv77emucRS1a1gRaIazedGIAgoL0l7gFABzrsDbNYrIBYNhQ6Ovx7vOnYyJS2llDQ01pTw0ww7CUSAfXarL57jph660XPTZvs0KrEozutOjMZ7+off3+nvb6+5VNtTXK7JfmKBwlFIBALMDXSdNcGAhEhGlPWf2OxWAGxbGBQR0dGJ5N7JBItfHi1VgeIBUAwzDoeD6q35hT+cebFv53CnJXbT56+kng0GiZekT5wv+23GPF0SzgwMl+saRLiw7s/B/q3B4ORAbWzN8xisQJi2SDo7k5LIvA3dxn9nWGt8eH1uqcBIdjARIJSzF9SX/jUc/O/98Ybr9e6umbw+8/ieG7aZGfKlOnuPbectt8u24/9ZSIcCBWqFSPEqlqfrIN++DYI4pGIvVkWy0aIDaJ/iuno8M/oaGtrPYLIz/UBgwMOuFYnmvFa6aBrrnn4Pb/WY8XDoKZNm+zsMGW6m7vnnP1Gt+OXDrQquzUjhVyPmw4CBCEcC9tWJhaLtUAsGwrpdFoQZcwtVxy1ZWvc2aVcrgEgKcA6GArKN+fWTz/p3Nv+2Kgkf794TJky3c3dc4EvHuyqmqtZkFjP84UBGLz22jub2jtmsVgBsWw41ocAgBHDo99vizuOMazZsG5qiqo3Z9V+cfCU665dVbpu45yP3B1n7je63fulY4yqecyC6KOZK8TwjG6zd8xisQJi2WAEJKMnTkwGAooOqboADBALKzlrXn3W754t/5A5LXp6VjyGtiEoN15x6H4jh8lfKniqrj0W9NHNEzICLQlpXVgWixUQy4aAXy0OPu2HI7dvS8Q2K3sF7TgSlRrxf99cctitt966JJebSZlMZqmANM75+NGF3+3cdsKwX4aEUXXXMBGJj7RKmoFQKGRvmsWyEWKD6J9C2tsnEgAMHYr/SYQl9RWkG04EQv96qf/i08+fvlKleeOcjxuuOnyrL2457KGYI51StWqEEB/5BoMEwXEce9MsFmuBWDYEOjq69Pbbb+8Eldi/UK8hEnVC786r/eUHx990yYB46GWWR1oceGBOn376D4ZOGJl4Mh6Sw8q1mhaSPp65wQylyBYSWizWArF80jSaHV714x/uGAsHNhdcNr2laPWVd+tHEcEbCK7zwNpNRBkDQO650/DcyFY5qliuVYmgYOCtfWX5WuMxMyIhp7bO+mMEg9k/2IT5YxYi0mBmgPSHfCP9yV0DvIHDvox9eixWQD7jNNxXYxNi/1hUgLxm8ebs3vNOOfvm17rTaUW01HVFQJoOOeTv8UO/vc2DW4+Pf623t4pEk/OxBSS0Z1SiKYw35izYwrecJq21YgnJTlNTRHmeB/qYO9pqzSoRD4GxuHVd38NxggR4Q+LxMNU9g4/bFnM9o5riETBE1D49Fisgn3E6Oro0kKGmptBusXCQZryW7z7qhJtvWIXriogy5rCD9hpTLNTf+9fLfVe6rlAS+mP7rkxsFiyBePu9wtv+3yQHvQueMcM/XXFxrzdLV0vXGvYYmujj9MkykYlEtFiU53fW2nYhYgBIJFBkBA/sy5tAnQ2T+XgtECJpoFiwCL683PyxD5LF8lkjnU4LALjk/OPHPfPY2aW/PH5G9eILjtqSiJb+m8VisVgLxLIK6wMik4EZN6K+67Bh8cjfX5x9+kWX3vnK6s73aGxCu7vT8pP83gsXzuTVHZu7RiuAQT09G+/3B/xW+Z90I8meHpjl07otFstnDOasBIDfPnBS7g8Pn/o2AJXNZiXscXcWi8VaIJYPQoiUvn7q3sE6y10WzCodBcADcoM5nNxisVgsn1UaMY4rM8ftePM1x10C+Cm9dmQsFovFMigmT54cAQD++OsJLBaLxbKxY+u6LRaLxWKxWCwWi8VisVgsFovFYrFYLBaLxWKxWCwWi8VisVgsFovFYrFYLBaLxWKxWCwWi8VisVgsFovFYrFYLBaLxWKxWCwWi8VisVgsFovFYrFYLBaLxWKxWCwWi8VisVgsFovFYrFYLOuRtTo9m5kpl0uJ9vaJK/zewoUzOZnMGSKwHVLLRzVX0+k0AT2io6NjhX/o6ekB0GEymYyxw2TZEGAG5XJJ0T5jImH56doDdACGMhkGNv71clACwum0wKRJRKmU/sDXZbOya8YMXtWDzAzq6UnLD/r9jo6MHqwIpdNp0dEBsbp/X7hwJqdSOb02g9GdTqvGze7ogAEmUU/PDOrszHhrO7DpdFq9b51bPT3AwkkzecaMiby6RZDTadHzAde7tnR0dGki4rV9KN53lUS0dos2c1oAGX7/LKTVPEyN+zyYe0BE+ONFF6mOrsHPo5WvCVjbjRAz02q+Dw/u83mlR/H934GBVX8rGliGutJEgxRQ//t2ESjDq7vS1YwB8YdY8ogal7LWz9IHPutrnuswy8/TD3O/1nSJ2WxWJJEDDWLt6e5Oq54efODGZ4X5Sf5fdHV10WA2S9lsViaTSdMYeHCaurqANf3u0vGhFZ/KVc0JGsyXSA0IxxmHHz58q20CO40cGRr37pz+bUhqHjYsMWPuXP36C8+LZ2598NYl/u8k5dou3pZlN2+wE+Rj22UQgVezchABvB72Uel0Wix/zY1FbtmDv5u65uIttoxEylu3D29paxvSDMBgyZIK5s7uX7ik6P7feZn7X182bz+Tc5A+DbvajZFsNikPPDCnG89COn18bNxQd9tatbbNpuOGO+FoiPN9JZo7e36RhXphygOB/+L56e7ym6qNxIOzwhyjwawb9918zo5tbeK0cKC+V3PIaQk4ChAMggYzoVwDirXqAvbEz//w9wXTLr/q3hcaD3BjYbjm8iPHjx+RuJDYY6Y6YWBDYVhwpeJRIBh688UX3rmx67pH+wFa7S4wnU6Liy/OmOuuO2OzicPCpxpZifQu6Uet5pIxBuFIyLQ0R8V7cytv/vCk2y5hZhrEzoIA8LSrfnDWqOFNE+PxuFm0uG9sJOaU8+XInw484oqr0+kuygzS7Nx8872DJxw+8rDhQ2PBQCDMRB5Jx0AJB1jOBjMaqNVczJ3f640ZN3zmv/49e07mx/4i+P7x++nNZ3ZuvdnQSYVK3jAvvxt7/xr5gUYeBBt2VJz6SqHctw8+Zf4HjU/jO0y/8YS9thnfdrXxKlVGUAgYHQyH5Kx5lTu/fdhlNzGnxZoskYHr4OxdJ1w9flRrR61a1wYkIcgEOSyffSF/4knnX/XXdDotJk2aSY3F/9Lzjtphu89FD46FQnsLoq2aYoqUQxACAAxgJFwX6C9W3brR/1f25AOPP/XOA3fckesd+F4r3bPGpuimK48+dZftxxxaKpQ9BhQ4wBSUVPICh+31rfNf/KDratyXH19w6OdGjQzeR2CCFgTh6lAgLGfNXXzBKRdln1iVkDXG/L770k1twcLjUnCT0YaJlYlEpXzjrf4Xjzhp2mH+wgIQZcwv7z7j3k1Gx7aulFzN5MqBJ5TBikMqyG/NqZ2fPOZHf1jTd+7q6uIzzth/k2986XN3tERDiZpXBWhgx8kEEuxFwxH11rt9l373qOt/mc1mJQCkUil9w5VHn77rF8cfUi72+eO1pu1nw7BiqSPRmJzx+uwXDzv21sMG+UyicS13Xnfs4V/adnhHf7FsgLWyREw8GhELF5V7dj/wJ/cAwPU/OmRiW3PkfoZhsCYB4YWiSi3Jy18cffKtP1qXjcdyvxO489rTDhg9Sh4YCfKOASlHh4MOhGBAAGwIWjNKZRd1Cr5SrVWe+L+X5j50XvqBfy4/pxrX/ev7z7999LDgF+f19hsBI2KxMBujqjNe7z998inX/yOVSopcbuXvOjC+uH/aSadtOqLpILAgpQi95frCV94snXTyWTe83tWVXmmT2vj8W645bvyEcYk7Y2EVLxRLYCO5rTUu3plfff2AQy//PjObxv1TH2RWE5H61YPnXNYexRmJGFGxplHRrq7UFa8wQYhFLKiGxpqCx++zy7Cjt93y1DNSqWtvaiwGANDWGhs+YVzzEWQ8MMwKc88zQDwehevp8UR0JHNWAqt2l3UByDDTZm2nPzRhE9qxUFQYM6R9YF4ZaGPQFA+jVvFeBnDJIG++ufWGE7fbYcvWK2IBhtEa7dF2MBsER8a/9ZsHz2re9+ArL1jeGlvduBGB29r6olts8rnpW4xrQq2mIYSz1E/z/geM4WDzUWG4mtG841B3p/tO+ss7vc6ZqdTVz2ezSdneDspkYOKqdvSYtsohi/pqUCK8vCSspYVjoII1eBL/B2B+LpcSq1AhAEAymTMA8H8z5vxr82GhTUe0OZFq3YVkgpIFNMX4hksuOf5XRJl3329BrDzGGX3t5ZO/tsWYllOlrkMFCMxAJGwwa37f/Jdnv/cfIsB3V+W8ow7af+R39ht/SUtMHtHaFBU1rwa35qJW93St5m9siAY2Q8QUCpHT6kS+RApfOvSbY8/56ucnZ4gy04kIxjAtvyFpb59BvtRWNk2E6AtcBaQQYNShgg644sQAIJebudolcum8HhJu/vyWQ7cnGBgmaNZoaYojGHTG+581cbXvsVk7lKjLLzdFnaDraRgGEvEw5s/rW+m5VFT+fCIY3gauCynE0r2fNjXEIx5iYe/+Q/beaXOgqwBkVmmJdHRAEJH3wO0nnDthbKSzd0kRTSEFLNUPgjYemkISyujhy48VACiubd4Sdr+AqoBUYs1bqYFvodlDIlyDNDW1NnO1p8d/qCV5eyTizg+0lpBysPOdoTWjpSmAhYsLCsA9ADBmWHNiy81av2CMBkPDaIGWlgjenF15YU336wNETt989eTOzUeErx3aFt0uSAa1uouq53Gp7Gn/2/i+KCYQSRYJh7YcFg9vGd5u+CmP3XXGHXc99vo5mUxmcTablD09IACmWim+1xSlY9gTkNKB57loaQsgXwqfS4Tv+M/Ays8aEekrL5n8tc+Nj18VZhc1ZsAjbDk6BK9a+SkROpiBTGbl+ZHJwLQlgsduNiqyW29vAcOag9Ca0Ryv4+U3+/4DQPf0dCkA3uoEhHzfdop+dtfkJ7YYHdwz35c3fQWhDUlJIAGCAcyAU8yQgBJunXmRW9bhgAlss0n8xkdvn9r6wB9m/uhbI1sEAB2A5xYKBc+Amdm/7IZL1ABcdWs0bEjwe+eedNA5RKlV7oyz2aSkVEbfkHnnq0MTw3acv6BU1wyx3FYHAGlmSAFeMpgJMDBheGTcOTLoeGZxvlInkDIEIgMOuTVEQuK0S8877NZUKjX7gxbKBkNUiR2pFxZLpZZaXfNSFz8NTCQWS58vYgmQgCZXRAPSaW+OdbYNoT/fc93Rx6RSdzz4xBNTgwA8RTqf76t5pbL2wAW1olWBxgZyRd8kM5gaU3fpP7JTc0kaxx2Ez5q7u9OqszOzYM+vnHLncESOK9dLmsAKNeG1NUediSNwCIDLOjogMxmYVQtREkAOmwwNHR4QxvSXXZfBjgC5gUDEWdhf++ktt+SKTzwxNdjZmalddeHhX9/p80Pvah8SHNNfKHA+X/SYhDAkSTJLXz4YzAxDgIAgo4nzuswCZJqizsgvTmyf9sTPTt9hn4OuPhlI15gzK1m1UshKqVYzFc/1AChiwY6RJKAHvQMVVPIKxaoeEGcCsSeglGBZW9Pvai/EzKVisVJ3PG2YQUbKqmRwaRWfVCpWXVN2XS0AySD4T4dApV7XI9tD7d/4xnbfJqL7utNp1ZlZMWbEDBKU8a5PH9I0vCX+rd4lZV2rg6tUF8QDWkAAyHiFWk15MCvND8miWq64pqLrHjSpxmMn/CtfasisvJQb7VQCkkyotE5uXehif77ilcp1j0ADu1ezwrO0avPHeJJIAbqw9G+F9PoLNQP2mJkJJDwllPI8t7q2rhzOZgVRSj9wy/EXbjoufnE0SCiXC7rCEgwIQUwaUGAwDTyLxALCKKoaz1TqdRMULCdsGjtm6sETdjt431P3SaWufX3atMkOAPx3VvHB9rbgeSHFSruuf0VLighJ76uTv79fG1FuUWPT+r71DFuNC30v4rDu6zOeFp4jIdldWOSWeGDX66+c8jmizMz3r2UdHV0ayCAeNjsXChVddY2puloKIr1wCWShhHsb8eXVbl+z2awgyphH7t7k7O02G7FnX2+x7sIjEqyEEVCCKBJ2ZDwalbFoWIYCQQFobUQdUpCq1aXx3DyPHBXPfGWb9q22nzzdAwAhDBFJBUARoIigQFAgUoLI8VyD9tZIbOJWww7zdx9dctULETB8VGJyOOrAGAgaeA+8708Gy8FMgt07M14yuUciGBYHujVXMEQQREqAJAlSNZfRmgiEx4yKf6uh0oOb9FCAUAApQCkgoIiFlCxAA/8DCEwuNHsCEMJlw/2FqqeoFp4wfvhd99569nbf/OYNdf+bekSKoVhCkYAigiQBSQJGQhhpFC8dA1JMpFiQkOS/XhIN/AiQkHCUM6inpDFZ5iwu35MveEKCHYAEiJX2qhQOuUdsvvnmQX/yrc4qS+mjj062xqKB71RqdQGmgGAhhEBgUb7Mr86c9xAz0z773Fi78UdH7PmlHYf9Jh5XY5b0lTxjHCJBCjAk2RgF0o4SFAoEKBQIkKMkEUGD2AiSAkSqUnO5VKp444c3/fBn0yb/mijDuVxWvN9lK5lJQAjBJASEIIYgMoJ0bdC7UK0NwR9aIUgIAQhBJGh1q+nKuzVBRALAwO+yAK+8zWYjBRGEAAmC8P/0P0f4H03c2h47BgA6ulYW8p6etGQAw4YP/U5bszO85tYgQEpACCISgvwxWDoWRLSyWBoigiD2v4egxneRQkKs9kexI4RgAVFZx0A4CRAUwIpJK5BRxI5yhFRSidX8SCWlUtJxpIBUy98vIYQAQQiSQoKFJAi5iutdQ2xYUCql77zuuFu2mzj0Ygd1XSzWDSAlEaS/VYQniUzQURQJBSnkhEgQkRGux2AiSGUgqLe/7A5tVVuMHhl96tbrztxiypTpbnd3WmUyd7xRKnv/DoUDksAQgPQ8RnM80vqlL437KgB0da2YmNTRkdHbbz/ZiYbDe1ZrWjJpR0IIgKVmg0RTSIxpje7//rWssWFPp48dGg4GtqnVPUmAEgQEHOkUS5hTnBV6FgBSA56JlQQknU6LVCqlpx5zwOh4xL2gUiwZAzhEDrEBwkGmUl2bJXnv+Rdfnv3XN99b/Ndi2bwTDodlVEXIaNeNhCGLOuK9+Mb8H556YftL06dPVoNbcEmw5yEexeRVLUiNheiccw4d0tbk7FeruDDwb9S60p32H6r9d5uw17DW8PCqq7WgFRcZBkgQczyE7w2o9NplHQEgMgDqEA5RJNakItGQCkeCKhoNq2g8oSLRgPCjxoJIkKrVjNcU9QJDm8wNRF0EAJ6miAw4ipQJqYBUKiCVExBKOUoFhBLCSIjlvzobBKQjlOMoFSDlBKRyAlIpRzgBx1GFkh6UgqRSOc3MNPW06f9a0Fd+IRIOEoE0EYlK1TNtLYEtTj5y168REWezSbmqhQsA9t950z3a24Ktrqs1EYgJOhIOoVjBUxdd97MZQghOpw/fZOKEtp83BShYrtQ0CamIGMaQUUTUFFcSQSFLNV1a2F9atLCvvKhc06WAE5SJcECCNbO/9SNDWvX15d3PbzVm99wdJ16fSqV0Nptdb1lsDYYPHwMp5WqTDD6msKaslGtoTzg733j1EdsQZUzyfffCzyqECEf0CQSXAQlDHzaTlKEMw9VENU9T3Wiqa7PST8X1VN1jqnuQH/5ipW91kIfeqoclxTr6VvVTqqG3WBNLCjUq1rS3Poe74cq+75apx+ywbdtxpeIS13WFkMKPzDGzjgQkJaIRxSRFf6XW+9bsvkV9BXeRxwLReJOSigkGhiAhiJxCseIlQt7YTYa7T0w9ZGrTQAYn91f0L6Ro6BHAzBwKCG5vld/0BWTS0huYTSYlEfgH/1P+YjCELWs1jwc2Jw0XJUFrNMUDeyw3J/zQQFeHBIAth8tdErFwk2v85xQMEwo4KNb0n0+/9toKc1Yunw+4wuLeAYgMYHbYpq2zvSUWLpdrHgmjYKQJBTUtKsn5r74t9jn+jCv+1fido/Y/Kr7z19URm49rOWvkkObRcxZV+998r/zdo06644/vLEqLSZOWmMFE2oiEqFSrZlR7fPNzjt1/VyJ6avmAlr8QZbwdJwz73tAhgeZiseqREIoBMAuAzMB1DX4jsXCSv7sePjT+/YBgrjEaCWzM0EzsCIIWlXIdQxLhnS85/ahxRPTOYNxY7xM/EwwERW/JfauvQpeUSzX05/OUSDTDq1TGhKJyvxFtoR3qFY8hQCRI5Ut109oU/NpPr130pWNOxTMz35hz41tzenvK1YqhAZEjIaRbZbP1hOG7fW6L9sPLpbIhEoLZmHAkIl5+c+E9L74872knpAQb1xdkLaBUkMoUfW35OMcH+6K7JACvWKvfIUXiBub6QIYFTDwUoC3Gth8I4H8brqpVLFwIBs1RigyIJZgYgg2MARXK3nQ/O5Gx4xZt1w9rd5oKS6qekI4CuYCWJhImUapK/cZ7+mfvLSz9fEEh/9xf//pMAWjBHrt8IT6kubjLqGHxI4e1RvZyvSobzZAcJC1rTn9/vzd+ZHzq3TdPfiSVSnWvSuQ+DE64EYtZbylvcN01rXcDsWSGb8kSoJl1S1NAjWyNTwYwNZtMggbuhb+wZMw16cnbtzcHd6yUPYCFBBkQE5jWLXmLGQxH0XtzC4e9+155hhOpCtc1K80nKQUHRRO9NX9JcSA7Z51Vy/c6GXY9oj/++a1D3npvwQtKkfJTUt5vMXlsFKlgMDh7MIkeg80WTCaT5pr0keM3GRm6zq1VtOcpJUkQQ4OMMLF4WM7vdef2F/L3z5pb/O3cQvDfP/7xbWby5MnYfmJoQntT7dDm5sDk9qgMFiqeIQlBglR/wXXHD49u3vGN4sVEmVMAYN7iRY+PbXN+5EhSniGAtKjXXYqFRefkyds7QqSWuhrbj59IyAGbjhi6RyImqZB3PRCp5ZZaUa26CCjvK5dccuAYosx7jbWsq+sEzmSeRjSMbwYcoFJjP/IPIm0Ixf7SEwDQ0zVjhcm+onXQASADBEPy844k9mOrBJDH0gmJ9+b2ZY4/49Z/cXdaoaPLAF0gyhTufBw3nnnC/r/Y46vbpWe8vuT20y6Y/tyA79xb0wPLTOwviAzD0sRCRgwfpn4I4Clg2YI04J8ToUD9OG0cX03BYDBLqckYWivx8K2tjL7igpO2CDp632LFA5gUk4EDSXAUeXUPICLPaK+9NRbe6nNNDX+/WJ2/fzU7RA44BNfTc795UNddq3jFxb954PSHxw4LJwvlsiYISYZMNCFFa2toPwDPZK58/DkAz63q7Z/Mneo6QhxOIANAEMgEhBTtrUOf/NG10+9fU5xjTV+/4Rt9ZXbk4VFDSpdEwiLhuswMyEq1RsEwDjjhhEPPJkotXj52lU77D+1l5xwzIRyh3YuVGjNIgtmEAkouWlyb88d/zHySAdx41dF7DmsL7l8s1DSkUIABaTbhiBRLCvL1t2ZVDj3y5GufXenan3y+H8DDAB5+ePpJx44ZEbg1KJWu65oQ7JBmQ2EHPHpoaxfAPclkFw8EKdcPngsgABCvGIT6EOaE1oaXpYx0rSrystT/xWx4wMaV5Wod8bA8+PCTv30hUaqv4R8fWFh4i82bDk00hSifL3lEpPzSEo8BQUuNeVrbbwuMG9H67+8fc8t/Px5ji5euhkNa1ItX3PDMi4P5vW9+c8R62ThMmjSJiMhk7zjhstZEONrfX/SEIGIYCAgdiEG+Nad8e+4PC8+97777Fi//u9OnTweAfwL450/SR/904haRn48dFtmiVKobCN9Nly9WzZBE4MQbLzvhlqnn3fzqqWc/8OrvHzrz+RHt+HKpBA1AVmoexyKh8btuu+sXp/Pzf29stJetkerb7JmlO5uluU5EpI32mhOByOjmtn0B3NZYy4RI6YkTk4FQwOmsuy6IIRjMjiK5qL9amfFG79MA0IMVRXiV7qVQJJhg6OX9IVT3CI5DM5+bNtmZ/upcTOmkxhtRdzotOzOZOVfe/PiU5TITBmU2KumQ1hogDYYjy5USx8KBb59/+sHjUqnUO41MLiIy12cO221IS2i7SrVmAJKAgWBJ+VKNY2FFxAqGBhf/bAzcmFF8RGtzwCnkKx5BKUcBpaIpLlnkLd5klDO2UiGwMKLmVdAU5SOSEyde1dHR5QKZtd2tgQhOd3dadcRHUs+v5jAAVL7UK/fd98baq28tumxIYvgBkkgYZhgBggeEAtgRaBQd9azwnptssol6++23Pddw7P0VYQyGa7xYOr2barxu+X/PZJ7Wg912EhEzZyVRasHn7z75t22t8YPybkkTKVX3PK+tOdS645aR7wGY1rBWlh/jCVvFU0MTAWdJqegRCUVGGhUKicWzio9Mn/5kPwCMbQ8fFw4wF2p+zJ/YM+FAGEtKet6fZ/btceGFt7zz3HOTnTffXGKSyaxZttIxcrmUSLZPJOrM3HbvDUcHtv3c0OtRlsY32kmWynXTFFVfm3b9UV8juuvpJ56Y6jS+48YHAQMuHLADEkyG65BwqF43elh7qHX/bcfvfw9wb09PWjJnNFHGO/nkbzfHI+bAaqUGA5Ji4OZLJ0Ra1yAMwOuoq8VqPZpNJiUmQmImVvsAzpi4+kLZdaHu1iPpdFrMnTtXjhgxYrWf29WV4Vzuw39ew8V/yenJTYc2h75TLFUYYsAtx6yj0aB8fV7hlu8ceuMJjWd2uS4dYAa6utL0rZFz5Q5Tpr+w33677HHKYV95ui0eGFeuawPhCe0pPawpqIqja1MAnA6AC2X3sZEy+mXBZTYkARgdDTsqHCz9D4C/t7dPJH+zRuae69JjYpHqtpVaHcwkiQDhl2P4YkIMCUJLTOzvC0iXySZnylQupw8/OLB1LOKMr9U0M5Qg8nQoGJQLFlb+9aNrHn5vVVbcKgWkWKhUCLHlViNlwo4RwYBzxA5H3fInWm5wZsyYyJ2ZjOfnmE+irq4ZPBhTkZlZKUmLFxcXxmPBloCSiskl4ypvaEswtPVWLT8A8CM/0DMRAHirzYb+oCnioC/vGYBE0FHIl3jxvEWU/dwWznFuxTOD3UJ1dGT03ntvHhzSgpRXN2BIQWR0JByRC/OVP7z0Tv6O8WPG/EahpjW0rFaMGdoc22LvH+7+dSL6bTqdVpnMYCvU/XWajOTOzozHzNS5AzV8mvqii1rFll/c/M167cV8JEit2jUMImhjEI/Ilsb37excccHv7u7AkUfe4/0++wWz6gwhmEzmaa/xug/z8OT8J5AWLSreOXpY6CCCEANZUEQs0NoUPALA9OX9qh0dXXrixFwgGuLDXNcALAXBgIhkoVR3++vV6QAonT48EY8Fv1qramKw9N0yio0D+fbr3mkXXnjLO9lsOrDDDpn6cjlmy+ebaQDE3K2IOm/47f2nfXfMcGe3fNnTBEiwMbGQEomIcyiAp8Ph1vVngShnvZbvEQClPjhUY9jlaDhEb7/dP49JlDYd1zS+UqkzgSEMI6hwIoD7OjpgGq7fL2zZmmprig4rlUseEZSfJqTw5jtLnh89IvYFKSDWLYzDUFJwMps1QBcBq44Rrocq75VGSjlhTPDTqWnSpCW0mhieyWTA2eyH/8TGhmiriSO/NTQRDfaX+z3AUczGhINKzl5QmXVG12unMbPo6urC+7sn+PZAhjOAmTZtsjNlyvR39/jqlsd8eeu2/1UAPBYwoi4qdQdS8oH77bf9hb/+9fPl/778zh+Gtk74UUgqyf5UF56uIxw0+wI4t6Mjo199dbICYGLN+W82N0WDxYLnkfCD4JW6ISUBJRQ0XFmrGiTi4ksnnPCdIUS0+Llp0xzkcnrCuGG7NDcFRb5Q8UBCgZkFBcDGe8R3ZQ/USqxsC7//ZqsXtVkhwK1K5ZoZ3R46/MGfnpg54shke2dnxkulcjqTyRgiQkcHRFfXjEHvMAiko5EAXAo+Utb6n7FQAAw2hljUtYfmpsBhEydODHR0dOnOzow+9dTDRkWi/D+lSo0NhCSwF40EuVCp/balTfREggEAwgymmDOdTisi8Pf33b9jSHPT5pVa3YCMYGIYF1jYW3z8vMzdTyxaVJ7lhFkawAijjBNktLU5kwdMWR7sguCX1RAAQ93daYXnp6vu7rTq7k6r55+frjKZjPnv3/+8ecCRCU8bQ0RETGBh4NU2jOrUgWA6bntI9vT211+JBAOCYQyxkKVqmZuboztMu2rylkQZk06nRTablUSE44/Ydff2psgWpXrNEJEwJHU0ItHbX3n+hyfc+gIAHt2mPh8LB9pczzPkmzsmEpRywZLqy0ec9F6WOS1SqYZ4rH4l6+npATPT3NnFWz2zXDYEC1HXHppCTV8CoDo61p/1odbzODMbKKVomQvrffOJCUTEUgiIgJj3zvzCdY6UxMRsiGW14pqWVmeHGy6dsiNRxnR0TGIA1BZLHMP+ZRPDcDAg4bp4b+Zbcx4MKUf4eflmLZdwgpHAvHK9TkRMlPH8P1f+WW/jQwzBDAOJOUtKRX8NytVTqZxe1Q/WY2X+woX+M98SD3+N4YEhQH6PGRMMKFQ9eePrr/+u1tPTtcYY6ZQp013OZuUpZ9/51MJF9X9EIo4ASBMcUXdr3BQLj+jY6QufA4DMlY/8q1J1nwtEHCJAE0hUqh63xMMTrv/RlC2JwJMnj2AACJBJ+nV2hhiso+EQZi+q3V8s194NBRyAgapXNy3xWOvXd5y4EwDafvtGeoLZ1zADMORnLUnZXyqYN+cX/te//pn8gfO/p8efQW/PKz09dliTF3BIaGYm8kgbJSQYW2/SfNHwpsAJB+559qP5Yvl3//fm7P/78Y9/+WZDbddUbLe8LElJCClevHChe/eYofQVUREGBFWp1k1bS3DCmcfvujsR/Q4AvrhZ5PCW5mCikK95EkKRcKnqEb39Ht/2uS3FaH+KmkE5cRuLfyJmJocCBLcGwyAKBiDn9laXPPfS4ieYQT+/w71n+PDY+ZWaNp7UqlKucUs0uNcl5x+/1L22xr4yAAT7hfdasLuqnk7nnTJ5xFabhq8PBVmWy/DNXWhWKsD9Nf3C8kkEn6SI9PR0yeefn+5Wq+fcQyFcJmpkACk0e7o1QWrokNghAC7s6IDoWAgGwCPbYkeHwobdPAwIgtjACEH9eXNn433bEtEJ4aCDklvzXwMY5YREvVp/Asjpnp60wiBWN7+XWoYnT97rT2M3iZQScSfquoZBINczCIZo5NlnT44KkenHRo42DEFIPPLYSz/fbuLQC5rCGFZxiT0jTUuTo8aNCh8F4B9EKX3bjZN3aG0J71CsVJigpGD2QpGwXNDPv6zm3dcDQQe6Wjc8UN+/NhF/cg1ajHnwsXtOLAkYIr9FxdJlmwksVYQWlMJHHfHDzAtrm4CyKgEFEUi42HGbLb/810e+3GS4KgSpFd7TDRmmQICe+1Pvy6dnru2dMWPBh7Y6U6mU3nzzzYMG3nau59d6ECQEjOwru+x53pMAaFUL7Sqfp/YZxAx6/G7xG6HUl4jrjbHTsUhQDW2NbgPgeQBcA/3ckdipagSzYLAxuikRV8Pa6vsBmClExjv1sH1HhcPBnavVOowfC+WqS5g/P/DjWLDuOCEeK6uOZtIIOERKegcA+K3Y8Vh38vf3awsH8JVqvQL2U9pNKBwQ8xZWX7vn58/N9ONpK1e9ixX94hmTzSbl+Zl7Xi4U6g82J2ICPFBQRC40PJSLVZ2IqSFjhoujJ4yL5/baftzM3z50yr9/cffUK+694fRNU6mUHmjGtcYbZjRBqFDsqd9VHlqwqFZVCpL9yjcTURItidCxALDbbmnV3hw6TNcxcNM8E3DCcsHCyqyTzr/pr4JFE+vBbTQafsxTTz1sVHNUfbNaqYCJpAB0OBhFvlx69MYbcwuFAL/5dv6eJb1eXQlIwQaep/SQZie85abm0IZJOxgLBKTJcw0cIUf+/hcXHv/0Y+edOO3K79/00LQpd/763pN/v/susRljR4Z3LZer7D+BgCRCrQoqVMw9q1P/j19A/EV8xsuzcouX1OtCSAk2YHaErmuEAt6hu+02LtTR0aUpldLnnXLAiNYm5xvVsiYGJDPYcRy5cHG576nnZj7eaNq2ZEl+ghBmqQ+eCPCMRl+x8tJaJjAxM2j69N/PEyrwakBJEMEADDaAEl4o5vY38QbScahUrq77osYMZoSe/uc/5/X11nKRYBjSSM3kyXLVQzSqkudOTbYDQGtEntQSCRCz1H5ZqRKliktvzV5wVzwSEswaYOnHVtbS36YNY8RQudX4kdHtx41s+uKYUfHtx46Ibz9m5MDP8NgOm44Ob98795WtBmbRh0ulJg3DoAAIW41xbg+HKn+Nhc2fI6H6X5f/iaH+t2bh/dWRpQ5/09jxoT63MVczp50WCQbQ5moDv5eMy0pKcuuqf04p9A4A9mN0g5+zRtIcj72lqssMOBJobg60NF63YIn3eKHfuEJqyUuLC+qIx3nfxu986WubfbW9JRj2tNZMxCEnIHr7++eedtF1M6s1+QdPK9/IAYl6vUoB6e6z//77x5kZO+048ktD4rEmzyVDBBIwRjkK/aVq9/PPP++urhHuSoOaTGYNp9Pit8+9d8Yb75VfH9IcCQDCg1GaAWZhZNX1OF+oedVaTcfCMjiiLbTdVuMSZ00YH/xP9s4zLyUi5nR6jSLCzGBtInc+fmchn/cej4aDRAxt/MAnt8VCe59zzsEtJxy85MtD2hITSrWSkUyCARN2AiiWa/cSAR5rxwyy1Wdj0d9xq1iqbUgk7Pl3jkBGFks1LtWbbwGAf/5zsnP2pXe/li+6T0XCIT8VjSBcz0NzJHh4cmIysLriuVUMs6jUPSQicpNRrbh5SJO4cZcdxp+wzYS2I8eNin6jOSpaKpWaEUQECBDreksipt6ZX3rs0MlX/tl34XzyjQEbfXrO+/H9rxfz7lPRSICY2BPEolx1TVtrdNwP9t+ro+Gy2OELY749pCXQ5HqeRwQiQIfDCp4ns3fc8cf5PT1dQX+XKhK+gcFLN7aep/H2u/MrvnD1rJVPHgBXyvU6CVr6mDIze0ZHXp717vD1OSaet+5OkvFjN/dWdu8I8CCzudivRReLCt4tvfmaFtJIgiDXc73hreHW7SaN2G/06NHhtnjou6VaGQCkgTaRUEjMm194/bjTp/0nGA7E2fBAdtPaXgiDBaNcMV6hZNxSyXXLxbpbKi37qVXq1XLRc9mFu35GXPjdFQhwazWuuhVTcasr/bh1V+ty3YzZNLEQAMYvmfuhtg1dXX491l+e/+VwXdcxwwPtAJkAIVB3qzxz5rtm5RjdB+3I/D/mzZmnjBYrtCVhGBQK+a38dbJbHXP89a8v6i+9EgyGiJkNM0St4iEScna4/PLDNwGAcND5rpQE8pt9mFAQXHbVr4jAc8r5P/b1lytCCslgqtaNaUk4o/bate0rzKCWeHC/YMhP6wMAI1jUqh6qjJ9/0AZWrCrY1QXgxhtzC3/bvaTzjdn134YDQRWPB2TQEURgIwDNRGQYwtXM5XLd5PNlj1CNf37z4PmP3Xf2A+QvNmscSf/rgub11W/NVxiQdUEAeZp1W2souPWm4SNYuMdGIx4RYAwkpIRckC/V33x30X3MgBm46MEFwro0AGpLxA4xpuqnAzObSDhEC/O1V//4zF9ffO65aU7hvzXZ3Z1Wi/KVO1zDgAARQVSqVTOkNb75vseO/LpfuZlWg9xpwPMMF/Ilr5Ave4V8xf8pVnXdZSYSwrAAseslmmOBl9/rf/3Pf1twDKfToqtrw3Gd9HT5c6a/StNrmkFkGr2iTTgk0N4aPaIxt4KOPIq5AoYisAQJI0plmLdmFx4AQJVKLwOAW/d45RRYA0Hrnhcr6H2ucwI5TiC/S8d273zSY9hYjH7x21+3ep4J8fvmiet6ZnUxkPfNKQ0g/MNTb31pSdH7YyQSIAZrBoiEy7EYHXTRWd/4wdD2aNR1jfZFXDI5BsWKmT6QCK8+zMpKhhEJhlQ8Ip1IRDmRqP8THfgJhFUoGlUOGy+y/kdSGmJa5Q8DhgEzYmhreX1+YrWgA8bwcgXMfqxNa4033nhzneZrS0tUr1xLRACRHNhAKQB6SUn/SioFARgikNbGa49HI2MTsT0AqHDA7FmtF2FYSklM5TrTrLm1J5iBU0+9591CSf87HFIAkWGGiUUcjBoW25MIHE+oXV3tNlIuOeA4or/gzX/zP/QsACRTq7aqxOp2mul0Wtz405/O2ufgq/Z57sXZB7y3oP7zUs2Zo5Qj4k0RFYsEpaNARMaASIBIaU9y35JKfcK4yMH33nJ82s/Gmig/eLdoNAD+4akv/mVxb/Vf4VBMELMGIEuFKoY3N3UNbw1/t5SvAhxQTK4XC0WpL+8+dUbmoZcHFotBCchAozG+6drjd2qK0herFdcwSAqCISGwcHH92nvuebq6ww5T3M4j76l2dma8w6be9ot5C8ozw8GAZGYDVibkMNpaeSCYPnjXEvnuWwliwYAEkSIiSf6mAY4CorG4en2W+7uf/+HvHddMf2hRF9bcv//jpCOT0QTg0ZfF73t7q7OCjiMZbBgka2UXiRjts//+O8evv+qo7VqanB2qJcMAS4ZnQsGQWLiw8tqxZy75KzMjHG7VANA2JPbmQNHSUtPUcQRGjx0d9kW/Y+38KoAMRcIhY3h5qwRsyADkrs/xWNy/GNporE0t4cyZfiPGWe/1jTDGRNgvY1/6DsbowZ3rseyCqbfXu8XTAiQAAsli2aNEGJ2btrdcXalUmcGCGewokgt7K/k33vXuZwY8xoewbBmCCIWy999FFfeZ/op5Jl/kZ/pL5pn+ov9TLJu/LS7qZzb94qT/+OLZsV7mMhEQj4VlvCmimlb1Ew87TU1RVXO94HoSfQaAjq/uOSsQUIVGiUUj3KOU4i98Ydu1G8uBaR2JhyNCvv9YBEJIqTcBoH2hv75VDB4olup1IRql6QQlgbYhaudLzk7tPLwl1Oy6pAGBkFCyN19d+MLrC3sG3G9mSV/pD4IC/mJDRMYzaIqoXdJnJ8dGHLFVteYCDEmADgWCqNbdv2RuuaXInJWNzmuDTiLx3RVMUgg+5ox7HgXw6BVXnBkf01LZMRqufS2oxFdDjtiptTkSq1SqrA2IhCbXSKdcLJmRraGzzjg8OS2Z7Jq/2poJAlg0xvxpr1SZeLOD+E+rpBkQVNcaTTHVxGzg+YmaAFjUXAK5kevWdhI0KqVHNgePSUQV9RfqmsgIBslSqYLRIyL7/OnxC3diP4HagFmAyGi3KrQeOJeFIcuVOkdCct9zTv3W5qlU7vXBBQYZRIoMCEFHkqcrMC5AQsCwYceRKBW9/jdnV6YcOPnqbCNes6GdskdY2mCx8v07p+aGD2s5teLmDUgpz9PesPZI/Jtf/fw3hzZ7n2+NB6mvT3sCrDSIHalQ8bzpfmC8SzVMeCmC72pTX7r6MwNSEIbEgxPX5rs1ChfPm5IcbrzaBNcVYD9Vhh0paUm9nr/jjn/U1ktV8kBdwXvzyxjX3gpHAJoaWVJmMDF/ELnLRe78aloigfYhsQErKTeQFvuBNUeaiPiWB5/7ffqkL78zqjU8rlirG2OMCASUEwpJx3U9EBHIkBcNh9TsRUsev+Cy6XMBQCxT2XUKw5AKUckVh+797Uv/M7iF/8ONux8fBNy6xguzFuQCQWeRABPet8ARaSYVpaoXmwMAhQkj+MMJlq/vN9z9i8qPz9y1rykSaiprzQQW2rgIq2B0TGhBO4D+rq40rXRo2gfdwKqaJGD8ZouN09W0Bjk8GwAWtsMMFOjO+MNDp80cPiT0+VKlrhmQFbcKSbJz83FtbRDkh0fIP26htKTy5PTpuf6T9ugKAKj3legX/cXK+VJAagNU6zUQYevR7fFLgmGpXL/1id9S03hY2Fv5vW8BzVjt9kitYdAYAGWzSZFEEpRKFQD8ceAH6bOmjp44QR02ptW51AlWjetJIYShumdMW2s48qXdNt+ZiH45uMmYFjd09eaGtZUvjoXFyHqdDIiF52keOB+EmI0Jhxwxrzf/1tX3/ftPA8VtepCTnYhS+rjjDm6JR9V3K7UqDEg2uoIAhOEtwf3FwP9d/sSUak2iVq9joHkdtGe89ta488VJEw4CcOkaK9OZdDQakPOXVJ6YM89JR6O02fAhzl2BgBv0XL9ZL7NhJxhw3p3d92LjZL3OTGaDLHZbeItvdc1b7N45oq0yVXFAeqShyQi3Xudxw5wLAsFwvFytw4AlINlRWi7sK5Xm9eoHGwH5Rkv0/qJ8sVhhQ+RbxAyIWt0gHND77LbbbmcO1JassdqiowPi4othtpzYvHtbSyRcrpQ1EUlmGKUUKrXqa88//3wZM/YLAKivB/3Ae2/OMe6WIxEIke80GZgzQpg11nUHAwFe/iV+FILQ3NzU13hwOzqSa/wuxhhBRJXFP/jyPeOGyYuopg04IDQ0tOcxkSAwg6Ur8hUHc+bR9PW3ofAQkDqUTqfFyJFz5Zw5Kxf0dQFYb0e4sp8rVq4HcNFV95z+xhtL3hvUnP3wSSg8sPEoa+wxQyk5lmqeAaQwxvWampxg85DmTiK8PthOFR1+UooMh3lXU9cAS+E3kyCZr3iYs6D/5cZ3bxToLuqr/37k8PDnqeIxoKhe1YgF5CahEdFNipUqCCRBrKuaKF/iRwDQwhkNAUrN/P3Pml4Z1hqYVK7UjadBIeXENxsXP0y7LgQkGRhWQsiF/XX3pTcXPtV4VtdJQNLptOiaNIlyyIFSKb30nN/2iTRwTOQsAJc9cOsJaustEhmta5oBCSYOKMmlytwdAQxKQHp6EDg5c2P+Z9OPe2y7zdqPq9ULht7XFZQAEwgERH++cP/TTz9d7enpCAGDM8EbabAdO7TuO7w12FoulTUR5PKrUr5c1gMdflZ49JlJiqURWYYhIbRbQ0uMD0smkz9Zc2U6sxISwVDkrcOnXvYcgOd+ede5m265SejyvJv3QFJ5LnNTXEa3mhB65Etf+tLnF06aWeeVDpXcMEjlcnrgYXrxVw+c8Y9NhgV2LhW1ZsmyXPHQ3qq2MUyoVj0QERloLxaKqrm9+d+deNYt8xrngzRG+Tc977w2KjVuVmtcja3VXENEolZzdXtzdMJhqS0OJsrcm82mAx9UC7K00paBloRzJsNrnM8C4ZuUKNTr3QDQs/DDHw2czWYNEWGLbTd/TyknL4TXxGYg/ZAIVU9NXN2CmUwC2SzTAzeeGYiEHRhT44H6FzAI786avVZtN4QQBgBee1ffPmZE9YxISIY9l5kGikb81Fejg+GwnDO/9sLxZ9/0t0arofUhIcZIHsjgpClTpq+02GTW6+wT/o5L1PCNjkktqZ9+fe7ChRDt7ate5NbmmOxBrFECgCkWaj08NPZNAgPkwTAJbVwMaQ2cxIw7OrDsbKDVvde0aZMdmpJx77vpzK+3N4uJxZpryD96yoQCUizMe7Oe/c/8FwG/GDKbTAoAeHvOkl+MGRk/K0iQGtrvAyg0KzCYBfmZjlIu6i2Wnv3bm38GwB1dXdoXoJxXKJ72v6OHOZOoUjcACQgXkZD0j9ggBgEmFAzIhf3153983S/fGrB81l5AGmZ+Zpn8Ui6XWiEbKJ1Oq2+NnEu/fGfBHaPaQ+fFQhSs64GHiIlIDv7GNfx8s+f13zquPfFDoUgaMxA3AMFAc1AI2dtXLc9agNsHlHktguf++8eCcjLB71wDmIFZR5rgMbEYaBMBLD9kTEaDBRhGQjARIKq1uh7SHNria9vF9iWiR/xgekavyuT2Pw+QxgSy2aScOHGiPPXUv914yhGfO2Fke3hUuWKMFJ6o5KvepiObJpx07BdPT6VuubS7O63QuWFaIY2HqT+v78Yws7M/ZhJMBFczw6849wMSxFSrAQvmFe8BgBkzlh7as9Qddth+p/w2NCQypVZzDcDCsCSta2bzMW1XTrv+/L+mUpk3uDutcgsn8YwZM7jhk+7q6iI/s67LEJH3yN1nnbHJKLVNsVw2fnY2IJQj+oqV2rxZix7x582qFxsmA4aA4Zjs7k6rSqVXdnevOhHk+eenEwCPeXTNcEn757q4AEPUai7CAfofAOd3dHRVs9mZMpXym1YyM3772xsUEdUeuvW470UibSjkG/UvBAFGqCn+yto6dgbGcdYX7jj9t+2bBr/b79W0f5SAf11gsENB5PPVOwHot99+O4QP2c7FPyCJUWeIgZ53Mpv9YItpYBw+xILOfuoZC9QKVdPZ6XfBWFtXr+9oMAMZbwbMRnR3pxUA1d2dXt0aJdLptPjvG/95tL1180ujASXr7PqNYCs1PWZ4aOtf3HPe+dSZuYT5/9v79iipqjPf79v7PKu6Hk1DIyCCz/HCJKPRde/ozBrBxCQz9+LMytxqjaMTxyRoND6B6Ohkqkuj4tVolKCCRMHQo7cqA2ISZHwMjTGRhUEEpTFKlDf0u57nvfd3/zhV0EA3FIq55N761trrLBa1Tp+9z7f3953v8fsRW51u550AcgiTKabTaZwxYy8///yF/qXXXBobN0Y+wRknGe4TQAnS0CLMtgdWLl36SqVm6EOnjRARN7zUceuW+JjolLJTlgwZCx1NrCa1pYhqUaVXBq88vmTlvmpDr8hmUwQAsLevsPKU8dotiJIRKaHOS141HhKAGHEFQArxIgDQUPKoug3I6tVpBTETLHzoW185/dRRN7z/e/vHiPhyGG8F+M//DCuPenuBnd+20Lv91tQoRVG5IJ8AAZEAAhJg6tEP6g6LjIEaleO7v1h68+pJ4yKXlMqeAAAeoo6SMCOm0tvtrpr9/Sd2hmx9U+pLNlaN4dy7Z34uEVMvLNs2EYbhK5REkSjnKo9WCXFo2LgrgQJluwBCqCHTFCFpGoPxJ5nfBoDl7e0jx6qxGqJFCqitLSc+WHmj8sorr1S+9t9Pu2ncmKZlCrqSiIFgwL2KI04ZFfuXx++95oWLL868d6Jye0+bFhrLdWs2vnhS8xceSiYg7nkQYrviAfpFIpKmznnvQOXjpb/Y+kromR0wtLVw2Lad1sKWZnWmysJ6aWABc12QzYbeOuVUfPX5J2//Bk7PvD4kR7f/9YThgoyybPGsO08eq9zjuI4ACCnziChoimjK9r32yjmZXFeV5VGOeKwgQNFxC39zaSao54C99YXO8qrvnLezOaokXY8kAOOu54txrfrE5xbecDcizh4mlu7+r3sv//z4sZFrbcsKASZDvgcMAglCGmEOpPNAovXoBj1MKO3osZ6cME7/+yrmebV4gJGqSaV3oFzctGXf8wAAnqd/ap1CAGCkgIBouaqjn7me0hDI7YB9ClTf2r4kBOISAtDsr0yv750DwAfnPj37Z62nsq97BQiAgQKIvOw4YvJY5e4Xnp1DiHj/0HvVvkgymQxlMiDvueuyiX913qlLmuN4ZqnsSMYYA4nEOeGAZQV9g+q8IWGu6jsOw1iW6y9nGkxBW6013g4x6BIlSCjawS8BDjBKpqoOzIuv7fjNGRPjPSe1qK22I8OcRxXWn4ABMuSlciB3dJdfrSf0p4xw2AYdC+740inj/OWtMdOM6HzGSx03v7azp/LgzFsXvTz00/eR+6+dPGVSYn40QoptC4nIERjwfNmDbdsq7xyTVxuWiMp8Sc4f34qXDK1sQeRoC4Dte739Xuy0ujdXeN+zT0lcOSqu8ULRChCZQiRI1xXsLdLrwpddmoJISKQovBpbJgCQ4AsAz7GSibg+Q1WCSMgugNyyHRrdYk6bm77qFETckU2lOMDRD/vd5ihR7dhfvuzpm179k8nRLxWLngAmuCsAklFVnzg59hQRXJAKEYmPI9rScYp9I9QAFrsvuuQLK8a1Glf5niVCEq2DDhmpqgYr2JVq2DGtDO2ob8vlRGgkF7694tnZS8+cZF5VGLACVKSCTGWWY8kmAydPnMDWrFh8088dz1iat+V6gyl5gDgwpTQ2asqLIqp/3fhW/fOOW5aBCFmmiCRpCoPBki83bu6bG4ZgjzAn4kDCh0Jf/oeLHrlmN+eERIceUhKQFCIFsRiwB265ZcGHfVd8YeXEsfzz6GA1kIbcsUicOSkya9nT10/wZOLeHy1asWfLli56dO6dkYRBX21utu+L66ppu4KQSaQQKYwVKsL+aF9+bdV+yDpVHDKZNTUPdc3KjjnvjW9V/tS2ReiAoRBR01D29Hv/fv9jz3cTZXl7+/xPrU8ECIL5YDLrv72yLBPj3GFC+PKwY0UJQKEooSaxp8TebWvLlOG4Ioh9chNIKJnnCdBROXf1i+nrGAQcgImD37gAAo0SCQ3ffGvXezfMfvzX8/rpruak+NsmgxuOJ4kxRCEY51LIUycY96x47rt/b1vwyM6PnF/NuXfRXkRwzjvvf0RmXnHm6clk0DYmqX2nJcpaimVbMsZZiD0hRSIWUz7e1rP4W7c88V6NgfXQPM7WXuuFk1rMOzkAl0MgMIkYqZzzvqJrb+uBVUPzFwj792vlpn88d6WuaVc7bmXIfg0B0XWDs329wfb5z+Q3IoYQRnUbEEqnGUA7LVscfHlsc7Dc0MHsyxcDhSM7+aToF1uajS++9vzsDSXbWRWLajsHK8HFLXHzK6NjECtXBCFXmCQU8YiCO/aWNn4vs+jdY0l0T89kBBHhBRdc8HLmxgu3jR3NJ1uOlAABmFoT39Nf2PZvP3/x5epGEdOmpeuIFbfjtGkZ8Y1vXGTETWhznSAsdSGShq6w/oLcc8llK74MsPWoFKQ/ezZ99enj/GccYQsAxkVAwZhExDx7/NirAODe077UzCBXnxeW2ryZiADva++/ubXVfMtUmOEKIGSSF8uemDwu/ufPL/zOjdjWNo+yWY5tbSfcV8h+gMVScWHFbrmSYTUYP1TBkPGBgh/s3ectHSkht3nzFCJKs/b27tnRCE1vjWsnlysikIqvEOesYiukcIFnnByb4UmYUaw4HpBnAwwCEsaTSQ2lRLBsV0jSQ6RZksCR+dGmiPb+e9333HHfs+tOOyeE2amGKoYNr8uAYOpZo77KOIV0w8OdcYQAmgK/21FYDAAf7usZfLxvNPtuk6lEHF8SQ8IAfM5sRmdNSlw+UPYu+/4NFw/KYJqMJ30z2aRFpWeA5brEOCAQB5BSxOKmsuujUuesWQt2ExFDRFnrGanPUWrnAOBXHO8pzuOPAlUoDE0gL5cl2EXzCQDA3PGApgUIu6F9AUk9WMRQVGlxlcOWjEABRi4wXQXPUy8AgLXZbOoEaI4lQATmWALiJvylarK/DMuG6KCvLAkAMghgVFQDJuynEOANmPPDjxc/fN3N53y+5SlFur4vpMIR0EPJgootTm9pOke08CWtccNd9fxNe03d7At8v1VRaWJLIoaO40PRdiQyzgh9IKEE8SZN2bXX2vGrNX3fC/fDwStZI3fD83Hjf9x62/sntWr/pew4EqHGYCmlbmh8X5/1zh13zDuMA6W9yuVRcd0VfsCvRjzsE04aioKO5/5HV1fOqydPxg5KQra309VXX52ImMG/jYphxKkwn3OuSJCsVHaF8H0a3aKee8akxD+PHW0+fvak2P9sMmSsZHsSOCGRJJX5UgCyfT3+3QAgcrnNx5IQpM7Odr527Vq7v+A8q6kGIJAEQKlpHByPLVyzZrtT3Sh1eS/r14/niEB/cf7Zfz0qqU52Ak8AIEMgqesaFCv2iwBb3dWr00YN4PDQ8dsFM1WiLP/fP//18oFBt19VFE5EJAGY53tgxugbU6ZM0c6buaDumDJmMrKzM83vynR07dpdnm9GDQYQ5loAJfNcW5zUHHvwjtsuOwtSKZlOp9mJZkBqAIvX3rLwzf58ZYupa0jVps4wHChExNRgoGK/ceOd8z8kGj5WnclkZC7XhZnMkz1vb8xfPlCWVlNUVSBQApAMOBcoAahQsYXj2MJUQYvoPBHRKaFrAq2KFViWJwmAI0qQFEiGMognDW1Xj/vElTcs+NfVq9PK0THawn7GimWLUtEJiqVKUCxZh41CpeJXipVA4YELADD7+4t37u72282IyRTm+UQQZjMYYbHsCo0BjhsTHTVhfGy0qVHUsm1hBR4xxhGkCiRJmDpnfSVh7+4L5oQFAe2fJC8lAQA2vNuX6+mzKyrnHIgFkYgKPfnKpstvuGcDEcHxO7hD/9fzfXJ9T3q+Jz2vej10BK4IXF8y5p8QZek49CuEAbhBIMtFKyiV7GqjbziKRSsoF+3AsiynWCgGyL0iAMDKlY/qV9/25KJ1G7sfMqKGanBORCAYsWoVlSctxxZNEdDHNpuTE1E8vzmunGIoDEslJ/B8QciQoSTAQAtiTbrSnRfl1eu2XzbvmVxvW1sXDrdXOjvbOawHv+i4KxSFAyPc3/2OQEScg+PDC+FZenCxSHt7iJyxrqvnjf68W1Q547LafRIaf8F8F9DzI8uHhkXrMiBhxUA7LlmypOBJdtmARZVEE1NBSl8Ck4BhL3bFcmWpZAelkh0US7bwA0khLgsJzkA0JxLqzm7vsW/OWrA8TKx1iQNGiqh6IapdDyGyqG2CHd3eUz2DosI4MM4U1leoWDv2UcdIXmwIDYQhwxSFNPYAAOeddxYBALTGtG9xNSAQrAbzBq5HUKrgywCAnZ0QTJ+eGXacf+1CH3IAudyrhXxZrjMMTYb5IMZsNxAto/iZc7457eIQeXTI84RzIwIkGU71oLlOm54RRGn276/23Luju7g7YqiMCAQgoOsKGNOs6n/xufHzEJGmTp06sicqAGQI90QyPMFJEpH4A/h3VWMuegf8Z5mmIhD5kkhKIgkEIgBAy9aeGk6hDzVG2WyKf++en/z61xv2fLWv5H+caDYVNeRRCELOWGQEyAMB5AeS/IBIEBEBKgCIIJkg8IUeUZlqRpXfbS/9+JLUA9cTpdn06ZlhViNcJiIQ4bU2QrK/kQaEcS2EKinwb3+7QL3i+sd+uOmD/heTyRaNowiq9yRE5JKAbNcn2/YpCIigWj5OJCWQF0QiyG0y2Kbf91/73Tse35zLpYbpU8GhzxdegcShhpiyWX7fjzr2Dha9lwxTBZLoSYUwXxI/AYCg+r6G7BskIApj/0OvwzTn4gjrBQCypu8jjtoGoGPvOyGqKhSFZ4asKtgn0VfOGUHYslPL2VQHhlmKkUaI4Lh/D+7cuVmuTqeVmbMWzVn/3uAcRygUb9L4fp0Kb8iDQJLt+NJ2fOG4gRQSKOQyAiKCABlAsllRBkuwZe2G3ovueyS7NptN8VxueCNfC2PtHpTLChVPMoYoQ2wTQkQsl6Sf9+Mrhjsnw0K/NHv44ef6yg69qepIQBhIIiJJUmUa9pe8/nc2DK4LDU6nqNuAhH8gI9PpNF769ftfe2N9/1/v6YffxWKmGjU0FuI0oUA4EKUIG59AcpQYjxhcV6NK1/bCYzP+4aGbq8nfA7+VBuqagpqCTNc4KgxVXVWQcVIO3QTZbJbfkVm0a6BQfCkW1VksqrH+fmvNLXc8tmM4LxaJM11F5IxUxkHRVIZU3d6I04OH01ec1powv+g5QIwRU4mJaERXShW/3N/nrAEAqlnnEQ/KzfMRAKBUchcjcqYyApSCCJiM6Yoc1xq9bv+qJACQkaqpiIrCGGekmgpHAPXQ/ADlcl2Yy+UK+7r9W7hiMpUDV1EhjWms4tr+aac0ffm5+d/9ZpXTe9ivOVQ4M3VAjTPV1FTUOFdNnWOIevDZJ9OJCN96++On9/RU+lpb4nrM5CxqImtpjmi9g+7gO1uLvyQCrCXej2ZE7rqn41fzlm78864P8087krx4rEmJmhpTOSIHkgxBIJJAJMGACyAgTWUYb9J4JJLk/Xna9u4H+cv/7qpHb6SwuXDYHgRiLJqIRXhTRNcTTSY/6oiF13jMUOIxk4OIKKFO7CGiNLt8Zu6KTe/nOzQjosSaFK5wjggoGKFgCOEAEEggFY4YiegsHm9SBgp8+/p3izOuv+2pn45UNME4xZOxKI9FTS3WpKuJuMlV5Ak4pNckBzkgAuwbVOfZAWBrsxoZ7CN785aPniMAPAy/jZEej5tKU8QwatdkPKKABHMYRYsk4gaPRTR96Hocbb0SMYPHmyJKPGZyVTWPGQGfMa5FIzoamqpGDJ1FIyqaEQUPwN7XL8ITSsRUuWFoimloPFLHMA2V6xrXo6bGgVgEAOCss8bR9EwmIEqza26c/9Abb+/9q76897KiGiwRM7ipcWQAxJBJBCYhLJSVyEgik2ganCVjpuITD97/yHrm6Rd2X/gv9y1++2hFM7Uw1vJfdG0oW/7WeNTkGueoccSWUU28WLTe/db1P/hgpK/9mhNXqlgvGrqOhqKoEV1FXeWsJWlixXXfmvvEE4MUVm8d1Ugrw4UTwkks+tWYMVPOf/QHX/726ARerav8c/GYxlUVwgKP0LUGERDkLTco9Is3+/qtB6644Ue/pHSaYVvmoHK9kqf5fWU5wKQggQEiQSC5r5RtVhwmug4EgPO7rXnjxkUuYsD5rh77cSLA9vbOw0hNXGHYRQcGXJ8FSBItJrkn1IHa/588YeylqqFRoVxmhoHgSwTXluXtvc59szI/GahCnIgj52fWBOl0mj2zrHNZJPq5n58+oXkGV3zwA6kO5B0IUFx867WpCY8syO0uQAI8n/XatvRdTxJwEiWXFFuaxZEOzba2x3/2syW3LJjYGv16sViKM8aApFQ9vwRGVH04nb7hpVSqbe9Qytia9Fnc1vvFgF3xAkKpAGBgS64ULG7/IZLp6XQ7m/fMqt4//bNT/walfpskMUk3dCraQB/tKv/ogQcWFubOra/7u60tJ7KpFG/L5XqWL3/lmw/dO/PBM08W/xA1ta8yDlObTG7qqsYYC2utpRBguwyK5SA/IN03K67y3P3z16xYt25dcaSO85oX1zvgbHjr3Z2vu67jEWGdodaq+jGN5W1jINyUGTl9OhAiVFLffuTK534yq2NUkzdL1/UL44ZiaioDwJDDnEhAEARQqIDfX3C7Ki48u/y17kUdHR3FIx0eu/sHXnY3OYNuELiEEnRVVfIFsQMAgqovTrX1q5a1vv7MY9fe/mdTJ35toFDM3j9vVe+52RRv26/n0yTAGtDj2tt9lv+ksIkkBojAZIAeC5h4J3QQQOZyYcNnd56vf2vT3tdt1/bDCdWfa2CSIWkKOtQ0WMt71RGSAwCAQsXbs3XHQI9lOR4A55wjWh45LYlJAwBvQnt7Ow2pyhs+55iq/j2VFUpOsFZSCDnI6MjZfKx+rjChCLRA8V3141CHQkoIxNp5ufg3APCVnz550xdboso1hq5epGl8QiQCXFURgDgQAQSBhHLFh4INv7fKpVU7u52nbvrnBRsBDtBs1/PVv2bNmuC6fzynIx6TN5csLwAglrdw35ad9q0AALm2LjxSmLO3oP9i89bSnZy5phBh9/pgSfB9/ex5AID2zZvrMs4j/uiQ2mr88d3XT4kmxDmTT4mbO/bkTzY11Rk1Ktq3e2fBKgbqb2+cPf+DoSWzh7/AFI+Mj8TCf+UBACAJALY91lu4cOGIgGc/XfnTeNDdx/7pn27Nj/is2bSW3J2MAGwDgDwkk0no6SmJ229/ugQA+MILDzS9v2FTojJYGHfGmZOozCT+5jcf7+3oWLXrGJv19uva0/Pu/MKfnN3Mt2/fTZvWb0WPiUJs9H/dlslkfACAuXNnxsfqLtZmmkwmYdu2vV4mM/xca2V+D6Zntb734RsTEQVTQQXf8iEypplxvXXLvHkdxeGqV1KplNbT44XzT+bD5U1Ohl6t1erK5Tz4A8hR1vGYK26IACGXZUOLB+6664pJp45rmkRe6azRY0YDgITe7nLAjeSWt9bu+PjJpct7ar/9v1T+jERprOn/g/dcPykRtc6ZMD45RldVABBQKrlgl9munftKv7/9B4u31tbleD/vMI1sJ1wl37FEngAgcsjzEwBYJ8qcQkbW9v3kWRdeeGnsyq9NOkPXvLNPao1GdR3JsgR27+ovOW6868Z/Xf07gC4vfPdZnkq1yWNveEzxm2/2YrahkbuvB5csWVOAAxTo9dwrDofjIeaP64ZYHbL31ROnxGoz0XE9lD7TQ48+WWIa8bN6HkL4IxZKpxlRlhMREgESpdknXeOhGzPsS8K63idls7xevQmfk9gnHSM9Ujab4vW8S0QEymY51UFGHq7loc9w5LWtPceRfkcEOFzhyHBFG+l0mn2a9TrSmv1B9XS/flKd48Bvj3bvcM2zdZ2DI63zJ48GIHza++Fn9HtMh/we7LDei86wXr2eTtDhNsrRaDxqL+1o8bjwd3jQzIZ4xJhOp7GrqwtT1UbZzZun0KcAKkRKpzFXxXLK5QCmTDn4fofPlWpNZEedR3t7O9YQW/cH9XJH7uAdYW3/WD3OEY3J1KldOGbzFNzfYNcJ0Du1i1KpnDzR5rv/ecdMwUNDaFX9Oz74UP9/CA7vY56gzhQAQjqN7YecmWFl0zR5vN790H1fJyXSH+2aNqQhDWlIQxrSkIY0pCENaUhDGtKQhjSkIQ1pSEMa0pCGNKQhDWlIQxrSkIY0pCENacj/e/J/AMjLKAkAafawAAAAAElFTkSuQmCC" alt="SVF Logo" style={{height:90,objectFit:"contain"}}/>
      <div className="login-logo-name" style={{marginTop:6}}>SVF Journal</div>
      <div className="login-logo-sub">TRADING JOURNAL</div>
    </div>
  );

  const tabs = (
    <div style={{display:"flex",gap:0,marginBottom:4,borderRadius:10,overflow:"hidden",background:"#1A1D24",padding:4}}>
      <button onClick={()=>{setMode("login");setErr("");setFpResult(null)}}
        style={{flex:1,padding:"9px 0",border:"none",borderRadius:8,cursor:"pointer",fontSize:13,fontWeight:600,
          background:mode==="login"?"#00C076":"transparent",color:mode==="login"?"#000":"#8E8E9A",transition:"all .2s"}}>
        Iniciar Sesión
      </button>
      <button onClick={()=>{setMode("register");setErr("");setFpResult(null)}}
        style={{flex:1,padding:"9px 0",border:"none",borderRadius:8,cursor:"pointer",fontSize:13,fontWeight:600,
          background:mode==="register"?"#00C076":"transparent",color:mode==="register"?"#000":"#8E8E9A",transition:"all .2s"}}>
        Crear Cuenta
      </button>
      <button onClick={()=>{setMode("forgot");setErr("");setFpResult(null)}}
        style={{flex:1,padding:"9px 0",border:"none",borderRadius:8,cursor:"pointer",fontSize:12,fontWeight:600,
          background:mode==="forgot"?"#FFD60A":"transparent",color:mode==="forgot"?"#000":"#8E8E9A",transition:"all .2s"}}>
        🔑 Contraseña
      </button>
    </div>
  );

  return (
    <div className="login-wrap">
      <div className="login-card">
        {logoBlock}
        {tabs}
        {err && <div style={{background:"rgba(255,59,48,.1)",border:"1px solid rgba(255,59,48,.2)",borderRadius:8,padding:"10px 12px",fontSize:13,color:"#FF3B30"}}>{err}</div>}
        {mode==="login" ? (
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input className="form-input" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="tu@email.com"/>
            </div>
            <div className="form-group">
              <label className="form-label">Contraseña</label>
              <input className="form-input" type="password" value={pass} onChange={e=>setPass(e.target.value)} placeholder="••••••••"
                onKeyDown={e=>e.key==="Enter"&&handleLogin()}/>
            </div>
            <button className="btn btn-primary" style={{width:"100%",marginTop:4}} onClick={handleLogin} disabled={loading}>
              {loading?"Entrando...":"Iniciar Sesión"}
            </button>
            <div className="login-hint">
              <strong>Demo:</strong> demo@smo.com / smo2026<br/>Incluye 4 cuentas y 14 trades de ejemplo.
            </div>
          </div>
        ) : mode==="register" ? (
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <div className="form-group">
              <label className="form-label">Nombre</label>
              <input className="form-input" type="text" value={rName} onChange={e=>setRName(e.target.value)} placeholder="Tu nombre completo"/>
            </div>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input className="form-input" type="email" value={rEmail} onChange={e=>setREmail(e.target.value)} placeholder="tu@email.com"/>
            </div>
            <div className="form-group">
              <label className="form-label">Contraseña</label>
              <input className="form-input" type="password" value={rPass} onChange={e=>setRPass(e.target.value)} placeholder="Mínimo 6 caracteres"/>
            </div>
            <div className="form-group">
              <label className="form-label">Repetir Contraseña</label>
              <input className="form-input" type="password" value={rPass2} onChange={e=>setRPass2(e.target.value)} placeholder="Repite tu contraseña"
                onKeyDown={e=>e.key==="Enter"&&handleRegister()}/>
            </div>
            <button className="btn btn-primary" style={{width:"100%",marginTop:4}} onClick={handleRegister} disabled={loading}>
              {loading?"Creando cuenta...":"Crear Cuenta"}
            </button>
            <div className="login-hint">Tu cuenta se guarda en la nube y sincroniza en todos tus dispositivos.</div>
          </div>
        ) : (
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <div style={{fontSize:13,color:"#6A6E7A",lineHeight:1.6}}>
              Ingresa tu email y te enviaremos un enlace para restablecer tu contraseña.
            </div>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input className="form-input" type="email" value={fpEmail} onChange={e=>{setFpEmail(e.target.value);setFpResult(null);}} placeholder="tu@email.com"
                onKeyDown={async e=>{
                  if(e.key==="Enter"){
                    if(!fpEmail.includes("@")) return setFpResult({found:false,msg:"Ingresa un email válido."});
                    try {
                      await sendPasswordResetEmail(auth, fpEmail.trim().toLowerCase());
                      setFpResult({found:true});
                    } catch {
                      setFpResult({found:false,msg:"No se pudo enviar el correo. Verifica el email."});
                    }
                  }
                }}/>
            </div>
            <button className="btn btn-primary" style={{width:"100%"}} onClick={async ()=>{
              if(!fpEmail.includes("@")) return setFpResult({found:false,msg:"Ingresa un email válido."});
              try {
                await sendPasswordResetEmail(auth, fpEmail.trim().toLowerCase());
                setFpResult({found:true});
              } catch {
                setFpResult({found:false,msg:"No se pudo enviar el correo. Verifica el email."});
              }
            }}>Enviar enlace</button>
            {fpResult && (fpResult.found ? (
              <div style={{background:"rgba(0,192,118,.1)",border:"1px solid rgba(0,192,118,.25)",borderRadius:10,padding:"12px 14px",fontSize:13}}>
                <div style={{color:"#00C076",fontWeight:600,marginBottom:4}}>✓ Correo enviado</div>
                <div style={{color:"#6A6E7A"}}>Revisa tu bandeja de entrada y sigue el enlace para cambiar tu contraseña.</div>
              </div>
            ) : (
              <div style={{background:"rgba(255,59,48,.08)",border:"1px solid rgba(255,59,48,.2)",borderRadius:10,padding:"12px 14px",fontSize:13,color:"#FF3B30"}}>
                {fpResult.msg||"No se encontró ninguna cuenta con ese email."}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
// ACCOUNT SWITCHER DROPDOWN
// ═══════════════════════════════════════════════════════════════════════════════
function AcctDropdown({user,activeAccounts,onToggle,onClose,onManage}) {
  return (
    <>
      <div style={{position:"fixed",inset:0,zIndex:199}} onClick={onClose}/>
      <div className="acct-dropdown">
        <div className="acct-dropdown-head">
          <span>Mis Cuentas</span>
          <div style={{display:"flex",gap:8}}>
            <button className="btn btn-ghost btn-sm" onClick={()=>{onManage();onClose();}}>Gestionar</button>
            <button className="modal-close" onClick={onClose}>×</button>
          </div>
        </div>
        <div className="acct-list">
          {user.accounts.map(a=>{
            const t=acctType(a.type);
            const on=activeAccounts.includes(a.id);
            return (
              <div key={a.id} className={`acct-row${on?" selected":""}`} onClick={()=>onToggle(a.id)}>
                <div className="acct-icon" style={{background:t.color+"22"}}>{t.icon}</div>
                <div style={{flex:1,overflow:"hidden"}}>
                  <div style={{fontSize:13,fontWeight:600,color:"#E2E4EA",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{a.name}</div>
                  <div style={{fontSize:11,color:t.color,fontWeight:600}}>{t.label}</div>
                </div>
                <div style={{textAlign:"right",marginRight:8}}>
                  <div style={{fontSize:12,fontWeight:700,fontFamily:"DM Mono",color:"#C0C4D0"}}>{fmt$(a.balance,0)}</div>
                  <div style={{fontSize:10,color:"#4A4E5A"}}>{a.currency}</div>
                </div>
                <div className={`acct-row-check${on?" on":""}`}>{on?"✓":""}</div>
              </div>
            );
          })}
        </div>
        <div style={{padding:"10px 16px 16px",borderTop:"1px solid #1A1C24"}}>
          <div style={{fontSize:11,color:"#4A4E5A",textAlign:"center"}}>
            {activeAccounts.length===user.accounts.length?"Viendo todas las cuentas":`Viendo ${activeAccounts.length} cuenta${activeAccounts.length!==1?"s":""}`}
          </div>
        </div>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ACCOUNT MANAGEMENT PAGE
// ═══════════════════════════════════════════════════════════════════════════════
function AccountsPage({user,trades,onAddAccount,onDeleteAccount}) {
  const [showAdd,setShowAdd]=useState(false);
  const [form,setForm]=useState({name:"",type:"real",broker:"",balance:"",currency:"USD"});
  const set=(k,v)=>setForm(f=>({...f,[k]:v}));

  const handleAdd=()=>{
    if(!form.name||!form.balance) return;
    onAddAccount({...form,balance:parseFloat(form.balance),id:"a"+Date.now(),active:true});
    setShowAdd(false);
    setForm({name:"",type:"real",broker:"",balance:"",currency:"USD"});
  };

  return (
    <div className="content">
      <div style={{display:"flex",alignItems:"center",marginBottom:20,gap:12}}>
        <div style={{flex:1}}>
          <div style={{fontSize:15,fontWeight:700}}>Mis Cuentas</div>
          <div style={{fontSize:12,color:"#4A4E5A",marginTop:2}}>{user.accounts.length} cuenta{user.accounts.length!==1?"s":""} registrada{user.accounts.length!==1?"s":""}</div>
        </div>
        <button className="btn btn-primary" onClick={()=>setShowAdd(true)}>
          <Ico n="plus" s={14} c="#fff"/> Nueva Cuenta
        </button>
      </div>

      {/* Demo banner — shown only if no real accounts yet */}
      {!user.accounts.some(a=>!a.isDemo) && (
        <div style={{background:"linear-gradient(135deg,rgba(0,192,118,.08),rgba(100,210,255,.08))",border:"1px solid rgba(0,192,118,.2)",borderRadius:12,padding:"14px 18px",marginBottom:20,display:"flex",gap:12,alignItems:"flex-start"}}>
          <div style={{fontSize:24}}>🧪</div>
          <div>
            <div style={{fontWeight:700,fontSize:13.5,color:"#00C076",marginBottom:3}}>Estás viendo la Cuenta Demostración</div>
            <div style={{fontSize:12,color:"#6A6E7A",lineHeight:1.5}}>Esta cuenta tiene trades de ejemplo para que explores todas las funciones. Crea tu primera cuenta real para empezar a registrar tus propios trades.</div>
          </div>
        </div>
      )}

      <div className="acct-manage-grid">
        {user.accounts.map(a=>{
          const t=acctType(a.type);
          const acctTrades=trades.filter(tr=>tr.accountId===a.id);
          const st=calcStats(acctTrades);
          return (
            <div key={a.id} className="acct-manage-card" style={a.isDemo?{border:"1px solid rgba(142,142,154,.2)",opacity:.85}:{}}>
              {a.isDemo && <div style={{fontSize:10,fontWeight:700,color:"#8E8E9A",letterSpacing:1,textTransform:"uppercase",marginBottom:8,display:"flex",alignItems:"center",gap:5}}><span>🧪</span> Cuenta Demostración — solo lectura</div>}
              <div className="acct-top">
                <div className="acct-emoji" style={{background:t.color+"22"}}>{t.icon}</div>
                <div style={{flex:1}}>
                  <div className="acct-card-name">{a.name}</div>
                  <div className="acct-card-type" style={{color:t.color}}>{t.label} · {a.broker||"—"}</div>
                </div>
                {!a.isDemo && (
                  <button className="btn btn-danger btn-sm" onClick={()=>onDeleteAccount(a.id)}>
                    <Ico n="trash" s={12} c="#FF3B30"/>
                  </button>
                )}
              </div>
              <div className="acct-card-stats">
                {[
                  {l:"Saldo Inicial",  v:fmt$(a.balance,0),              c:"#E2E4EA"},
                  {l:"Balance Actual", v:fmt$(a.balance+st.net,0),       c:pnlColor(st.net)},
                  {l:"Net P&L",        v:fmt$(st.net),                   c:pnlColor(st.net)},
                  {l:"Win Rate",       v:fmtPct(st.winRate),             c:st.winRate>=.5?"#00C076":"#FF3B30"},
                  {l:"Trades",         v:st.totalTrades,                 c:"#E2E4EA"},
                ].map(m=>(
                  <div key={m.l} className="acct-stat">
                    <div className="acct-stat-label">{m.l}</div>
                    <div className="acct-stat-value" style={{color:m.c}}>{m.v}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add account modal */}
      {showAdd && (
        <div className="modal-overlay" onClick={()=>setShowAdd(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-head">
              <h3>➕ Nueva Cuenta</h3>
              <button className="modal-close" onClick={()=>setShowAdd(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Nombre de la cuenta</label>
                <input className="form-input" placeholder='ej: "FTMO $100K Fase 1"' value={form.name} onChange={e=>set("name",e.target.value)}/>
              </div>
              <div className="form-group">
                <label className="form-label">Tipo de cuenta</label>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                  {ACCOUNT_TYPES.map(at=>(
                    <div key={at.id} onClick={()=>set("type",at.id)} style={{
                      border:`2px solid ${form.type===at.id?at.color:"#252830"}`,
                      background:form.type===at.id?at.color+"15":"#161820",
                      borderRadius:10,padding:"10px 12px",cursor:"pointer",transition:"all .15s",
                      display:"flex",alignItems:"center",gap:8}}>
                      <span style={{fontSize:18}}>{at.icon}</span>
                      <span style={{fontSize:13,fontWeight:600,color:form.type===at.id?at.color:"#6A6E7A"}}>{at.label}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Broker / Firma</label>
                  <input className="form-input" placeholder='ej: "FTMO"' value={form.broker} onChange={e=>set("broker",e.target.value)}/>
                </div>
                <div className="form-group">
                  <label className="form-label">Moneda</label>
                  <select className="form-select" value={form.currency} onChange={e=>set("currency",e.target.value)}>
                    {["USD","EUR","GBP","CHF"].map(c=><option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Saldo Inicial</label>
                <input className="form-input" type="number" placeholder="ej: 100000" value={form.balance} onChange={e=>set("balance",e.target.value)}/>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-ghost" onClick={()=>setShowAdd(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleAdd}>Crear Cuenta</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════════
function Dashboard({trades,accounts,scope}) {
  const st=useMemo(()=>calcStats(trades),[trades]);
  const eq=useMemo(()=>buildEquity(trades),[trades]);
  const dailyPnl=useMemo(()=>{
    const map={};
    trades.forEach(t=>{map[t.date]=(map[t.date]||0)+t.pnl;});
    return Object.entries(map).sort(([a],[b])=>a.localeCompare(b)).slice(-14).map(([d,p])=>({date:d.slice(5),pnl:p}));
  },[trades]);
  const byAsset=useMemo(()=>{
    const map={};
    trades.forEach(t=>{if(!map[t.asset])map[t.asset]={asset:t.asset,pnl:0,count:0};map[t.asset].pnl+=t.pnl;map[t.asset].count++;});
    return Object.values(map).sort((a,b)=>b.pnl-a.pnl);
  },[trades]);
  const byAcct=useMemo(()=>{
    return accounts.map(a=>{
      const at=trades.filter(t=>t.accountId===a.id);
      const st=calcStats(at);
      const t=acctType(a.type);
      return {...a,...st,typeInfo:t};
    });
  },[trades,accounts]);

  if(!trades.length) return (
    <div className="content" style={{display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:12,color:"#4A4E5A"}}>
      <div style={{fontSize:48}}>📭</div>
      <div style={{fontSize:16,fontWeight:600,color:"#6A6E7A"}}>Sin trades todavía</div>
      <div style={{fontSize:13}}>Añade tu primer trade para ver las estadísticas</div>
    </div>
  );

  return (
    <div className="content">
      {/* KPIs */}
      <div className="metrics-row">
        {[
          {l:"Net P&L",      v:fmt$(st.net),                     c:pnlColor(st.net),     sub:`${st.totalTrades} trades`},
          {l:"Win Rate",     v:fmtPct(st.winRate),               c:st.winRate>=.5?"#00C076":"#FF3B30", sub:`${st.wins}W / ${st.losses}L`},
          {l:"Profit Factor",v:st.pf===999?"∞":st.pf.toFixed(2), c:"#E2E4EA",            sub:"gross W ÷ gross L"},
          {l:"Avg Win",      v:fmt$(st.avgWin),                  c:"#00C076",            sub:"por trade ganador"},
          {l:"Avg Loss",     v:fmt$(st.avgLoss),                 c:"#FF3B30",            sub:"por trade perdedor"},
          {l:"Expectancy",   v:fmt$(st.expectancy),              c:pnlColor(st.expectancy),sub:"por trade"},
          {l:"Max Drawdown", v:`${st.maxDDPct.toFixed(2)}%`,     c:"#FF9F0A",            sub:"del pico de balance"},
          {l:"Avg R:R",      v:st.avgRR.toFixed(2)+"R",          c:"#64D2FF",            sub:"trades ganadores"},
        ].map(m=>(
          <div key={m.l} className="metric-card">
            <div className="metric-label">{m.l}</div>
            <div className="metric-value" style={{color:m.c}}>{m.v}</div>
            <div className="metric-sub">{m.sub}</div>
          </div>
        ))}
      </div>

      {/* Por cuenta (si hay más de 1) */}
      {scope==="global" && byAcct.filter(a=>a.totalTrades>0).length>1 && (
        <div className="chart-card" style={{marginBottom:20}}>
          <div className="chart-title">Resumen por Cuenta</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:10}}>
            {byAcct.map(a=>(
              <div key={a.id} style={{background:"#141620",borderRadius:10,padding:"12px 14px",borderLeft:`3px solid ${a.typeInfo.color}`}}>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
                  <span style={{fontSize:16}}>{a.typeInfo.icon}</span>
                  <span style={{fontSize:12.5,fontWeight:600,color:"#C0C4D0",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{a.name}</span>
                </div>
                <div style={{fontSize:18,fontWeight:800,fontFamily:"DM Mono",color:pnlColor(a.net)}}>{fmt$(a.net)}</div>
                <div style={{fontSize:11,color:"#4A4E5A",marginTop:3}}>{fmtPct(a.winRate)} WR · {a.totalTrades} trades</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Charts */}
      <div className="charts-row">
        <div className="chart-card">
          <div className="chart-title">Equity Curve <span>Balance acumulado</span></div>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={eq}>
              <defs>
                <linearGradient id="eg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#00C076" stopOpacity={.2}/>
                  <stop offset="95%" stopColor="#00C076" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#141620" vertical={false}/>
              <XAxis dataKey="date" tick={{fill:"#4A4E5A",fontSize:10}} tickLine={false} axisLine={false}/>
              <YAxis tick={{fill:"#4A4E5A",fontSize:10}} tickLine={false} axisLine={false} tickFormatter={v=>"$"+v.toLocaleString()}/>
              <Tooltip content={<CT/>}/>
              <Area type="monotone" dataKey="balance" stroke="#00C076" strokeWidth={2} fill="url(#eg)" dot={false}/>
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="chart-card">
          <div className="chart-title">Daily P&L <span>últimas 2 semanas</span></div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={dailyPnl}>
              <CartesianGrid strokeDasharray="3 3" stroke="#141620" vertical={false}/>
              <XAxis dataKey="date" tick={{fill:"#4A4E5A",fontSize:10}} tickLine={false} axisLine={false}/>
              <YAxis tick={{fill:"#4A4E5A",fontSize:10}} tickLine={false} axisLine={false}/>
              <Tooltip content={<CT/>}/>
              <ReferenceLine y={0} stroke="#252830"/>
              <Bar dataKey="pnl" radius={[4,4,0,0]}>
                {dailyPnl.map((d,i)=><Cell key={i} fill={d.pnl>=0?"#00C076":"#FF3B30"}/>)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bottom */}
      <div className="dash-bottom" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <div className="chart-card">
          <div className="chart-title">Win / Loss</div>
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            {[
              {l:`Wins — ${st.wins}`,   pct:st.winRate,      c:"#00C076"},
              {l:`Losses — ${st.losses}`,pct:1-st.winRate,   c:"#FF3B30"},
            ].map(b=>(
              <div key={b.l}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:5,fontSize:12}}>
                  <span style={{color:b.c,fontWeight:600}}>{b.l}</span>
                  <span style={{color:b.c,fontWeight:700}}>{fmtPct(b.pct)}</span>
                </div>
                <div className="progress-track"><div className="progress-fill" style={{width:fmtPct(b.pct),background:b.c}}/></div>
              </div>
            ))}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginTop:4}}>
              <div style={{background:"#071512",borderRadius:8,padding:"10px 12px"}}>
                <div style={{fontSize:10,color:"#4A4E5A",marginBottom:3}}>Mejor Trade</div>
                <div style={{fontSize:16,fontWeight:800,color:"#00C076",fontFamily:"DM Mono"}}>{fmt$(st.bestTrade)}</div>
              </div>
              <div style={{background:"#150707",borderRadius:8,padding:"10px 12px"}}>
                <div style={{fontSize:10,color:"#4A4E5A",marginBottom:3}}>Peor Trade</div>
                <div style={{fontSize:16,fontWeight:800,color:"#FF3B30",fontFamily:"DM Mono"}}>{fmt$(st.worstTrade)}</div>
              </div>
            </div>
          </div>
        </div>
        <div className="chart-card">
          <div className="chart-title">Por Activo</div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {byAsset.map(a=>{
              const mx=Math.max(...byAsset.map(x=>Math.abs(x.pnl)));
              return (
                <div key={a.asset}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:4,fontSize:12}}>
                    <span style={{color:"#A0A4B0",fontWeight:500}}>{a.asset}</span>
                    <span style={{fontWeight:700,fontFamily:"DM Mono",color:pnlColor(a.pnl)}}>{fmt$(a.pnl)}</span>
                  </div>
                  <div className="progress-track">
                    <div className="progress-fill" style={{width:`${mx>0?Math.abs(a.pnl)/mx*100:0}%`,background:a.pnl>=0?"#00C076":"#FF3B30"}}/>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TRADE LOG
// ═══════════════════════════════════════════════════════════════════════════════
function TradeLog({trades,accounts,onAdd,onDelete,onEdit}) {
  const [fAsset,setFA]=useState("ALL");
  const [fSide,setFS]=useState("ALL");
  const [fSession,setFSess]=useState("ALL");
  const [fAcct,setFAcct]=useState("ALL");
  const [selected,setSel]=useState(null);
  const [editing,setEditing]=useState(null);

  const filtered=useMemo(()=>{
    let t=[...trades].sort((a,b)=>b.date.localeCompare(a.date));
    if(fAsset!=="ALL")   t=t.filter(x=>x.asset===fAsset);
    if(fSide!=="ALL")    t=t.filter(x=>x.side===fSide);
    if(fSession!=="ALL") t=t.filter(x=>x.session===fSession);
    if(fAcct!=="ALL")    t=t.filter(x=>x.accountId===fAcct);
    return t;
  },[trades,fAsset,fSide,fSession,fAcct]);

  const st=useMemo(()=>calcStats(filtered),[filtered]);
  const getAcct=id=>accounts.find(a=>a.id===id);

  return (
    <div className="content" style={{padding:0}}>
      {/* Mini stats */}
      <div className="mini-stats">
        {[
          {l:"Net P&L",    v:fmt$(st.net),                      c:pnlColor(st.net)},
          {l:"Win Rate",   v:fmtPct(st.winRate),                c:st.winRate>=.5?"#00C076":"#FF3B30"},
          {l:"Trades",     v:st.totalTrades,                     c:"#E2E4EA"},
          {l:"Avg Win",    v:fmt$(st.avgWin),                   c:"#00C076"},
          {l:"Avg Loss",   v:fmt$(st.avgLoss),                  c:"#FF3B30"},
          {l:"P. Factor",  v:st.pf===999?"∞":st.pf.toFixed(2), c:"#E2E4EA"},
        ].map(m=>(
          <div key={m.l} className="mini-stat">
            <div className="mini-stat-l">{m.l}</div>
            <div className="mini-stat-v" style={{color:m.c}}>{m.v}</div>
          </div>
        ))}
      </div>
      {/* Filters */}
      <div className="filter-bar">
        <Ico n="filt" s={14} c="#4A4E5A"/>
        <select className="filter-select" value={fAcct} onChange={e=>setFAcct(e.target.value)}>
          <option value="ALL">Todas las cuentas</option>
          {accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select className="filter-select" value={fAsset} onChange={e=>setFA(e.target.value)}>
          <option value="ALL">Activo: Todos</option>
          {DEFAULT_ASSETS.map(a=><option key={a}>{a}</option>)}
        </select>
        <select className="filter-select" value={fSide} onChange={e=>setFS(e.target.value)}>
          <option value="ALL">Lado: Todos</option>
          <option value="BUY">BUY</option>
          <option value="SELL">SELL</option>
        </select>
        <select className="filter-select" value={fSession} onChange={e=>setFSess(e.target.value)}>
          <option value="ALL">Sesión: Todas</option>
          {SESSIONS.map(s=><option key={s}>{s}</option>)}
        </select>
        <span style={{marginLeft:"auto",fontSize:12,color:"#4A4E5A"}}>{filtered.length} trades</span>
        <button className="btn btn-primary btn-sm" onClick={onAdd}><Ico n="plus" s={13} c="#fff"/> Añadir</button>
      </div>
      {/* Table */}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Fecha</th><th>Cuenta</th><th>Activo</th><th>Lado</th>
              <th>Entrada</th><th>Salida</th><th>P&L</th><th>R:R</th>
              <th>Sesión</th><th>Setup</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(t=>{
              const a=getAcct(t.accountId);
              const at=a?acctType(a.type):null;
              return (
                <tr key={t.id} onClick={()=>setSel(t)}>
                  <td style={{color:"#6A6E7A"}}>{t.date}</td>
                  <td>
                    {a && <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <span style={{fontSize:14}}>{at?.icon}</span>
                      <span style={{fontSize:12,color:"#A0A4B0",maxWidth:100,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.name}</span>
                    </div>}
                  </td>
                  <td style={{fontWeight:700}}>{t.asset}</td>
                  <td><span className={`tag tag-${t.side.toLowerCase()}`}>{t.side}</span></td>
                  <td style={{fontFamily:"DM Mono"}}>{t.entry.toLocaleString()}</td>
                  <td style={{fontFamily:"DM Mono"}}>{t.exit.toLocaleString()}</td>
                  <td style={{fontFamily:"DM Mono",fontWeight:800,color:pnlColor(t.pnl)}}>{fmt$(t.pnl)}</td>
                  <td style={{fontFamily:"DM Mono",color:t.rr>0?"#00C076":t.rr<0?"#FF3B30":"#6A6E7A"}}>{fmtRR(t.rr)}</td>
                  <td><span className="tag tag-gray">{t.session}</span></td>
                  <td><span className="tag tag-gray">{t.setup}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!filtered.length&&<div style={{textAlign:"center",padding:"40px",color:"#4A4E5A"}}>Sin trades con estos filtros</div>}
      </div>
      {/* Detail modal */}
      {selected && (
        <div className="modal-overlay" onClick={()=>setSel(null)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-head">
              <span style={{fontSize:22}}>{acctType(getAcct(selected.accountId)?.type||"real").icon}</span>
              <h3>{selected.asset} — {selected.date}</h3>
              <button className="modal-close" onClick={()=>setSel(null)}>×</button>
            </div>
            <div className="modal-body">
              {getAcct(selected.accountId) && (
                <div style={{background:"#141620",borderRadius:9,padding:"10px 14px",fontSize:12.5,color:"#6A6E7A",display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:16}}>{acctType(getAcct(selected.accountId).type).icon}</span>
                  <span style={{color:"#A0A4B0",fontWeight:600}}>{getAcct(selected.accountId).name}</span>
                  <span style={{marginLeft:"auto",color:acctType(getAcct(selected.accountId).type).color,fontWeight:700}}>
                    {acctType(getAcct(selected.accountId).type).label}
                  </span>
                </div>
              )}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
                {[
                  {l:"P&L",    v:fmt$(selected.pnl),  c:pnlColor(selected.pnl)},
                  {l:"R:R",    v:fmtRR(selected.rr),  c:selected.rr>0?"#00C076":selected.rr<0?"#FF3B30":"#6A6E7A"},
                  {l:"Lado",   v:selected.side,         c:selected.side==="BUY"?"#00C076":"#FF3B30"},
                  {l:"Entrada",v:selected.entry,        c:"#E2E4EA"},
                  {l:"Salida", v:selected.exit,         c:"#E2E4EA"},
                  {l:"Sesión", v:selected.session,      c:"#64D2FF"},
                  {l:"Setup",  v:selected.setup,        c:"#FFD60A"},
                  {l:"Qty",    v:selected.qty,          c:"#E2E4EA"},
                ].map(m=>(
                  <div key={m.l} style={{background:"#141620",borderRadius:9,padding:"10px 12px"}}>
                    <div style={{fontSize:10,color:"#4A4E5A",marginBottom:4}}>{m.l}</div>
                    <div style={{fontSize:15,fontWeight:800,color:m.c,fontFamily:"DM Mono"}}>{m.v}</div>
                  </div>
                ))}
              </div>
              {selected.notes&&<div style={{background:"#141620",borderRadius:9,padding:"12px"}}>
                <div style={{fontSize:10,color:"#4A4E5A",marginBottom:4}}>NOTAS</div>
                <div style={{fontSize:13.5,color:"#A0A4B0"}}>{selected.notes}</div>
              </div>}
            </div>
            <div className="modal-foot">
              <button className="btn btn-danger" onClick={()=>{onDelete(selected.id);setSel(null);}}>
                <Ico n="trash" s={13} c="#FF3B30"/> Eliminar
              </button>
              <button className="btn btn-ghost" style={{color:"#64D2FF",borderColor:"rgba(100,210,255,.3)"}} onClick={()=>{setEditing(selected);setSel(null);}}>
                ✏️ Editar
              </button>
              <button className="btn btn-ghost" onClick={()=>setSel(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
      {editing && (
        <AddTradeModal
          accounts={accounts.filter(a=>!a.isDemo)}
          defaultAcct={editing.accountId}
          onClose={()=>setEditing(null)}
          onSave={t=>{onEdit(t);setEditing(null);}}
          customAssets={[]}
          rrPresets={DEFAULT_RR_PRESETS}
          onAddAsset={()=>{}}
          onUpdateRrPresets={()=>{}}
          initialData={editing}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CALENDAR
// ═══════════════════════════════════════════════════════════════════════════════
const MNAMES=["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const DOWS=["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];

function CalendarView({trades,accounts,onDelete,onEdit}) {
  const [selected,setSel]=useState(null);
  const [editing,setEditing]=useState(null);
  const getAcct=id=>(accounts||[]).find(a=>a.id===id);
  const [year,setY]=useState(2026);
  const [month,setM]=useState(0);
  const today=new Date();
  const todayStr=`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;

  const daily=useMemo(()=>{
    const m={};
    trades.forEach(t=>{if(!m[t.date])m[t.date]={pnl:0,count:0};m[t.date].pnl+=t.pnl;m[t.date].count++;});
    return m;
  },[trades]);

  const first=new Date(year,month,1).getDay();
  const days=new Date(year,month+1,0).getDate();
  const cells=[...Array(first).fill(null),...Array.from({length:days},(_,i)=>i+1)];

  const monTrades=useMemo(()=>trades.filter(t=>t.date.startsWith(`${year}-${String(month+1).padStart(2,"0")}`)),[trades,year,month]);
  const monSt=useMemo(()=>calcStats(monTrades),[monTrades]);

  const prev=()=>month===0?[setM(11),setY(y=>y-1)]:setM(m=>m-1);
  const next=()=>month===11?[setM(0),setY(y=>y+1)]:setM(m=>m+1);

  return (
    <div className="content">
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16,flexWrap:"wrap"}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <button className="btn btn-ghost btn-sm" onClick={prev}><Ico n="chevL" s={14}/></button>
          <span style={{fontSize:18,fontWeight:800,minWidth:170,textAlign:"center"}}>{MNAMES[month]} {year}</span>
          <button className="btn btn-ghost btn-sm" onClick={next}><Ico n="chevR" s={14}/></button>
        </div>
        <div style={{display:"flex",gap:10,marginLeft:"auto",flexWrap:"wrap"}}>
          {[
            {l:"Net",   v:fmt$(monSt.net),        c:pnlColor(monSt.net)},
            {l:"WR",    v:fmtPct(monSt.winRate),  c:monSt.winRate>=.5?"#00C076":"#FF3B30"},
            {l:"Trades",v:monSt.totalTrades,       c:"#E2E4EA"},
          ].map(m=>(
            <div key={m.l} style={{background:"#0F1116",border:"1px solid #1A1C24",borderRadius:9,padding:"8px 14px"}}>
              <div style={{fontSize:10,color:"#4A4E5A"}}>{m.l}</div>
              <div style={{fontSize:16,fontWeight:800,color:m.c,fontFamily:"DM Mono"}}>{m.v}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="chart-card">
        <div className="cal-header-row">{DOWS.map(d=><div key={d} className="cal-dow">{d}</div>)}</div>
        <div className="cal-grid">
          {cells.map((day,i)=>{
            if(!day) return <div key={i} className="cal-day empty"/>;
            const key=`${year}-${String(month+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
            const d=daily[key];
            let cls="cal-day"+(d?(d.pnl>=0?" win-day":" loss-day"):"")+( key===todayStr?" today":"");
            return (
              <div key={i} className={cls}>
                <div className="cal-num">{day}</div>
                {d&&<><div className="cal-pnl" style={{color:pnlColor(d.pnl)}}>{fmt$(d.pnl,0)}</div><div className="cal-trades">{d.count} trade{d.count>1?"s":""}</div></>}
              </div>
            );
          })}
        </div>
      </div>
      {monTrades.length>0&&(
        <div style={{marginTop:12}} className="table-card">
          <div className="table-header">
            <div className="table-title">Trades — {MNAMES[month]}</div>
            <span style={{fontSize:12,color:"#4A4E5A",marginLeft:"auto"}}>{monTrades.length} operaciones</span>
            <button className="btn btn-ghost btn-sm" onClick={()=>{
              const headers=["Fecha","Cuenta","Activo","Lado","Entrada","Salida","Qty","P&L","R:R","Sesión","Setup","Notas"];
              const rows=trades.map(t=>[t.date,accounts.find(a=>a.id===t.accountId)?.name||t.accountId,t.asset,t.side,t.entry,t.exit,t.qty,t.pnl,t.rr,t.session,t.setup,t.notes||""]);
              const csv=[headers,...rows].map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
              const a=document.createElement("a");a.href="data:text/csv;charset=utf-8,"+encodeURIComponent(csv);a.download="svf_trades.csv";a.click();
            }}>⬇ CSV</button>
          </div>
          <table>
            <thead><tr><th>Fecha</th><th>Activo</th><th>Lado</th><th>P&L</th><th>R:R</th><th>Setup</th></tr></thead>
            <tbody>
              {[...monTrades].sort((a,b)=>a.date.localeCompare(b.date)).map(t=>(
                <tr key={t.id} onClick={()=>setSel(t)} style={{cursor:"pointer"}}>
                  <td style={{color:"#6A6E7A"}}>{t.date}</td>
                  <td style={{fontWeight:700}}>{t.asset}</td>
                  <td><span className={`tag tag-${t.side.toLowerCase()}`}>{t.side}</span></td>
                  <td style={{fontFamily:"DM Mono",fontWeight:800,color:pnlColor(t.pnl)}}>{fmt$(t.pnl)}</td>
                  <td style={{fontFamily:"DM Mono",color:t.rr>0?"#00C076":t.rr<0?"#FF3B30":"#6A6E7A"}}>{fmtRR(t.rr)}</td>
                  <td><span className="tag tag-gray">{t.setup}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {selected && (
        <div className="modal-overlay" onClick={()=>setSel(null)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-head">
              <span style={{fontSize:22}}>{acctType(getAcct(selected.accountId)?.type||"real").icon}</span>
              <h3>{selected.asset} — {selected.date}</h3>
              <button className="modal-close" onClick={()=>setSel(null)}>×</button>
            </div>
            <div className="modal-body">
              {getAcct(selected.accountId) && (
                <div style={{background:"#141620",borderRadius:9,padding:"10px 14px",fontSize:12.5,color:"#6A6E7A",display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:16}}>{acctType(getAcct(selected.accountId).type).icon}</span>
                  <span style={{color:"#A0A4B0",fontWeight:600}}>{getAcct(selected.accountId).name}</span>
                  <span style={{marginLeft:"auto",color:acctType(getAcct(selected.accountId).type).color,fontWeight:700}}>
                    {acctType(getAcct(selected.accountId).type).label}
                  </span>
                </div>
              )}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
                {[
                  {l:"P&L",    v:fmt$(selected.pnl),       c:pnlColor(selected.pnl)},
                  {l:"R:R",    v:fmtRR(selected.rr),       c:selected.rr>0?"#00C076":selected.rr<0?"#FF3B30":"#6A6E7A"},
                  {l:"Lado",   v:selected.side,              c:selected.side==="BUY"?"#00C076":"#FF3B30"},
                  {l:"Entrada",v:selected.entry,             c:"#E2E4EA"},
                  {l:"Salida", v:selected.exit,              c:"#E2E4EA"},
                  {l:"Sesión", v:selected.session,       c:"#64D2FF"},
                  {l:"Setup",  v:selected.setup,             c:"#FFD60A"},
                  {l:"Qty",    v:selected.qty,               c:"#E2E4EA"},
                ].map(m=>(
                  <div key={m.l} style={{background:"#141620",borderRadius:9,padding:"10px 12px"}}>
                    <div style={{fontSize:10,color:"#4A4E5A",marginBottom:4}}>{m.l}</div>
                    <div style={{fontSize:15,fontWeight:800,color:m.c,fontFamily:"DM Mono"}}>{m.v}</div>
                  </div>
                ))}
              </div>
              {selected.notes&&<div style={{background:"#141620",borderRadius:9,padding:"12px"}}>
                <div style={{fontSize:10,color:"#4A4E5A",marginBottom:4}}>NOTAS</div>
                <div style={{fontSize:13.5,color:"#A0A4B0"}}>{selected.notes}</div>
              </div>}
            </div>
            <div className="modal-foot">
              {onDelete && <button className="btn btn-danger" onClick={()=>{onDelete(selected.id);setSel(null);}}>
                <Ico n="trash" s={13} c="#FF3B30"/> Eliminar
              </button>}
              {onEdit && <button className="btn btn-ghost" style={{color:"#64D2FF",borderColor:"rgba(100,210,255,.3)"}} onClick={()=>{setEditing(selected);setSel(null);}}>
                ✏️ Editar
              </button>}
              <button className="btn btn-ghost" onClick={()=>setSel(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
      {editing && (
        <AddTradeModal
          accounts={(accounts||[]).filter(a=>!a.isDemo)}
          defaultAcct={editing.accountId}
          onClose={()=>setEditing(null)}
          onSave={t=>{onEdit&&onEdit(t);setEditing(null);}}
          customAssets={[]}
          rrPresets={DEFAULT_RR_PRESETS}
          onAddAsset={()=>{}}
          onUpdateRrPresets={()=>{}}
          initialData={editing}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// STATISTICS
// ═══════════════════════════════════════════════════════════════════════════════
function Statistics({trades,accounts}) {
  const st=useMemo(()=>calcStats(trades),[trades]);
  const COLORS=["#00C076","#64D2FF","#FFD60A","#FF9F0A","#BF5AF2","#FF6B6B","#5AC8FA","#34C759"];

  const bySetup=useMemo(()=>{
    const m={};
    trades.forEach(t=>{if(!m[t.setup])m[t.setup]={setup:t.setup,pnl:0,count:0,wins:0};m[t.setup].pnl+=t.pnl;m[t.setup].count++;if(t.pnl>0)m[t.setup].wins++;});
    return Object.values(m).sort((a,b)=>b.pnl-a.pnl);
  },[trades]);

  const byDay=useMemo(()=>{
    const m={};DOWS.forEach(d=>m[d]={day:d,pnl:0,count:0});
    trades.forEach(t=>{const d=DOWS[new Date(t.date+"T12:00:00").getDay()];m[d].pnl+=t.pnl;m[d].count++;});
    return DOWS.map(d=>m[d]);
  },[trades]);

  const assetPie=useMemo(()=>{
    const m={};
    trades.forEach(t=>{if(!m[t.asset])m[t.asset]={name:t.asset,value:0};m[t.asset].value+=Math.abs(t.pnl);});
    return Object.values(m);
  },[trades]);

  const bySess=useMemo(()=>{
    const m={};
    trades.forEach(t=>{if(!m[t.session])m[t.session]={s:t.session,pnl:0,count:0,wins:0};m[t.session].pnl+=t.pnl;m[t.session].count++;if(t.pnl>0)m[t.session].wins++;});
    return Object.values(m).sort((a,b)=>b.pnl-a.pnl);
  },[trades]);

  return (
    <div className="content">
      <div className="stats-grid">
        <div className="chart-card">
          <div className="chart-title">Métricas Clave</div>
          {[
            {k:"Total Trades",        v:st.totalTrades},
            {k:"Wins",                v:st.wins,               c:"#00C076"},
            {k:"Losses",              v:st.losses,             c:"#FF3B30"},
            {k:"Win Rate",            v:fmtPct(st.winRate),    c:st.winRate>=.5?"#00C076":"#FF3B30"},
            {k:"Profit Factor",       v:st.pf===999?"∞":st.pf.toFixed(2)},
            {k:"Expectancy",          v:fmt$(st.expectancy),   c:pnlColor(st.expectancy)},
            {k:"Avg Win",             v:fmt$(st.avgWin),       c:"#00C076"},
            {k:"Avg Loss",            v:fmt$(st.avgLoss),      c:"#FF3B30"},
            {k:"Mejor Trade",         v:fmt$(st.bestTrade),    c:"#00C076"},
            {k:"Peor Trade",          v:fmt$(st.worstTrade),   c:"#FF3B30"},
            {k:"Max Drawdown",        v:`${st.maxDDPct.toFixed(2)}%`,        c:"#FF9F0A"},
            {k:"Avg R:R ganadores",   v:st.avgRR.toFixed(2)+"R"},
          ].map(m=>(
            <div key={m.k} className="stats-row-item">
              <span className="stats-key">{m.k}</span>
              <span className="stats-val" style={{color:m.c||"#E2E4EA"}}>{m.v}</span>
            </div>
          ))}
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <div className="chart-card">
            <div className="chart-title">Por Activo</div>
            <div style={{display:"flex",alignItems:"center",gap:16}}>
              <PieChart width={110} height={110}>
                <Pie data={assetPie} dataKey="value" cx={50} cy={50} innerRadius={28} outerRadius={50} paddingAngle={3}>
                  {assetPie.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
                </Pie>
              </PieChart>
              <div style={{display:"flex",flexDirection:"column",gap:5}}>
                {assetPie.map((a,i)=>(
                  <div key={a.name} style={{display:"flex",alignItems:"center",gap:6,fontSize:12}}>
                    <div style={{width:8,height:8,borderRadius:2,background:COLORS[i%COLORS.length]}}/>
                    <span style={{color:"#A0A4B0"}}>{a.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="chart-card">
            <div className="chart-title">Por Sesión</div>
            {bySess.map(s=>(
              <div key={s.s} className="stats-row-item">
                <div>
                  <div style={{fontSize:13,color:"#A0A4B0",fontWeight:500}}>{s.s}</div>
                  <div style={{fontSize:11,color:"#4A4E5A"}}>{s.count} trades · {Math.round(s.wins/s.count*100)}% WR</div>
                </div>
                <span className="stats-val" style={{color:pnlColor(s.pnl)}}>{fmt$(s.pnl)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="charts-row">
        <div className="chart-card">
          <div className="chart-title">P&L por Setup</div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={bySetup}>
              <CartesianGrid strokeDasharray="3 3" stroke="#141620" vertical={false}/>
              <XAxis dataKey="setup" tick={{fill:"#4A4E5A",fontSize:11}} tickLine={false} axisLine={false}/>
              <YAxis tick={{fill:"#4A4E5A",fontSize:10}} tickLine={false} axisLine={false}/>
              <Tooltip content={<CT/>}/><ReferenceLine y={0} stroke="#252830"/>
              <Bar dataKey="pnl" radius={[4,4,0,0]}>{bySetup.map((d,i)=><Cell key={i} fill={d.pnl>=0?"#00C076":"#FF3B30"}/>)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="chart-card">
          <div className="chart-title">P&L por Día</div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={byDay}>
              <CartesianGrid strokeDasharray="3 3" stroke="#141620" vertical={false}/>
              <XAxis dataKey="day" tick={{fill:"#4A4E5A",fontSize:11}} tickLine={false} axisLine={false}/>
              <YAxis tick={{fill:"#4A4E5A",fontSize:10}} tickLine={false} axisLine={false}/>
              <Tooltip content={<CT/>}/><ReferenceLine y={0} stroke="#252830"/>
              <Bar dataKey="pnl" radius={[4,4,0,0]}>{byDay.map((d,i)=><Cell key={i} fill={d.pnl>0?"#00C076":d.pnl<0?"#FF3B30":"#252830"}/>)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADD TRADE MODAL
// ═══════════════════════════════════════════════════════════════════════════════
function AddTradeModal({accounts,defaultAcct,onClose,onSave,customAssets,rrPresets,onAddAsset,onUpdateRrPresets,initialData}) {
  const isEdit = !!initialData;
  const allAssets = [...DEFAULT_ASSETS, ...(customAssets||[])];
  const [f,setF]=useState(isEdit ? {
    date:initialData.date,
    accountId:initialData.accountId,
    asset:initialData.asset,
    side:initialData.side,
    entry:String(initialData.entry),
    exit:String(initialData.exit),
    qty:String(initialData.qty),
    pnl:String(initialData.pnl),
    rr:String(initialData.rr),
    session:initialData.session,
    setup:initialData.setup,
    notes:initialData.notes||""
  } : {
    date:new Date().toISOString().slice(0,10),
    accountId:defaultAcct||accounts[0]?.id||"",
    asset:"US30",side:"BUY",entry:"",exit:"",qty:"1",
    pnl:"",rr:"",session:"NY",setup:"SVF",notes:""
  });
  const [newAsset,setNewAsset]=useState("");
  const [showNewAsset,setShowNewAsset]=useState(false);
  const [newRR,setNewRR]=useState("");
  const [showNewRR,setShowNewRR]=useState(false);

  const s=(k,v)=>setF(p=>({...p,[k]:v}));
  const save=()=>{
    if(!f.pnl||!f.asset||!f.side) return;
    const data={...f,entry:parseFloat(f.entry),exit:parseFloat(f.exit),qty:parseFloat(f.qty)||1,pnl:parseFloat(f.pnl),rr:parseFloat(f.rr)||0};
    if(isEdit) onSave({...data, id:initialData.id});
    else onSave(data);
    onClose();
  };

  const handleAddAsset=()=>{
    const t=newAsset.trim().toUpperCase();
    if(!t) return;
    onAddAsset(t);
    s("asset",t);
    setNewAsset("");
    setShowNewAsset(false);
  };

  const handleAddRR=()=>{
    const v=parseFloat(newRR);
    if(isNaN(v)) return;
    const next=[...new Set([...rrPresets,v])].sort((a,b)=>a-b);
    onUpdateRrPresets(next);
    s("rr",String(v));
    setNewRR("");
    setShowNewRR(false);
  };

  const selAcct=accounts.find(a=>a.id===f.accountId);
  const at=selAcct?acctType(selAcct.type):null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <div className="modal-head">
          <h3>{isEdit?"✏️ Editar Trade":"➕ Añadir Trade"}</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {/* Account selector */}
          <div className="form-group">
            <label className="form-label">Cuenta</label>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:8}}>
              {accounts.map(a=>{
                const t=acctType(a.type);
                const on=f.accountId===a.id;
                return (
                  <div key={a.id} onClick={()=>s("accountId",a.id)} style={{
                    border:`2px solid ${on?t.color:"#252830"}`,
                    background:on?t.color+"15":"#161820",
                    borderRadius:10,padding:"9px 12px",cursor:"pointer",transition:"all .15s"}}>
                    <div style={{fontSize:18,marginBottom:3}}>{t.icon}</div>
                    <div style={{fontSize:12,fontWeight:700,color:on?t.color:"#6A6E7A",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{a.name}</div>
                    <div style={{fontSize:10,color:"#4A4E5A",marginTop:1}}>{t.label}</div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Fecha</label>
              <input className="form-input" type="date" value={f.date} onChange={e=>s("date",e.target.value)}/>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label" style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span>Activo <span style={{color:"#FF3B30"}}>*</span></span>
              <button style={{background:"none",border:"none",color:"#00C076",fontSize:11,cursor:"pointer",padding:0,fontWeight:600}} onClick={()=>setShowNewAsset(v=>!v)}>
                {showNewAsset?"✕ Cancelar":"＋ Nuevo"}
              </button>
            </label>
            {showNewAsset ? (
              <div style={{display:"flex",gap:6}}>
                <input className="form-input" placeholder="Ej: ETH, SP500…" value={newAsset}
                  onChange={e=>setNewAsset(e.target.value)}
                  onKeyDown={e=>e.key==="Enter"&&handleAddAsset()}
                  style={{flex:1,textTransform:"uppercase"}}/>
                <button className="btn btn-primary" style={{padding:"0 14px",fontSize:13}} onClick={handleAddAsset}>Add</button>
              </div>
            ) : (
              <select className="form-select" value={f.asset} onChange={e=>s("asset",e.target.value)}>
                {allAssets.map(a=><option key={a}>{a}</option>)}
              </select>
            )}
          </div>

          {/* BUY / SELL */}
          <div className="form-group">
            <label className="form-label">Dirección <span style={{color:"#FF3B30"}}>*</span></label>
            <div className="side-toggle">
              <button className={`side-btn long${f.side==="BUY"?" active":""}`} onClick={()=>s("side","BUY")}>▲ BUY</button>
              <button className={`side-btn short${f.side==="SELL"?" active":""}`} onClick={()=>s("side","SELL")}>▼ SELL</button>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group"><label className="form-label" style={{display:"flex",justifyContent:"space-between"}}>Entrada <span style={{color:"#4A4E5A",fontWeight:400,fontSize:10}}>opcional</span></label><input className="form-input" type="number" placeholder="0.00" value={f.entry} onChange={e=>s("entry",e.target.value)}/></div>
            <div className="form-group"><label className="form-label" style={{display:"flex",justifyContent:"space-between"}}>Salida <span style={{color:"#4A4E5A",fontWeight:400,fontSize:10}}>opcional</span></label><input className="form-input" type="number" placeholder="0.00" value={f.exit} onChange={e=>s("exit",e.target.value)}/></div>
          </div>

          <div className="form-row">
            <div className="form-group"><label className="form-label">P&L ($) <span style={{color:"#FF3B30"}}>*</span></label><input className="form-input" type="number" placeholder="ej: 150 o -80" value={f.pnl} onChange={e=>s("pnl",e.target.value)} style={{borderColor:!f.pnl?"#3D1A1A":""}}/></div>
            {/* R:R FIELD SIMPLIFIED */}
            <div className="form-group">
              <label className="form-label">R:R <span style={{color:"#4A4E5A",fontWeight:400,fontSize:10}}>opcional</span></label>
              <div style={{display:"flex",gap:8,marginBottom:8}}>
                {[{label:"1:1",val:"1"},{label:"1:2",val:"2"},{label:"2:1",val:"0.5"},{label:"-1R",val:"-1"}].map(r=>{
                  const active = parseFloat(f.rr)===parseFloat(r.val);
                  const isNeg = parseFloat(r.val)<0;
                  return (
                    <button key={r.val} onClick={()=>s("rr",r.val)}
                      style={{flex:1,padding:"9px 4px",borderRadius:10,border:`1px solid ${active?(isNeg?"#FF3B30":"#00C076"):"#252830"}`,
                        background:active?(isNeg?"rgba(255,59,48,.15)":"rgba(0,192,118,.15)"):"#161820",
                        color:active?(isNeg?"#FF3B30":"#00C076"):"#6A6E7A",
                        fontSize:12,fontWeight:active?700:500,cursor:"pointer",transition:"all .12s",fontFamily:"DM Mono"}}>
                      {r.label}
                    </button>
                  );
                })}
              </div>
              <input className="form-input" type="number" step="0.1" placeholder="o escribe: 1.5, 3, -2…" value={f.rr} onChange={e=>s("rr",e.target.value)}/>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Sesión</label>
              <select className="form-select" value={f.session} onChange={e=>s("session",e.target.value)}>
                {SESSIONS.map(x=><option key={x}>{x}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Setup</label>
              <select className="form-select" value={f.setup} onChange={e=>s("setup",e.target.value)}>
                {SETUPS.map(x=><option key={x}>{x}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Notas</label>
            <textarea className="form-textarea" placeholder="¿Qué salió bien/mal? Lecciones..." value={f.notes} onChange={e=>s("notes",e.target.value)}/>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={save}>Guardar Trade</button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════════
// SETTINGS MODAL
// ═══════════════════════════════════════════════════════════════════════════════
function SettingsModal({user, theme, onClose, onUpdateUser, onToggleTheme, onDeleteAccount, onToast}) {
  const [name,setName]=useState(user.name);
  const [email,setEmail]=useState(user.email);
  const [curPass,setCurPass]=useState("");
  const [newPass,setNewPass]=useState("");
  const [newPass2,setNewPass2]=useState("");
  const [deleteConfirm,setDeleteConfirm]=useState("");
  const [section,setSection]=useState("profile");

  const saveProfile = async () => {
    if(!name.trim()) return onToast("El nombre no puede estar vacío.","error");
    if(!email.includes("@")) return onToast("Email inválido.","error");
    const updated={...user,name:name.trim(),email:email.toLowerCase()};
    await fbSaveUserData(auth.currentUser.uid,{name:updated.name,email:updated.email});
    onUpdateUser(updated);
    onToast("Perfil actualizado ✓","success");
  };

  const savePassword = async () => {
    if(newPass.length<6) return onToast("Mínimo 6 caracteres.","error");
    if(newPass!==newPass2) return onToast("Las contraseñas no coinciden.","error");
    try {
      const credential = EmailAuthProvider.credential(auth.currentUser.email, curPass);
      await reauthenticateWithCredential(auth.currentUser, credential);
      await updatePassword(auth.currentUser, newPass);
      setCurPass(""); setNewPass(""); setNewPass2("");
      onToast("Contraseña actualizada ✓","success");
    } catch(e) {
      onToast(e.code==="auth/wrong-password"?"Contraseña actual incorrecta.":"Error al actualizar.","error");
    }
  };

  const handleDelete = async () => {
    if(deleteConfirm!=="ELIMINAR") return onToast('Escribe "ELIMINAR" para confirmar.','error');
    try {
      await deleteDoc(doc(db,"users",auth.currentUser.uid));
      await firebaseDeleteUser(auth.currentUser);
      onDeleteAccount();
      onClose();
    } catch(e) {
      onToast("Error al eliminar. Vuelve a iniciar sesión e intenta de nuevo.","error");
    }
  };

  const menuItems=[
    {id:"profile",icon:"👤",label:"Perfil"},
    {id:"security",icon:"🔒",label:"Contraseña"},
    {id:"appearance",icon:"🎨",label:"Apariencia"},
    {id:"danger",icon:"⚠️",label:"Zona Peligrosa"},
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{maxWidth:540,display:"flex",flexDirection:"column"}} onClick={e=>e.stopPropagation()}>
        <div className="modal-head">
          <h3>⚙️ Ajustes</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div style={{display:"flex",gap:0,borderBottom:"1px solid #1A1C24"}}>
          {menuItems.map(m=>(
            <button key={m.id} onClick={()=>setSection(m.id)}
              style={{flex:1,padding:"10px 4px",border:"none",background:"none",cursor:"pointer",
                fontSize:11,fontWeight:700,color:section===m.id?"#00C076":"#4A4E5A",
                borderBottom:section===m.id?"2px solid #00C076":"2px solid transparent",
                transition:"all .15s"}}>
              {m.icon}<br/>{m.label}
            </button>
          ))}
        </div>
        <div className="modal-body">
          {section==="profile" && (
            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              <div className="settings-section">
                <div className="settings-section-title">Información Personal</div>
                <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  <div className="form-group">
                    <label className="form-label">Nombre</label>
                    <input className="form-input" value={name} onChange={e=>setName(e.target.value)} placeholder="Tu nombre"/>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Email</label>
                    <input className="form-input" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="tu@email.com"/>
                  </div>
                </div>
              </div>
              <button className="btn btn-primary" onClick={saveProfile}>Guardar Cambios</button>
            </div>
          )}
          {section==="security" && (
            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              <div className="settings-section">
                <div className="settings-section-title">Cambiar Contraseña</div>
                <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  <div className="form-group">
                    <label className="form-label">Contraseña Actual</label>
                    <input className="form-input" type="password" value={curPass} onChange={e=>setCurPass(e.target.value)} placeholder="••••••••"/>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Nueva Contraseña</label>
                    <input className="form-input" type="password" value={newPass} onChange={e=>setNewPass(e.target.value)} placeholder="Mínimo 6 caracteres"/>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Confirmar Nueva</label>
                    <input className="form-input" type="password" value={newPass2} onChange={e=>setNewPass2(e.target.value)} placeholder="Repite la nueva contraseña"/>
                  </div>
                </div>
              </div>
              <button className="btn btn-primary" onClick={savePassword}>Cambiar Contraseña</button>
            </div>
          )}
          {section==="appearance" && (
            <div style={{display:"flex",flexDirection:"column",gap:16}}>
              <div className="settings-section">
                <div className="settings-section-title">Tema de la Interfaz</div>
                <div style={{display:"flex",gap:12}}>
                  {[{id:"dark",icon:"🌙",label:"Oscuro"},{id:"light",icon:"☀️",label:"Claro"}].map(t=>(
                    <div key={t.id} onClick={()=>theme!==t.id&&onToggleTheme()}
                      style={{flex:1,border:`2px solid ${theme===t.id?"#00C076":"#252830"}`,
                        background:theme===t.id?"rgba(0,192,118,.1)":"#161820",
                        borderRadius:10,padding:"14px 12px",cursor:"pointer",textAlign:"center",transition:"all .15s"}}>
                      <div style={{fontSize:24,marginBottom:6}}>{t.icon}</div>
                      <div style={{fontSize:13,fontWeight:600,color:theme===t.id?"#00C076":"#6A6E7A"}}>{t.label}</div>
                      {theme===t.id&&<div style={{fontSize:10,color:"#00C076",marginTop:2}}>● Activo</div>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          {section==="danger" && (
            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              <div className="danger-zone">
                <div style={{fontSize:14,fontWeight:700,color:"#FF3B30",marginBottom:6}}>⚠️ Eliminar cuenta permanentemente</div>
                <div style={{fontSize:13,color:"#8A8E9A",marginBottom:12,lineHeight:1.6}}>
                  Esta acción eliminará todos tus datos, trades y cuentas de este dispositivo. No se puede deshacer.
                </div>
                <div className="form-group" style={{marginBottom:10}}>
                  <label className="form-label">Escribe <strong style={{color:"#FF3B30"}}>ELIMINAR</strong> para confirmar</label>
                  <input className="form-input" value={deleteConfirm} onChange={e=>setDeleteConfirm(e.target.value)} placeholder="ELIMINAR"/>
                </div>
                <button className="btn btn-danger" onClick={handleDelete}>Eliminar mi cuenta</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [user,      setUser]      = useState(null);
  const [trades,    setTrades]    = useState([]);
  const [tab,       setTab]       = useState("dashboard");
  const [scope,     setScope]     = useState("global");
  const [activeAccts,setActAccts] = useState([]);
  const [showDD,    setShowDD]    = useState(false);
  const [showAdd,   setShowAdd]   = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showNavSheet, setShowNavSheet] = useState(false);
  const [theme,     setTheme]     = useState(()=>{ try{return localStorage.getItem(LS_THEME)||"dark";}catch{return "dark";} });
  const [toasts,    setToasts]    = useState([]);
  const [authLoading, setAuthLoading] = useState(true);

  // Firebase Auth state listener — auto-login / logout
  useEffect(()=>{
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if(firebaseUser){
        let data = await fbGetUserData(firebaseUser.uid);
        // Seed demo data for ALL new users (no existing data)
        if(!data || (!data.accounts || data.accounts.length===0)){
          data = {
            name: (data&&data.name) || firebaseUser.displayName || firebaseUser.email.split("@")[0],
            email: firebaseUser.email,
            customAssets: [],
            rrPresets: [...DEFAULT_RR_PRESETS],
            ...DEMO_SEED_DATA,
          };
          await fbSaveUserData(firebaseUser.uid, data);
        }
        // Ensure rrPresets exists for legacy users
        if(!data.rrPresets) data.rrPresets = [...DEFAULT_RR_PRESETS];
        if(!data.customAssets) data.customAssets = [];
        const u = { id: firebaseUser.uid, ...data };
        setUser(u);
        setTrades(u.trades||[]);
        setActAccts((u.accounts||[]).map(a=>a.id));
      } else {
        setUser(null); setTrades([]); setActAccts([]); setTab("dashboard");
      }
      setAuthLoading(false);
    });
    return ()=>unsub();
  },[]);

  // Persistir trades y accounts en Firestore cuando cambian
  useEffect(()=>{
    if(!user||!auth.currentUser) return;
    fbSaveUserData(auth.currentUser.uid, {trades, accounts: user.accounts});
  },[trades, user]);

  const login = useCallback(() => {
    // handled by onAuthStateChanged
  },[]);

  const logout = async () => {
    await signOut(auth);
  };

  const addToast = useCallback((msg, type="success") => {
    const id = Date.now();
    setToasts(p=>[...p,{id,msg,type}]);
    setTimeout(()=>setToasts(p=>p.filter(t=>t.id!==id)), 3200);
  },[]);

  const toggleTheme = useCallback(()=>{
    setTheme(t=>{
      const next=t==="dark"?"light":"dark";
      try{localStorage.setItem(LS_THEME,next);}catch{}
      return next;
    });
  },[]);

  const updateUser = useCallback(updated => {
    setUser(updated);
  },[]);

  const toggleAcct = useCallback(id => {
    setActAccts(prev=>prev.includes(id)
      ? prev.length>1?prev.filter(x=>x!==id):prev
      : [...prev,id]
    );
  },[]);

  const addTrade = useCallback(t => setTrades(p=>[...p,{...t,id:Date.now()}]),[]);
  const editTrade = useCallback(t => setTrades(p=>p.map(x=>x.id===t.id?t:x)),[]);
  const delTrade = useCallback(id => setTrades(p=>p.filter(t=>t.id!==id)),[]);
  const addAccount = useCallback(a => {
    setUser(u=>({...u,accounts:[...u.accounts,a]}));
    setActAccts(p=>[...p,a.id]);
  },[]);
  const delAccount = useCallback(id => {
    setUser(u=>({...u,accounts:u.accounts.filter(a=>a.id!==id)}));
    setActAccts(p=>p.filter(x=>x!==id));
    setTrades(p=>p.filter(t=>t.accountId!==id));
  },[]);
  const addCustomAsset = useCallback(name => {
    const trimmed = name.trim().toUpperCase();
    if(!trimmed) return;
    setUser(u=>{
      const existing = u.customAssets||[];
      if(existing.includes(trimmed)||(DEFAULT_ASSETS.includes(trimmed))) return u;
      const next = [...existing, trimmed];
      if(auth.currentUser) fbSaveUserData(auth.currentUser.uid,{customAssets:next});
      return {...u, customAssets: next};
    });
  },[]);
  const updateRrPresets = useCallback(presets => {
    setUser(u=>{
      if(auth.currentUser) fbSaveUserData(auth.currentUser.uid,{rrPresets:presets});
      return {...u, rrPresets: presets};
    });
  },[]);

  // Trades filtered by active accounts (for scope=account, else all)
  const visibleTrades = useMemo(() => {
    if(scope==="global") return trades;
    return trades.filter(t=>activeAccts.includes(t.accountId));
  },[trades,activeAccts,scope]);

  const visibleAccounts = useMemo(() => {
    if(!user) return [];
    return user.accounts.filter(a=>activeAccts.includes(a.id));
  },[user,activeAccts]);

  // Current account display (for switcher)
  const currentAcct = useMemo(()=>{
    if(!user) return null;
    if(scope==="global") return null;
    return user.accounts.find(a=>a.id===activeAccts[0]);
  },[user,activeAccts,scope]);

  const NAV=[
    {id:"dashboard",label:"Dashboard",    icon:"dash"},
    {id:"journal",  label:"Trade Log",    icon:"log"},
    {id:"calendar", label:"Calendario",   icon:"cal"},
    {id:"stats",    label:"Estadísticas", icon:"stats"},
    {id:"accounts", label:"Mis Cuentas",  icon:"accts"},
  ];

  if(authLoading) return <><style>{css}</style><div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"#0E1117",color:"#00C076",fontSize:16,fontWeight:600}}>Cargando SVF Journal…</div></>;
  if(!user) return <><style>{css}</style><Login/></>;

  const allAcctPnl = user.accounts.map(a=>({
    id:a.id,
    pnl:trades.filter(t=>t.accountId===a.id).reduce((s,t)=>s+t.pnl,0)
  }));

  return (
    <>
      <style>{css}</style>
      <div className={`app${theme==="light"?" theme-light":""}`}>
        {/* SIDEBAR */}
        <aside className="sidebar">
          <div className="sidebar-top">
            <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAASwAAACECAYAAAAqRRZCAACAxUlEQVR42ux9d5xdVbX/d+192u1TU0loASRREVEfVmZQFJVi4V6UIk0TKaEjoD7vvZaHSCe0RIp0uIOCAoKIZHjv6e+pYAETeid1kky57bS91++Pc+9kElImIUEgsz6fk8Bk7rn77LP3d6/1XQ0YkzEZkzEZk3e/5PN5AYDGZmJMxmRMxmRMxmRMxmRLaFZEwHn5Y3a66KLj2ho/HtO0xmRMtrKIsSnYZKGuLghm4IO7t90+fXzrJwGgVMqOzeWYjMlWFmNsCjZNeH5eUncxvPemky7acXL6Iy8tqvWPzcqYjMmYhvV2BCuDuovhL38x+8ypEzOnlytV7eox0B+TMRnTsN5m8tjcmSZ1F4NrLzny9J0mJS7wfNcXwrQM8LvK3GVmoFCgnhkLKbtgOhcAFItFBt5dDzomY4D1bhV6bO5M40Oz5gXXXXTUGXtOn3hh6Ieh0iylfHc8X6mUFZ2d02nf7mJIRFgXODGXZE9PD3K5Hr0x8GqEe2xAiigWsdkgyAAV8nkaeb/GNw//pFAoMtHmgywzqFDIUwFAz4yFBAALFkznYrGot8Y72Pgjb+LBg63qBfq3HV5jnq0NLlom9OQE5XpU6brjv7PLdi3nB0GgAqWFILBlWWLpKv70Fw87/5FSKStzuR71Tnq+UikrDz20R/GI5fez/FETpr2npXVlXyU1eeq4yoInX6me9Z/B68DqZ9tSz8rMRESbtPjz+bzYSqCxKWPe7E3LACEfAWFTfvjDoub13I0I+MEPIAoFZvT0iN7OBdTXt5DfaWttDLDegs3cXBQP3HbWeZPHmefUXV+FSgtBRADrdzBgUamUFY3xitvnzv5MR2v8y5YIPw7BOxiCUqYUCBkIwsAlab2iNP3f0FD1N2f86Pn7n3/+QY85L4jeaCpms1k5tbO6naFMggNMaGkBALguMOAOwB0AXC4Hc296ZAkAvRnrlfc64ID4SV+dMe7151/jFa+vpAF3AADQ0uLAgQPHcQAjVStedMvyzdwTfPzxX2ydOrUjk0GsdcK4WNpKCH5lyUDfiadd99RWeB8CgBX95/bA9gBeQfMPb90aL1OhUKB1gXc2m7Xi0+Pi5Zdfxg7YYYsP9sYbb/T+XVrWmEm4Dpk/P290dxfDE044IfnlTzk3Th7nfGWwWlOsIQW9szGeOTqkiHrUXT8/9cCOViOfSci9bNuAHwBBqKGUhmLNAkRxy3QMA7tZprFbWyJ91PUXvO+pJSum/RdR8RYiQGsQEbipLe2xS+u4D84Y/8+4ZcYVKxYkKYIAQHMLWDMbBgVHfOXDL7662PvSYcdf8tL6Nt6a484LoMA9Pz/rA5PHG3dpeFO233Mc1Ps6SLMGgUBEAEGlEo5ctNy9H8CXuVSSlMup0c1NSYJy+rZrjj9m1+3TF5SrXsIyTccxJUCMtkSbvv/m0+/vnT9weHzKlOqmmJ2lUknmcjl15U+PO+Y/PjDxW5Wqq0xDSoBRqdbbwlAlhRRMJCiaMLBSIRmGLMdi9qpy2SPLlEtqAT8zVPUfJKL/BsAjD8rGIaKPyW5/c3tSfrz6vjYF8BYiLoiJmBQb6oiv/vST+x10zqv/Dm13DLDWMjcKBYCoGP78suP32m2HxA3tKft9g+VKyCSMdzhWNcCKQZQTD9w85eoJ42LfEkKhVvO164eawQIgImJq8iChYg4VuO6HGgCl4ubuLTtmbn74rrM+9e1z7p5N4nmvCYIAEI8Dybhlp2KG6YdyDRWeyADAUJrNjjbrfZVq8CMiOpxLJVEczZYh4gduO+XicW3xnVf2+9p2jOj8IGqc94xQaaMlaVH/kLcZa3sBE8C/TZonpGJ2uwpCBikEodIAIAi8+07pA7XgHxx4ePGsrq68ARTD0dy5s3MBAYAtg53bM9ZHBQJIEVF9iVgCYICjP0bYPgSi6PEyyQQECZAg1OrhuX+899yH/rZw6Nxc7sq/ra3dpwwxsTVhTRashr9ji0AWAYECfArMf9caHgOsxruYPz8vu7uLYbEI3H3j6bMntMnz47aMDZZrIZEw3gW2M/X0ZEUuR/jdHWeWdpqQ+sqKoQGlozNdRPuxCWzRCU8UKS7RWiUBAHU30IKUmjou9q3Lf/jFca+V61lgoioUCsO8jtasglCxUszRMl+LqyXm/oG6Tsb5S1f/eNZkyuUWbei0jjILivrqnxw+PZOQn1w1WFOaSWileB2orIJQSbVeVmj9FABRUV112bF7tqadDw5UqkozREPbEdFzQa8crKp0TMy8IP/tC7q7i8uZIw1z9IeG8qp1T3leGIKi/ceNCX8DScOrgZobPyAGg1i0JmKf/eDusU9edf7hX8vlbv1NqZSVw/PP2nf9UPtKK1JabhmwIgaYmIViEf7bSPdtPg4rWqjg7u5ieOmls3aZ/8uzfjNtO/tyQYhV6p6mSC14FzxnSeRyPeo3N536/e0nxb/SNzTgM0spiETDYgOzUCAoKRim0eTDWQGsaPXmEQxtruwv1987bfzBGel8l6ioD5y0RK65vhu6D63jAokw1NyeScTHT3KOAYCurvWvxea/TZrUfkxLKmEopTm61xtl+KebOD+dndMJAHbsaDkyk7QFK+ambTZCwxBBoNGedtI7ThFfAEC9vflNA4RoumXDVJMAJBEJIhJrgPsITYsZggBJIBmpqUL0V+ph3BKxPXaZfPutV5+1y6GH3qUen9d8B8QAMQFMoDdcEfNPYl1X45W98XMc3Qv/5vCWbVbDGmH+KUybZv/6+188ta3N+W5rQqQrFT/UYClIiHfLs+ZyOXX1ebN2aEsb51YqNQUWZtNBFx3axKmEJYOQMVT1oZnrUohYS8qWgEalXtdgGa1mUNCWSsSefXVVb9UPbuZ8XvS0LtwkLoOJReArtCbFkdls9mddXYVgdXjCmtLdXQzz+aOcZNI8tO57YEBuYY2X9u0uhmcde1DKNvlrdc8D02qNc62RA4LZsc2vAPhFX9+MLbKBGYBpCmqSpE3IZWaESkMprZghmz+XJIyaG4aZFjve4XpzmfnTe+06kRvAmkzFbalYS7mOp9CaUXeDdY5BCqKYY8r1mYShghyo//sUnW0SsBggKhZ1sQj86vozD25vQbG9xd6jXvMxVAkVERv0LnKgdnVBFIvQ4yfSEW3pmD1QroZrKCEs2LYMemlZ/fZqmW9ftXLFS8uWeUPtHcnWCZNTH2xNW8eOa4l9IvADBIqD1pRjvrzE7TnqtN8fs2zZE9VjGZQF86Y4nYmFqPmuammJ7Zrbb+Jniei+fD5vFItrckJN0nyPHVIHjss4U8puXQmiLRoBNz+fl93FovrwhyZ9saMlPrHq1hVhfd9Bou4GFI9R97knf218LpdbtjnhGWsvSUlEfoA+JjmoVEhh4LMUBkzLRBCEk9oysXi97kNpPUzZCUFGpeKrjlar++Y5s/ah7mIvM9P8X37nfwfKfrXmKsXrIN19P0w7tvzwGsY6MxtSkOerShDiz+tAq4ZJSEqoRBUACoUCF4vFMcDa2toGFYv6+rmnvW/HDvOSTFJ+WhCjXK6HHKnn8t0W7dHVFYUP2JbZpbRag1diZpVK2nLRktodBx5x6WFrffRVAP8EcMM9159+bEeH8bO2tNP+3KtDFx30jUvPJKJhfmkk8T46xIq4MsNgJJPG8QDuKxSg37D+swsYAGKmdWKUcr5mSCQz3mC6bfL8FKBRBGdanaOlYH5j0CVrNDg8IlAQKNXZlkh+aM/2QwBc2dtbkADCzYcrrVKJhLFyiP/z4S/9+Oco9BjFYi4EspSfX6LU48dM3GFc7OsTM4mf2FILX4vIH9oAGseW3NYWPwpAb29vQe57yAVnbejrjs3t896jv7bXk7ZJrHRTmWOOWQb19XsvfvHISz4zel5rTMPaqsRzoVDgoaGFscktdM/kzthOq/qHQg0SRGS8W4PSiCIyO26ZE0OlI2oDNGwCVGth+Ep/7b+Y86KnB8aCBas3XxcgugrQRMXrb5xzzv/2t+kPHvSNS++IiGIavveoOecIDKgxMFmr+px25Gcv+eG3dyMqPjOSfM9mIyL82ktPfm8mLT9RrXlo8D7DIiWR1pu/b5qAe+tVp+6UjptdlboHsJBo7EUCYJiGCIJwNYwRoENGJmYdB+Cq3l68Sde+ABPARqCLRJo5q4pFaKAHxW4CgNcA/OyOa0+s77595vKg7io0NEAGhB+EFHfEx7LZkuzuzoVRCMgbZd68JXLmzInqB6f+NYF1kFHc4OkaISSIrvWvpzHSfWubgpFLh/eZMb01acnJq4bKSoNkRHi++8W0TbXGmchgEEQQsnas1kEUgAULEBaLRd28uovFkKioS6WsPGr2T5898PAf3xHF+9Ampr5wxBqTiFjfhvtRa1ZtLbaxy/bJo9Ym3084ISLCJ3Zax7akLMnMikYuWQ12fe2+mXCT5vclkzgqlXZsVlBNxUEIQqjYXb7Cf8CSEswRMhJI1l1Pp9P2njdcferHisVoft4cTcEgLQgAzZvX2qxkS4iCfCWXsvK2P732i1UD7ipLSqm56QUl4QchTEk7ZPf789TIVItAZe3r4Yf7NVFRB77WGzvghBB6Xff4d4LVNgdYTbFtk1lwKCDkthDs33xCz/PlSC2eCKQVhy0Z07K58hUqFvV//Mcqs7H51piYXK5H5fN5USqV5KYuWmZmy5CourSs6ob9trSGNz8ghOt7SMVx2GmnnRbr6ioqNNxcEdl+eDpu68Pq9RBooBUz63jMRD3Qf3/l9aE7kwkHDN6cLAPq6iqq/fff345bdGTgu9AjvsOxDXiBfupvT9G3qh5cwyCKgqUaY3Ak2uN0fEMb3EJvCbxrRJ4PX7lcjxaH3qV+c/1vqm7NW2mYJihSVtEI3oVhSGvc5EyyCVjvVtl2wxp420lL0g0TIfTD5UIYDQJ1GLWE5wY8ZULsuzdedfaeX/jCHK8RhMjMJTk/nzeateuLxaLOjTJqfK29yJZpQBrWM64yb4rHBQgiug+xcD2tWlvs7ffe3TuQCDx/fl72zo/CBaZPyRzS0RIf7weBGuaRAO1YNvor+mbmYJFhiIazftOkVCoJIuCoL++wb0dLbEfX1ZqGVTjWpjRRr/I93/+vSxYNVt2HE7EYAKjG8pH1uot0gg66IH/GOKKc4q2zpiifz5O+804J7CWlbcYVh2uGt6Fp4L/7Zawe1jYgvb3Re/YC/EUa3Kghs3oNeL6GY4nOnSer/3uodNoNd117Wvc++bxBlFPdxWJYLBY1ATx/ft5YI8hxk0ATsAy2Vy5T8/orgSbBsjkIJgCCOZM2ZwJAX99C7uoqKADIJOyZGiEPb1AGC0Fy5UA9/OOTL9xiGWZS682zUho6EbdnkkdZFnFErkdEvpRCrhyseS8vCW4DQNWavMz1GCA9TL6HIYcd7fHUrtP40Gie82/KLCSCmD8/bwAwuFSSzHlBABeLRU25nLp13of3bcnYkzxP6WYgLzMgBOAHyn/q2UXlMQ1rTN7x0tUghfsG/dvK1UALORwrCgCQAuT5ii0Ba7v2+NFTJ5mP/PiD1X89dPuZv/jVjacce/PVs6czILqj8jO8OXyN1gzFnDrylIsWDg2F/52IOYTVZpys1TykY1bX1RfMnp7L9Sgi4tLPz9irNWl/pDaCbCdolYrZ1F/xHrn44vtWEHFicyjvfB6Ccjl18cWHT4zb+GKt5hEPfwerRMyBG8jfnfTdq55nLomvPbxo/kDZXRhzbMHcADZAhEGIhEXHARBNkN1MsEIQUqW7uxh2dxddyuUUUVEzIPL5oybcd8sZR+44MX2j5LViNwnKsS12g/Bfx5829xVmpn9nNYsxwNrkhZgX6/OSbKtCDVL4uJPn/nP5QHBbazommVXQ5E0YAAlQyJoHKq4Kg5CTttxt8njnqF0mJ6/beYL95CN3nfHEA7ef9d0LL8x35HI9anNAizULAlCp+1fwCPuJon9TrSlbbj/RPrr5+6kkz0olDQLTMBBokPAVUAv1VQyQbngONhnEu6I1sn1L2+GtGTsZKt2ITSOAmJRiWjpQuRkA9f5igYmeHjVU0zeYhgABOsrJJFF3Pd2aMva4Yc6sT20umDMgXdeHH9RPfLjn9Bv/dO+5N917ywn3/fbWE//48B1nLOh6f8cz2403brIkj/eCkJqmcYMg1IaU1D8YzAPAjRCLd60Y7xaQ6uqC6OqCJirqtziW7R0h2WxJMxfEuec+d3LKcXaf2Bnfa9WgF2jWwxH9UdYMJECo+4F2vUAzQMKAbI1bMxzT+Ekm4c2+bd5pP8jlLvl5swLBJqgRIYPw5GvL7+1ojb2YSZo71b1AE0gwIOueD8dW3zgtm8137uzE4zZy1brLDJIUkWo65lhi5WD9xcUDeJAAvq3BKW06YBUUAJGKDR2tAgUGCwKBwdq2TNnXX1/y/37f9yAAvuq3CwMAePal4LbWtF9IWiLha92IDRHacUhs15k4FkBvRL73bKJ2xeR7Ica3xPY2TdobDKTjLdDM0IqhQoV6PVTMEMMBvwRorYPWVNx8dWn1bz0P9d3QqNbwrq6T9U7VRIjzedHkVIrFoo7MlaK+6OpZk2+YN3tvrHYLjwmaQX4F/ulPb+t/8tny5xb3hb9JJhwzGbdEVCqAQ4ZW3OC3CCRAZBCRZE1cd33dX66FtqEmvH9act6Dt5/9g1wup0ql0iac6Ix8Xotiscev1LwbbdMAcWTQERF5vlYTOpLj3//Jjn2nbZ85cEJbOhMGSjUDQwmkLdNApRrefMopc7zNnYsof5Rwy9UrP9qasWbUPF9TMw2LtY7bDtyA77yy1FMtlfLW9OnT+bG5M82zi1curlfVffF4HGCsNmfrIWzbOPjnlx43fvPIdwEIoOa6eqjshkMVNxyquKpa9VXN87QXKo6C4RvBomBmRUE6ETOXD/rLn36+9rW77urxG9zVu5p9f8doWMxRtYHOzunU3V0MqVhkFKGBIq49/9u7TZpo72sY8sD2NuuTg576PwD7vROrgG5t0Mrn82L2d4srARxcunb2kePa4ic4pvxIMmkb0BqeH8ALFBOgGjHQsqF6EQDhBUqHqq6mTLCLd990xqIv53LXNcygUfEmxaLQAPDk8/5N6UT9XMeCHarIcamJSYWax7eZ3zOkiLt+nRkiItyYWEolV66qhwte7r9lU6skrKltZgH0cEuGjovHDAwNBboZMiEEycGKF9S0c2V0/6IPAMXG81Vq3iVVz8oOx+4RURiqsLXFTo8bav06gEsj8r0YbgqQN85XWl3ipwnSYo1jlwFIEpTOOOaKgfDpfyxcdeipP7juuX93JdYxwIpMAOrp6RFZAEQ5tbpM7z7GzVfusWdbi7F/Mm5+VpL6SEvKskKl4JgGqq6qbui+NdSQ5K1c9fptKsViUTc9fUR0M4Cb7y6d/T5zqPqFuCW6pMSeMccYn3BMQymNWt2FYnBUZVWACEJpjbrr69aEvuTHp2UfzGZ7Fvf05ARGZZ4xuJSVlJv78oO3nP6bjkwsN1CpKUBICYhyzUVnq/1RMKFaD7F647JKxhLG4GD93u8Wb3n+oGzJAnL+5hx8RDl17uz9O+OW8ZV6PRhOpo5MTlssWV5+7n//9JLz/dMOfp9SjVIqJmDBwqN/e8VNJXd8bXxHcvu652sCBIOE9jUc05+1F/a6squrEK4vkXtDmGWbkqQkCpRCGPAwiK4JVtBMRv2lxZXb7nli0Vnzzu8ZjA7m4jZxML/tAGtNPop0cxOccMIJyf0+nPmPVIK+KMnf37Zp90zSglIadS9EueqGGqSFEKbQY97PjZuHkWmUzfZoovOfBPAkgPPPPntm5kO7We9vS8Y/QURfiNvWJ2ImqO4HLIRupOOQ8D0VdrYlUrvu3nkMEX5cKk2XGCWf1GR4lq6sXNPebuZGFkmPvGWKm2bi6k9p4QcKZY+vBoC+vy7YrHfc1H72fP+0r3S2xjKVqhs2SwgRkXA9H6m4vdtXPr3rk4x1HWoahiTteSFoOL+QRM3zdHtb/D1n/nzvjxPRo5uk3TOxJFCl7q/wPD1oWUZbJmm01tyQxYgStwKsDcPmfz5bOfzYU+b8urlfthWwelsCVpQSEqnf1112bmdbqryvY9sHJWL0yaTDU2xHIggkXC/AYLkeUlTdrJkLqIjGeKvRynBp3Xxe9K52WgwC+J/GdV7p+lP3Hdcq70zbZns98BuaFgBBpJXi1ozdBeDHnZ2jDy7I5XoU5/OCTin+9+9uP/WfEzpie9TqvkIzrGCtclYM1nHHFn399Rf+84GHHmUGzZu3ZDPJ9micrWn7G6w11k6dZgYMU0jTWt8ykmCG4LXrAzJ0zDJFe8o8DkBvFptCviu27BgtHowd/aUjf/Tg+fkTx//HB+RvWhPWB6tuoKgxL8yCDQNyUofxLSB/7/z5UajJtrRm306ARQBw9Q9nTZs4JfbZeNzaP+aEH03HMu2GwXC9AF7gaa/s64ilJEEgI3Ivj4HPpsr8fN7oKhQUETEVixqNQ2IkV9gFgLqLj1x72fGH7zEt86Cgkd2jmMJQEwnsgGxW7rvvpm2c3i4IFBGuLKufTx5nXAG4vD4fEDG0aRqiVg1vXNiz0O/tzRu77ro5ke1RMvW8S074QDIm9q7XAmZ6Y20t1hq68ag0oj4ED2s61CDQeKS5Jms1D7ZtfOn8/ImTKJdbPOqyMyQYAFasfC0OQJ1dvHLxjXNmfju2Y+tfpSAMJ3cTy3rdV1MnJr94903lb3R3X/wL5pKM6JJtQ94WphNHnia++arZx+z14fZ/7bhd4oqJ7fIAx1TtNddVg2VX+YHWgBAgMkAkMFx1/J0lmxspvoVNQkRJzdSIXl+tYxCBc7ke1d1dDKm7qJhL8punXP3Q8lW1Z2KONRw0ObyARGMNbeKr6O2FZgY9s2jo1hUD9T7TMAzmdXWHiaLOVw25tWUV94ZIS9q8AM1mVdEJ7eLYTNIWCqzWydtHhm+TPIsOxMbfRAATY+2hEhEpFYSdmVhy2hTjyOgZNy0mKvA8CwDNvyHvHDV73mPL+r2fp+KOZNYj4tCYXNfVnWm65OqLZk0GsnrjfSDHAGuLSm+jQH/S0Z3pmLDqtZpbrrkqCIiJmzWq3h281L+jhtCIzR81KGPG7dfOPvKqC84YF4WDRGk36174Cxr7Vg8aJEYkrRFLKcBK9aGnR+tNCm+ITP/e3rwsFm8cqHnBbXHHBkGrNyrdrJMxi+quvn/mKde+3ghJ2Jw5pO7uYnjGGUckUjHrkLrvAYwRye8MYlKCoASRIpAiYM2LoksQKSIoAGtUv9AgEQY+WtLyiGw2KzcVWLlRk7rv5YWa83mxZJn47vJVtUHbsmhEpQjh+prb0nbLduOcq4mIC4UZNAZY/wZRWgSB0swggyBko7j0u0aYmc4//+Rd/n2aXZ6YgV/ecOJ1H9yl/aY9pol//rZ0yg/y+W+PixpwFPXq+LaSJAITFcOrzvv2ni2Z2B4V12NwVIeJmFlKwb5PzwLgx3d6eJPXUjNl6IUlg9f1l+ua6I29tIk0uYFG36A/L0KwzauKMD+flwDoI+8b/8W2Vmei7ytFYo2qq4jHTSmkKYUU0jCltCxD2pY5fFmGIQ3DlCSENKUp444pNVYX4yIiUfUCnUlb7/3KZyd9cnMj3xdgucaMGTTrzItXLO/3v+9YhmhG1ze+Rw5W6mq7SckDb7v6pK8TbWo83BiHtYXUD96c/gHvGOkp5MwpUyecOHPmXmfNm/d48NYqdtHpfd8tp16/8+TkMf2DZd+2xYQd0qliak/r+I/cdMYvVgzyDTS7+GyTz8pmT4t97YsyOy5DP7NNclwfPKJEOCkNKrv6QQDA45sxqGJRN6Kzn/ztzac8OnVionuo6imiJsmsdMKJieWD9afm3dbe26hntnlke6OqaLuDYwStWVWUmdm2Jb262L/y5VdX3CelL6yYw3HbgG1HOKAAeJ6H0DOwatWASKfjmDipbebkjthBddfVaMZlMbRjSdFiyxMA9AKbHvkOAJTLNeYGVz1w5+A3J7fF9qjU/YiAJwazIPIDPXmcfdlPzj3m4Wx2wcptIRZrrM3XWwQYALhzh+mibq3qmjHxPeOBx1/fArXAR6ld5eneeYjZmcqcKRPixwwMVkMQLD9QHAR1lbDkhLbtnHNSmeC039/5nb8Q818V/E7HND7ekjJ2ClQI11vtYtcMjlmCVvTXVi547dX7AeD8h/s3a6MUChAAdMjGJUqjeySvTyBtmlLUvfCGRx8thr29MLAZpYibVUUvOHfWdMfmz9RqAYYrdjLrmGOK/kr4/AFHXXTSJt142rSH559/0AvpuDHZC8JGihHJWs3jRBwH5vPZqblc7tV8frMsGe7pWSiAHrWo/4ST21P2o5IAxc0QU4i6F4bjWuOde+7R9jOi4jHz5+eNpod9DLDG5M2YYyAiPLH41dR7d23Zfdz41I4AXgcKa1RN2CrfXYq8SHffctZXd92+5djly/tdBhxqZg4ChhsodoNQ25Lsljb7k9IQn2S24Pshaq6nmCHEGi2vOXTiCXPF0hXnFYu/HmAuSSCrN0c5LhaLipnp5M+f/NBBx9FL7Wm5o+dqzQAZUsoVA271lcV8KxAR9ZulXTWacEzbzT6stSVmDA26IYlo7ROgLcukatV9gJnpgQdOtiqVpRsFxWRygvGFL8zxhqrBr8e1xY/3/VCDIIhASnHY3uY4H95p0qEALmgmWm+q5HI9quEF/O97bzr1lp2nJI7oH6orajbhEGQMVupqQqt99G1zT7qru7t4/7s9u2MMsN4KUzAXRYG3OtakzraENVjzdgHwP406VVv1RKRcTjHnxZln/ulXKWvPz283PvX1gcFKqJhFo4FqA7hIakVcqXu6WS+LiUWDS2wALwDAb8/ErdeW1X+XO6bv0ogEz2nmzcZd7u0tGHMenON9Ojv7F5PbW4qeW9GAQCJmG8tWDP1u9tlXLt7kROuG9HYuoK6uospm81YmUT7U99UaLbyIiHxfUbniPdxIXVLF4pyNfk8+vw8BoL4V3m+ndgYnRP0GdVM7FEGg4STMo7LZ7MVdXQU1b96szdprhcICZma65CezvtOSNA+IO5T2QmhqNndlJmLNE9rtq/P5E6Zns521t0pz/3fIWET4WyCd05cTAFgx3jWVsGCb5ltKvBMV+aKLfl/9TO78w597deAax7GNlGMIAIqZFYM1N9xkEUdCBogMghDMYGbWzBwKEHe0JKxFK9z/edGZ9hXmks5mS3ptLZHBipkVOPqbOfoeWk8Z46bmtGTAv27VYKUqpQGQ1nU/RN+Ad82GbW3W0TNAMVit/u7onvX6KkkEzn62f5900prmekEQlSeNPmdIwQNDfvmZ5/WfIoAYXdR4sfioYgb+9nz/o6sqwVLLBqLnjBTquuuG6bic/qXPbPcJIuIpU2yx3vE23oPmkNahgere3oI8/fvzlixeWc3bMUcQc9B4JxoE1DwvGNcam/Ifu9g/Jirqnp6eDe5rIYjXfD+r3xFAagywtnXp6gIA2HFrD0MApqSdox/PeKtOQWaAmAkHHnnZ8QteGjykFhiPxxxHppOOdCxDSAIhUpOiTs8gBTCkJIo7lmhJxQ0WQj+/qHbF9y585XOzDppVa2goazyDaZpkGWYqk4zLVCpmpJMxmUo4ZiYVlyAzsx6zUDOX5PFnzF1Ur9Ovx7UljI7WpNVfDp459tS5jzAzrU+7IhaJTMqRCcey04mYTDq2lUnGJBFSADB1ahsDoFSczu3IxGCa0oxZpnAsUziWIcd1JI26H95TvHjeiqhe/ahNdAZK4qqreipD1XBOSzIlLYOkaYAsS5Bp2EZnS5zGtcozAGAapjU+RLF0MjY83nTCkcmYZaVTtsykW9fpiOnuLqpSKSsP/VbflYuXBX8e35G2Y44lEjFLxB1LJGK2pcIQO0xKnVK69qQvRlU01u+dDAUbqWRMplNxI52KyXQqJlOJmNmSciQRWsZMwjG80gDgWOKDYaAgiCZHtkP2LSNIqVHFvuGV+yWQv/uua/u/nE5aWcfCR0jwFMeQhmkZkoigQwU/FAh87ble+IIf6N8/9/qqm08489rHG7zcOs2OFUtdd2mH/uXQkGsHSkFAgMEcs0wqB/TK+ke4gJlBt9wgL0oO6HTctuEG4a0AVE9P7g15in19CxkAyq74y+sr3NbKkBeViCGt64EQVc/4CwC8771F/6yzjk2R6ax85uUV/zRt0yCwEwShY5vWymUDQ39+rSK/2wjo3aT3QZRT+XxeXPoSfnam2T++LSkOYS1jfhiwFLSsvLiuh8ocz+fzzq1/XuUDgKfon0v63PsqNU+Do5I2DM2xKtGE9l2faqwYDTy6BjguWDCdgaJ+aenZOSndS123vDMRScMUjTuQjpmeCBUfm82WHsxms3rtPMjp06dHsVy+vfSZl1fd65ialGqWh2eO2TYtGai9PIzHb0N5q0IIKJ/PU6FQ4HUt8vnz80Z3dzG867qTznjPjpkLy+V6iEZC6iapEYBKJSw5OBje+4mvXHDQ2gRkc5P98ubvThyX9J63TYqHijezESdry7LE0lX86S8edv4jGyA7CQAfccR+iWMPfN+z4zudSSsHvec++aULd6PVLrG3dHWsPdb999/fPuyru0+J2aLdpHB8IpGgV19dosZNmPza60v6Bo8/be6rzc3c+KzGO7vukjlx4kRzyZIltS150/2OOCLxrYP2tOfPf5yvvvq2/q20Xzc27wKrO+6Mke6bYIOsUb+qWCy+5W2ttz7ab3z9lEpZkcv1qIO73rerE5MTXS+E0pw+4ojPpwAM/TvG3QArKpWyIossKJfzHnzwwecBPL++z8yfnzd6e6FHUxmAS1n5hgDPbKRFbaxFWFRSKCcAYMGC6byxuKJ8Pi8KMxZSD1ZHPEVfNT3KkRy+b15I8UOtI+dAsGTJkiBqkTXs4XxTGzwC8luqv7/llupqDYyaz7TG86EnJ4bHOXKCsjm9EZOUo+edQeLQQ9V65m80WiIxl8T6NN1/d+/Btwywmostm82uVb8KdNOlJ8+oaFE74fRLX3wzxdfeTqKZUXU3XPiymb+WjKE7nbCpXK2xIJHZ74O7p2699cGhZsjDv0E4Aq6eYQ14xoyFBDTrDPQgm53OhQJQLBZ5U6oC0Or7bvohEAHHqInfYrGoi6O67xqbsGEEgbdU4nAu1xOFSDVCUhspUDz65+vZos+7sXf/Tk2YftOAte76VT049tiDUl/86A57tyTjnyPp79femnj/ikH+LoDzNr0i49tYwnBU/JVp6i+w1mAAphR6x+mT3k6nGBeLRd6UjfMOl61yWNJY6ZC3JWBRqdQoP9JVUEQ0XL/qxjnntLdmvC7bCL5sW7GuVEJOdmwJ1zVgGoA0yNuWJrfBmekLf3T8FMsQH695HgsSpFkDtbHFNyZjstUAK5/Pi0JhBhHl1GrCtoirz5+1y+QJyU8n4/Lztqk+low7HYYRh+eF8AJf+z40g7TtsBkF12070igvEu48VR7YkYk5AxUvkJJNQADxscU3JmOy1QCrUQkU2expsa8fID8Qk+H+lml81rL0B1vSMQvQ8LygmcoBAIKiulWCmMPIqtfb1OQ2zcGYJY9UWoOgiUjADxU9+fQLY7bDmIzJlgasZgb4ZT85Zvp7d+k4yzL1p2xT7pSMOwhDBdcLUKnWwohwJEFEcsyMH65uqW+44pQPtCStj1TqPjNISCEA0v1PvvDKAADQ2GSNyZiMWjYW6U6FQoGPOmofZ/qurXftODl+dNyWO4Xa54FyNay6vlKNPFUCybF66qslaiUFbkupk9NJS4BZAY2mVUzluXPvrY/N0piMyRbUsPL5PBGR/tGPjpgoSb9nxapKGDKIICSo8dkxDWGdWimQ0xf+6NAprRk7W6n5UfdigjakgFK0hIi4EXW+1ezkRkqLmD59OhcA9CxcSAumT+f1BfBu0r0B6slmRfN+zZ8XCgVqeBw3dv9h503TfC4UgB/+8Idaa01AgRrJ4Wg0x9jsYMj1laUe0axns57/Dfcb/qc3P7ZGaASva20tXLiQpk+fzgsXLiQgimBv/ix6F+v+7KifK5+nwoifFQoFLhQKw+NcuHAh9fSsO3iYASrk81sMFNaOwxsVh5UwUiSYFIiMqBL3GCg1VhvCdYQ1dHVBECH89Y3jT+7IxJKDQ7WolRQzCymgtXoZALZ2tYaRMT/FNRcB3kws3HBaTk/kfFkrIJg3BuZdXVG3l/WVQWkWG1x7bubPzxtdXUW1qePeGpULaAuFRmzq2DYWSNt8F5tTsWH4M8MhLmvck0c9L2t9/i3lsCIZBMhuLJNtswHpuk5TZsB1w3VsyIK66McvTW5JW7OqVZ+jRp2NLissUKmo596K4f3oe4fubAivRQiLU6kYAcCKgRXhtOn7LSU6dRk2Ly2IiIj32uuA+HGHTNgdMPsnb79dFQAc2+LHnvhXm3RrS845v2dw5P2ZQegpCcrlVLEIPW3aNPu8cw/+QEuCP2KaYnoY+jvF4naiWnNTjm25nqc9KaznteS/rRgQf/7asT/9WzN4dVNqPt1wQ96xQysTBj57vk9IAHZgccb06TVvsHrSSVdVNsPel3u9+GLS9/uEEBEoBIESwEcrCxf2jLq569yZM80V7arNskz2/QECErAsj03LJvK3q59SLL4hE+Kc0w/dNZPQKaXqrPVI7SwO39XuFw/Yf8VPLv11mYhqm/Ne995779jx3/zwexY//6IYKJf9PfbsXjmus1W98NKL9nPPvNRistZGwrQH/MRzc+bcOrT2Grr22rNSr73w8hR3ZUXCtDaPp1KCQaHgmHTPu+ju50YC71jy8xaWKPSD9D03nvyDzhY7NThYUySEbOQeC98PUVX+34HVCbxbWubPz8vu7mK4204Tv7rLlPj5Q+U6DMMAmBGErUgl+qr33nrG9QceftHJm2KWRqEtBf75hbN33HkH56GkLae5YeBLOeADDENI/sh7O2JPvFD+IIAn8/k8FYvFEaZvTl1/6axdJnY6M+OO8SXHNqclYwaINLQ2oZiRsBMAASIJSCE+CYhjkmaAR+8+/V/lmr71r4/Xrs3l5q2ITKn1mz7N/NSpSRzUmnavq1brIQAj2l5+mE46RrDEvBzA95q/O4p5Nbq7i+GNn5owe9cjd/xuuVJlBkkQmAAyzcTQS6+f9bljT71gg63jm4C7434T93iv6c73Ao8FJjbLrKp4zJJL+vr/CGD/5tw1//7knpN+PqHT+VS54kKuFSUUKoZ0Xyqfedzuyw85cMfPHTXz8hcbJroezXs9vzBr6odmpB5KJcRuO7btCqUAw6zVBOp6+vaWsevkaQ40sxO36LEnVxwM4DfN1LPm3Exrt879wHa7nDs4WNVCiM2qBsMMWKaAG9CSefPmTQNQa1oEY+VlNp/DARMgpOCRC1FQTt1wxTc/MKHNObZcdTVEVCSPGWwYJIYqfr1/sf/P6KAubRVzsNmtpX8QN9eqXi3uSBbQLAWzYxnMup6Y3O7MvvXykz5CVNSjbZTQAGOeNME6d/tJ8WmawsCxhGVJTkriZCZhpoTW/3vGOfOeZI42bD6fN4iK+vjjv9j6u9tOu/Q9O6b/MXVS6sx0wpimtc9DlVo4WHbDoZqnavVA1eq+rtcDVa0FaqjshUPlWsg65EzceO+OE5Pn7feplidu//kJJxERE0W5dRsas+2wGbORNA3OODYlHYuShsEZx5ZJUyO2OfNrm0FHZ5vT2ZKOjetsi7d3tsY72lti7W1psWNQX7o9AERpThsW0wqMeEIkkzEjlYgbyUTcSDq2zCTjZlKQ19mY9TUAOR6XgW0yO7YITZN45BWPCWhVT03uiO3cmTQuIiIezTgiCoN4153iZ+wwKbUbqzCwTMHxmIRtcNyUOmmb7MRjAomk1I4pWJj+Og8K02An6RhIxKWOxwQ27yKOxyQSMYmJExevqX1tygYdkzfOilKBBIAFC5ZTNpsFA2J8W/yqRMwwlGZe7ZVgti0TXoCFs4vXL96aVSGb3VpmnX7pkiFX/zbmWEBUKI40mPyQAstibm+3jgFW5ztujIwlyqn87MPTcZu/PDBU11qxoRRzqJihKQy0RqVuzAOA3gJEVGO8GN581bf3PuKz7//zlEnxU6TU8aGhWlj3Ax3VOm0WCyQJQFJUBVUCiBw7RAYIVHMDPVSuhjELE9+3c+uc35XOuDufPyHZAEWx/tNacxAq1owwCDUHoWZmCoNQsxDYrHw6LURQ9zSHSgd1L2TXC9kPlPICpaVljvqezJqDQHGotA5CFY1T6zAIQ2amddbGUhqkGaQ4+nvkpSI/tF41MKRb4ubnL/vZzJ1zuR61EVCnffcthvl8NtmWkIcMDdW1Zsjofoyw8X5DBVYKUCoawwa0I60UY/h339T1xu0xKsBavmwQOuSxmKER70UIYtfTun+w9mp0oo4TRDl153UnHj9lQuqj5ZqrGptweJ2b0oAO9R8iwr2wVdsyLVgQgVC54l0XBkzNd914g4brKrJsfUj+lINburuL4cZcKb3zozZZ79+j/QudrfGOIFAsBBFRVL/TsshY0e/2/e3xxfdHxzbQ3V0Mr/rZkdlddsj8IZnALgMDbqgUuAFQYgTZy8xagzkEcxgFGkONTB6Oal2R4QYBl8v1cOq4xJe63ht/9MQTD5q0MdCKWjExUdSwefi/N9d9RKxIRNVZSVBDIvQVkYdz04ij5hCpMcLo7/WPjdZ3Rf8htBa6LWNZu0xKHdXUoDZEHzAD758y8YC2jDPJDX0miozN5kONuIabyW74mdZ9RcYeawYziPX6LhLQAGteh7k/Sg3LXmu6tnFjUCNoS8dkxVW/ObN457OPzZ1pHprr8a+46IRpUzrjP/XqrgavaW4Tsai4IXxh37M1+asRnh3FDLr+iRfnryqHzzuOIbhRNpgIFISBam+Jd0yfvt3BEYDm5UbMBg2AMynrSBIaI/e6AFQsZqFcCX9VnHPr0L/+lbe6u4vh7XNP/9gH3zPxVgMcr9Q9RQLGyFi9qDQzK8MgiscckU46RjrlGMlUzIjFDWkakgCo1QXjCYIEgchYNVgJxnc4H/xq17S7Z848ID5jxkJ6q/zXhrH1mZQ30yGcCaLu+4jH+BsXnXZarKurqNa3cYezMeLGLCLNq8tpbXmxTEkxxxQx2yTHNsX6Lts0ZMwxhSHI3kwv4Zg0t5jWCNvSjvXK4vqT//vn5Scw58Xjjy8BA/Se7WI3p+JGslx1FdEIwpFZ27YtVg66r918z6J/EIBGEbytOtje3rzx4Jyid+KH3nPH+I7E91030ECzyiVBAJxJyqMB3NhcuOsjZYmK+rKfzdw5ZtFnqjU/cnc29wCRLFd8Xa3zXADU1wedP+OIcRPacJdjC7Pm+ko0O700m7wzqZhtSMM0MFAOKkND3gss8VyolW8Im4jCHSwpZ7RkYunA9+H5oSIBicY+FkTmwGA9mDQu/pEDPrrT1QflLj8q4uK2fscYw9j628aU0t/cz0bdoUPVlo5tv+PuQwcSoTQ/nze6i2s6FrjxXq+7bPb0loT8ZLXugyJzfIuLEITBStDv+6oeKZUbBEU2DUleSMvdtbiyMcAa/YkHggjaMnFz6Urv0QXL/IP+69Jbhz7wsbyVy83zf33TGRdN6ozvPViuhkTCWFsncyxT1KrVu3t6euqj9Uq9WWk2d3h+6dAtrRnzbFOSoZjRsDdkre5xMhn7+O1zv7czUfGF9Xm2mm2ytmu3j2xpsa2hZlxZ9HQqHjflilXB/x12wpy/8/y8Qd3F8P7bTv7RhM7ExFUD1VCIEdVj2YCEVomUJVcN+M/1l905Q17q7iNnFl9f+3vnzj114nau+krC5u+2tziTquVQgUgyhY1tCXNgsBZOnZT6xo1zvt2Ty11z31vT5ipcj6G2ZQ5FIkIqk1wJAI1ihpv1PETgeNqYBaDUaCS75vrogkARemK7PC6TtuXQUDXEWmt3C22eMB6LGX3l4PQDjrj1zo99bKrxpz+9Oor1Lxl4xW0+yxhgjZZk1cxSkk4n4+ary2qls/7roWOfeOKJ6m8vm21/IVf0Slef8o3tJ9inlyu1kAkGrbH8GAJCDlTqevEyvh4A+q5a+Jb4MIqrOys/8/vbz3ykZVz8s0PVqoqaiDK0hmpLWWa5UjsSQKEJTG8ErILaZx8YLelqNgh8MEa0yWJmQRZWDdVvin65oH5d8qa1x9VR5XJdk1iDxwNRoOJOXL7e584t/a7/rOuvv77c5D30nSUZteWawY0qoEsAXHnuyV+7q/sTk38xuc3ef7C6JjeoQURC8cQO5yfYBw8uWDB9q2fYW5bzBiKHG2lXLZnkm3WZNOeVNh0XMFzum5hkpV7nTNzc5+arZ00nKi7kfF40q7AyQGLfYjhz5mcyjoUj6q4HDSHF6kN2OJJ0S81ba9Jxgdfrf/zja5vtcBoLa9gYWDErxzLIskz5zCv9P/3c1y489Mknn6iWSnnrC6fM8W695pSPbj8l9vMw9JXiKEB0LUJBJRMWqjX+w/HnXvFP5rzI9byFjS57ZhAAcr3wWq010TC1RmBA+IEPaegj999/f3tdXEfUSYZw/GGrPtmStKbX3VA3PHlgBkvTMFaurA/97Ynldzc9n7JWPSOdsG0VMdAjOCuoVDwmX15cvXz/Qy/69g03XF+ePz9vMDMxRz0Uu7uLIVFORalLTPPn543zLr9j2WdzDxy8ZMB7NBm3pdZaj9jeslrzubM1/v7bsjM/UyyOPkxjc8URYrhJ4zoMxi3yHZuCEgxAEmAagqJhNWZds8okbdmeiM8c1qia2lWDbN/ng7t8paMtOS4IlBLDNZ0BQQTLNIi34NEaKpYAqNGjkUZ5jQHWaE8rMIeZpCPdAKuef6Wa/fLRc85lzotrrplp5nJF/4KfHD59x8nOPYYByws0rSv5WxDDV6CVQ9WLIhV/xlvrtcjlNAH82Ev+gysG6ktsS8gmiU1Eou4Fur3F3unQA6Z2E0U16Ed+PMrhBifj/E3HiWi8EZtKxWMm3FD3nHf5HcsA4IgjjkjYjvll1/UQ0WTDopIxSy7uc/9y4NGXnsJckj/4QV5EALXu05aIuLu7GObz+xjAQv+vT7507FA1qJrRRuIRnI22LMHpdPzoaMzZrX2MbVWeFABIkB7tOjUNgSAUK8suP+dYBjffL7OQdc+F49DX87MPTzdoCBpJtnekrW8CquFEadSFEgJBoP3BSvi6aQiMnOs3JwrMwF5Y3SVjnRcPTwSPAdZGl4oAMyspQel0zFgxFD782DP1j+Rmzrlr/vy8USj0ilmz5gXXzjlx0sfeN+WehEPjPC9QzS7KI09IBlQsbssly8p/+9rMax5mzovN6V78Jk9qfmR+3igWr6p4Ht3p2A7WaGjK0DHT4AltsSMB8MjNHmlMOZXPf3lc2nEOqNV98MhQDWJRrzMGBu0bmgCz/8dbPpBJGeP9QOmR64ugyQsYi4fCMyLg3nhe3GrT9tFw/vy8cW7xVy8OuurqZMymkc/ADOl5PsUc/uTMAw6IE+XUs88u2WoHw2YGcG+SblWreckIfKfzxlatFAIkMbB8VXARiGhYzxKaPF+rjjZn3Iz3Zb4CRGEMpWxU+qh0/Wnva0k5e9dqPmM12a4SCYNrLv67Wlf3JBM21tcAd1PFkIYiAu81c6KiKO563dcGckXHOKw1zD+wRKjSiZhRqfvu84sqPzz4iMvOi0yjrOzrW8jF4qNqzvknTtptSvzhVJx2KVe9ER6wNTkNgyXCkLCkPzwXgOrpWSj/Hc/VDKF4dZF3c0tankIjxssgWa27lHCML1z2k2M6iXJ9zTSIZsXUGdtPPqStzU6XK25IjSodzKzjcVMsW1lb8LXjW/5fk2xPJ8y94jEL5XKo0QRx1joWs8TSvvqCo2Zd/qeG6ag29RmYmW686pSbO2L+6UQkG/0eQALkhwqOZU768GfGT5t3H55obZ241QDLMaytWqSEmVGtuY2mswUGNtx2QikNkG556vXFv+5IT/xOe0tsp7obaCIhmvFPmWTsW2h4g3sxXaAHsEidnEwYYqgcDDtRmBlCmlTz3GtSSf2hLRl7WXNVvPSvknXvvQuM3142W02d2PYGYFqIGcB0YEHPgnBdB9o2r2E1NCEGcxg3BSWScWNZv//ogpfKex98xGXnMTPl83nRuWA65XI96rY5J07a8z3xh1uS1u6VqheuC6wi8COVStpy6cra3d885eqHSqXSW+C9Wp9V2KOY82LW2Vf+rVbXf0rGbOKG54kIpEIdtmWclu3Hp74KrI7JapoNncn4YVorjAxmJEAb0kClFv4CKOrexuFnmWr6Oiw8bZomPMW/B6A3J2g2l+vRRMRzrnefKnvBq7YtiUfYZsxQ8biFyRPatgOAZHLVOzpgcLQmYVMjY0V2sdizNCDzGtuyQeAmuS5rNR8tKbH3HTedMYOoqPfdtxied87xrS0JeYjrBsNaMzPYMqVcsbI2MPfO8D4AaaW3gPlLZFRrLhyjdvF2L/z1uQ6uPt26vf1s2ao+t/a1nf3nZ3ZZ8q/nPvE+Y98mh7rJgOV63ru2uDGzVgaBMumYUVd4/dmXh074dPbCruNOnvvP+fPzBhHxpElLZHexGJ73w9we22+f7k0njN3L1foI1/4biHp2LIGVQ7Xqs6/2n87MtGDBgn9rdlOztlTVV78QJEAMbuIPg4gVw0ka34iAqqCaFVNvueKUDzgJ2rtW9xncXNjE0hBG/6BbeWVxcCsApJ5dogAgFY+n1u5uRSSgQkbdU/+IBrO5ikdePP74vCDwwhdNKRt+g9X/bEhCeagyFQBiy9q2GmDVfP/ttIKjP4nVY7/Jx199vXxL/2C9LqWQ4ChqjZlVKmGJhAiPbwAT3vMeO9vZHm/xA6Ui7pUBsIo7NsrV8J4HH5zjgaUDpi20zxiOJTO2RVNti6aYtpi6zsvADjFTT7W4kgDe0N1ydIA1OLgMjRMW75asQo4qgHIqFTNCLbwXX69fcd8T7gcPOW7O1U2tqru7qHh+3pg1a15w7WXHd39qj+3/kHT0LuWqp2gDnakFoBzblotX+Oecdu6NL6OnR4yWr9la0vAA4l+vBXcvH6wPGqYwmHUjhhOy4rqcSZgfuX7Oie8jIp6O6RIAMi3i2HTckMxQaGhOBKUTMQvVunrg9O/PW8KlrNxr5kQFAAOD1fHMWI2GADRYBFqjJZN8DQD6ZmxeWEcTdE3TeE0IAq3RoTQqyGeaMvUWkAfgrboNCEpvWmECAnQZiM86fd6SVUPuA4m4Q2hwTxoka56HuIHDzznn0+0AELPV8VrpEZhPEILEYDXk5X3htQ0Q3KJrNgg1+0Go/UDpIAjXeYWKAy8INdO6daRRToqD1R7Gd35qTq1Wg2kaKQiTlvWFt//9mcpHDjjy4tnnfW9O3/x8pFU1TwXqLoZ33XDK0e/dIfVQzBLt1Xqg1mcGEgBoHWbScePVxZXf5r51xRXz5+cNyv37m1YSgZlL8rvfvXJltRb+OmlbGDYLow2vMklLTmyLHQ4AM7II87MPTycsOtSrh+A1IqCJfF9j+ZB/PQDqQRbNqgJ+EMTXfUAAge9vkW1uOlZtXVk4DEa1uvX7p/lab9V9QARkkrFGq/vCqL+oXC6DGbSyH1fU3XDYSysI5AdaTRyXznx0t/fuO+/CE3ftaE1+oOK5etgcBKu4bYtyzf3LMadf8f8AgHjLGlZE0ODmxeu8mKGhSQdC85sALLxLwCoa/6svLwpfX+b3PPHUqn0/87WfHXbid65+grkkI3wqhvPzeaNYLGoiovtvO+2Cads5N5DUsu77mtYDVgCgWGsnZhorBtxX//WcewwzUzPa/O0gPT1Rk9QB15pX9RRGBGWBCcL1PBhGeNgJJ2STREV+/x4TvtDRGh/nhYFqBhAyQzuOIVYM1l+49w99jzADuVxumJfq7Gh5hQhRRvQI7UcSwQ+18+a0xBkMANVybVzD104jNzkzw3bMvugnL2+1eXT9cB0ri6A1o1KpbJHviDlWLXpnC0e96UTGUkTgo0+Z8+iqSvC3eMwWzdb1BIKG5liMv9nZLs6JOwTWYjXuM4OEQHkI12IrxG0wM+KOJTOpuJFOxY10OmGkU4no7+aVShippGNnMjFDSFpn9b93qZeQ16tlAMD3zuvpA5CLSL2sXLBgOhPlFDOIuSSJcuF5+Vk7fPT9rT/vbDU/M1StKa1ZCFq/P1trsG1KeD77T71a/fpZxWuWbz9jpSwWe942LcEj8p2JCoX/90im8kRHi/3+St3XRCQIJDw/VJ0tsSmfeN/E/a4C7k4n1TdFA3lW69daW5YjBsvl23p6evze3rwxsou3W/c8SsXfYK6YhhCh708DQKMpZ7NuyWoAMAxjktZ6jWhzBpEOCclYfDkA1Ment5rR5rrr57BCFW6Rtev6oVgXhzNam7VcUfMmtctriKAbeZ+yUqkjbhufjVvAYNkDEYbJdts05Yr+2qpnX1j+yy3fa4C1ZZlicV9tfhCEz4OEwHpMPs3MyVhAK8r1FwAAa3G/bx1gEUO+nSCN86KnZyE1PXeRKVgMgZz69Y3f+Upbmua2pUTHULkaMpEhNuDejYL3WEnDNp56pv+4Wadc/ae3Kl9w03mggkSxGFZ+cerN4ztiFxD81fFSDDYtye0dxpdOPPHYP8cdc99q3WMa9iIxS0myfzDwlg/hFw1eaY2F5wbhi+v0+RMjmTQ+BICbmtKmva+ohO/xxx/WahjGbl6gAWbR/C4Cy5rr8fIB9ToATK20bTXAKlc8wes9uEbPUksp+A1pgg0urn+w2jgcswB6NnmuTjrplbvakjv9Vzop2rxAc1QGiCBlUxsdAfWAcmLSWLwiKJ3709v69/5c3gHgbkG7RtuWKSqeuix77GW/3qTPbk4TincYmc6jaVLQPEEa5WFBRGE+f1zbx96TurCzzTiGVYjBiqdICGNDt2MGGxKh48TNp1+unXrkyVffMnfuTLO7uxi8HeenCTCPP7WylEmbP4xZwgkVNxe09NyAHIl9uz4Q+1k6ZlLZdXXkRSIQsUo4Cbloef0PJ5x+9YtrnMS90f0rtWBBEKg1Gi4yk/S8ELYpPztz5gFxIFvHJtaT7y3kJXNB3fHzUz7eljbbar6nCFHpaWhiwxY0WAlXvfT0ypcB4I/9S7YaYMVts3/d/WKATDo5ao16cMi14m3m2pubiQi2ZS/DZqpYjz8+07jyynkrP/fhU24d1+nM9gNPjdzrIx0GjbQeWa6yKnvO1QBQf2IVb4V9CVtyev78vIGXYWAHhBs2/wtqXRkQb2EcFmPJ8lWdW9EIVMQ6jFsGeRzZv9mNnEKNipiaiPSvrzs199m9Oh6bMiFxjO+7yg0Uk2S5oT2lNVgK1jEnZv7j6eU/zH3z4svmN7yKb1dALxaLmktZWTz/5lfDQN2XiNvD3iQikBcoWIbYbsqE+OFVz0WUN9jUYoiUZuovl38BYLgNVwOvNAC8vpz+MlTxXSlIopkCJECeH6jOtuSEz/zHtCOIiOfOnblJh2VXVxRJ35o2TjAMAJrR9FoysbYsi+s+/lmcc+sQc17suuvErQZYO26//RJAr0HpMsCOKWE5cgIzb9Ds7eycTswgL/B3sE0JsY5qDPFYsj86YBZssvl8773PMAD01fU15XIQkoDcwGSoWCxOQ0PeXw771nlPMOdF7P1tW4nGINXdXQzxMsLu7uIGr/Wla72lgaNhoMwtC1KswRwSAcmYJePxuL2yrPuWr3BvYQatR5GmKL4K3N1dDOddfMKM39125v3bbxe/07F4x/6humImKajRWmD9J4Y2DWbTjsl/vTB07jdOmpdnLsm3oxm4thQa1Uj7huQvvFCttQ64oaeu2c9NM0dBhYOVRY88jvsJ4O7uoloDCDkvzvzPq1+r1tXfHMdk0OrgRyZQ6Ht6cpv5wx9/d+bEWbPmBXPnzhzVeiiV8hZ1F8Mbr5z5lXEt9ufLVW8N54dgYiJQ6POvGlrk1lnXDS3y9UXLDa3XShxlsJQCMUN8djSVCIjAcUN8TK6HFq1Vyys3+/0WehVzXhx3/JyFA+Xw0UTcAtZbooZAQmOg6v98q87dFpK31CTc3D54I9RlMIOZWBMItmVIxzbEYNnD8n7vj5W6uPHv/xy6u3jxvBWHfgs0MrKcAerN52V3MULwfH5mx4enxc/paLG/nYwbiUrVVcxMYgNewMbrhWKtHEtKFUq8ssj95tdnXX5dBIK5tz1YNcBFMYOO7lr+SPvxra+0t5rbu57SI8oWr6tJqHJsxwj7+ZZ58y6rrYuja/ZZrNXcGwQlP8a8uqw2gUTdVzqdNMd/cq/WX5522nEHzJo1bxWXsrJ3wXTqAjQaTUABBgoF6u2CaDRR9a+84PgP77xd5nroqCj7cGEBBhsmy/6BYGjxCrenaU5sPJqewQTBXJLPPbdEMpc2ujbnzXuYAKDqh6+4gQ9mkpGWR1GKU83jTNr4aj5/1A+7u4svP/bYTHOvveaFq6v6A/PmzTS6u4vBaacd15aMW4fWXY81SI5MIWCtYRjW4jeFrYXoXfQNefMmdSY+Tetoz8fMbFuGXLnK7Xv8r8t/BQBd3UXVKIe9FegaiHx+H+NlvGzk8/uMRq8GAD0yhvEdw2E13LNaSjbiTlyGrDBU1q8MDqieJatqdxx+wtWPN3+3WSGzafr19uYldRdDFIvhEWcckTh27/HHGSbOaU/HJ1aqdQxVAkVEcjQJYlqrMJVwjMGKLr+2vPL1w2Zdcf/bmbNa33T29uaNGx8tugcdNfv2SeMT53huXa9VXWFNVVxADlU9tXKVuHldZDsAdHdHQFg4UdzRmnHzrRlj0shyNIJIlKuebk8nPnrwJ1v/tOeuJ86m3JW/H4GkI/GS0ajNdc9Npx/enjKujtsqVXNDlmJEfyvWKpFIGANlb94JZ12zvJGdEM6fn9/A00dahad1nSinMPoCeQoAaivH/72+XW1pwpETgjDQUWl3Jj9UOhO30/vM6Lz1qKMO/uKHPjRvACPIumh5zQuAfYwDPtZ6XWvabKvUPLVmbifLal1hRVU/BWx+Ke3uYlSnv3B09TeT2+Mvt2TMHVwvGHkoRYeQYxp9A+Et58/rGZzfyAedv1W0FUALqhSLj4bAo6M82B/992pYm2zwMTGBFQgiHjOFaRiivxzUBleo+YPl+s13/j24v+eqqBEmM1NvoSC7CgVFRDoi02dQtCCLYf6EfHLvfcpHJW1xamvKmeZ5HoaGaiETS9qIVtU0iQRIt2biRt9g+I+/PT945KlnXfOvhqbxTgKrNcj3VTXjusGyf7oUZK4vHpIBlXQcubSv+n+HnXTZgg24vbm3kDeKVxUrt7/vpMK4jpZr654KRpqcQghRrtVUJmHt9p4piYfml8743UDN/ZWA/L+XF5WXIJkdqiy9qeUDM7Yf5/n1fTIJ4/C2FntvFQaouYqNZudSNGPCTLF8hdv/96f6LmJmKhQKeuMrC7JeY6RNPqRn3vG7SINpnR3Nm0qJFiqVsOWzrwz+5oRzbriVqFj53S1nPtDRYh0TlIMG0BOkYDFUr+v21vjHjjlo2v99ad9T8s+/6M0/q3hNPzCdLv3JZ1onj6OPt2XonM6M8+FKtaqJxAiwgrYtk4Yq4WuPLXz9SdCbK6Xd25uXxRuL7n2fPuXmCZ3Of3puuMahRERyYMjn15bVf/FmwHHj802kQg2/PrDvpT8+1LRISI1Qb1hBEew4MdE3SC9/90c3/LmZkP+2AqxQh5HJB1IAyDSFjDuW4dY1Vg0FT3q+f/uqAfvOw0/46YvNz8yfnze6eqEp4ktUacZCwZxnoqIuFoF8/oQJH3iPdey4hH9MJhGb5gchhio1xVGVEIM2GgzL0MzKNqQ0bUu+trR+4z2/ck+6queaSj7/9gxdGDX5HgHP87+/87TeiR3OfkMVb+1OPw1dh5lIoL8a/mKk6be+kz0qU3zF9ffeevqXd50c++LKgVpAQpiNxQsQyaiaAKijzf5ce5vzuUrNQ0uqbdCQ/zMYTJ7cYls6nUykwTpEteZqBpFcA6yYpSBlSsNc3t9//HeKNy7dYUZtVHFvJEBe4GNcR2LXKZax68Z6mSul0dYax0DV7SPCLcygn19QuzydwtFSSgoVR6ECIBBJUam5OpM0d8ukrDs6kkb/Azef2E+GoLhttaXiVkZIjUqtqmntuD7NOuaYxqJl9dsvueTNl9JuHkovLO2/MZM2zrYlmWGzAy1YJWKOfG1p5U/fOvXqJxtrYWvFDErX87Hz1NbZu+zQPntUqqzSaE0n8fi/Fj0MYD+gJICcelsBluu6RASKOaZtSIHBstdXroX3vL5koOcbs+c+0lTJoxiqGZTN5TR1F8N8Pi+aL7fJW/3iypPfP6ndOi7m4LC2VKzD810MVbQCMRGN4Aw2plUR60wyIcsV1f/SsvKZ2WPnXA8ApWxW5orvTLBai3Pi/gH/xvFt8c8SETjadiPmAGyZhrFyyF2x6HXjrogj2vDCXrBgOjMzfnruuUe2JPUf2jPxPQeG6gERmSNOdwEA5ZqvCAxBJOMxkREUZixTQGmNSrUWMkMQiTV6HGtmlkQqnUqYz7226rzct66+k0sluSkpUEQE1w+05wWj0WBCKWEAXAWABx6Ybc38zpx//Pq6k+e9Z+fWWSsGhwKCGH42QSQiQCaOOdSaTiZbwQKBCuB6dR0B25pgpVnrmG3JvlVu3+MvLr2kgSvqzR5K0eFx0wv333LKw1MnJb5QKXshCAYxoElgsMbXRBQBJLZuZUIEQahHWxqZmZXve1JKXf03mYSEjbVhMqTjB6HAysHaH2oubn3yqfC+7513UV/zpH9kft7o7YWOWneDekolwdkFTW1K73PUUc4pXS0HJuLmcUmHPtOSsmTdDTBUqYZMECPV743ZDGAObVsYlmXJ5Svd3z79enV2FHuUlUCPJupRpVJJZrM5/WadCf8uaXj5+OHHl9/f0WItb0lZnV4YrlF4D2AVty25YrB+z2nFywYamQBqYxsFgCj+9Kf9t96a/yxr94HOlsSHBstVFTUII7k6VAKysTYQBrpZcLJRvZWMkbQiMzFYK9skw3bixiuLvJ8ddOQV3424l013eBBIbIi3G8kWg8gAR787bpynmfOiUOg7M5ka+uSEDmf64JAXkHgjIAehZj9UzSwiWht8IxqOlWVKocmgZX3hMcViz9IZM3Iyl8Ob1ng6Gx7hoXIwTwX0BRBTw/SUqwaqix97tv9XDBB1F9+CjAwSo00aZ44KMzKv+X6Mtw6uAB2oxDp9AY0T21XyrqcW13sPO/qSJ1YPvCR7enqQy/XoqOFnXnR1rY5KB4B5F58wY9p2yUNMW389FbN3E4ZGvephsOwqgAURGcPFqkeB7JKETKYdY0W/v2zJCu/sA4+86EZgdTQ85/OCuYiNbdx3Avne0EwH99/7xFsnjU+f5g4OeaDV2gKIueaFtLhf3QSszkcclcmZzws6vLjijDOO6PrsXhOuHtduHimEQC3q26gZJBqtRIddiVirvUOUMshMIC2EMlKJuDFY9isvvLTqrEO/eeU1XMpGDpX1v08GcwggfBMlFqLPNtJJyuWJXCgAxeJVlcsv/+YBjuP8vj3t7NxfcUMGCExi9TM1ereua1yAJgJSSUdWam744qIVxx0+a+79G+r8Q1Gd4RAM1QgBZUQNK8L1mOiRR/jo6u/GdVivtaWtSTU39Gxb2vUVdPtFF91SPWB+3sA65pA19BvnjhSYWet1JydzlMT8ZucbYKgojm9NLfMtA6zo7eh1VzloaCjfnH3lYgCLmZnQ0yOQzWoiUlEzgoLcd99i2CB7dT4/O7337onP2WZwtClpv7a0ZXqBj7rrKjCBiUSUK0WjGBuBWCsiUCppy6FaqF5eUr3293/pK1566a1LotMU6CoUFRcaGkYRuH3u7OOffWnZY/mflv66vhZZ7wTyPZ/Pi5eeX3pRe6Z62KRxqfF1NwARQSmNTMqRT724csGx85ducqVQanRkLhaL1YuAb9x6zeye7drj300kYnvHHBJ+EMIPFLTWmpg1INAMEojCDkgYUgjLMskyDDFQCYMVq/Ttf31m+Xlnfu/Gp0ujMAMFyM6kYwazNqTcPG+9UtrIpONgXpV8AyCfXHwpf/aR+3Z9aLur2zPxL0AouG4ApXTUyXitWD4CgcHSMg1ybEMGClhVCf/nH08vP+eUc275E5eykjZc6LElk44ZTL4hBYGZYRoSKwZqHYZh07q3XkneeGPOPfBTJ182dWLiQlPWY3VXYcnS6vUA0LWeBH0ipDKZmKG0NmSjnw4zG45twRSWtR5bO5lJx4xAK8OQmx/SFc15DIIo85YDFgOaoDkWsysb0W4IhQI1CHRdKmUFl7JobJIQAO6Yd9rerSl9WDxmfSmdoClCWKjVfAyVayGjAVI0+hbAUTKXomTCll7AWLrKvf/VRap47KmX/xUAuFSSRDk9P5+XRAiBnLr+wuM/Nm3HxI9bW2Pdr7362ucAYMaMhe/IUhYR+c5ERIvmXjizyw/ESUHg7m5YQsQsm1cOlgeff7G/gJ4eVSgUNrktcLFY1JHWkSei4r0A7r3r2rO64453mONYnzQE75yIW4ZtGILE6jAs1gQ3DFGvK7fihk/V6rWHVq00b/nGqRf9C4iS1jdUH79ZLbVaNZ9a2le7rlrzFJjlJhccYYCJVF1JWVaqd+S9RwDyq0Xgi3ffcOZXk0k6ISZ570TCiVsGiaZBEzWxiZyRbj1Epa5WDFTq/91f4Zuyx1766+YzrR+solLJQ6EuLVnhPlGvupoJgkFsCCI/NGo+TXLXjSE5lc/nxSHHFS+556bTMtuNj3/qxSUDfzzurLkLG+9er2vuVgzioedfH3CrNVdpZgkAEkIbpi2q9fCFJl858jMVj3sXraxalbKraHPme7WXULshiYrP/2wwo4yNOEfQ1BqOOewTO33tgD2fbcvEZBAqJhrdMJihCVrHHNNgYeGZFyv7fW3WpQ9vSOXN5/OiqwtipHfksstmb7fbuNiXTCP4RsIxPpxJmKi7IbxQqahwFcRoxxQ5SBgMVoKI4nFLqJDQXw7+e9HywZ8deeK8+5umKJDTKOQJhQITEZ977jGd++7R+oNEzDgxmZBUrQfqv//07H5nn/eb+W9NA8+teKg03MZb8ztKpaw89NAeNcJSMH5+xXE7pKzkzuPGxTpWLOub4tjxeN2tu22d41/pX1VfvnRg6PmTz7r2pZH3WLBgOr+dtNlmW/kmoXzFj07YfvudEjNMEe4Uc2QnhAAxU3+/F9ix1Iv9teUv/eVJ/fQll1y3qqHJ4Ac/eOs1dG7kQb+T1ulW0bA0gyVD2bZhmKYUQ+XgpddXDBW/Nuvyh/P5vMjl3kDwUamUFdns9GECHXvtZd518qf2S9vqGMc2P9eatlJaC9TqPg+UlWrEvkTePhr1wmKCVoKEEU9Y0vOAvgH16KpqeGH2qIvva3ogCwUAyGmgJKiYUygWUfrFqTMnZGS+o8WZNFipc7WmAiJpCiHf+RUNG2Z587BYo219zwwqLFiwRQCiCeilUlZms1kQ5cJvnXTd8wCe38jY8MgjkcNlHWtno2CyOTXk12c+r2semkAVPVdJE9ErAF7Z6NhKWdnTmJfRzm+plJXry1McTQgEl0oS2QXc07OQNmJ6gjkv1peq09VVVOs64Db0mc2Rvr6FPFIR2OKAxczKMkgmYzFj5WDw0qq++qU33/v69T09PZW1eZ7mYhoZjnD9pSfvMq5DHtkSMw6JJ2l3y4ij5nooV2qqQWEK0KaNm5l1VJNJGknHNlaWXX69z3tw+VD5sqNmXvu75lh6enKCqLiG+ffzi0/6+M7bx37cnrG6lB9iYLCuopAgyHdLueiR5tu6Oj9vaYnedQ8AUD6fpxkzFq4zWbivbyE3tanNjUdqgMlbEn4SPRchn8+LGTNmUGfnuhOX+/oWcjYbeZo3F/Q3+2DapNCPiC/etPne9M+8pRpWRCJqKGY2SOh0MiaH6kH/S8vdy373QN9ll91448BqziE6HZsnORFF3oTpWeuX5+68f8YOjnVM2r8lY9lBoOC6gfYQcsRN0SacktzQpoQGMcVjpjAMKQaGwlVDNXXHK0vD646dfenf1gQqUpzPcyP/LTz33GM6uz7Q+Z+pGGanYoRK1VUaWghBEmOyxc63YrHI77aHeic6X7YZk5ChAY0wYVuGICEXrXB7XlrqnzvrlDkvAFEoQHexqJrVLtHTIyiXU8Ui9M/yZ07YfZfwG6mYPKYlSe8xpY1K3Ue57DbipqJYFtqU4YA1s4ZpmDIeM2XdUxgcUv8cqNZvfuE197bTvz9vSVN17elZSJEXEno4vqhYxD3Xn35se4cotqfM7YbKLpfr0ESQYqwr2piMyTsVsAjMmgmkM2nLWNYfLO4bqJ2SO27OXUAjZaa7qCiKBqdGc4cQgPrh92ftsvf7M99KOjgqk4yPC32NmuvretT2YUTc1Gi1KWiKAneNuGNJEhIDg+FAzQvu7ivzbYccdeEjTTWVuSQLhSjYtKn5Rap5Tl1/5fEf3mlC6rzWjPHpMAgxOOiGLGAQMKZVjcmYvJMBS7PStpDCdhz56jL3jt/8z8LTrrrqt0u5VJKFBQu4yTk0PUPdxWL4s/yZE96zi3dOW8L5ZnvGSlRcF0NlL2Ri0SwUtwlApcHQRCRitiksS4qBsqtXDAZ/rFS9O55a6t9z9tlXLm5qaI/MzxuNKobDZmmhABAV1SmnHNXy2Q+2FttajJOSSSnKFU8xWAixKcA5JmMyJm9LwNLMKulYsuaj/vKr5TMOOe6yq4FGzNJqUo/mz883C9oZ99x45sntaTqnPdPSWavVMTBUC5kgI21qdLDQiHrWBJBlGcKxTeHWA6wcCp7z/HpPxXfuyB17/pPDv18qyR6sjpIf0fKbGgQzen5+/BGTxmcKLSm5c7nicrkSlfsgjEHVmIzJOx+wmMNM2jZXDYUvvPRa8LWjZl/2WDNmqZmqks/nxQ9/GHl2br7q1E9OGW9e0t5q7+W7LgbKlZCjxPsGUPFGSSkwaRDDMkjGYrYMfMJQ1XutXFf3LF/h35Obed8fgee9aHhrlJlRbxx+FDPzi2tO3WHHCfalmaRxMKsQQ4NeyCSMTSP3x+RtJsTMKBRW9/IrRDF0wLvNpTsGWKMDq5a0Yy5e6T36h/9ZdOh5l9+xbO1Kmw2SPcS0afZv8gf+sLPFPCtpE1XK9VADUpAwRjZnWv9XRaEIUggjHrckAyiXgxUrB/0/lL3gjt/+z0t/uP7635SHv3c4MZo0gHB1Mbi1pUBERf7d7afdPLUz8YllKwcCBsmo2cS7W0qlrNycLixvlCwWrBWbFXlbe8Qb7/3G392SAFUqZUVn53RqVCbVa4NTsbEOuFSSvZ0LaH2xVGvfN5/Py8KMGTzyaTo7F9DacUGjtAyop6ckRoY5bM59mjFYfX2ruw5lARQWLKBiMUpkHwMsAIEgJqIgk044z742eOcBh//tCODRsFTKrlHDvFni5bKfHDP9/bu13TC+I/aRwSGXh+qsBcEQG9OlGtoUkybHMYVtGmLVQKArbvBI3RO3vrDSuP+UU87rG/l9jRffSIwGdSFv9M1Y92JopiHkz/jyOEvSB1cOlBVYGCS2DftvRPzTm5Q33qMR76RG87tbRJMqlYTI5dTI97z33tnYrCM6My8vXjQhE7dFPWAXVrLve9+7YdXI+KMmz7oB4OJisRgWNwBAo80KaFSe4Gai/kjZlPxTwpuPwdpmAEvX6pSMxZzlq4JLDzj8ktMalR1HRqwTc0kQ5cLSdad9ebtO8/pUXLYMDNRCCDLERgihZgQ6CWkkErYMQ6Ba1U+v0ur2F56v3T3rnCvfwEtFgXcRSJVKJZEF0KwuurHn2W33aYYwFRiQvMFWE+8uue7Skz/R2WGm3Lpm0po2h8EkktqKGWKgRou/cdz5/2xuuh9974gd99h96nt8P9QceAJG9LsxKyFWrhh87RunXv6vxoHxprSAZgpUA4DkHdec8fG2VtpPMj5BMpxmSmrdedJOCUmEUGuAMNR71+lLFMsn/UD/4eVllQcpl3u5uZYol9MjNBMCwOee/LXxH3jvpH3Hd2QGYIRAaCAIPdHXv2JnoZLPEF38u9GktTSB7ayzjk196VM7feyVJS9PnTxxnF2tenrJEjx+3GnFP49mTpr3+eX1p+7rBbX3tmRaX4pbVggA0jDw+pLlrf98YtHvfnrlPSuxie3T3pWANXnKJPPFZbUfHTFrzg+Y8wIgbkZEM6K6VEQ59eubTv3OlHHW+awVhqqhEoKMDbNTpAHWlimMmBM3Bgf9cPmq+gMVz5h37n+9/NDChT1+9MLyorcA0eSlIhW7mRidU83T66dnn515//uDA15dMjT+22dee/H6TjClTCZsO7F9RFFW/7hW3LTr1PiO5YqP4apMm4LWDCit0ZKJY3Ff8CsAX+3a4WWrCLhtKXxtt+3t/xosKxgiFtVBCTXaWiy8IMRNAI5qpMiEbxasgP3t39y4+3GppPh2Mma8L+kYCLVCGEiEWkHryDtjQJJBIi0NIy0t2o2YDknHRfX3d5zy62eWVC+gXO4fRAStNRFRVMyEAI6bYXsrrh/fqhzP1yAnAECY0NoJNgRK1578dfHNy+/I5/NGcT1FHJlBhUKe5v7UTe+yMz/SkvI+mHTGwRSE9riNCW2Eu288+UQiumpDeailRvL9jVfMOnjalNQ9ghLQmgBoMDMci+DVbBep+KTG946mNcG7E7Cam/2Cy37zLIAfjDgNeLVtnhW5XE7dc8PJV+28Xer4arWqAwWSG4oIj0qJsGWTtC1bDA76fUM1fePiJdWbjpi9Wpuav2bBPu7pWSi4VGqAVGTenHPO8a2f2D3VnUzKLxki3HfyhLbJrufOB3BxoTCD1ktl8SZu1nfDy5Zc9jylgtAfbgyxycIIfdc3TEG1kT+Wgj3f95VWYeirRultptDzPcMQovZmx84cxcvddPlJ++4wJXZxe9raw1ca9brHA0GgIptUE1gQiKmpaSitAeUxPDCB2TRkYuK41GGJuJ2997azfnbgYRcUoia6UZ36RgDxyk/efvJtGuFRNbc+sklEkErYVksMxzNwR6EAvb711dubl8ViMbz72lO/sd349AdXDAz5BCGi0kfQjiXNdNz86X+dc+KdudyVK9dnZmaj5po8vs35qmEoHhpyPRAa5aYRWqZtgOXtP/3pbf2jKa64rZDuHNV8HtFnjqMmtbkcqT/cdfbVkzrMbw8OVULNQsr1cEIcVS3TccuSlmVgVdl/aVHf4HVPP6+u+07xqqVNbarRQl53dRVVX19WrH4REUhdlp+dnrqDs2/CpkNiDj6dTIkJlhCo1hRqtZoCY3BDDxOPN06hbcxvxIAAs4ze3eYCFjODpF6rEqQmJjBk9IobGzx64XKzv2vEwUVUDO++8cxTJ7eLi2OmpHK5Hmpi0Sg1bETKYrPn64imWY06Cs3/DRXzYLmuDYKxy6T49x6566yP3P/wkiOKxeLyfD4vGgUKqVZTd3sBH9vA9ebziHo9JNsx97zqgm+PIyouXx/QdHUVFFBELE5f97xAE0sJgox6aAOeF4SdrfHU9Gm8P4Bbe3vzcl10hqCc2muvvUwifNz3NTFgNTvfEAOhknKo5v0+AskF7/ojeNQsxlpdUqi3Ny+7uyl86M6zrpnU6cwaGCwHDGGuSx1lJhBU6BjSsB1HDpS9FxevUpf3/mPl9RdccH15pDYFFBnINjmxYZCaOXNmZt+9Yt0tSfpqImZ+OpUwJ5om4Loh3HqoXPZZR1qTgbHI9E2HMqYwque+UQnBGm+23vimgFV3dzG87ZqZF+w6JXZmpVbTg27AUog14veYwQKkGZqjs4gFiKI2liBqgmij/KdUTNw/WAkmtcf3++K+439vyiP3LRQKq3pyOQLAf/lj/dGOL9jL0gk53vMVNwqHUqiVas3YqcmdfheAnt7CG4GmaYlcccEZ2yfj2LPuBWJthZ4hSBLYdoJDANzatY6ONZzPCyoW9ZGHfmT3REzu6PkBNzVjZrBhCDkwWKk99+rSRyPAevfzHMZmLiLZ3V0Mf3X9SZdMGW/NGhisBACZtO4DWQmCTCXjxqpBf8XKgeBnD/0D11xwwQXDQNWIQA9Xn1YRSB1xxhmJr7/P/lQ8RV8i9g/MpMyJtsmouwo1t67JJc0gGRXtIxBYYSzgc5NFQCCeMg0BsdFcg1BpoyUTw2C1ltna42p6oe+67pTjd98xdWalWg2VhpS0Zll0ZighWDqOKS1pQClGqDWEAAxpQIUhqvU6M8TwhidiAshcNegFkztj79/3U513EBU+VyoB80/IG93dxfJ+nz3rAce2jvb9uhreKwyWQkAK+RUApa7CDEZxbXOwIAGoqePlvpmU7ZSrVbWO+D5R9wKyHfNT+VOOaqHcjQNra2u9XRAogneenP54Jm1QpVwPQREvTMTacQy5cjD469nFOxZvoPXatg1YzRPvl9fNPnWXHTKnDpbrAQPm2oVgI88f61TCluWaVq+8Xv/5n//10k+KP7v7dSCK1+oqFhWtjkAnIvB++x2RmPm19k+lHXGIE6fPJOM01TEZrge4rqdrHrPQECSEACDG4OlNghURfF+Hr700dB2RqAjyI+NurVYUw+CgtU6uSohKWfwdAPoSO+itBVaHHtqj5l4884OTO63L63VPhRpS0GodvtHVCJlkXPZXPF5ZVn8OPO+/Byv1heM62xctWTQ4IdMS381x9H7pmP0ftkFUqQcqKp3dtByEuXKoHkydkPhMz3XLf5DN9RT+VcpbAFDx1C+DkI8mEsQNHGFAul6AmENdxx57UIooV17bY9jo78em8L4syFgnX0oE8oNQt6Tttj327PgogAd6eqJWVsNmZeM+cVPv1+hntPrhGSxIwvXVfQ3tar2t17ZZwGqeeDfPnf3ZKROTl9TrdaU1G0Rrt8DWypRSxhxLLuuvP7pspT7zsG9f+tgIwFPdI7wrDdWXf33Hd/duTfCdcYOnOrYJ33PhejXtu6QZkEQkBAhjRRO2kCHIYCGJAs3eIcfddyrwirup9+js3DqbJJudzrkcaMp456pU3DAGq55aA6w0s20apCHw6tLKLSsqdMmRs6KSQeuQ/7znxjM/k0nh/M6M88FKxVXcrPdPIcAwyhVXTepInT33spk3z8gWXmQuUKFwYm9bEkuTcWOCHyhNgCAi8oNAt6ac8d177fTR66/HQz2lkkAjzivSknpU/rRsm22JT9XdEFjPihVM2jRJJOLiQAAPrFU/iyjXo2bOzGZA6lOexwBYNCvekyA5VPHVyoHgQWD9ddm3WcDK5/Mimy3o884+eoepneYdBoXsBky0BugDxBymEzFjsB4OLFnqff+gIy6+MnqRzfSddbiBZ8wgALozgYkdaWvqisFyEPg+MUEQhACNaVJbWejCH3V37vWJ7ZekUpOoXF68UXfE5kRqjxpII1e+uuPnsw+c3Jn8j3KtrsQIk0ozs20ZFIQ0tHhJ/civzrrsN03uqLe3INEL9M1YyJ0LphO6Im7nS0cVH95++30+ft2FH7p2fJt9eLniNsw0AhFIBYpb0wlnh4np7xDRrGd/O9suFq+qfOSWk+ePa419PfBDjaZnlUk7DlF7Gl8E8NBIoGlyWjvv0tLd1hLL1F1XrS/dSxOL0AshdHjA7P33P23ffYteQxfjUikrcrke9eHpbR9vTVrtXuBpASkaTYR03LZEXzlc+M1Tr1kQgWRxDLBGStT2nfT9t552Y0fGbh0o+2pkMTutmaUUnE7GjaUrqr1Pv1T79glnX/MMc16ggFG1xGItgrrv60a/ODkGUm+duPUgjLIF3nxw55tXr6KGA61xeZqQkUO6ya0xgw0JVprUsy9Xv3rUyVc8/NhjM817752ohtOyRkqDX5qfzxuf/uEP3c9kHz3it7ee1jZ1vPP5ctVXIJIAQxNkteayI/Xh5+e/Vtzl85cvAeZgyPfu9IPk19ewxgjC90OK28Zns9mS7Ooasba7ou8c1xb/vGkI1Ic9GU27cHWkFBEJz9c6k7SnfPjAHffiB/GnJlA1K7B2tpj7ObbJnu9rJm7Wh9OmJYVb8/8AgHt788ZoAqbfHXzrJpx4t1717XN2nBT/VLnsh0KubtnFzMqxDZJSiheWDRX3zV386RPOvuaZhjtaN7uLYCOMOJGmzY4PGpN3hTTjoS7/0Uk7xuPGx2t1DyPDIoi0SsVjYsny8tVHnXzFw/8q5a0PfWhesLEUl+5iMbzjkEMkM9Of/9Z39KpKuMI0TMGRbxlERKFSqq0lnthlh44vRoGkTH/6e2X+qrLXZ5pScoPIIpCoeyHbMbnbpz/18J5E4ChPE9QddSK3HMva1/MDjGzUSgxAr+0w0DqRMJBMWAdHJnYEVFFYBETSsboCFRCP3KsEUXM1Vlb8+yNtd8Y2E6AjRrOAxKE5NXfuzJ13mJTM1+qe0gRJzdQ/jTAZt6Ub8sqnX64cfODXLysw55HP50Uzv49LJdlYUGMZ829TicWTgktZid6C5FJ2PVdJNjfm1hpHV1e0JsdP1J9pTdkWK6hG6FKkXQkpV5bd2tPLwwvz+bzoWTD6yPlcT4/q7S3I4kW3LB8Y4iucuEk0Iv+RARLEHI+ZnwWA5x442Zoz59YhDfHbmG1w5IUe/mWVTlrUGTeHgaZUygoAeO/klf+RdMSOnh9oAIIZbJkSbqCXL+0Pe+K2DWbdzBQRYRigJW7uB4C6ugoqAm3iqy4+fgfHphmeG6Kp4TEzW6YU5bK77M//WvZ/AJCN0ou2CdmoSThjxgxiBnZIJ67MpExnsBKRnwwJUhRm0paxfNBd8NhTKw4583s3Pt0M8hupmQE59cPvH7m7EWL5d39687s+3+mdI03Pl8bVv/h7+Yzn/7IRs73nLRtZJhXbiwTAI11sBO04luxfWfvzOefMe3VzXPl9fQuZGXTtZdW7O1rED4SAHNF2jPwgIEvKD+yzzz7GPypLQwBY0ufe15Exj2q2kmuqZDoIkEyYnweQ7+oqqGZ3nphlfCXm2AjKvgYJAWLtWJZc0R/+/cVlAz+aOt7OUsPwZiKquyE7jvHeW6///jQieq5UypsA/CkTUp/MpC2zUqkN82AEKMe2jBUD4SNXXdVT2Rai20cNWKVSSeZyOXXrVd/+2oQO53OVih8KIoPBIEaQydjmopXBI798ZMkhV199W38z5CGq5llgIlL5M44Y99H/mHi2ZYgTXnxt8GMAVubzeXo3Nh94pwkRkdIM25T2RT/48D2CP+JBRG1v3/jLzFIYVK17qvf/PT/zyusfXtwgube0hqUBwDZoV6UYPKLPOzGzkAK1uvobA7Q5rvxcrkcD4COOKL+w8xRneSZuTvCDUEdmJ1EYKhhSTzx4v906c7mo/v+fnlj5h0kdsr8lYbd6QeRpYmZR83wkbWOPqy+dtTMRPcf5vM5mIS0Hnw9CF9wIu6FGM3kvDH53xjm/ePL3d562uD1jTfK8QBNIsEaYThlmcmX1IAAXfSDZRgAgde1AAWuNqAgmkNaMSkD3A9tGdPuoAIsBQnYB5/Mz4xM64ucrrVmjQfoxhS3puPn6Cv+O/U677Vi8/nq9GfLQrIdVLBbxy+tPmdXWYhbHtVrjaxWFHbZv9QCgUMD6y1WNyVurYzHDkELuNDnTTRv8PcCUhIGKCcG6BcDiQqFAXV1bGkSLGoABxjitFYYD1RuiNUNz+DwBPP9NfM8tt9xSP/rg0ytRu/eIBicChYphGGZixx1aOwAs+Vcpb703V+w/8BOnPhRrMw71wkABMIiItOawNR0zduwUnwPwHBWL+trLZu+ZTJi7uG7IjbQhkBByqOr5ZYUHiAC3rh6yx8mjPS9oRrsRFENa+ssALtrl8yf7J2T/N2la8hOe7w9TN8zMhiTZX65XFy8ZnB8BFvQYYEX2nCDKqZ55J506oTM+dXCopkAkiRG2ZCzj9b7qDftlLz5WEOE/83mRzRZ1Q0UPr/jZNz+w+86ZiyekY91u4GFosBaSNKXra2sMIt6eoFWuumq1I2vdv2YIonI1YFPa4dYZRxQ8fMQRZ9gEaldaY2TtAaIIsBYvXhmNsPfN8be+F0jgjUtSkEBLJsUAsLDxs6EK9QQhH0oj+DsmkEIIIfhgAFcAoO067M9lErYYKtdCEAxm1vGYKZatDJ48/Jg5zwBXwFVmyfdxdFMDY0DWPA+pmNzrvPxROxDRy9df/s2PZJKx8X4wIlGdWMecmByq1P86++zrt5no9jXezbp+GHn0svon5x7T2d5qfser+xpEROCgJR03Fq0Irt8ve/GxpVJWKs00Y8ZCIgITFfWvbz7t1D3f0/an8Rm7e7BWU56vWUhJUoCeevKFyQDQ07NwLGLhbYdaJAASw3+v5yJAKK236vv75Cd3ZUM0Y8dH5AsSSGvCpAnbLQKAvhlvyjumpRD6jTcgYHWOPxYsiDSYf7y07JH+srfKMqTU3GC9mETdDRAz1ceuPf+sSQDYQPBVrRSYhtOwtSENuL53b2TUMi2rJ/9nqOL3WZYUzGAiINSsWtMJ5707te/LDJrQlvh0wjHAzLpp8xCDhSCsGqr8oaFdbXMe9fW0oYYgIn7PtMzJ4zoSGS8ItFBCt6Zi5qI+/+bPHHLhcVzKymy2R/f25mUu16POPDM74fel7/x62qTkJZZQsaFqFDBHAsRgCCGRSmfGQhbepiIl0YYuIUg0/1Zq69Q8bOpSF1xwgXJ9vx7V7FpNiVNjc69YuaINADoXbD5/s//+s03bMixmvZbPkwEm1N1obxQKUc/Kn/70tv6apx+2HYtFw7MYmZBatbbG45nW+j7nnPOldidh71lzfUTJ1gwQycFKgGXLoxSaBT0F86STihU/EL2ObQJRJnkERsRwYvoAIrBjm/sqpdZoJEUk5EDZ54Gqvg/YdqLbN2gSRqVHiqpUuiI5znzpm17dY8WS29Km+cpS7/ef+/qFxzDnRaEA7uqMkqDnXjb7Y7tPcW7taDF3KA/VwpBIClqzYoIQQCoVG0OGt6dNiJrHTGBef+Vf4lAQeSErQabaaiOJAlc9IcUyKcWOI5OBmQHDIHR0pNMAqBmkuanmLxGha4+l48HbjVOKAI78f8yAIQU8P/ReeX35UJNvLcyIJqDuhj1K6dwaIMJgKYF0wuh+73YTjLYWWw4OVkIiEZmDji2WD9SevuXehf9kBjU5p8GK99sJHVZ2BExKz/fhmPLDl5z/7d0MGb7P8xnMJCgam445plg55C5cdNrkJ7al6PYNali9vXlJBDYqz81sa4lNqPthkEma5qKV9X/9+n9e+Qoz60Ih0sK6u4vhTVfO+sZ7d3bmpxO0Q/+QG2rBhiBeO5segoDxLTYAIIvsGEi8PZBKW6ZEoGnRs4v86c+9PLTbwucH3vPsy+Xd3ngNveepRYO7vbQ0eM+SavxFYOu0ZG+GBiiFF6WQWJtRI2JYtrknAO7q2nSTsFDoksygHXYav2s66dih0np1uAKzISWY9fKFL+olAPDDYlEjG5VRfuLVoYf7B71VpiEbdb8ioKm7HkxbfK4l45wS+j4YsrGvKJpfxfc++uijYW9vXjYB6/nXVjy8arDqGjKqIUZEFIQKkmjipHacb0mZCFXkyW2alpZpcujjoSKKOqqfte2J8UZzsKiy2elWMs6zXc/XMdswVg25K555ZvCAq67qqXR15WRhRhbUnQvvnPft7+6yfetPdBCiWg90VBJ5nUVmQERIpZJjoQxvMyECpJTurJOvePrtNK7Bmvf4RIodNtKnrwHpeQFsiz43e/b+dqGwIMAmxvR1dXWB6FG+/1b7c45DcH1oakSjE0GblpT1Af3MnDlzvCapTQRu1H8f+PgdZ/zese1Dg6CmABiCiFxfIWGJqXFbTK3WAzS9g4JIVOo+u57zKyCKASsWe5rOqdcfvOOUP7dnEvsM1VwNQDIThNBy+87kwfzGzmSi7oW0rN//XfNe2zxgNQI99e3zuj/b3prYQft+CDLw9EuDuZP+8/pXotpVC5kop+656bSf7LRd4rte1VW+UkIIIda3dgjEIGDB069MBYDezgVjpPvbRccCQKxp7ty55uLFi9XChQtp+vTpG9wMW6llFwDgqquijbho2dD8SW0xFgKyORhBRJ4XqvGtzuSPfWDXo75+XHHeY3Nnmh+aNS8Yzb3z+bzo6oLO52en0yk6vF5TzCBJI8w7QYRaPWiGDAzHefVGfBlVVdCjlX0oN1SfCE8JmqMOmpFfgsFg7ViWWFV2X3ri5b8/RjQcAzZ8X9/DbyDkPmAazjeM8iYbRNoIO9m2DDFYqff99ZkX/wQA2ca9tmnA6okimTmTtL5pGqyZHGPhSwOnzjrj+vmPzZ1p7tU1QxMV1UN3nv1fk8dZ55arlUArYYjhjga8Qd5AmiIxBhFvT2ltbdWzZs3S+DdnIfT09KiGBvKPB+84/fGJHdZetVqg0Kgiy2ChPKUnt5nnnZc/6qEPzZr38mhAK5/Pi0IXBFExvO/mky9sS5gTG1kbq2tjCZL9Q75evkr8qgEsw6DQVSgqFMFPPxk80raXN5BIUIsfMDfNydV/chP8tGUb5K4QDxWLj4bNoOqR911W8R/oKAfnCwGpeWRw6JqUCgHKtk2jttL77zlzHhza1qLb1wlY+Xxe5HJFdeH3jp4St+nTjjTF84urt3191pWXPTZ3phmpzDl1361n/td246xzK0O1kCFNEqNb20RAIpHSY9CwTepxxJwXCxZARF2XNkZkQQAItbIvkpC3M/uNyi4MIkG10OeWhNX20T067vvR90744odmXfVKs7RMX99CXrAg0hALBaC3AIEuoLu7GBaL0A/c/t2zJnbgW+Wat0YhPzCHyYRjLF/p3jfrzCuejjrZDLexwwizsP/em056tLMtfVAQuApYb2co4XmKBmq1uyMTbsbI5q66QVs99fDtpy/obLf2qNQ93TQl12miaIYfqnsA0LYW3b5OwOrqgigWwZOnxg+eOj6dfGVJ+bn5T8hvM+fFvHlLMGvWvKBn3gnfnTLBPneoUvEVC5NI8yjPYgaDE3Fno7/NzBz9sRmnPHOjz8XGP0sEzeCIn9iM1oSE6OGFoDFeboPzBGhG0PBo+aP8mM7n8+KGexb2fOuQyd8b3xZ7b6Xq6oh2AAQJUa75ujUZm/GpvfB/d1514jlEdAvWKi3TyKbQKAI/+9HMnffYKfWjie309brrKc2QI8tBkyByXY2huvPD9eJog8qoh/L2UIuD11dPmpnZsUgMloPlzy5a+UcAyK2VoNxseeb6+kHTkHuIKPhLrGvnSClkf9mvryrzIwC42eBiWwcsDYDbMuaX6iHjqdeqx11wwTXlD384b82aNc+/75bTjttpcvInbt1jQ5qWuQm1SpXShmMbFHPY3ODiNgXZFpHvh4bYjJJ9SmnDtgxIwRscnZQBMTjuWKYIFW9uHzdBJKD0WMOL9Z9SJKt1D7Yjv/zo3d+ZQRFZw+sHt1AlUmm5akBe/Zmvfr8kiPTn9jnhxJZk/FHLEDpQTJEJRhBCiEq9plOOOSGzc/oX83tOP61SDe8re8H/qwwGi5596XX9wT12tgT0+9rbkp9ypMq2tdiJobKrQSRHxM9DMwft6Zj53CuVG7501KWPNXNo1x5fV3ekcVUHW3432FpbEbNlhx/o1Wbh6sMsSlAe8n9fLPZUGprZGvdrkubLV4b3j+9QZ48sQ7PmpLCO2bbsr9Qe/+bsKxev3b1qmwSsZg2ifP7rHZmks++Lrw1deMLp1/xPqZS3crmif/H5Mz8ohP7ZkqX9Q77SiKKeN2nOQl/BeP6VgdSGfqlvQAdeza3U664CeJOBgJmUHyo5VNMDG/o932gJtB76l+dqR0UaGW3aRgSkIK3YEL4Rq4xB03q1WApCjZgtJ1qmnLjxA4fQljRQq/q/IyJ+9reX2bt+4ZT/vvsXp52z+w6Jnw4O1QLFwiDSEWiRIeqBYgoUt2bMPca1x/ZwfY26G2CXHRNwHAtxx4QhCbW6h8GKq0iQjNZu1LpQaxVmko65aHn16Vde9E+OTNasXo+2yA3+aOChO8+Y35aOHRJ5C9c0CwkgXxMGB737AdC6nEzNaq2vDC778w5166WWpLmj6wVv7BfZaHpR9dVvG/zXNlG7fYOA1QWIIqA/vPPEA8qVcNmVtz71/VIpKxc0ag0N1vqfven2P01/+rUVujMW3zx9JJkEgCoQ8QlrvODG6XPVjaVH1GB8Z+BNYEAyCd9vrTU5tzU3UHS653Lf6wPzB96sLUcAcFDznj1qDKLWzV36QchBqDa+yRhhpeYazOwBwPzXFjQbm55/9y0nj9ttcub0crmiw8ibJ6JmWUQAqFYPNCHQJIgMCWkaJrTWXK+7KuIXSK4uVRwtYc06yKQcs+waL728gr94UvGqSh/yolhcvxbY4I+ob4V33/h2OwvShDWosKj9Vn+/W332pfojALi3d91e1QYR7z9w6xkP2+3mN0ckQ4/U4+VgxUffEv27BmBt0zywAazOyfJ1cMDgKu/kBx980Dv22Gyz6B6KxZ4K3hSKjE4efPB5D8Dyt2gn8VhsxVsFWkQYVa9IZorathEA7LrrRCbKKS5lJeUuP+M3t5zVv1177Ee2UKjXgxAEgeG2XSQQFcuLCEzNoCiexgCt1ROQoYiYWjNxc/kK95nBWvzzx51w6UtrE+3rkq6uogLAf3tx0YMTx5mVVNxK+qFiMWwWso7Zpujv9//0vfOuW7ahBOWmWViuVO/zA/Nba9emZo7utarffXZe6f+e3Faj29fA7wYhqPL5w9Mry3jw8BPm9UQewzU1BmbQm71GY3q9Vd8zbBO8+eudpO2EYA6B1X9z8//fvLap17j35lyNzxKtqUVQrkfNz+9jHHTEBT9+6uXgi5UKnk2nY4btGILBGswhM+uGyyXqU0+rNZ6GJ0ZF38FIJi1pGrZYsQpz7/6f5/Y++Bv/2QCrjWvJUTnkkrzooruXK2U8mHBkSIDfGIMCIyRJVHGjGKENJSg3Y6n+319W/u/AoL/SkMTMHIyYD982jTDQ5gOPP/54sK1Gt6+TdF+40K8We+ZcywDROgIDid6a2Jy36nuwDVY81UwdmUzMEIaEEARmhmObWLqi1rEFXlw8k4kbTDDkZrYP0UoZmUwcK6pufO1/6y4+GjbI69/us0/2v086fOLJEzqdb8Tjzm4xk0SgFIJAIdQarJkj7y+EFESGNGGaUhqCMFgNVP9g+PtlK/QFuZkXPdLkcDemWY2URpccGqjWfz1t6rhDFMMQJKCZ4cRM+eri8ut9K5xS1D1j/fcdwYmt2q/rpL/ussOE/fsHa5DNzB6GYZgGyrXqbyONbAaPAVZDooC9NTvPjsm7S0KO/WxlhcbVappBTGBixw8poFj/ggXZzXrvTU6l7hm9ry5zf1ythppZiyYzPJryHMNV7CjUg54lyjXZuy6+hnI51dCEKo8+iv+aPj174Y/O2m7fdMLenxB+QspgR0lGi2FIIYhJawHPD8Ma+31ai6dDxfOHKuLX2W9d+AQQ9dnM/v/2zh4ngSCK4+89WChM1GCwtLPB0gsQTmCzV9CCA2g3g/aewNZm5wJ0TKWNJXAAxMYsRgKbwMrOs1iJSoIREaPx/Q4wmcxMXub/Pn3jFpVZU1nY7MT1XLZ3mc8nHmU8jkcxkLfW6XbHF0cn5/3DY05V6YekE4Kip9xZOKCbKALHNCEHad3PIBwlzdu7qxcl9O/zGMWNI/zJd8tBQLOpAtXqwdb+7k7BueHGQ/S4WVjf7mGC/fp1eG+MGb66HRQZ08YVB0pkboEYLGEZlFLZeS2NZyO3X1ibphNvlsVacJ+sV8Qg8KlYLGGlcjphnm8fmBVZC1S24PD7aiGx0VCZt10jrG3hAvt/d366DGRXcDdisAThF8IMqLVCDQBmr41+q8QaAHStxii/HUEQBOEneQbs1g/jfl7EHAAAAABJRU5ErkJggg==" alt="SVF" style={{height:32,objectFit:"contain",maxWidth:180}}/>
            <div className="sidebar-brand-sub" style={{marginTop:3}}>TRADING JOURNAL</div>
          </div>

          <nav className="sidebar-nav">
            <div className="nav-section">Navegación</div>
            {NAV.map(n=>(
              <div key={n.id} className={`nav-item${tab===n.id?" active":""}`} onClick={()=>setTab(n.id)}>
                <Ico n={n.icon} s={16}/>
                {n.label}
                {n.id==="accounts"&&<span className="nav-badge">{user.accounts.length}</span>}
              </div>
            ))}

            {/* Mini P&L per account */}
            <div className="nav-section" style={{marginTop:8}}>Cuentas</div>
            {user.accounts.map(a=>{
              const t=acctType(a.type);
              const pnl=allAcctPnl.find(x=>x.id===a.id)?.pnl||0;
              const on=activeAccts.includes(a.id);
              return (
                <div key={a.id} onClick={()=>toggleAcct(a.id)} style={{
                  display:"flex",alignItems:"center",gap:8,padding:"8px 10px",borderRadius:9,
                  cursor:"pointer",opacity:on?1:0.45,background:on?"#141620":"transparent",
                  border:on?"1px solid #1E2028":"1px solid transparent",transition:"all .15s",marginBottom:2}}>
                  <span style={{fontSize:14}}>{t.icon}</span>
                  <div style={{flex:1,overflow:"hidden"}}>
                    <div style={{fontSize:12,fontWeight:600,color:"#A0A4B0",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{a.name}</div>
                    <div style={{fontSize:10,color:pnlColor(pnl),fontFamily:"DM Mono",fontWeight:700}}>{fmt$(pnl,0)}</div>
                  </div>
                  <div style={{width:8,height:8,borderRadius:50,background:on?t.color:"#252830",flexShrink:0}}/>
                </div>
              );
            })}
          </nav>

          <div className="sidebar-user">
            <div className="avatar">{user.name[0]}</div>
            <div style={{flex:1,overflow:"hidden"}}>
              <div className="user-name">{user.name}</div>
              <div className="user-email">{user.email}</div>
            </div>
            <button className="settings-btn" onClick={()=>setShowSettings(true)} title="Ajustes">⚙️</button>
            <button className="logout-btn" onClick={logout} title="Cerrar sesión">⏏</button>
          </div>
        </aside>

        {/* MAIN */}
        <main className="main">
          <div className="topbar">
            <div style={{display:"flex",alignItems:"center",gap:8,minWidth:0}}>
              <img src="data:image/png;base64,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" alt="SVF" style={{height:22,objectFit:"contain",maxWidth:120}}/>
              <div className="topbar-title">{NAV.find(n=>n.id===tab)?.label}</div>
            </div>
            <div className="topbar-right">
              {/* Scope toggle */}
              <div className="scope-toggle">
                <button className={`scope-btn${scope==="global"?" active":""}`} onClick={()=>setScope("global")}>
                  <Ico n="globe" s={13}/> Global
                </button>
                <button className={`scope-btn${scope==="account"?" active":""}`} onClick={()=>setScope("account")}>
                  Por Cuenta
                </button>
              </div>
              <div style={{fontSize:11,color:"#4A4E5A",fontFamily:"DM Mono"}}>
                {new Date().toLocaleDateString("es-DO",{day:"2-digit",month:"short",year:"numeric"})}
              </div>
              <button className="btn btn-primary btn-sm topbar-add" onClick={()=>{
                const hasRealAcct = user.accounts.some(a=>!a.isDemo);
                if(!hasRealAcct){addToast("⚠️ Crea una cuenta propia primero en 'Mis Cuentas'","error");setTab("accounts");return;}
                setShowAdd(true);
              }}>
                <Ico n="plus" s={13} c="#fff"/><span> Añadir Trade</span>
              </button>
            </div>
          </div>

          {/* Active scope banner — desktop only */}
          {scope==="account" && (
            <div className="desktop-scope-banner" style={{background:"#0D1A12",borderBottom:"1px solid #1A3D22",padding:"8px 24px",
              display:"flex",alignItems:"center",gap:10,fontSize:12.5}}>
              <span style={{color:"#4A7A5A"}}>Viendo:</span>
              {visibleAccounts.map(a=>{
                const t=acctType(a.type);
                return <span key={a.id} style={{color:t.color,fontWeight:700,display:"flex",alignItems:"center",gap:4}}>
                  {t.icon} {a.name}
                </span>;
              })}
              <button style={{marginLeft:"auto",background:"none",border:"none",color:"#4A7A5A",fontSize:12,cursor:"pointer"}}
                onClick={()=>setScope("global")}>← Ver todo</button>
            </div>
          )}

          {/* Mobile account selector bar — siempre visible en mobile */}
          <div className="mobile-acct-bar">
            <span className="mobile-scope-label">Cuentas:</span>
            {user.accounts.map(a=>{
              const t=acctType(a.type);
              const on=activeAccts.includes(a.id);
              const pnl=allAcctPnl.find(x=>x.id===a.id)?.pnl||0;
              return (
                <div key={a.id}
                  className={`mobile-acct-chip ${on?"on":"off"}`}
                  style={{color:t.color}}
                  onClick={()=>{ toggleAcct(a.id); if(!on) setScope("account"); }}>
                  <span style={{fontSize:12}}>{t.icon}</span>
                  <span>{a.name}</span>
                  <span style={{fontFamily:"DM Mono",fontSize:10,opacity:.8}}>{fmt$(pnl,0)}</span>
                </div>
              );
            })}
            {activeAccts.length < user.accounts.length && (
              <div className="mobile-acct-chip on" style={{color:"#8A8E9A",marginLeft:"auto"}}
                onClick={()=>{
                  user.accounts.forEach(a=>{ if(!activeAccts.includes(a.id)) toggleAcct(a.id); });
                  setScope("global");
                }}>
                Ver todo
              </div>
            )}
          </div>

          {tab==="dashboard" && <Dashboard trades={visibleTrades} accounts={visibleAccounts} scope={scope}/>}
          {tab==="journal"   && <TradeLog  trades={visibleTrades} accounts={user.accounts} onAdd={()=>setShowAdd(true)} onDelete={delTrade} onEdit={editTrade}/>}
          {tab==="calendar"  && <CalendarView trades={visibleTrades} accounts={user.accounts} onDelete={delTrade} onEdit={editTrade}/>}
          {tab==="stats"     && <Statistics   trades={visibleTrades} accounts={visibleAccounts}/>}
          {tab==="accounts"  && <AccountsPage user={user} trades={trades} onAddAccount={addAccount} onDeleteAccount={delAccount}/>}
        </main>
      </div>

      {showAdd && <AddTradeModal accounts={user.accounts.filter(a=>!a.isDemo)} defaultAcct={activeAccts.find(id=>!user.accounts.find(a=>a.id===id)?.isDemo)||""} onClose={()=>setShowAdd(false)} onSave={addTrade} customAssets={user.customAssets||[]} rrPresets={user.rrPresets||DEFAULT_RR_PRESETS} onAddAsset={addCustomAsset} onUpdateRrPresets={updateRrPresets}/>}
      {showSettings && <SettingsModal user={user} theme={theme} onClose={()=>setShowSettings(false)} onUpdateUser={updateUser} onToggleTheme={toggleTheme} onDeleteAccount={logout} onToast={addToast}/>}
      <ToastContainer toasts={toasts}/>

      {/* MOBILE BOTTOM NAV */}
      <nav className="bottom-nav">
        {/* Hamburger / Menu button */}
        <div className={`bn-menu-btn${showNavSheet?" active":""}`} onClick={()=>setShowNavSheet(v=>!v)}>
          <div className="bn-menu-icon">
            <span/><span/><span/>
          </div>
          <span className="bn-menu-label">Menú</span>
        </div>

        {/* Current tab display */}
        <div className="bn-cur-tab" onClick={()=>setShowNavSheet(true)}>
          <div className="bn-cur-label">Viendo</div>
          <div className="bn-cur-name">
            {tab==="dashboard"?"Inicio":tab==="journal"?"Trades":tab==="calendar"?"Calendario":tab==="stats"?"Stats":"Cuentas"}
          </div>
        </div>

        {/* Square + Add Trade button */}
        <div className="bn-add-btn" onClick={()=>{
          const hasRealAcct = user.accounts.some(a=>!a.isDemo);
          if(!hasRealAcct){addToast("⚠️ Crea una cuenta propia primero en 'Mis Cuentas'","error");setTab("accounts");setShowNavSheet(false);return;}
          setShowAdd(true);
        }}>
          <Ico n="plus" s={24} c="#fff"/>
        </div>
      </nav>

      {/* NAV SHEET */}
      {showNavSheet && (
        <>
          <div className="nav-sheet-overlay" onClick={()=>setShowNavSheet(false)}/>
          <div className="nav-sheet">
            <div className="nav-sheet-handle"/>
            <div className="nav-sheet-grid">
              {NAV.map(n=>(
                <div key={n.id} className={`nav-sheet-item${tab===n.id?" active":""}`}
                  onClick={()=>{setTab(n.id);setShowNavSheet(false);}}>
                  <Ico n={n.icon} s={22} c={tab===n.id?"#00C076":"#4A4E5A"}/>
                  <span className="nav-sheet-label">
                    {n.id==="dashboard"?"Inicio":n.id==="journal"?"Trades":n.id==="calendar"?"Cal":n.id==="stats"?"Stats":"Cuentas"}
                  </span>
                </div>
              ))}
              <div className="nav-sheet-item" onClick={()=>{setShowSettings(true);setShowNavSheet(false);}}>
                <Ico n="settings" s={22} c="#4A4E5A"/>
                <span className="nav-sheet-label">Config</span>
              </div>
            </div>
            <div className="nav-sheet-footer">
              <span style={{fontSize:11,color:"#3A3E4A"}}>SVF Journal · Smart Money Only</span>
            </div>
          </div>
        </>
      )}
    </>
  );
}
