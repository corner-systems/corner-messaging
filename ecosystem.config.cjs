module.exports = {
    apps: [
        {
            name: "messaging-debug",
            script: "node_modules/.bin/tsx",
            args: ["watch", "src/index.ts"],  // watch 모드
            watch: false,                     // PM2 watch 끔 (tsx가 감시)
            env: {
                NODE_ENV: "development",
                PORT: 61002
            }
        },
        {
            name: "messaging-prod",
            script: "dist/index.js",
            watch: false,
            env: {
                NODE_ENV: "production",
                PORT: 61002,
                NODE_OPTIONS: "--enable-source-maps"
            }
        }
    ]
};
