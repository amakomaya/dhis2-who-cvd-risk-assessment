const config = {
    type: 'app',
    name: 'amakomaya-cvd-risk',
    title: 'CVD Risk Assessment',

    coreApp: false,
    standalone: false,

    entryPoints: {
        app: './src/App.tsx',
        plugin: './src/Plugin.tsx',
    },

    dataStoreNamespace: 'amakomaya-cvd-risk',
    minDHIS2Version: '2.43',
};

module.exports = config;
