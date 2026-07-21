const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
      results.push(file);
    }
  });
  return results;
}

const files = walk('src');
files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let changed = false;

  // Replace imports from services
  content = content.replace(/from\s+['"](?:\.\.\/)*services(?:\/[a-zA-Z0-9_-]+)*['"]/g, "from 'linda-core'");
  
  // Replace imports from zen
  content = content.replace(/from\s+['"](?:\.\.\/)*zen(?:\/[a-zA-Z0-9_-]+)*['"]/g, "from 'linda-core'");
  
  // Replace imports from utils/crypto and utils/names
  content = content.replace(/from\s+['"](?:\.\.\/)*utils\/(?:crypto|names)['"]/g, "from 'linda-core'");

  // Note: some imports might be just specific files like services/CommunicationService, the regex handles that.
  
  if (content !== fs.readFileSync(file, 'utf8')) {
    fs.writeFileSync(file, content);
  }
});
console.log('Refactoring complete');
