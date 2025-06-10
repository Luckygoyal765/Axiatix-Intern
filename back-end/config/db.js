const mysql = require('mysql2');
// this is changed the next line 
require('dotenv').config();

const connection = mysql.createConnection({
  host: 'localhost',
  user: 'intern',          // your MySQL user
  password: 'RadhaSwamiJi13!', //  your MySQL password
  database: 'digi-goat',
  port:3306
});

connection.connect(err => {
  if (err) {
    console.error(' MySQL connection failed:', err);
  } else {
    console.log('Connected to MySQL');
  }
});

module.exports = connection;