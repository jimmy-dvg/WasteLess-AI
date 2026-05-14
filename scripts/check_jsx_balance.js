const fs = require('fs');
const path = process.argv[2];
if (!path) { console.error('Usage: node check_jsx_balance.js <file>'); process.exit(2); }
const content = fs.readFileSync(path, 'utf8');
const lines = content.split(/\r?\n/);
const tagRegex = /<(!--[\s\S]*?--|\/?\s*([A-Za-z0-9_.:-]+)|>)/g;
// Simpler approach: find tags <...>
const regex = /<\/?([A-Za-z0-9_.:-]+)[^>]*>/g;
let match;
const stack = [];
let index = 0;
while ((match = regex.exec(content)) !== null) {
  const full = match[0];
  const closing = match[1] === '/';
  let tagName = (match[2] || '').trim();
  // Handle fragments
  if (full === '<>') {
    stack.push({tag: '<>', pos: match.index});
    continue;
  }
  if (full === '</>') {
    const last = stack.pop();
    if (!last || last.tag !== '<>') {
      console.error('Fragment mismatch at', match.index);
    }
    continue;
  }
  // Remove attributes if tagName contains spaces
  tagName = tagName.split(/\s+/)[0];
  // Ignore comments and doctype
  if (!tagName || tagName.startsWith('!--') || tagName.toLowerCase().startsWith('!doctype')) continue;
  // Self closing if ends with '/>'
  const selfClosing = /\/>$/.test(full);
  if (closing) {
    const last = stack.pop();
    if (!last) {
      console.error(`Unmatched closing tag </${tagName}> at index ${match.index}`);
      continue;
    }
    if (last.tag !== tagName) {
      console.error(`Tag mismatch: expected </${last.tag}> but found </${tagName}> at index ${match.index}`);
      // try to find matching
      let found = false;
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].tag === tagName) {
          found = true;
          break;
        }
      }
      if (!found) {
        // keep going
      }
    }
  } else if (!selfClosing) {
    stack.push({tag: tagName, pos: match.index});
  }
}
if (stack.length === 0) {
  console.log('All tags matched.');
} else {
  console.log('Unclosed tags:');
  stack.forEach(s => {
    // find line number
    const before = content.slice(0, s.pos);
    const line = before.split(/\r?\n/).length;
    console.log(`${s.tag} opened at index ${s.pos} (line ${line})`);
  });
}
