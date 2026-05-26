const fs = require('fs');

try {
  const content = fs.readFileSync('frontend-design-reference/parkofideas.com/tastydaily/demo/home-3/index.html', 'utf-8');
  const cheerio = require('cheerio'); // Try to see if it's installed in the project, e.g. next.js might have something or we just fallback
} catch(e) {}

const path = 'frontend-design-reference/parkofideas.com/tastydaily/demo/home-3/index.html';
const raw = fs.readFileSync(path, 'utf-8');

// extracting titles 
const headings = raw.match(/<h[1-3][^>]*>(.*?)<\/h[1-3]>/g) || [];
console.log("HEADINGS:");
headings.slice(0, 15).forEach(h => console.log(h.replace(/<[^>]+>/g, '').trim()));

// Extracting banners/sliders: look for text like "Shop Now", "Discount" etc
const shopNow = raw.match(/<[^>]+>Shop Now<\/[^>]+>/g) || [];
console.log("SHOP NOW BUTTONS:", shopNow.length);
