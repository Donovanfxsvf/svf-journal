// Extrae las funciones puras REALES de src/App.jsx y las ejercita.
// No son copias: se leen del archivo fuente y se evalúan tal cual.
const fs = require("fs");
const parser = require("@babel/parser");

const SRC = require("path").join(__dirname, "..", "src", "App.jsx");
const code = fs.readFileSync(SRC, "utf8");
const ast = parser.parse(code, { sourceType: "module", plugins: ["jsx"] });

const WANT = ["asArray", "tradeKey", "acctKey", "reconcileDataset", "mergeOutbox"];
const pieces = [];
for (const node of ast.program.body) {
  const decl = node.type === "ExportNamedDeclaration" ? node.declaration : node;
  if (!decl) continue;
  if (decl.type === "FunctionDeclaration" && WANT.includes(decl.id.name)) {
    pieces.push(code.slice(decl.start, decl.end));
  }
  if (decl.type === "VariableDeclaration") {
    for (const d of decl.declarations) {
      if (d.id.type === "Identifier" && WANT.includes(d.id.name)) {
        pieces.push("const " + code.slice(d.start, d.end) + ";");
      }
    }
  }
}
const found = WANT.filter(n => pieces.some(p => p.includes(n)));
if (found.length !== WANT.length) {
  console.error("No se extrajeron todas las funciones:", found);
  process.exit(1);
}
const mod = new Function(pieces.join("\n") + "\nreturn {" + WANT.join(",") + "};")();
const { reconcileDataset, mergeOutbox } = mod;

let pass = 0, fail = 0;
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function check(name, actual, expected) {
  if (eq(actual, expected)) { pass++; console.log("  ok   " + name); }
  else { fail++; console.log("  FAIL " + name + "\n       esperado: " + JSON.stringify(expected) + "\n       obtenido: " + JSON.stringify(actual)); }
}

const t = (id, pnl) => ({ id, pnl });
const real = [t(1001, 50), t(1002, -20), t(1003, 90)];

console.log("\nreconcileDataset — escenarios de pérdida de datos reportados:");

// 1. El bug original: el cliente intenta escribir la semilla demo encima.
check("semilla demo NO borra los trades reales",
  reconcileDataset(real, [t(1, 150), t(2, 120)], []).list,
  [t(1, 150), t(2, 120), t(1001, 50), t(1002, -20), t(1003, 90)]);

// 2. El useEffect disparando con trades:[] en el momento equivocado.
check("un guardado con trades:[] no vacía el documento",
  reconcileDataset(real, [], []).list, real);

// 3. Borrado explícito: debe funcionar de verdad.
check("borrado explícito de un trade sí lo elimina",
  reconcileDataset(real, [t(1001, 50), t(1003, 90)], ["1002"]).list,
  [t(1001, 50), t(1003, 90)]);

check("borrar todos los trades explícitamente deja la lista vacía",
  reconcileDataset(real, [], ["1001", "1002", "1003"]).list, []);

// 4. Dos dispositivos a la vez.
check("otra pestaña añadió un trade: no se pierde",
  reconcileDataset([...real, t(2001, 33)], [...real, t(1004, 10)], []).list,
  [...real, t(1004, 10), t(2001, 33)]);

// 5. Edición local gana sobre la versión del servidor.
check("la edición local gana sobre la copia del servidor",
  reconcileDataset(real, [t(1001, 999), t(1002, -20), t(1003, 90)], []).list,
  [t(1001, 999), t(1002, -20), t(1003, 90)]);

// 6. ids numéricos vs string no deben duplicar registros.
check("id numérico y string son el mismo registro",
  reconcileDataset([{ id: 7 }], [{ id: "7" }], []).list, [{ id: "7" }]);

// 7. Documento de servidor corrupto / sin arrays.
check("servidor sin array no rompe",
  reconcileDataset(undefined, real, []).list, real);
check("local sin array no borra el servidor",
  reconcileDataset(real, undefined, []).list, real);

// 8. Contador de rescates.
check("cuenta los registros rescatados",
  reconcileDataset(real, [], []).rescued, 3);
check("sin rescate cuando el cliente está al día",
  reconcileDataset(real, real, []).rescued, 0);

console.log("\nmergeOutbox — cambios que quedaron sin enviar:");

check("sin outbox se devuelve el servidor intacto",
  mergeOutbox(real, [], null), { trades: real, accounts: [], changed: false });

check("outbox con un trade nuevo lo reintegra",
  mergeOutbox(real, [], { trades: [...real, t(1004, 11)], accounts: [], deletedTradeIds: [], deletedAccountIds: [] }).trades,
  [...real, t(1004, 11)]);

check("outbox idéntico al servidor no marca cambio",
  mergeOutbox(real, [], { trades: real, accounts: [], deletedTradeIds: [], deletedAccountIds: [] }).changed,
  false);

check("outbox con una edición sin cambio de tamaño sí marca cambio",
  mergeOutbox(real, [], { trades: [t(1001, 777), t(1002, -20), t(1003, 90)], accounts: [], deletedTradeIds: [], deletedAccountIds: [] }).changed,
  true);

check("outbox con un borrado pendiente lo respeta",
  mergeOutbox(real, [], { trades: [t(1001, 50), t(1003, 90)], accounts: [], deletedTradeIds: ["1002"], deletedAccountIds: [] }).trades,
  [t(1001, 50), t(1003, 90)]);

console.log("\n" + pass + " ok, " + fail + " fallos");
process.exitCode = fail ? 1 : 0;
