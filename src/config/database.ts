import mysql from 'mysql2';
import type {Pool} from 'mysql2';
import {config} from './env.js';

const pool: Pool = mysql.createPool({
    host: config.db.host,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    waitForConnections: true,
    connectionLimit: config.db.connectionLimit,
    queueLimit: 0,
});

export default pool.promise();
