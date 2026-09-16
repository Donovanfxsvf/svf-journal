#!/usr/bin/env node
/**
 * Busca usuarios cuyos datos ACTUALES son solo la semilla demo, y comprueba si
 * alguno de sus backups contiene trades reales. Si es asi, es una victima
 * confirmada del bug de siembra demo — y es recuperable.
 *
 * Solo LEE. No escribe ni modifica nada.
 *
 * Uso:
 *   node scripts/find-demo-victims.js
 *   node scripts/find-demo-victims.js --key ./serviceAccountKey.json
 */

const fs   = require("fs");
const path = require("path");

const argv = process.argv.slice(2);
const val  = (f, d) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const KEY_PATH   = val("--key", null);
const PROJECT_ID = val("--project", "svf-journal");

const appMod       = require("firebase-admin/app");
const firestoreMod = require("firebase-admin/firestore");

if (KEY_PATH) {
  const key = JSON.parse(fs.readFileSync(path.resolve(KEY_PATH), "utf8"));
  appMod.initializeApp({ credential: appMod.cert(key), projectId: PROJECT_ID });
} else {
  appMod.initializeApp({ credential: appMod.applicationDefault(), projectId: PROJECT_ID });
}

const asArray = v => (Array.isArray(v) ? v : []);

// Un trade es "demo" si pertenece a la cuenta sembrada.
const isDemoTrade = t => t && t.accountId === "demo-acct";
const isDemoAcct  = a => a && (a.id === "demo-acct" || a.isDemo === true);

// Solo-demo: tiene trades, y absolutamente todos son de la cuenta demo.
function isOnlyDemo(trades) {
  const t = asArray(trades);
  return t.length > 0 && t.every(isDemoTrade);
}

async function main() {
  const db = firestoreMod.getFirestore();
  console.log("Leyendo users…");
  const snap = await db.collection("users").get();

  const onlyDemo = [];
  const mixed    = [];
  for (const d of snap.docs) {
    const data = d.data() || {};
    const trades = asArray(data.trades);
    if (trades.length === 0) continue;
    const demoCount = trades.filter(isDemoTrade).length;
    if (demoCount === trades.length) {
      onlyDemo.push({ uid: d.id, email: data.email || "?", trades: trades.length, accounts: asArray(data.accounts).length });
    } else if (demoCount > 0) {
      mixed.push({ uid: d.id, email: data.email || "?", total: trades.length, demo: demoCount, real: trades.length - demoCount });
    }
  }

  console.log(`\n  Usuarios con SOLO datos demo: ${onlyDemo.length}`);
  console.log(`  Usuarios con demo + trades propios: ${mixed.length}`);
  console.log("\nRevisando backups de los que solo tienen demo…\n");

  const victims = [];
  const clean   = [];

  for (const u of onlyDemo) {
    const bks = await db.collection("users").doc(u.uid).collection("backups")
      .orderBy("createdAt", "desc").get();
    let best = null;
    for (const b of bks.docs) {
      const bd = b.data() || {};
      const bt = asArray(bd.trades);
      const realCount = bt.filter(t => !isDemoTrade(t)).length;
      if (realCount > 0 && (!best || realCount > best.realCount)) {
        best = { id: b.id, createdAt: bd.createdAt, total: bt.length, realCount };
      }
    }
    if (best) {
      victims.push({ ...u, backup: best, backupsTotal: bks.size });
      console.log(`  VICTIMA  ${u.email.padEnd(34)} backup ${best.id} tiene ${best.realCount} trades reales`);
    } else {
      clean.push({ ...u, backupsTotal: bks.size });
    }
  }

  console.log("\n" + "─".repeat(72));
  console.log("  RESULTADO");
  console.log("─".repeat(72));
  console.log(`  Solo demo, CON backup recuperable (victimas)....... ${victims.length}`);
  console.log(`  Solo demo, sin backup con trades reales........... ${clean.length}`);
  console.log(`  Con demo mezclado con trades propios.............. ${mixed.length}`);

  if (victims.length) {
    console.log("\n  Recuperables desde el panel admin (buscar por email y restaurar):");
    victims.forEach(v => console.log(`    - ${v.email}  ->  ${v.backup.id}  (${v.backup.realCount} trades reales, ${v.backup.createdAt})`));
  }
  if (mixed.length) {
    console.log("\n  Tienen la cuenta demo ademas de la suya (normal, no es perdida):");
    mixed.slice(0, 15).forEach(m => console.log(`    - ${m.email}: ${m.real} propios + ${m.demo} demo`));
    if (mixed.length > 15) console.log(`    … y ${mixed.length - 15} mas`);
  }

  const out = path.join(__dirname, "..", "backups-local", "demo-victims.json");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), victims, clean, mixed }, null, 2), "utf8");
  console.log(`\n  Informe: ${out}\n`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
