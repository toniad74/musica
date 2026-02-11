const fs = require('fs');
const path = require('path');

// Función para incrementar la versión
function incrementVersion(version) {
    const parts = version.split('.');
    parts[2] = parseInt(parts[2]) + 1; // Incrementar patch
    return parts.join('.');
}

// Función para obtener timestamp actual
function getCurrentTimestamp() {
    const now = new Date();
    const day = now.getDate();
    const month = now.toLocaleString('es', { month: 'short' });
    const year = now.getFullYear();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `${day} ${month} ${year} ${hours}:${minutes}`;
}

// Leer versión actual del sw.js
const swPath = path.join(__dirname, 'sw.js');
let swContent = fs.readFileSync(swPath, 'utf8');

// Extraer versión actual del cache
const cacheMatch = swContent.match(/amaya-music-v(\d+)/);
const currentCacheVersion = parseInt(cacheMatch[1]);
const newCacheVersion = currentCacheVersion + 1;

// Extraer versión actual de la app
const versionMatch = swContent.match(/SW Version: ([\d.]+)/);
const currentVersion = versionMatch[1];
const manualVersion = process.argv[2];
const newVersion = manualVersion || incrementVersion(currentVersion);

// Actualizar sw.js
swContent = swContent.replace(
    /const CACHE_NAME = 'amaya-music-v\d+';/,
    `const CACHE_NAME = 'amaya-music-v${newCacheVersion}';`
);
swContent = swContent.replace(
    /\/\/ SW Version: [\d.]+ - Time: .+/,
    `// SW Version: ${newVersion} - Time: ${getCurrentTimestamp().split(' ').slice(-1)[0]} (GMT+1) - Auto-actualización`
);

fs.writeFileSync(swPath, swContent, 'utf8');
console.log(`✅ sw.js actualizado: v${newCacheVersion}, versión ${newVersion}`);

// Actualizar index.html (Desktop y Mobile)
const indexPath = path.join(__dirname, 'index.html');
let indexContent = fs.readFileSync(indexPath, 'utf8');

const timestamp = getCurrentTimestamp();

// Desktop dropdown (primera ocurrencia)
indexContent = indexContent.replace(
    /(<p class="text-white text-sm">v)[\d.]+(<\/p>\s*<p class="text-[^"]*">\s*Actualizado\s*<\/p>\s*<p class="text-white text-sm">)[^<]+/,
    `$1${newVersion}$2${timestamp}`
);

// Mobile dropdown (segunda ocurrencia)
indexContent = indexContent.replace(
    /(<p class="text-white text-xs">v)[\d.]+(<\/p>\s*<p[^>]*>\s*Actualizado<\/p>\s*<p class="text-white text-xs">)[^<]+/,
    `$1${newVersion}$2${timestamp}`
);

fs.writeFileSync(indexPath, indexContent, 'utf8');
console.log(`✅ index.html actualizado con versión ${newVersion} y timestamp ${timestamp}`);

console.log('\n🎉 Actualización de versión completada exitosamente!');
console.log(`   Cache: v${currentCacheVersion} → v${newCacheVersion}`);
console.log(`   Versión: ${currentVersion} → ${newVersion}`);
console.log(`   Timestamp: ${timestamp}`);
