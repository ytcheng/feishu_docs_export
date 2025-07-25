const path = require('path');
const webpack = require('webpack');
module.exports = {
  mode: 'development', 
  mode: process.env.NODE_ENV || 'development',
  target: 'electron-main',
  entry: './src/main/index.ts',
  output: {
    path: path.resolve(__dirname, 'dist/main'),
    filename: 'index.js',
  }, 
  resolve: {
    extensions: ['.ts', '.js'],
  },
  module: {
    rules: [
      {
        test: /\.(ts)$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
}; 