const fs = require('fs');
const path = 'frontend-design-reference/parkofideas.com/tastydaily/demo/home-3/index.html';
const outPath = 'html_chunks.json';

try {
  const content = fs.readFileSync(path, 'utf-8');
  
  const bodyMatch = content.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  let body = bodyMatch ? bodyMatch[1] : content;
  
  // Strip scripts, noscript, and simplify svg
  body = body.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  body = body.replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, '');
  body = body.replace(/<svg[^>]*>[\s\S]*?<\/svg>/gi, '<svg></svg>');
  
  // Try to split into major chunks by looking for id="page" or standard HTML5 tags
  const chunks = {
    fullLength: content.length,
    bodyLength: body.length,
    first1000: body.substring(0, 1000)
  };
  
  fs.writeFileSync(outPath, JSON.stringify(chunks, null, 2));
} catch(e) {
  fs.writeFileSync(outPath, JSON.stringify({error: e.message}));
}
