module.exports = {
  apiUrl: process.env.API_URL,
  apiKey: process.env.API_KEY,
  apiConcurrency: parseInt(process.env.API_CONCURRENCY) || 0,
};
