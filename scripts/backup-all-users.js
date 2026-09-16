#!/usr/bin/env node
/**
 * Backup masivo de todos los usuarios de svf-journal.
 *
 * Recorre la coleccion "users" y, para cada usuario con trades.length > 0,
 * crea users/{uid}/backups/bk_{timestamp} con una copia de trades y accounts.
 * Ademas guarda una copia LOCAL en disco, fuera de Firestore, porque un backup
 * que vive en el mismo sistema que viene perdiendo los datos no es un backup.
 *
 * NUNCA borra ni modifica nada: solo crea documentos nuevos en la subcoleccion
 * backups y escribe archivos locales.
 *
 * Uso:
 *   node scripts/backup-all-users.js                  # simulacion (no escribe)
 *   node scripts/backup-all-users.js --execute        # escribe de verdad
 *   node scripts/backup-all-users.js --execute --force
 *   node scripts/backup-all-users.js --key ./serviceAccountKey.json --execute
 *
 * Opciones:
 *   --execute        Escribe. Sin esta bandera solo simula.
 *   --key <ruta>     serviceAccountKey.json. Si se omite usa las credenciales
 *                    por defecto (gcloud auth application-default login).
 *   --project <id>   Por defecto svf-journal.
 *   --force          Crea el backup aunque sea identico al mas reciente.
 *   --no-local       No escribe la copia local en disco.
 *   --out <dir>      Directorio de las copias locales. Por defecto ./backups-local
 *   --concurrency N  Usuarios en paralelo. Por defecto 5.
 */

const fs   = require("fs");
const path = require("path");

// ─── ARGUMENTOS ──────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const has  = f => argv.includes(f);
const val  = (f, d) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };

const EXECUTE     = has("--execute");
const FORCE       = has("--force");
const WRITE_LOCAL = !has("--no-local");
const KEY_PATH    = val("--key", null);
const PROJECT_ID  = val("--project", "svf-journal");
const OUT_DIR     = val("--out", path.join(__dirname, "..", "backups-local"));
const CONCURRENCY = Math.max(1, parseInt(val("--concurrency", "5"), 10) || 5);

// Limite duro de Firestore por documento (1 MiB). Se deja margen para metadatos.
const DOC_LIMIT_BYTES = 1024 * 1024;
const SAFE_LIMIT      = Math.floor(DOC_LIMIT_BYTES * 0.9);

// ─── INICIALIZACION ──────────────────────────────────────────────────────────
// Se usa la API modular (firebase-admin/app y /firestore), estable desde la v10.
// La antigua con espacios de nombres (admin.credential.*, admin.firestore())
// desaparecio en la v14.
let appMod, firestoreMod;
try {
  appMod       = require("firebase-admin/app");
  firestoreMod = require("firebase-admin/firestore");
} catch {
  console.error("Falta firebase-admin. Instalalo con:\n  npm install --no-save firebase-admin");
  process.exit(1);
}

function init() {
  if (KEY_PATH) {
    const abs = path.resolve(KEY_PATH);
    if (!fs.existsSync(abs)) {
      console.error("No existe el archivo de clave: " + abs);
      process.exit(1);
    }
    const key = JSON.parse(fs.readFileSync(abs, "utf8"));
    if (key.project_id && key.project_id !== PROJECT_ID) {
      console.error(`La clave es del proyecto "${key.project_id}" pero se pidio "${PROJECT_ID}". Abortado.`);
      process.exit(1);
    }
    appMod.initializeApp({ credential: appMod.cert(key), projectId: PROJECT_ID });
    return "serviceAccountKey (" + path.basename(abs) + ")";
  }
  appMod.initializeApp({ credential: appMod.applicationDefault(), projectId: PROJECT_ID });
  return "application default credentials (gcloud)";
}

// ─── UTILIDADES ──────────────────────────────────────────────────────────────
const asArray = v => (Array.isArray(v) ? v : []);
const bytesOf = obj => Buffer.byteLength(JSON.stringify(obj), "utf8");

function sameContent(a, b) {
  try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const idx = i++;
      if (idx >= items.length) return;
      out[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return out;
}

// ─── PROCESO POR USUARIO ─────────────────────────────────────────────────────
async function processUser(db, userDoc, stamp) {
  const uid   = userDoc.id;
  const data  = userDoc.data() || {};
  const email = data.email || "(sin email)";
  const trades   = asArray(data.trades);
  const accounts = asArray(data.accounts);

  if (trades.length === 0) {
    return { uid, email, status: "skipped-empty", trades: 0, accounts: accounts.length };
  }

  const payload = {
    trades,
    accounts,
    createdAt: new Date().toISOString(),
    tradeCount: trades.length,
    accountCount: accounts.length,
    source: "backup-all-users.js",
  };

  const size = bytesOf(payload);
  if (size > SAFE_LIMIT) {
    return {
      uid, email, status: "too-large", trades: trades.length,
      accounts: accounts.length, bytes: size,
    };
  }

  // Copia local primero: si Firestore falla, al menos los datos quedan en disco.
  let localFile = null;
  if (WRITE_LOCAL) {
    const dir = path.join(OUT_DIR, stamp);
    fs.mkdirSync(dir, { recursive: true });
    localFile = path.join(dir, `${uid}.json`);
    fs.writeFileSync(localFile, JSON.stringify({ uid, email, ...payload }, null, 2), "utf8");
  }

  // No gastar uno de los 10 puntos de restauracion con una copia identica: el
  // cliente poda a MAX_BACKUPS y un duplicado expulsaria un punto mas antiguo
  // que si era distinto.
  const backupsRef = db.collection("users").doc(uid).collection("backups");
  if (!FORCE) {
    const latest = await backupsRef.orderBy("createdAt", "desc").limit(1).get();
    if (!latest.empty) {
      const prev = latest.docs[0].data();
      if (sameContent(asArray(prev.trades), trades) && sameContent(asArray(prev.accounts), accounts)) {
        return {
          uid, email, status: "skipped-identical", trades: trades.length,
          accounts: accounts.length, latestBackup: latest.docs[0].id, localFile,
        };
      }
    }
  }

  const backupId = "bk_" + Date.now() + "_" + uid.slice(0, 6);

  if (!EXECUTE) {
    return {
      uid, email, status: "would-write", trades: trades.length,
      accounts: accounts.length, backupId, bytes: size, localFile,
    };
  }

  await backupsRef.doc(backupId).set(payload);
  return {
    uid, email, status: "written", trades: trades.length,
    accounts: accounts.length, backupId, bytes: size, localFile,
  };
}

// ─── MAIN ────────────────────────────────────────────────────────────────────
async function main() {
  const credDesc = init();
  const db = firestoreMod.getFirestore();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");

  console.log("─".repeat(66));
  console.log("  Backup masivo — proyecto: " + PROJECT_ID);
  console.log("  Credenciales: " + credDesc);
  console.log("  Modo: " + (EXECUTE ? "EJECUCION REAL (escribe en Firestore)" : "SIMULACION (no escribe nada)"));
  console.log("  Copia local: " + (WRITE_LOCAL ? path.join(OUT_DIR, stamp) : "desactivada"));
  console.log("  Duplicados: " + (FORCE ? "se crean igualmente (--force)" : "se omiten si son identicos al ultimo"));
  console.log("─".repeat(66));

  console.log("Leyendo coleccion users…");
  const snap = await db.collection("users").get();
  console.log(`  ${snap.size} documento(s) encontrado(s).\n`);

  if (snap.empty) { console.log("Nada que hacer."); return; }

  let done = 0;
  const results = await mapLimit(snap.docs, CONCURRENCY, async doc => {
    let r;
    try {
      r = await processUser(db, doc, stamp);
    } catch (e) {
      r = { uid: doc.id, email: (doc.data() || {}).email || "?", status: "error", error: e.message };
    }
    done++;
    const tag = {
      "written": "OK  ", "would-write": "SIM ", "skipped-empty": "--  ",
      "skipped-identical": "IGL ", "too-large": "BIG ", "error": "ERR ",
    }[r.status] || "?   ";
    console.log(`  [${String(done).padStart(3)}/${snap.size}] ${tag} ${(r.email || "").padEnd(34)} ${r.trades != null ? r.trades + " trades" : r.error || ""}`);
    return r;
  });

  const by = s => results.filter(r => r.status === s);
  const written    = by("written");
  const would      = by("would-write");
  const identical  = by("skipped-identical");
  const empty      = by("skipped-empty");
  const tooLarge   = by("too-large");
  const errors     = by("error");
  const totalTrades = results.reduce((a, r) => a + (r.trades || 0), 0);

  console.log("\n" + "─".repeat(66));
  console.log("  RESUMEN");
  console.log("─".repeat(66));
  console.log(`  Usuarios totales.................. ${snap.size}`);
  console.log(`  Con trades........................ ${snap.size - empty.length}`);
  console.log(`  Sin trades (omitidos)............. ${empty.length}`);
  console.log(`  ${EXECUTE ? "Backups creados..................." : "Backups que se crearian..........."} ${EXECUTE ? written.length : would.length}`);
  console.log(`  Omitidos por identicos............ ${identical.length}`);
  console.log(`  Demasiado grandes (>1MiB)......... ${tooLarge.length}`);
  console.log(`  Errores........................... ${errors.length}`);
  console.log(`  Trades totales respaldados........ ${totalTrades}`);

  if (tooLarge.length) {
    console.log("\n  Superan el limite de documento de Firestore:");
    tooLarge.forEach(r => console.log(`    - ${r.email} (${r.trades} trades, ${(r.bytes / 1024).toFixed(0)} KB)`));
    console.log("    Su copia local SI se escribio; el backup en Firestore no.");
  }
  if (errors.length) {
    console.log("\n  Errores:");
    errors.forEach(r => console.log(`    - ${r.email} (${r.uid}): ${r.error}`));
  }

  // Informe de auditoria.
  if (WRITE_LOCAL) {
    const dir = path.join(OUT_DIR, stamp);
    fs.mkdirSync(dir, { recursive: true });
    const reportPath = path.join(dir, "_informe.json");
    fs.writeFileSync(reportPath, JSON.stringify({
      project: PROJECT_ID, executedAt: new Date().toISOString(),
      mode: EXECUTE ? "execute" : "dry-run", totals: {
        users: snap.size, withTrades: snap.size - empty.length,
        written: written.length, wouldWrite: would.length,
        identical: identical.length, tooLarge: tooLarge.length,
        errors: errors.length, totalTrades,
      }, results,
    }, null, 2), "utf8");
    console.log(`\n  Copias locales e informe en:\n    ${dir}`);
  }

  if (!EXECUTE) {
    console.log("\n  Esto fue una SIMULACION. Para escribir de verdad:");
    console.log("    node scripts/backup-all-users.js --execute");
  }
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch(e => { console.error("\nFallo general:", e); process.exit(1); });
