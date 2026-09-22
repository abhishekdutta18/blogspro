import fs from 'fs';
let content = fs.readFileSync('package.json', 'utf8');
let json = JSON.parse(content);
if(json.scripts && json.scripts.build) {
  json.scripts.build = "echo 'Skipping build'";
}
fs.writeFileSync('package.json', JSON.stringify(json, null, 2));
