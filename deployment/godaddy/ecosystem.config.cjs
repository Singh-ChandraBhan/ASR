module.exports = {
  apps: [
    {
      name: "asr-commerce",
      script: "server.js",
      cwd: "/var/www/asr",
      env: { NODE_ENV: "production", PORT: "3000", ASR_API_URL: "http://127.0.0.1:8000" }
    },
    {
      name: "asr-python-api",
      script: "/var/www/asr/asr-integration/.venv/bin/uvicorn",
      args: "app:app --host 127.0.0.1 --port 8000",
      cwd: "/var/www/asr/asr-integration",
      interpreter: "none"
    }
  ]
};
