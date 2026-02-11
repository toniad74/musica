---
description: Sincronitza automàticament els canvis amb Github
---
// turbo-all
1. Actualitza automàticament la versió de l'aplicació
```
node update-version.js
```
2. Afegeix tots els canvis al stage
```
git add .
```
3. Crea un commit amb una descripció del que s'ha fet
```
git commit -m "Actualització automàtica de l'aplicació"
```
4. Puixa els canvis a la branca principal
```
git push origin main
```
