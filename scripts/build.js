#!/usr/bin/env node
// Monta app/my-studio.html a partir dos módulos em src/, depois propaga esse
// resultado a todos os destinos que dele dependem (wrapper nativo, PWA).
//
// A partir da Phase 2 da auditoria, app/my-studio.html PASSA A SER UM
// FICHEIRO GERADO — não editar diretamente. A fonte real vive em:
//   src/template.html        — a estrutura HTML/CSS, com um placeholder
//   src/data/i18n.js         — traduções (conteúdo dos posts + interface)
//   src/data/categories.js   — categorias, paletas, selos, campos extra
//   src/main.js              — estado, rendering, UI, exportações
//
// Ordem de concatenação importa: main.js lê I18N/UI_STRINGS/CATEGORY_* como
// variáveis já definidas, por isso os dados têm de vir primeiro.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const OUTPUT = path.join(ROOT, 'app', 'my-studio.html');

const PLACEHOLDER = '__MYSTUDIO_SCRIPT_PLACEHOLDER__';

function assemble() {
  const template = fs.readFileSync(path.join(SRC, 'template.html'), 'utf-8');
  const i18n = fs.readFileSync(path.join(SRC, 'data', 'i18n.js'), 'utf-8');
  const categories = fs.readFileSync(path.join(SRC, 'data', 'categories.js'), 'utf-8');
  const main = fs.readFileSync(path.join(SRC, 'main.js'), 'utf-8');

  if (!template.includes(PLACEHOLDER)) {
    throw new Error('src/template.html não tem o placeholder ' + PLACEHOLDER + ' — a montagem não sabe onde inserir o script.');
  }

  const script = [i18n, categories, main].join('\n\n');
  const html = template.replace(PLACEHOLDER, script);

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, html, 'utf-8');
  console.log('✅ Montado app/my-studio.html a partir de src/ (' + html.length + ' caracteres)');
  return html;
}

function propagate() {
  const TARGETS = [path.join(ROOT, 'native', 'www', 'index.html')];
  const html = fs.readFileSync(OUTPUT, 'utf-8');
  let count = 0;
  for (const target of TARGETS) {
    const dir = path.dirname(target);
    if (!fs.existsSync(dir)) { console.warn('⚠️  Destino não existe, a saltar:', target); continue; }
    fs.writeFileSync(target, html, 'utf-8');
    console.log('✅ Copiado para', path.relative(ROOT, target));
    count++;
  }

  const pwaFiles = ['manifest.webmanifest', 'sw.js'];
  const pwaDir = path.join(ROOT, 'pwa');
  const nativeWww = path.join(ROOT, 'native', 'www');
  if (fs.existsSync(nativeWww)) {
    for (const f of pwaFiles) {
      const src = path.join(pwaDir, f);
      if (fs.existsSync(src)) { fs.copyFileSync(src, path.join(nativeWww, f)); console.log('✅ Copiado', f, 'para native/www/'); }
    }
    const iconFiles = fs.existsSync(pwaDir) ? fs.readdirSync(pwaDir).filter(f => f.endsWith('.png')) : [];
    for (const f of iconFiles) fs.copyFileSync(path.join(pwaDir, f), path.join(nativeWww, f));
    if (iconFiles.length) console.log('✅ Copiados', iconFiles.length, 'ícones para native/www/');
  }
  console.log(`\nBuild concluído — ${count} destino(s) atualizado(s) a partir de app/my-studio.html`);
  console.log('Lembrete: corre "npm run sync" a seguir para propagar ao iOS/Android (npx cap sync).');
}

assemble();
propagate();
