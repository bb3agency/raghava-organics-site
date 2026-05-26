const fs = require('fs');
const content = fs.readFileSync('clean.html', 'utf-8');

// Find all image sources and text blocks to deduce the hero content
const cheerio = require('cheerio'); // Do we have cheerio? Probably not. Let's use simple regex.

const sliderMatch = content.match(/<div[^>]*class="[^"]*carousel[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
if (sliderMatch) {
  console.log("Slider found!");
}

const firstImages = [...content.matchAll(/<img[^>]+src="([^">]+)"[^>]*>/g)].slice(0, 10).map(m => m[1]);
console.log("First images:", firstImages);

const textBlocks = [...content.matchAll(/<h[1-3][^>]*>(.*?)<\/h[1-3]>/g)].slice(0, 10).map(m => m[1].replace(/<[^>]+>/g, '').trim());
console.log("First headings:", textBlocks);
