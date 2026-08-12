#!/usr/bin/env node
// Copia a fonte única (app/my-studio.html) para todos os destinos que dela
// dependem. Antes desta Phase 1, isto era feito à mão com `cp`, e já
// desviou uma vez durante o desenvolvimento sem ninguém dar por isso
// (documentado no PHASE0.md). Este script existe para que isso deixe de
// poder acontecer silenciosamente.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SOURCE = path.join(ROOT, 'app', 'my-studio.html');

const TARGETS = [
  path.join(ROOT, 'native', 'www', 'index.html'),
];

if (!fs.existsSync(SOURCE)) {
  console.error('❌ Fonte não encontrada:', SOURCE);
  process.exit(1);
}

const html = fs.readFileSync(SOURCE, 'utf-8');
let count = 0;
for (const target of TARGETS) {
  const dir = path.dirname(target);
  if (!fs.existsSync(dir)) {
    console.warn('⚠️  Destino não existe, a saltar:', target);
    continue;
  }
  fs.writeFileSync(target, html, 'utf-8');
  console.log('✅ Copiado para', path.relative(ROOT, target));
  count++;
}

// copia também os ficheiros PWA para o www/ do wrapper nativo, se existirem
const pwaFiles = ['manifest.webmanifest', 'sw.js'];
const pwaDir = path.join(ROOT, 'pwa');
const nativeWww = path.join(ROOT, 'native', 'www');
if (fs.existsSync(nativeWww)) {
  for (const f of pwaFiles) {
    const src = path.join(pwaDir, f);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(nativeWww, f));
      console.log('✅ Copiado', f, 'para native/www/');
    }
  }
  const iconFiles = fs.existsSync(pwaDir) ? fs.readdirSync(pwaDir).filter(f => f.endsWith('.png')) : [];
  for (const f of iconFiles) {
    fs.copyFileSync(path.join(pwaDir, f), path.join(nativeWww, f));
  }
  if (iconFiles.length) console.log('✅ Copiados', iconFiles.length, 'ícones para native/www/');
}

console.log(`\nBuild concluído — ${count} destino(s) atualizado(s) a partir de app/my-studio.html`);
console.log('Lembrete: corre "npm run sync" a seguir para propagar ao iOS/Android (npx cap sync).');
