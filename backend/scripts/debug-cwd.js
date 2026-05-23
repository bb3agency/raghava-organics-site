const fs = require('fs');
fs.writeFileSync(__dirname + '\\debug-output.txt', 'cwd=' + process.cwd() + '\ndir=' + __dirname);
