// Генерирует audio/<hash>.m4a для каждой греческой строки из lessons.js.
// Запуск: node scripts/make_audio.mjs   (нужен macOS с голосом Melina)
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, unlinkSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "audio");

// Должна совпадать с audioKey() в app.js
export function audioKey(text) {
  const s = text.normalize("NFC").trim();
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

const GREEK = /[Ͱ-Ͽἀ-῿]/;
const CYR = /[Ѐ-ӿ]/;
const SKIP_KEYS = new Set(["html", "extra"]);

function collect(node, out, key = "") {
  if (typeof node === "string") {
    if (SKIP_KEYS.has(key)) return;
    for (const line of node.split("\n")) {
      if (GREEK.test(line) && !CYR.test(line) && !line.includes("___")) out.add(line.trim());
    }
  } else if (Array.isArray(node)) {
    node.forEach((n) => collect(n, out, key));
  } else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) collect(v, out, k);
  }
}

const ctx = { window: {} };
vm.runInNewContext(readFileSync(join(root, "lessons.js"), "utf8"), ctx);
const texts = new Set();
collect(ctx.window.LESSONS, texts);
// фразы, которые говорит сам движок (app.js)
["Μπράβο, Ιρίνα!"].forEach((t) => texts.add(t));

const wanted = new Set();
let made = 0;
for (const t of texts) {
  const key = audioKey(t);
  wanted.add(`${key}.m4a`);
  const file = join(outDir, `${key}.m4a`);
  if (existsSync(file)) continue;
  execFileSync("say", ["-v", "Melina", "-r", "155", "-o", file, "--file-format=m4af", "--data-format=aac", t]);
  made++;
}
let removed = 0;
for (const f of readdirSync(outDir)) {
  if (f.endsWith(".m4a") && !wanted.has(f)) { unlinkSync(join(outDir, f)); removed++; }
}
console.log(`texts: ${texts.size}, new: ${made}, removed stale: ${removed}`);
