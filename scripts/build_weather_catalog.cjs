'use strict';
// Reuse the browser's catalog construction; no second hand-maintained place list.
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..'),context=vm.createContext({window:{}});
for(const name of ['assets/places.js','assets/taiwan-places.js','destinations.js'])vm.runInContext(fs.readFileSync(path.join(root,name),'utf8'),context);
const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
const expression=app.slice(app.indexOf('const cityRows = [')+'const cityRows = '.length,app.indexOf('\n  const cities ='));
vm.runInContext('const cityRows = '+expression+'\nwindow.catalog=window.SunseekPlaces.buildCatalog(curated,window.PLACE_ROWS);',context);
const catalog=context.window.catalog.map(({id,lat,lon,tier})=>({id,lat,lon,featured:tier==='featured'}));
const output='[\n'+catalog.map(c=>'  '+JSON.stringify(c)).join(',\n')+'\n]\n',target=path.join(root,'server/weather-cache/catalog.json');
if(process.argv.includes('--check')){if(fs.readFileSync(target,'utf8')!==output)throw Error('Weather catalog needs rebuilding');}
else fs.writeFileSync(target,output);
console.log(JSON.stringify({places:catalog.length,featured:catalog.filter(c=>c.featured).length}));
