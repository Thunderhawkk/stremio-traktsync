const http = require('http');
const https = require('https');
const axios = require('axios');

const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 50 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 50 });

const httpClient = axios.create({ timeout: 10000, httpAgent, httpsAgent, validateStatus: s => s >= 200 && s < 500 });

module.exports = { httpAgent, httpsAgent, httpClient };
