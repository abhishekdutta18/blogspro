import fs from 'fs';
import path from 'path';

const pDir = path.join(process.cwd(), 'p');
const files = fs.readdirSync(pDir).filter(f => f.endsWith('.html'));

for (const file of files) {
  const filepath = path.join(pDir, file);
  let content = fs.readFileSync(filepath, 'utf8');

  // Strip common LLM chain of thought / prompt instructions
  content = content.replace(/Okay, I need to write the section.*?Let me start by breaking down the outline[^<]*</gi, '<');
  content = content.replace(/Note: <strong>Emphasizes key terms.*?<blockquote>Quotes\./gi, '');
  content = content.replace(/Okay, let's break down the process[^<]*</gi, '<');

  // We should also replace unparsed markdown with HTML, but for now let's just do a basic cleanup of specific known bad strings.
  // Actually a general regex for "Okay, I need to..." or "Okay, let's..."
  content = content.replace(/Okay, I need to[^<]*</gi, '<');
  content = content.replace(/Okay, let's[^<]*</gi, '<');

  // Clean up any remaining unparsed markdown stars where it affects presentation
  // Simple heuristic: if we see * **Text**: we can remove the stars
  content = content.replace(/\* \*\*(.*?)\*\*(:?)/g, '<strong>$1</strong>$2');
  content = content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

  fs.writeFileSync(filepath, content);
}
console.log('Cleanup complete');
