const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyPlugin = require("copy-webpack-plugin");
const ZipPlugin = require('zip-webpack-plugin');
const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');

const PACKAGE = require('./package.json');
const version = PACKAGE.version;

module.exports = (env, argv) => {
  const isProduction = argv.mode === 'production';
  const shouldAnalyze = isProduction && process.env.ANALYZE === 'true';

  return {
    mode: isProduction ? 'production' : 'development',
    entry: {
      main: 'index.tsx',
      demo: 'demo/demo.tsx'
    },
    output: {
      filename: "[name].[contenthash:8].js",
      chunkFilename: "[name].[contenthash:8].chunk.js",
      clean: true,
      publicPath: '/',
    },
    externals: {
      'filesafe-js': {}
    },
    optimization: {
      minimize: isProduction,
      minimizer: [
        // Gebruik TerserPlugin voor betere minification
        new (require('terser-webpack-plugin'))({
          terserOptions: {
            compress: {
              drop_console: isProduction,
            },
          },
        }),
      ],
      splitChunks: {
        chunks: 'all',
        cacheGroups: {
          // Split vendors af
          vendors: {
            test: /[\\/]node_modules[\\/]/,
            name: 'vendors',
            chunks: 'all',
            priority: 10,
          },
          // Split D3 af (grote library)
          d3: {
            test: /[\\/]node_modules[\\/]d3[\\/]/,
            name: 'd3',
            chunks: 'all',
            priority: 20,
          },
          // Split Preact af
          preact: {
            test: /[\\/]node_modules[\\/](preact|@preact)[\\/]/,
            name: 'preact',
            chunks: 'all',
            priority: 20,
          },
          // Split SN Extension API af
          snExtension: {
            test: /[\\/]node_modules[\\/]sn-extension-api[\\/]/,
            name: 'sn-extension',
            chunks: 'all',
            priority: 20,
          },
        },
      },
      runtimeChunk: {
        name: (entrypoint) => `runtime~${entrypoint.name}`,
      },
    },
    performance: {
      hints: false,
      maxEntrypointSize: 1024000, // 1MB
      maxAssetSize: 1024000, // 1MB
    },
    module: {
      rules: [
        {
          test: /\.(ts|tsx|js|jsx)$/,
          exclude: /node_modules/,
          use: {
            loader: "babel-loader",
            options: {
              cacheDirectory: true,
              cacheCompression: false,
            },
          },
        },
        {
          test: /\.css$/i,
          use: [
            "style-loader",
            "css-loader",
          ],
        },
        {
          test: /\.scss$/i,
          use: [
            "style-loader",
            "css-loader",
            "sass-loader"
          ],
        },
        {
          test: /\.(jpg|png|gif|jpeg|svg)$/,
          type: 'asset/inline',
        },
      ]
    },
    resolve: {
      modules: [
        'node_modules',
        'src'
      ],
      extensions: ['.tsx', '.ts', '.js', '.jsx'],
      alias: {
        react: "preact/compat",
        'react-dom': "preact/compat",
        "react/jsx-runtime": "preact/jsx-runtime"
      },
    },
    devServer: {
      open: ['/demo.html'],
      hot: true,
      compress: true,
      port: 8080,
      historyApiFallback: true,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
        "Access-Control-Allow-Headers": "X-Requested-With, content-type, Authorization"
      },
      static: {
        directory: __dirname,
      },
    },
    plugins: [
      new HtmlWebpackPlugin({
        filename: "index.html",
        template: "./src/index.html",
        chunks: ["main"],
        minify: isProduction ? {
          collapseWhitespace: true,
          removeComments: true,
          removeRedundantAttributes: true,
          removeScriptTypeAttributes: true,
          removeStyleLinkTypeAttributes: true,
          useShortDoctype: true,
        } : false,
      }),
      new HtmlWebpackPlugin({
        filename: "demo.html",
        template: "./src/index.html",
        chunks: ["demo"],
        minify: isProduction ? {
          collapseWhitespace: true,
          removeComments: true,
          removeRedundantAttributes: true,
          removeScriptTypeAttributes: true,
          removeStyleLinkTypeAttributes: true,
          useShortDoctype: true,
        } : false,
      }),
      new CopyPlugin({
        patterns: [
          {
            from: 'public',
            to: '.',
            transform(content) {
              return content
                .toString()
                .replace('$VERSION$', version);
            }
          }
        ]
      }),
      new ZipPlugin({
        filename: `latest.zip`
      }),
      // Bundle analyzer voor debugging
      shouldAnalyze && new BundleAnalyzerPlugin({
        analyzerMode: 'static',
        openAnalyzer: false,
        generateStatsFile: true,
        statsFilename: 'bundle-stats.json',
      }),
    ].filter(Boolean),
    // Source maps alleen in development
    devtool: isProduction ? false : 'eval-cheap-module-source-map',
  };
};
