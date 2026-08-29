const { getDb, backupDatabase } = require("../db");

getDb();
const dest = backupDatabase();
console.log("Backup saved (private local file):");
console.log(dest);
