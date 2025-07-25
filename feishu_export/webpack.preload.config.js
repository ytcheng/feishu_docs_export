const path = require('path');
const webpack = require('webpack');
module.exports = {
    name: 'preload',
    mode: process.env.NODE_ENV || 'development',
    target: 'electron-preload',
    entry: './src/renderer/preload.ts',
    output: {
        path: path.resolve(__dirname, 'dist/renderer'),
        filename: 'preload.js',
    },
    resolve: {
        extensions: ['.ts', '.js'],
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                use: 'ts-loader',
                exclude: /node_modules/,
            },
        ],
    },
}; 
