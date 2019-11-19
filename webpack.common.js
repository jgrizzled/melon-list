const path = require('path');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require("mini-css-extract-plugin");

module.exports = {
   entry: path.resolve(__dirname, 'src', 'app.js'),
   output: {
      path: path.resolve(__dirname, 'dist'),
      filename: 'bundle.js'
   },
   resolve: {
      extensions: ['.js']
   },
   module: {
     rules: [
       {
        test:/\.(s*)css$/,
        use:[
            {
               loader: MiniCssExtractPlugin.loader,
            },
           'css-loader',
           'sass-loader'
         ]
       }
     ]
   },
   plugins: [
    new CleanWebpackPlugin(),
    new HtmlWebpackPlugin({
      title: 'Melon List',
      template: path.resolve(__dirname, 'src', 'index.html')
    }),
    new MiniCssExtractPlugin({
      filename: '[name].css',
      chunkFilename: '[id].css',
    })
   ],
};