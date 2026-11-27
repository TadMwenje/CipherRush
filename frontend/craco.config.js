// Load configuration from environment or config file
const path = require('path');

// Environment variable overrides
const config = {
  disableHotReload: process.env.DISABLE_HOT_RELOAD === 'true',
};

module.exports = {
  webpack: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
    configure: (webpackConfig) => {
      
      // Disable hot reload completely if environment variable is set
      if (config.disableHotReload) {
        // Remove hot reload related plugins
        webpackConfig.plugins = webpackConfig.plugins.filter(plugin => {
          return !(plugin.constructor.name === 'HotModuleReplacementPlugin');
        });
        
        // Disable watch mode
        webpackConfig.watch = false;
        webpackConfig.watchOptions = {
          ignored: /.*/, // Ignore all files
        };
      }
      
      // Production: drop console.log / info / debug calls from the bundle.
      // console.warn and console.error stay, for crash reports in device logs.
      if (webpackConfig.mode === 'production') {
        for (const minimizer of webpackConfig.optimization?.minimizer || []) {
          const opts = minimizer.options?.minimizer?.options;
          if (minimizer.constructor.name === 'TerserPlugin' && opts) {
            opts.compress = {
              ...(opts.compress || {}),
              pure_funcs: ['console.log', 'console.info', 'console.debug'],
            };
          }
        }
      }

      return webpackConfig;
    },
  },
};
  
