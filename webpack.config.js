const path = require('path');
const webpack = require('webpack');
const ReactRefreshWebpackPlugin = require('@pmmmwh/react-refresh-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const { ESBuildMinifyPlugin } = require('esbuild-loader');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const { attachBaseApiRoutes } = require('./server/base-service');

const cwd = process.cwd();
const isDevelopment = process.env.NODE_ENV === 'development';
const isProduction = process.env.NODE_ENV === 'production';
const appConfig = require('./app.json');
const timelineApiBaseUrl = process.env.TIMELINE_API_BASE_URL || '';

let docsAddonDevMiddleware = null;
let docsAddonWebpackPlugin = null;
let docsAddonWebpackUtilsError = null;

try {
  ({
    docsAddonDevMiddleware,
    docsAddonWebpackPlugin,
  } = require('@lark-opdev/block-docs-addon-webpack-utils'));
} catch (error) {
  docsAddonWebpackUtilsError = error;
}

class FallbackDocsAddonWebpackPlugin {
  apply(compiler) {
    if (process.env.NODE_ENV === 'production') {
      compiler.hooks.compilation.tap('FallbackDocsAddonWebpackPlugin', (compilation) => {
        compilation.hooks.processAssets.tap(
          {
            name: 'FallbackDocsAddonWebpackPlugin',
            stage: webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONAL,
          },
          () => {
            const initialHeight =
              appConfig.initialHeight || appConfig?.contributes?.addPanel?.initialHeight || 520;
            const projectInfo = {
              appid: appConfig.appID,
              projectname: appConfig.projectName,
              blocks: ['index'],
            };
            const blockInfo = {
              blockTypeID: appConfig.blockTypeID,
              blockRenderType: 'offlineWeb',
              offlineWebConfig: {
                initialHeight,
                contributes: appConfig.contributes,
              },
            };
            compilation.emitAsset('project.config.json', new webpack.sources.RawSource(JSON.stringify(projectInfo)));
            compilation.emitAsset('index.json', new webpack.sources.RawSource(JSON.stringify(blockInfo)));
          }
        );
      });
      return;
    }

    compiler.hooks.done.tap('FallbackDocsAddonWebpackPlugin', () => {
      const previewUrl = `http://localhost:${process.env.PORT || 8080}/`;
      console.log('[fallback-docs-addon] docs-addon webpack utils unavailable, using standalone preview:', previewUrl);
      if (docsAddonWebpackUtilsError) {
        console.log('[fallback-docs-addon] original error:', docsAddonWebpackUtilsError.message);
      }
    });
  }
}

const config = {
  entry: './src/index.tsx',
  devtool: isProduction ? false : 'inline-source-map',
  mode: isDevelopment ? 'development' : 'production',
  stats: 'errors-only',
  output: {
    path: path.resolve(__dirname, './dist'),
    clean: true,
    publicPath: isDevelopment ? '/block/' : './',
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        include: [/node_modules\/@lark-open/],
        use: ['source-map-loader'],
        enforce: 'pre',
      },
      {
        oneOf: [
          {
            test: /\.[jt]sx?$/,
            include: [path.join(cwd, 'src')],
            exclude: /node_modules/,
            use: [
              {
                loader: require.resolve('esbuild-loader'),
                options: {
                  loader: 'tsx',
                  target: 'es2015',
                },
              },
            ],
          },
          {
            test: /\.css$/,
            use: [
              isDevelopment ? 'style-loader' : MiniCssExtractPlugin.loader,
              'css-loader',
            ],
          },
          {
            test: /\.less$/,
            use: [
              isDevelopment ? 'style-loader' : MiniCssExtractPlugin.loader,
              'css-loader',
              'less-loader',
            ],
          },
          {
            test: /\.(png|jpg|jpeg|gif|ico|svg)$/,
            type: 'asset/resource',
            generator: {
              filename: 'assets/[name][ext][query]',
            },
          },
        ],
      },
    ],
  },
  plugins: [
    ...(isDevelopment ? [new ReactRefreshWebpackPlugin()] : [new MiniCssExtractPlugin()]),
    new webpack.DefinePlugin({
      __TIMELINE_API_BASE_URL__: JSON.stringify(timelineApiBaseUrl),
    }),
    new (docsAddonWebpackPlugin || FallbackDocsAddonWebpackPlugin)({}),
    new HtmlWebpackPlugin({
      filename: 'index.html',
      template: './src/index.html',
      publicPath: isDevelopment ? '/block/' : './',
    }),
  ],
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
  },
  optimization: {
    minimize: isProduction,
    minimizer: [new ESBuildMinifyPlugin({ target: 'es2015', css: true })],
    moduleIds: 'deterministic',
    runtimeChunk: true,
    splitChunks: {
      chunks: 'all',
      cacheGroups: {
        vendor: {
          name: 'vendor',
          test: /[\\/]node_modules[\\/]/,
          chunks: 'all',
        },
      },
    },
  },
  devServer: isProduction
    ? undefined
    : {
        headers: {
          'Access-Control-Allow-Private-Network': true
        },
        hot: true,
        client: {
          logging: 'error',
        },
        setupMiddlewares: (middlewares, devServer) => {
          if (!devServer || !devServer.app) {
            throw new Error('webpack-dev-server is not defined');
          }
          attachBaseApiRoutes(devServer.app);
          if (typeof docsAddonDevMiddleware === 'function') {
            docsAddonDevMiddleware(devServer).then((middleware) => {
              devServer.app.use(middleware);
            });
          }
          return middlewares;
        },
      },
  cache: {
    type: 'filesystem',
    buildDependencies: {
      config: [__filename],
    },
  },
};
module.exports = config;
